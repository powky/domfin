package books

import (
	"context"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

// testConvert changes money at 60 pesos per dollar.
func testConvert(_ context.Context, cents int64, from, to, _ string) (int64, error) {
	switch {
	case from == to:
		return cents, nil
	case from == "DOP":
		return cents / 60, nil
	default:
		return cents * 60, nil
	}
}

type assetsResponse struct {
	Assets []assetJSON `json:"assets"`
}

func TestAssets(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 6, 28, 0, 0, 0, 0, time.UTC)
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "DOP", CreditLimit: 50_000_000, Balance: 9_300_000,
			Transactions: []statements.Transaction{
				{PostedOn: cut.AddDate(0, 0, -26), TransactedOn: cut.AddDate(0, 0, -26), Reference: "0570000001",
					Description: "LBTR FIDEICOMISO PRUEBA", Amount: 9_000_000},
				{PostedOn: cut, TransactedOn: cut, Reference: "10000000000000000000001",
					Description: "SUPERMERCADO UNO  SANTO DOMINGO", MCC: "5411", Amount: 300_000},
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "junio.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)

	// A home bought off-plan, in dollars; its trust's name links what pays it.
	home := `{"kind": "property", "name": "Torre de Prueba", "currency": "USD", "match": ["fideicomiso prueba"],
		"property": {"price": 15000000, "downPayment": {"amount": 1500000, "date": "2026-06-02"},
			"installments": {"amount": 300000, "everyMonths": 3, "first": "2026-09-02", "last": "2027-06-02"},
			"delivery": "2027-12-31"}}`
	var created map[string]string
	if w := do(t, h, "POST", "/ledger/assets", home, &created); w.Code != http.StatusCreated || created["id"] != "torre-de-prueba" {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var list assetsResponse
	do(t, h, "GET", "/ledger/assets", "", &list)
	if len(list.Assets) != 1 || len(list.Assets[0].Payments) != 1 {
		t.Fatalf("assets: %+v", list)
	}
	house := list.Assets[0]
	payment := house.Payments[0]
	// RD$90,000 at 60 pesos per dollar.
	if house.Paid != 150_000 || house.Value != 150_000 || payment.Value != 150_000 || payment.Amount != -9_000_000 || !payment.Auto {
		t.Errorf("house: %+v", house)
	}

	var movements movementsResponse
	do(t, h, "GET", "/ledger/movements?from=2026-06-01&to=2026-06-30", "", &movements)
	for _, m := range movements.Movements {
		if m.ID == payment.MovementID && (m.AssetID != house.ID || *m.CategoryID != "investment-in" || m.Flow != "transfer" || m.By != "asset") {
			t.Errorf("linked movement: %+v", m)
		}
	}

	// Unlinked by hand, its text doesn't link it again.
	body := `{"movementIds": ["` + payment.MovementID + `"], "assetId": null}`
	if w := do(t, h, "PUT", "/ledger/assets/links", body, nil); w.Code != http.StatusNoContent {
		t.Fatalf("unlink: %d %s", w.Code, w.Body)
	}
	do(t, h, "GET", "/ledger/assets", "", &list)
	if len(list.Assets[0].Payments) != 0 || list.Assets[0].Value != 0 {
		t.Errorf("after unlinking: %+v", list.Assets[0])
	}

	// Payments can't add up to more than the price.
	tooMuch := `{"kind": "property", "name": "Otra", "currency": "USD", "property": {"price": 100,
		"downPayment": {"amount": 200, "date": "2026-06-02"}}}`
	if w := do(t, h, "POST", "/ledger/assets", tooMuch, nil); w.Code != http.StatusBadRequest {
		t.Errorf("payments over the price: %d %s", w.Code, w.Body)
	}

	// Shares are worth what they cost until they have a price.
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "shares", "name": "Acciones de Prueba", "currency": "DOP",
		"shares": {"quantity": 500}}`, nil); w.Code != http.StatusCreated {
		t.Fatalf("shares: %d %s", w.Code, w.Body)
	}
	var supermarket string
	for _, m := range movements.Movements {
		if m.Amount == -300_000 {
			supermarket = m.ID
		}
	}
	body = `{"movementIds": ["` + supermarket + `"], "assetId": "acciones-de-prueba"}`
	if w := do(t, h, "PUT", "/ledger/assets/links", body, nil); w.Code != http.StatusNoContent {
		t.Fatalf("link: %d %s", w.Code, w.Body)
	}
	do(t, h, "GET", "/ledger/assets", "", &list)
	if shares := list.Assets[1]; shares.Paid != 300_000 || shares.Value != 300_000 || shares.Payments[0].Auto {
		t.Errorf("shares at cost: %+v", shares)
	}
	if w := do(t, h, "PUT", "/ledger/assets/acciones-de-prueba", `{"kind": "shares", "name": "Acciones de Prueba",
		"currency": "DOP", "shares": {"quantity": 500, "price": 1000, "priceDate": "2026-09-30"}}`, nil); w.Code != http.StatusOK {
		t.Fatalf("price: %d %s", w.Code, w.Body)
	}
	do(t, h, "GET", "/ledger/assets", "", &list)
	if shares := list.Assets[1]; shares.Value != 500_000 || len(shares.Payments) != 1 {
		t.Errorf("shares at their price: %+v", shares)
	}

	if w := do(t, h, "DELETE", "/ledger/assets/torre-de-prueba", "", nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}
	if w := do(t, h, "DELETE", "/ledger/assets/torre-de-prueba", "", nil); w.Code != http.StatusNotFound {
		t.Errorf("delete twice: %d", w.Code)
	}
}

func TestPensions(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "pension", "name": "AFP de Prueba", "currency": "DOP",
		"pension": {"balances": [{"date": "2026-08-31", "amount": 57500000}, {"date": "2025-12-31", "amount": 50000000}]}}`,
		nil); w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var list assetsResponse
	do(t, h, "GET", "/ledger/assets", "", &list)
	fund := list.Assets[0]
	if fund.Kind != "pension" || fund.Value != 57_500_000 || fund.Paid != 0 || fund.Pension == nil ||
		len(fund.Pension.Balances) != 2 || fund.Pension.Balances[0].Date != "2025-12-31" {
		t.Errorf("fund: %+v %+v", fund, fund.Pension)
	}
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "pension", "name": "Otra", "currency": "DOP",
		"pension": {"balances": []}}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("a fund without balances: %d", w.Code)
	}
}

func TestVehiclesAndLoanSchedules(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	now := time.Now().In(santoDomingo)
	date := func(t time.Time) string { return t.Format(time.DateOnly) }
	// A car bought a year ago, and its loan: paid by someone else, known to
	// owe RD$1,000,000 today with 24 installments left.
	car := `{"kind": "vehicle", "name": "Carro de Prueba", "currency": "DOP",
		"vehicle": {"price": 170000000, "date": "` + date(now.AddDate(-1, 0, 0)) + `", "rate": 0.1}}`
	loan := `{"kind": "debt", "name": "Préstamo del Carro", "currency": "DOP", "schedule": {"balance": 100000000,
		"asOf": "` + date(now) + `", "rate": 0.05, "first": "` + date(now.AddDate(-1, 0, 0)) + `",
		"last": "` + date(now.AddDate(2, 0, 0)) + `"}}`
	for _, body := range []string{car, loan} {
		if w := do(t, h, "POST", "/ledger/assets", body, nil); w.Code != http.StatusCreated {
			t.Fatalf("create: %d %s", w.Code, w.Body)
		}
	}
	var list assetsResponse
	do(t, h, "GET", "/ledger/assets", "", &list)
	byName := map[string]assetJSON{}
	for _, a := range list.Assets {
		byName[a.Name] = a
	}
	if v := byName["Carro de Prueba"].Value; v < 152_800_000 || v > 153_200_000 {
		t.Errorf("car a year later: %d", v)
	}
	debt := byName["Préstamo del Carro"]
	if debt.Value != 100_000_000 || debt.Remaining != 24 || debt.Installment < 4_380_000 || debt.Installment > 4_390_000 {
		t.Errorf("loan: %+v", debt)
	}
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "shares", "name": "Otra", "currency": "DOP",
		"shares": {"quantity": 1}, "schedule": {"balance": 1}}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("shares with a schedule: %d", w.Code)
	}
}

func TestDebts(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 6, 28, 0, 0, 0, 0, time.UTC)
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "DOP", CreditLimit: 50_000_000, Balance: -25_000_000,
			Transactions: []statements.Transaction{
				// Money in from a relative, and part of it paid back.
				{PostedOn: cut.AddDate(0, 0, -26), TransactedOn: cut.AddDate(0, 0, -26), Reference: "0570000001",
					Description: "TRANSFERENCIA DE FAMILIAR DE PRUEBA", Amount: -30_000_000},
				{PostedOn: cut, TransactedOn: cut, Reference: "0570000002",
					Description: "PAGO A FAMILIAR DE PRUEBA", Amount: 5_000_000},
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "junio.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "debt", "name": "Préstamo familiar", "currency": "DOP",
		"match": ["familiar de prueba"]}`, nil); w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var list assetsResponse
	do(t, h, "GET", "/ledger/assets", "", &list)
	debt := list.Assets[0]
	// RD$300,000 lent, RD$50,000 paid back: RD$250,000 owed.
	if debt.Value != 25_000_000 || debt.Paid != 5_000_000 || len(debt.Payments) != 2 {
		t.Errorf("debt: %+v", debt)
	}
	var movements movementsResponse
	do(t, h, "GET", "/ledger/movements?from=2026-06-01&to=2026-06-30", "", &movements)
	for _, m := range movements.Movements {
		want := "loan-payment"
		if m.Amount > 0 {
			want = "disbursement"
		}
		if *m.CategoryID != want || m.Flow != "transfer" || m.AssetID != debt.ID {
			t.Errorf("movement %s: %s %s %s", m.Description, *m.CategoryID, m.Flow, m.AssetID)
		}
	}
	if w := do(t, h, "POST", "/ledger/assets", `{"kind": "debt", "name": "Otra", "currency": "DOP",
		"property": {"price": 100}}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("a debt with a plan: %d", w.Code)
	}
}

func TestGroups(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	var group map[string]string
	if w := do(t, h, "POST", "/ledger/groups", `{"name": "Familia", "flow": "expense"}`, &group); w.Code != http.StatusCreated ||
		group["id"] != "familia" {
		t.Fatalf("group: %d %s", w.Code, w.Body)
	}
	// A new name keeps the ID, and what's filed under it.
	if w := do(t, h, "PATCH", "/ledger/groups/familia", `{"name": " Pareja "}`, nil); w.Code != http.StatusNoContent {
		t.Fatalf("rename: %d %s", w.Code, w.Body)
	}
	var categories categoriesResponse
	do(t, h, "GET", "/ledger/categories", "", &categories)
	if i := slices.IndexFunc(categories.Groups, func(g groupJSON) bool { return g.ID == "familia" }); i < 0 ||
		categories.Groups[i].Name != "Pareja" {
		t.Errorf("groups: %+v", categories.Groups)
	}
	if w := do(t, h, "PATCH", "/ledger/groups/nadie", `{"name": "Otro"}`, nil); w.Code != http.StatusNotFound {
		t.Errorf("unknown group: %d", w.Code)
	}
	if w := do(t, h, "PATCH", "/ledger/groups/familia", `{"name": " "}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("no name: %d", w.Code)
	}
	var category map[string]any
	if w := do(t, h, "POST", "/ledger/categories", `{"name": "Salud", "flow": "expense", "group": "familia"}`, &category); w.Code != http.StatusCreated ||
		category["group"] != "familia" {
		t.Fatalf("category: %d %s", w.Code, w.Body)
	}
	for _, body := range []string{`{"name": "Mías", "flow": "transfer"}`, `{"name": " ", "flow": "expense"}`} {
		if w := do(t, h, "POST", "/ledger/groups", body, nil); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, w.Code)
		}
	}
}

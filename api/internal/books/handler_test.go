package books

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

func openStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// do sends a request from this computer and decodes the answer into out.
func do(t *testing.T, h http.Handler, method, target, body string, out any) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:50000"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if out != nil {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			t.Fatalf("%s %s: %d %s", method, target, w.Code, w.Body)
		}
	}
	return w
}

func TestLocalOnly(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	r := httptest.NewRequest("GET", "/ledger/categories", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r) // from another machine
	if w.Code != http.StatusForbidden {
		t.Errorf("remote: %d", w.Code)
	}

	r = httptest.NewRequest("GET", "/ledger/categories", nil)
	r.RemoteAddr = "127.0.0.1:50000"
	r.Header.Set("Origin", "https://example.com")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("other site: %d", w.Code)
	}

	r = httptest.NewRequest("OPTIONS", "/ledger/payroll", nil)
	r.RemoteAddr = "127.0.0.1:50000"
	r.Header.Set("Origin", "http://localhost:8081")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:8081" ||
		!strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PUT") {
		t.Errorf("preflight: %d %v", w.Code, w.Header())
	}
}

func TestWithoutStore(t *testing.T) {
	if w := do(t, Handler(nil, testConvert, nil), "GET", "/ledger/categories", "", nil); w.Code != http.StatusServiceUnavailable {
		t.Errorf("got %d", w.Code)
	}
}

func TestCategories(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	var list categoriesResponse
	do(t, h, "GET", "/ledger/categories", "", &list)
	if len(list.Groups) != len(ledger.DefaultGroups) || len(list.Categories) != len(ledger.DefaultCategories) {
		t.Fatalf("%d groups, %d categories", len(list.Groups), len(list.Categories))
	}

	var added categoryJSON
	w := do(t, h, "POST", "/ledger/categories", `{"name": " Pagos del exterior ", "flow": "income"}`, &added)
	if w.Code != http.StatusCreated || added.ID != "pagos-del-exterior" || added.Group != "other-income" {
		t.Errorf("added %d %+v", w.Code, added)
	}
	if w := do(t, h, "POST", "/ledger/categories", `{"name": "X", "flow": "gift"}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("unknown flow: %d", w.Code)
	}
	if w := do(t, h, "POST", "/ledger/categories", `{"name": "X", "flow": "income", "group": "food"}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("group of another flow: %d", w.Code)
	}
	if w := do(t, h, "PATCH", "/ledger/categories/pagos-del-exterior", `{"name": "Freelance", "archived": true}`, nil); w.Code != http.StatusNoContent {
		t.Errorf("update: %d %s", w.Code, w.Body)
	}
	if w := do(t, h, "PATCH", "/ledger/categories/nope", `{"archived": true}`, nil); w.Code != http.StatusNotFound {
		t.Errorf("missing: %d", w.Code)
	}
}

func TestRulesAndPayroll(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	var rules rulesBody
	w := do(t, h, "PUT", "/ledger/rules", `{"rules": [
		{"name": "Regalía", "contains": ["nomina"], "months": [12], "minAmount": 8000000, "categoryId": "bonus"},
		{"name": "Dólares", "direction": "in", "currency": "USD", "categoryId": "extra-income", "review": true}
	]}`, &rules)
	if w.Code != http.StatusOK || len(rules.Rules) != 2 || rules.Rules[1].Direction != "in" || !rules.Rules[1].Review {
		t.Fatalf("rules %d %+v", w.Code, rules)
	}
	for _, body := range []string{
		`{"rules": [{"name": "Todo", "categoryId": "bonus"}]}`,
		`{"rules": [{"contains": ["x"], "categoryId": "nope"}]}`,
		`{"rules": [{"contains": ["x"], "months": [13], "categoryId": "bonus"}]}`,
		`{"rules": [{"direction": "sideways", "categoryId": "bonus"}]}`,
		`{"rules": [{"contains": ["x"], "category": "bonus"}]}`,
	} {
		if w := do(t, h, "PUT", "/ledger/rules", body, nil); w.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, w.Code)
		}
	}

	var payroll payrollJSON
	do(t, h, "GET", "/ledger/payroll", "", &payroll)
	if payroll.Keyword != "nomina" || len(payroll.Days) != 2 {
		t.Errorf("default payroll %+v", payroll)
	}
	w = do(t, h, "PUT", "/ledger/payroll", `{"accountId": "popular:checking:1111:DOP", "keyword": "nomina", "days": [30, 15, 15], "daysBefore": 2, "daysAfter": 1}`, &payroll)
	if w.Code != http.StatusOK || payroll.AccountID != "popular:checking:1111:DOP" || len(payroll.Days) != 2 || payroll.Days[0] != 15 {
		t.Errorf("payroll %d %+v", w.Code, payroll)
	}
	if w := do(t, h, "PUT", "/ledger/payroll", `{"keyword": "nomina", "days": [32]}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("day 32: %d", w.Code)
	}
}

func TestMovements(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "DOP", CreditLimit: 5_000_000, PreviousBalance: 100_000, Balance: 300_000,
			Transactions: []statements.Transaction{
				{PostedOn: cut.AddDate(0, 0, -20), TransactedOn: cut.AddDate(0, 0, -20), Reference: "0570000001", Description: "Pago Via App", Amount: -100_000},
				{PostedOn: cut, TransactedOn: cut, Reference: "10000000000000000000001",
					Description: "SUPERMERCADO UNO  SANTO DOMINGO", MCC: "5411", Authorization: "000101", Amount: 300_000},
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)

	var list movementsResponse
	do(t, h, "GET", "/ledger/movements?from=2026-01-01&to=2026-01-31", "", &list)
	// The card, and cash in pesos to write down what's spent in it.
	if len(list.Accounts) != 2 || list.Accounts[1].ID != "cash:cash::DOP" || list.Accounts[1].Kind != "cash" || len(list.Movements) != 2 {
		t.Fatalf("got %+v", list)
	}
	newest, oldest := list.Movements[0], list.Movements[1]
	if newest.Date != "2026-01-28" || newest.Amount != -300_000 || *newest.CategoryID != "groceries" || newest.Flow != "expense" ||
		oldest.Flow != "transfer" || *oldest.CategoryID != "card-payment" {
		t.Errorf("movements %+v %+v", newest, oldest)
	}

	body := `{"movementId": "` + newest.ID + `", "categoryId": "restaurants"}`
	if w := do(t, h, "PUT", "/ledger/classifications", body, nil); w.Code != http.StatusNoContent {
		t.Fatalf("classify: %d %s", w.Code, w.Body)
	}
	do(t, h, "GET", "/ledger/movements?from=2026-01-28&to=2026-01-28", "", &list)
	if len(list.Movements) != 1 || *list.Movements[0].CategoryID != "restaurants" || list.Movements[0].By != "manual" {
		t.Errorf("after correcting: %+v", list.Movements)
	}
	body = `{"movementId": "` + newest.ID + `", "categoryId": null}`
	if w := do(t, h, "PUT", "/ledger/classifications", body, nil); w.Code != http.StatusNoContent {
		t.Fatalf("undo: %d %s", w.Code, w.Body)
	}
	if w := do(t, h, "PUT", "/ledger/classifications", `{"movementId": "x", "categoryId": "nope"}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("missing category: %d", w.Code)
	}
	if w := do(t, h, "GET", "/ledger/movements?from=2026-02-01&to=2026-01-01", "", nil); w.Code != http.StatusBadRequest {
		t.Errorf("backwards range: %d", w.Code)
	}
}

func TestMovementsByHand(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "DOP", CreditLimit: 5_000_000,
			Transactions: []statements.Transaction{
				// A code Domfin doesn't know: it asks for a look.
				{PostedOn: cut, TransactedOn: cut, Reference: "10000000000000000000001", Description: "COMERCIO RARO", MCC: "1234", Amount: 80_000},
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)
	get := func(from, to string) []movementJSON {
		t.Helper()
		var list movementsResponse
		do(t, h, "GET", "/ledger/movements?from="+from+"&to="+to, "", &list)
		return list.Movements
	}

	var added struct{ ID string }
	body := `{"accountId": "popular:credit_card:1234:DOP", "date": "2026-02-05", "description": "Colmado", "amount": -50000,
		"categoryId": "groceries", "notes": "pan"}`
	if w := do(t, h, "POST", "/ledger/movements", body, &added); w.Code != http.StatusCreated || added.ID != "manual:1" {
		t.Fatalf("add: %d %s", w.Code, w.Body)
	}
	got := get("2026-02-01", "2026-02-28")
	if len(got) != 1 || !got[0].Manual || got[0].Notes != "pan" || got[0].Amount != -50_000 || got[0].Currency != "DOP" ||
		*got[0].CategoryID != "groceries" || got[0].By != "manual" || got[0].Review || got[0].Hidden {
		t.Fatalf("added: %+v", got)
	}
	if w := do(t, h, "POST", "/ledger/movements", `{"accountId": "popular:credit_card:1234:DOP", "date": "2026-02-05", "description": "Nada", "amount": 0}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("without an amount: %d", w.Code)
	}

	// Hide the one added by hand; mark the imported one reviewed.
	imported := get("2026-01-28", "2026-01-28")[0]
	if !imported.Review {
		t.Fatalf("imported: %+v", imported)
	}
	for _, body := range []string{
		`{"movementIds": ["manual:1"], "hidden": true}`,
		`{"movementIds": ["` + imported.ID + `"], "reviewed": true}`,
	} {
		if w := do(t, h, "PUT", "/ledger/marks", body, nil); w.Code != http.StatusNoContent {
			t.Fatalf("mark %s: %d %s", body, w.Code, w.Body)
		}
	}
	if got := get("2026-01-28", "2026-02-28"); len(got) != 2 || !got[0].Hidden || got[1].Review || got[1].Hidden {
		t.Errorf("marked: %+v", got)
	}
	for _, body := range []string{`{"movementIds": []}`, `{"movementIds": ["manual:1"]}`} {
		if w := do(t, h, "PUT", "/ledger/marks", body, nil); w.Code != http.StatusBadRequest {
			t.Errorf("marks %s: %d", body, w.Code)
		}
	}

	if w := do(t, h, "DELETE", "/ledger/movements/manual%3A1", "", nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	for _, id := range []string{"manual:1", url.PathEscape(imported.ID)} {
		if w := do(t, h, "DELETE", "/ledger/movements/"+id, "", nil); w.Code != http.StatusNotFound {
			t.Errorf("delete %s: %d", id, w.Code)
		}
	}
	if got := get("2026-02-01", "2026-02-28"); len(got) != 0 {
		t.Errorf("after deleting: %+v", got)
	}
}

func TestUndetailedCash(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC)
	withdrawn := time.Date(2026, 3, 5, 0, 0, 0, 0, time.UTC)
	st := statements.AccountStatement{
		Institution: "popular", Product: "AHORRO EMPLEADO", Last4: "1111", Currency: "DOP", CutDate: cut,
		PreviousBalance: 1_000_000, Balance: 500_000,
		Transactions: []statements.AccountTransaction{
			{PostedOn: withdrawn, TransactedOn: withdrawn, Description: "COD CASH 1234", Amount: -500_000, Balance: 500_000},
		},
	}
	if _, err := s.SaveAccountStatement(context.Background(), st, nil, store.Source{Name: "marzo.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)
	get := func() []movementJSON {
		t.Helper()
		var list movementsResponse
		do(t, h, "GET", "/ledger/movements?from=2026-03-01&to=2026-03-31", "", &list)
		return list.Movements
	}

	// 1,200 of the 5,000 went to the colmado.
	body := `{"accountId": "cash:cash::DOP", "date": "2026-03-06", "description": "Colmado", "amount": -120000, "categoryId": "groceries"}`
	if w := do(t, h, "POST", "/ledger/movements", body, nil); w.Code != http.StatusCreated {
		t.Fatalf("add: %d %s", w.Code, w.Body)
	}
	got := get()
	if len(got) != 3 {
		t.Fatalf("movements: %+v", got)
	}
	colmado, rest, withdrawal := got[0], got[1], got[2]
	if colmado.AccountID != "cash:cash::DOP" || withdrawal.Flow != "transfer" || *withdrawal.CategoryID != ledger.CategoryCashWithdrawal {
		t.Errorf("colmado %+v, withdrawal %+v", colmado, withdrawal)
	}
	if rest.ID != "cash:"+withdrawal.ID || rest.AccountID != "cash:cash::DOP" || rest.Date != "2026-03-05" || rest.Amount != -380_000 ||
		rest.Flow != "expense" || *rest.CategoryID != ledger.CategoryUndetailedCash || rest.By != "cash" || rest.Kind != "undetailed_cash" {
		t.Errorf("undetailed: %+v", rest)
	}

	// Filed elsewhere, it's no longer undetailed.
	if w := do(t, h, "PUT", "/ledger/classifications", `{"movementId": "`+rest.ID+`", "categoryId": "personal-care"}`, nil); w.Code != http.StatusNoContent {
		t.Fatalf("classify: %d %s", w.Code, w.Body)
	}
	if got := get(); *got[1].CategoryID != "personal-care" || got[1].By != "manual" {
		t.Errorf("filed: %+v", got[1])
	}

	// A hidden withdrawal leaves nothing to detail.
	if w := do(t, h, "PUT", "/ledger/marks", `{"movementIds": ["`+withdrawal.ID+`"], "hidden": true}`, nil); w.Code != http.StatusNoContent {
		t.Fatalf("hide: %d %s", w.Code, w.Body)
	}
	if got := get(); len(got) != 2 || !got[1].Hidden || got[0].ID != colmado.ID {
		t.Errorf("after hiding the withdrawal: %+v", got)
	}
}

func TestNames(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)
	purchase := func(day int, reference, description string, amount int64) statements.Transaction {
		date := cut.AddDate(0, 0, -day)
		return statements.Transaction{PostedOn: date, TransactedOn: date, Reference: reference, Description: description,
			MCC: "4121", Amount: amount}
	}
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "DOP", CreditLimit: 5_000_000,
			Transactions: []statements.Transaction{
				purchase(3, "10000000000000000000001", "UBER RIDES-*UBER RIDES  SAN FRANCISCO", 25_000),
				purchase(2, "10000000000000000000002", "UBER *TRIP  SAN FRANCISCO", 31_000),
				purchase(1, "10000000000000000000003", "SUPERMERCADO UNO  SANTO DOMINGO", 300_000),
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	h := Handler(s, testConvert, nil)
	names := func() []string {
		t.Helper()
		var list movementsResponse
		do(t, h, "GET", "/ledger/movements?from=2026-01-01&to=2026-01-31", "", &list)
		var out []string
		for _, m := range list.Movements {
			out = append(out, m.Name+" · "+m.NameKey+" · "+m.MerchantID)
		}
		return out
	}
	want := []string{
		"Supermercado Uno · name:supermercado uno · ",
		"Uber · merchant:uber · uber",
		"Uber · merchant:uber · uber",
	}
	if got := names(); !slices.Equal(got, want) {
		t.Fatalf("names:\n%q\nwant\n%q", got, want)
	}

	// Renamed, every way the bank prints it takes the name.
	if w := do(t, h, "PUT", "/ledger/names", `{"key": "merchant:uber", "name": " Uber del trabajo "}`, nil); w.Code != http.StatusNoContent {
		t.Fatalf("rename: %d %s", w.Code, w.Body)
	}
	if got := names(); got[1] != "Uber del trabajo · merchant:uber · uber" || got[2] != got[1] {
		t.Errorf("renamed: %q", got)
	}
	// An empty name gives it back Domfin's.
	if w := do(t, h, "PUT", "/ledger/names", `{"key": "merchant:uber", "name": ""}`, nil); w.Code != http.StatusNoContent {
		t.Fatalf("undo: %d %s", w.Code, w.Body)
	}
	if got := names(); !slices.Equal(got, want) {
		t.Errorf("after undoing: %q", got)
	}
	if w := do(t, h, "PUT", "/ledger/names", `{"key": "", "name": "Algo"}`, nil); w.Code != http.StatusBadRequest {
		t.Errorf("without a key: %d", w.Code)
	}
}

package accounts

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/pdftext"
	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/testpdf"
)

func newHandler(t *testing.T) http.Handler {
	t.Helper()
	return Handler(newStore(t))
}

// newStore holds a loan history: disbursed in January 2026, paid down since.
func newStore(t *testing.T) *store.Store {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	pages, err := pdftext.Read(testpdf.PopularLoan(t), "")
	if err != nil {
		t.Fatal(err)
	}
	loan, issues, err := statements.ParsePopularLoan(pages)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.SaveLoanHistory(context.Background(), loan, issues, store.Source{Name: "historial.pdf"}); err != nil {
		t.Fatal(err)
	}
	return db
}

func get(handler http.Handler, target, remote string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.RemoteAddr = remote
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestAccounts(t *testing.T) {
	handler := newHandler(t)
	rec := get(handler, "/accounts?from=2025-12&to=2026-02", "127.0.0.1:52000")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var body response
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Accounts) != 1 {
		t.Fatalf("accounts = %+v", body.Accounts)
	}
	a := body.Accounts[0]
	if a.ID != "popular:loan:1234:DOP" || a.Kind != "loan" || a.Last4 != "1234" || a.Currency != "DOP" ||
		a.Balance != 9_700_000 || a.AsOf != "2026-09-30" || len(a.Months) != 3 {
		t.Fatalf("account = %+v", a)
	}
	if a.Months[0].Balance != nil || *a.Months[1].Balance != 10_000_000 || *a.Months[2].Balance != 9_700_000 {
		t.Errorf("months = %+v", a.Months)
	}

	// Without a range: the twelve months up to the latest statement.
	rec = get(handler, "/accounts", "127.0.0.1:52000")
	body = response{}
	json.Unmarshal(rec.Body.Bytes(), &body)
	if months := body.Accounts[0].Months; len(months) != 12 || months[0].Month != "2025-10" || months[11].Month != "2026-09" {
		t.Errorf("default months = %+v", months)
	}
}

func TestAccountsRejects(t *testing.T) {
	handler := newHandler(t)
	for target, remote := range map[string]string{
		"/accounts?from=2026-03&to=2026-01": "127.0.0.1:52000",
		"/accounts?from=2020-01&to=2026-01": "127.0.0.1:52000",
		"/accounts?from=enero":              "127.0.0.1:52000",
		"/accounts":                         "192.168.1.20:52000",
	} {
		rec := get(handler, target, remote)
		if rec.Code != http.StatusBadRequest && rec.Code != http.StatusForbidden {
			t.Errorf("%s from %s: status %d", target, remote, rec.Code)
		}
	}
}

func TestAccountsIncludePensions(t *testing.T) {
	db := newStore(t)
	same := func(_ context.Context, cents int64, _, _, _ string) (int64, error) { return cents, nil }
	fund := assets.Asset{Kind: assets.Pension, Name: "AFP de Prueba", Currency: "DOP", Pension: &assets.Fund{
		Balances: []assets.Balance{{Date: "2026-01-31", Amount: 50_000_000}, {Date: "2026-02-28", Amount: 51_000_000}},
	}}
	if _, err := db.SaveAsset(context.Background(), fund, same); err != nil {
		t.Fatal(err)
	}
	rec := get(Handler(db), "/accounts?from=2025-12&to=2026-03", "127.0.0.1:52000")
	var body response
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	a := body.Accounts[len(body.Accounts)-1]
	if a.ID != "asset:afp-de-prueba" || a.Kind != "pension" || a.Balance != 51_000_000 || a.AsOf != "2026-02-28" ||
		a.Months[0].Balance != nil || *a.Months[1].Balance != 50_000_000 || *a.Months[3].Balance != 51_000_000 {
		t.Errorf("fund = %+v %+v", a, a.Months)
	}
}

func TestAccountsIncludeAssets(t *testing.T) {
	db := newStore(t)
	ctx := context.Background()
	same := func(_ context.Context, cents int64, _, _, _ string) (int64, error) { return cents, nil }
	home := assets.Asset{Kind: assets.Property, Name: "Casa de Prueba", Currency: "DOP",
		Property: &assets.Plan{Price: 50_000_000}}
	if _, err := db.SaveAsset(ctx, home, same); err != nil {
		t.Fatal(err)
	}
	movements, err := db.Movements(ctx, "0000-01-01", "9999-12-31")
	if err != nil {
		t.Fatal(err)
	}
	// Say the loan's disbursement paid for the home.
	var disbursement string
	for _, m := range movements {
		if m.Kind == ledger.Disbursement {
			disbursement = m.ID
		}
	}
	if err := db.LinkMovements(ctx, []string{disbursement}, "casa-de-prueba", same); err != nil {
		t.Fatal(err)
	}

	rec := get(Handler(db), "/accounts?from=2025-12&to=2026-02", "127.0.0.1:52000")
	var body response
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Accounts) != 2 {
		t.Fatalf("accounts = %+v", body.Accounts)
	}
	a := body.Accounts[1]
	if a.ID != "asset:casa-de-prueba" || a.Kind != "real_estate" || a.Name != "Casa de Prueba" || a.Balance != 10_000_000 ||
		a.Months[0].Balance != nil || *a.Months[1].Balance != 10_000_000 || *a.Months[2].Balance != 10_000_000 {
		t.Errorf("asset = %+v %+v", a, a.Months)
	}
}

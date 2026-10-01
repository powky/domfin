package books

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
	if len(list.Accounts) != 1 || len(list.Movements) != 2 {
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

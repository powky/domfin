package importer

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/testpdf"
)

const testPassword = "clave de prueba"

func newTestHandler(t *testing.T) http.Handler {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return Handler(&Importer{Store: db, Password: testPassword})
}

// upload builds a request from this computer with the files in a form.
func upload(t *testing.T, files map[string][]byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for name, data := range files {
		part, err := form.CreateFormFile("files", name)
		if err != nil {
			t.Fatal(err)
		}
		part.Write(data)
	}
	form.Close()
	req := httptest.NewRequest(http.MethodPost, "/statements/import", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.RemoteAddr = "127.0.0.1:52000"
	return req
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("body %q: %v", rec.Body.String(), err)
	}
	return out
}

func TestImportEndpoint(t *testing.T) {
	handler := newTestHandler(t)
	req := upload(t, map[string][]byte{
		"estado.pdf":    testpdf.PopularCard(t, testPassword),
		"historial.pdf": testpdf.PopularLoan(t),
		"cuenta.pdf":    testpdf.PopularAccount(t),
		"cd.pdf":        testpdf.PopularCertificate(t),
		"otro.pdf":      testpdf.Build(t, "", []testpdf.Text{{X: 50, Y: 100, S: "Otro documento"}}),
		"ajeno.pdf":     testpdf.PopularCard(t, "otra clave"),
	})
	req.Header.Set("Origin", "http://localhost:8081")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8081" {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}

	body := decode[importResponse](t, rec)
	if len(body.Results) != 6 {
		t.Fatalf("results = %+v", body.Results)
	}
	// Bank accounts first, then cards, loans and certificates.
	bank, card, loan, cd := body.Results[0], body.Results[1], body.Results[2], body.Results[3]
	if cd.File != "cd.pdf" || cd.Status != Added || cd.Account == nil || cd.Account.Kind != store.Certificate ||
		cd.Account.Last4 != "1234" || cd.Date != "2026-09-30" || cd.From != "2026-07-22" ||
		len(cd.Sections) != 1 || cd.Sections[0] != (sectionJSON{"DOP", 5}) {
		t.Errorf("certificate result = %+v (account %+v)", cd, cd.Account)
	}
	if bank.File != "cuenta.pdf" || bank.Status != Added || bank.Account == nil || bank.Account.Kind != store.Savings ||
		bank.Account.Name != "Ahorro Empleado" || bank.Account.Last4 != "1234" || bank.Account.Currency != "DOP" ||
		bank.Date != "2026-08-20" || len(bank.Sections) != 1 || bank.Sections[0] != (sectionJSON{"DOP", 4}) || len(bank.Issues) > 0 {
		t.Errorf("bank result = %+v (account %+v)", bank, bank.Account)
	}
	if card.File != "estado.pdf" || card.Status != Added || card.Account == nil || card.Account.Kind != store.CreditCard ||
		card.Account.Name != "Prueba" || card.Account.Last4 != "1234" || card.Date != "2026-01-28" ||
		len(card.Sections) != 2 || card.Sections[0] != (sectionJSON{"DOP", 2}) || card.Sections[1] != (sectionJSON{"USD", 1}) {
		t.Errorf("card result = %+v (account %+v)", card, card.Account)
	}
	if loan.File != "historial.pdf" || loan.Status != Added || loan.Account == nil || loan.Account.Kind != store.Loan ||
		loan.Account.Last4 != "1234" || loan.Account.Currency != "DOP" || loan.Date != "2026-09-30" || loan.From != "2026-01-10" ||
		len(loan.Sections) != 1 || loan.Sections[0] != (sectionJSON{"DOP", 2}) {
		t.Errorf("loan result = %+v (account %+v)", loan, loan.Account)
	}
	// Files that aren't statements go last, in the order they came.
	rest := map[string]resultJSON{body.Results[4].File: body.Results[4], body.Results[5].File: body.Results[5]}
	if r := rest["otro.pdf"]; r.Status != Skipped || r.Reason != ReasonUnsupported || r.Account != nil {
		t.Errorf("otro.pdf = %+v", r)
	}
	if r := rest["ajeno.pdf"]; r.Status != Failed || r.Reason != ReasonWrongPassword {
		t.Errorf("ajeno.pdf = %+v", r)
	}

	// The same card statement again changes nothing.
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, upload(t, map[string][]byte{"copia.pdf": testpdf.PopularCard(t, testPassword)}))
	if again := decode[importResponse](t, rec); len(again.Results) != 1 || again.Results[0].Status != Unchanged {
		t.Errorf("second upload = %+v", again)
	}

	req = httptest.NewRequest(http.MethodGet, "/statements/coverage", nil)
	req.RemoteAddr = "[::1]:52000"
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	coverage := decode[coverageResponse](t, rec)
	if len(coverage.Accounts) != 4 || coverage.Accounts[3].Account.Kind != store.Certificate {
		t.Fatalf("coverage = %+v", coverage)
	}
	bankMonths, cardMonths, loanMonths := coverage.Accounts[0], coverage.Accounts[1], coverage.Accounts[2]
	if bankMonths.Account.Kind != store.Savings || len(bankMonths.Months) != 1 || bankMonths.Months[0].Status != "ok" ||
		bankMonths.Months[0].Month != "2026-08" {
		t.Errorf("bank months = %+v", bankMonths)
	}
	if cardMonths.Account.Kind != store.CreditCard || len(cardMonths.Months) != 1 ||
		cardMonths.Months[0].Month != "2026-01" || cardMonths.Months[0].Status != "ok" || cardMonths.Months[0].Date != "2026-01-28" {
		t.Errorf("card months = %+v", cardMonths)
	}
	// From the first movement to the day the history was generated.
	if loanMonths.Account.Kind != store.Loan || len(loanMonths.Months) != 9 ||
		loanMonths.Months[0].Month != "2026-01" || loanMonths.Months[8].Month != "2026-09" || loanMonths.Months[8].Status != "ok" {
		t.Errorf("loan months = %+v", loanMonths)
	}
}

func TestImportEndpointNeedsFiles(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestHandler(t).ServeHTTP(rec, upload(t, nil))
	if rec.Code != http.StatusBadRequest || decode[map[string]string](t, rec)["error"] != "no_files" {
		t.Errorf("status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStatementsOnlyAnswerThisComputer(t *testing.T) {
	handler := newTestHandler(t)
	for name, req := range map[string]*http.Request{
		"another device": func() *http.Request {
			req := httptest.NewRequest(http.MethodGet, "/statements/coverage", nil)
			req.RemoteAddr = "192.168.1.20:52000"
			return req
		}(),
		"another site": func() *http.Request {
			req := upload(t, map[string][]byte{"estado.pdf": testpdf.PopularCard(t, testPassword)})
			req.Header.Set("Origin", "https://example.com")
			return req
		}(),
	} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden || rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("%s: status %d, allow origin %q", name, rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
		}
	}

	// The web app's preflight from another localhost port goes through.
	req := httptest.NewRequest(http.MethodOptions, "/statements/import", nil)
	req.RemoteAddr = "127.0.0.1:52000"
	req.Header.Set("Origin", "http://127.0.0.1:8095")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Origin") != "http://127.0.0.1:8095" {
		t.Errorf("preflight: status %d, headers %v", rec.Code, rec.Header())
	}
}

func TestImportEndpointReadsPayStubs(t *testing.T) {
	handler := newTestHandler(t)
	stub := testpdf.PopularPayslip(t, "28/01/2026", []testpdf.PayslipRow{
		{"SUELDO", "90,000.00", "45,000.00", ""},
		{"LEY 11-92", "10,000.00", "", "5,000.00"},
	}, "45,000.00", "5,000.00", "40,000.00")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, upload(t, map[string][]byte{"volante.pdf": stub}))
	body := decode[importResponse](t, rec)
	if len(body.Results) != 1 {
		t.Fatalf("results = %+v", body.Results)
	}
	got := body.Results[0]
	want := payslipJSON{Employer: "BANCO POPULAR DOMINICANO", Income: 4_500_000, Deductions: 500_000, Net: 4_000_000}
	if got.Status != Added || got.Date != "2026-01-28" || got.Account != nil || got.Payslip == nil || *got.Payslip != want || len(got.Issues) > 0 {
		t.Errorf("stub result = %+v (payslip %+v)", got, got.Payslip)
	}

	// The same stub again changes nothing, and it never makes an account.
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, upload(t, map[string][]byte{"copia.pdf": stub}))
	if again := decode[importResponse](t, rec); len(again.Results) != 1 || again.Results[0].Status != Unchanged {
		t.Errorf("second upload = %+v", again)
	}
	req := httptest.NewRequest(http.MethodGet, "/statements/coverage", nil)
	req.RemoteAddr = "127.0.0.1:52000"
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if coverage := decode[coverageResponse](t, rec); len(coverage.Accounts) != 0 {
		t.Errorf("coverage = %+v", coverage)
	}
}

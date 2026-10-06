package importer

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/powky/domfin/api/internal/localonly"
	"github.com/powky/domfin/api/internal/store"
)

// Uploads are read in memory, never written to a temporary file.
const maxUpload = 32 << 20

// Handler serves the statement endpoints:
//
//	POST   /statements/import    multipart form with one or more PDFs in "files"
//	GET    /statements/coverage  each account's months and whether they check out
//	GET    /statements/password  whether a password for the PDFs is saved (never the password)
//	PUT    /statements/password  saves it: {"password"}
//	DELETE /statements/password  forgets it
//
// They handle bank data, so they only answer this computer (the web app in
// development, a simulator) and pages served from localhost: not other
// devices on the network nor other sites open in the browser.
func Handler(im *Importer) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /statements/import", im.serveImport)
	mux.HandleFunc("GET /statements/coverage", im.serveCoverage)
	mux.HandleFunc("GET /statements/password", im.servePassword)
	mux.HandleFunc("PUT /statements/password", im.setPassword)
	mux.HandleFunc("DELETE /statements/password", im.forgetPassword)
	return localonly.Handler(mux)
}

// servePassword says whether the PDFs have a password to open with: one
// saved in Settings, or one in the environment. Never which.
func (im *Importer) servePassword(w http.ResponseWriter, r *http.Request) {
	if im.Store == nil {
		writeError(w, http.StatusServiceUnavailable, "store_unavailable")
		return
	}
	saved, err := im.Store.StatementsPassword(r.Context())
	if err != nil {
		log.Printf("contraseña de los estados: %v", err)
		writeError(w, http.StatusInternalServerError, "password_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"saved": saved != "", "environment": im.Password != ""})
}

func (im *Importer) setPassword(w http.ResponseWriter, r *http.Request) {
	im.savePassword(w, r, true)
}

func (im *Importer) forgetPassword(w http.ResponseWriter, r *http.Request) {
	im.savePassword(w, r, false)
}

func (im *Importer) savePassword(w http.ResponseWriter, r *http.Request, set bool) {
	if im.Store == nil {
		writeError(w, http.StatusServiceUnavailable, "store_unavailable")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if set {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil || body.Password == "" {
			writeError(w, http.StatusBadRequest, "bad_password")
			return
		}
	}
	if err := im.Store.SetStatementsPassword(r.Context(), body.Password); err != nil {
		log.Printf("contraseña de los estados: %v", err)
		writeError(w, http.StatusInternalServerError, "password_failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (im *Importer) serveImport(w http.ResponseWriter, r *http.Request) {
	if im.Store == nil {
		writeError(w, http.StatusServiceUnavailable, "store_unavailable")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large")
			return
		}
		writeError(w, http.StatusBadRequest, "bad_form")
		return
	}
	defer r.MultipartForm.RemoveAll()

	var files []File
	for _, header := range r.MultipartForm.File["files"] {
		file, err := header.Open()
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_form")
			return
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_form")
			return
		}
		files = append(files, File{Name: filepath.Base(header.Filename), Data: data})
	}
	if len(files) == 0 {
		writeError(w, http.StatusBadRequest, "no_files")
		return
	}

	results := im.ImportAll(r.Context(), files)
	body := importResponse{Results: make([]resultJSON, len(results))}
	for i, result := range results {
		body.Results[i] = toResultJSON(result)
	}
	writeJSON(w, http.StatusOK, body)
}

func (im *Importer) serveCoverage(w http.ResponseWriter, r *http.Request) {
	if im.Store == nil {
		writeError(w, http.StatusServiceUnavailable, "store_unavailable")
		return
	}
	accounts, err := im.Store.Coverage(r.Context())
	if err != nil {
		log.Printf("meses importados: %v", err)
		writeError(w, http.StatusInternalServerError, "coverage_failed")
		return
	}
	body := coverageResponse{Accounts: make([]accountMonthsJSON, len(accounts))}
	for i, account := range accounts {
		months := make([]monthJSON, len(account.Months))
		for j, month := range account.Months {
			months[j] = monthJSON{Month: month.Month, Status: month.Status(), Date: month.Date, Issues: month.Issues}
			for _, section := range month.Sections {
				months[j].Sections = append(months[j].Sections, sectionJSON{section.Currency, section.Transactions})
			}
		}
		body.Accounts[i] = accountMonthsJSON{Account: toAccountJSON(account.Account), Months: months}
	}
	writeJSON(w, http.StatusOK, body)
}

type importResponse struct {
	Results []resultJSON `json:"results"`
}

type resultJSON struct {
	File   string `json:"file"`
	Status Status `json:"status"`
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
	// Set for statements.
	Account  *accountJSON  `json:"account,omitempty"`
	Date     string        `json:"date,omitempty"`
	From     string        `json:"from,omitempty"`
	Sections []sectionJSON `json:"sections,omitempty"`
	// Set for pay stubs, with Date (the payroll's) instead of an account.
	Payslip *payslipJSON `json:"payslip,omitempty"`
	Issues  []string     `json:"issues,omitempty"`
}

type payslipJSON struct {
	Employer   string `json:"employer"`
	Income     int64  `json:"income"`
	Deductions int64  `json:"deductions"`
	Net        int64  `json:"net"`
}

type accountJSON struct {
	Kind        string `json:"kind"`
	Institution string `json:"institution"`
	Name        string `json:"name,omitempty"`
	Brand       string `json:"brand,omitempty"`
	Product     string `json:"product,omitempty"`
	Last4       string `json:"last4"`
	Currency    string `json:"currency,omitempty"`
}

type sectionJSON struct {
	Currency     string `json:"currency"`
	Transactions int    `json:"transactions"`
}

type coverageResponse struct {
	Accounts []accountMonthsJSON `json:"accounts"`
}

type accountMonthsJSON struct {
	Account accountJSON `json:"account"`
	Months  []monthJSON `json:"months"`
}

type monthJSON struct {
	Month    string        `json:"month"`
	Status   string        `json:"status"`
	Date     string        `json:"date,omitempty"`
	Sections []sectionJSON `json:"sections,omitempty"`
	Issues   []string      `json:"issues,omitempty"`
}

func toResultJSON(r Result) resultJSON {
	out := resultJSON{File: r.File, Status: r.Status, Reason: r.Reason, Detail: r.Detail, Issues: r.Issues}
	if !r.Imported() {
		return out
	}
	if r.Payslip != nil {
		out.Date = formatDate(r.Date)
		out.Payslip = &payslipJSON{Employer: r.Payslip.Employer, Income: r.Payslip.Income, Deductions: r.Payslip.Deductions, Net: r.Payslip.Net}
		return out
	}
	account := toAccountJSON(r.Account)
	out.Account = &account
	out.Date = formatDate(r.Date)
	out.From = formatDate(r.From)
	for _, section := range r.Sections {
		out.Sections = append(out.Sections, sectionJSON{section.Currency, section.Transactions})
	}
	return out
}

func toAccountJSON(a store.Account) accountJSON {
	return accountJSON{
		Kind: a.Kind, Institution: a.Institution, Name: a.Name, Brand: a.Brand,
		Product: a.Product, Last4: a.Last4, Currency: a.Currency,
	}
}

func formatDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("responder: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

package books

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"
)

// salaryKey is the setting that keeps what the user told about their salary.
const salaryKey = "salary"

// maxSalaryEntries limits the salaries set by hand, so a mistaken request
// can't grow them without end.
const maxSalaryEntries = 100

// salaryEntryJSON is a gross monthly salary the user set, from a month on:
// for the months no pay stub covers, or a raise no stub shows yet.
type salaryEntryJSON struct {
	// Since is the first month it applies to: "2026-07".
	Since string `json:"since"`
	// Amount is the gross salary a month, in cents of Currency.
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
}

// salaryJSON is what the app figures the Christmas salary and the
// profit-sharing bonus with besides the pay stubs: the salaries set by
// hand, oldest first; the day the job started (the bonus is 45 days of
// salary before three years and 60 after); and the month the bonus is paid,
// 0 when it isn't.
type salaryJSON struct {
	Entries    []salaryEntryJSON `json:"entries"`
	HiredOn    string            `json:"hiredOn,omitempty"`
	BonusMonth *int              `json:"bonusMonth,omitempty"`
}

func (b *books) serveSalary(w http.ResponseWriter, r *http.Request) {
	salary, err := b.salary(r.Context())
	if err != nil {
		log.Printf("sueldo: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	writeJSON(w, http.StatusOK, salary)
}

func (b *books) salary(ctx context.Context) (salaryJSON, error) {
	var salary salaryJSON
	if _, err := b.store.Setting(ctx, salaryKey, &salary); err != nil {
		return salaryJSON{}, err
	}
	if salary.Entries == nil {
		salary.Entries = []salaryEntryJSON{}
	}
	return salary, nil
}

// setSalary replaces what the user told about their salary, like the
// budget: the app sends it all back with each change.
func (b *books) setSalary(w http.ResponseWriter, r *http.Request) {
	var body salaryJSON
	if !readJSON(w, r, &body) {
		return
	}
	salary, err := cleanSalary(body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_salary", "detail": err.Error()})
		return
	}
	if b.ok(w, b.store.SetSetting(r.Context(), salaryKey, salary)) {
		writeJSON(w, http.StatusOK, salary)
	}
}

// cleanSalary checks the salary settings and sorts the entries by month:
// one entry a month, an amount above zero, a real day the job started and a
// month for the bonus from 0 to 12.
func cleanSalary(in salaryJSON) (salaryJSON, error) {
	if len(in.Entries) > maxSalaryEntries {
		return salaryJSON{}, fmt.Errorf("más de %d sueldos", maxSalaryEntries)
	}
	out := salaryJSON{Entries: []salaryEntryJSON{}, HiredOn: strings.TrimSpace(in.HiredOn), BonusMonth: in.BonusMonth}
	months := map[string]bool{}
	for _, entry := range in.Entries {
		entry.Since = strings.TrimSpace(entry.Since)
		if _, err := time.Parse("2006-01", entry.Since); err != nil {
			return salaryJSON{}, fmt.Errorf("mes %q: va como 2026-07", entry.Since)
		}
		switch {
		case months[entry.Since]:
			return salaryJSON{}, fmt.Errorf("%s: dos sueldos el mismo mes", entry.Since)
		case entry.Amount <= 0 || entry.Amount > maxBudgetAmount:
			return salaryJSON{}, fmt.Errorf("%s: el sueldo tiene que ser mayor que cero", entry.Since)
		case !knownCurrency(entry.Currency):
			return salaryJSON{}, fmt.Errorf("%s: moneda %q", entry.Since, entry.Currency)
		}
		months[entry.Since] = true
		out.Entries = append(out.Entries, entry)
	}
	slices.SortFunc(out.Entries, func(a, b salaryEntryJSON) int { return strings.Compare(a.Since, b.Since) })
	if out.HiredOn != "" {
		if _, err := time.Parse("2006-01-02", out.HiredOn); err != nil {
			return salaryJSON{}, fmt.Errorf("fecha de ingreso %q: va como 2020-03-15", out.HiredOn)
		}
	}
	if out.BonusMonth != nil && (*out.BonusMonth < 0 || *out.BonusMonth > 12) {
		return salaryJSON{}, fmt.Errorf("mes de la bonificación %d: va de 1 a 12, o 0 si no te la pagan", *out.BonusMonth)
	}
	return out, nil
}

// payslipLineJSON is one concept of a pay stub; kind is statements.Pay* or
// Deduction*, and amounts are in cents.
type payslipLineJSON struct {
	Concept    string `json:"concept"`
	Kind       string `json:"kind"`
	Deduction  bool   `json:"deduction,omitempty"`
	Amount     int64  `json:"amount"`
	YearToDate int64  `json:"yearToDate"`
}

// payslipJSON is an imported pay stub: who paid, the payroll's date, its
// concepts and what reached the account.
type payslipJSON struct {
	ID       int64             `json:"id"`
	Employer string            `json:"employer"`
	PaidOn   string            `json:"paidOn"`
	Net      int64             `json:"net"`
	Status   string            `json:"status"`
	Issues   []string          `json:"issues,omitempty"`
	Lines    []payslipLineJSON `json:"lines"`
}

// servePayslips lists the imported pay stubs, oldest first.
func (b *books) servePayslips(w http.ResponseWriter, r *http.Request) {
	slips, err := b.store.Payslips(r.Context())
	if err != nil {
		log.Printf("volantes de pago: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	out := struct {
		Payslips []payslipJSON `json:"payslips"`
	}{Payslips: make([]payslipJSON, len(slips))}
	for i, slip := range slips {
		lines := make([]payslipLineJSON, len(slip.Lines))
		for j, line := range slip.Lines {
			lines[j] = payslipLineJSON{line.Concept, line.Kind, line.Deduction, line.Amount, line.YearToDate}
		}
		out.Payslips[i] = payslipJSON{
			ID: slip.ID, Employer: slip.Employer, PaidOn: slip.PaidOn.Format("2006-01-02"), Net: slip.Net,
			Status: slip.Status, Issues: slip.Issues, Lines: lines,
		}
	}
	writeJSON(w, http.StatusOK, out)
}

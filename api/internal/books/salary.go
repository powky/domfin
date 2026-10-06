package books

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/powky/domfin/api/internal/assets"
)

// salaryKey is the setting that keeps what the user told about their salary.
const salaryKey = "salary"

// Limits of what the salary settings keep, so a mistaken request can't grow
// them without end.
const (
	maxSalaryEntries = 100
	maxExtras        = 20
	// An extra payment is at most a year of days or two years of salaries.
	maxDays     = 365
	maxSalaries = 24
)

// salaryEntryJSON is a gross monthly salary the user set, from a month on:
// for someone whose pay stubs Domfin doesn't read, the months no stub
// covers, or a raise no stub shows yet. The deductions are what their own
// stub says, in cents a month; without them the app figures them by law.
type salaryEntryJSON struct {
	// Since is the first month it applies to: "2026-07".
	Since string `json:"since"`
	// Amount is the gross salary a month, in cents of Currency.
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	ISR      *int64 `json:"isr,omitempty"`
	AFP      *int64 `json:"afp,omitempty"`
	SFS      *int64 `json:"sfs,omitempty"`
	Other    *int64 `json:"other,omitempty"`
}

// extraJSON is a payment the job makes besides the salary, as the user
// describes it: a bonus, a seniority bonus, a yearly allowance. The app
// figures what it comes to. The Christmas salary is the law's for everyone
// and isn't one.
type extraJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Month is when it's paid, 1–12.
	Month int `json:"month"`
	// Kind is how much it is: "days" of salary (a month is 23.83 days),
	// "salaries", or a "fixed" amount.
	Kind string `json:"kind"`
	// Value is the days or the salaries. With Seniority the days are the
	// law's bonus's: 45 before three years in the job, 60 after.
	Value     float64 `json:"value,omitempty"`
	Seniority bool    `json:"seniority,omitempty"`
	// Amount is a fixed one, in cents of pesos.
	Amount int64 `json:"amount,omitempty"`
	// Base is the salary days and salaries are figured on: the year's
	// "average", or the one of the "month" it's paid in.
	Base string `json:"base,omitempty"`
	// Tax is the ISR it pays: by the DGII's "scale", a flat "rate" (0.25 is
	// 25%), or "none".
	Tax  string  `json:"tax"`
	Rate float64 `json:"rate,omitempty"`
}

// salaryJSON is what the app figures the salary, and what the job pays
// besides it, with beyond the pay stubs: the salaries set by hand, oldest
// first; the day the job started; and the extra payments.
type salaryJSON struct {
	Entries []salaryEntryJSON `json:"entries"`
	HiredOn string            `json:"hiredOn,omitempty"`
	Extras  []extraJSON       `json:"extras"`
	// BonusMonth came before Extras, for the law's bonus alone: it's read
	// and turned into an extra.
	BonusMonth *int `json:"bonusMonth,omitempty"`
}

// upgrade turns the month of the law's bonus, which came before the extra
// payments, into one.
func (s *salaryJSON) upgrade() {
	if s.BonusMonth != nil && *s.BonusMonth > 0 && len(s.Extras) == 0 {
		s.Extras = []extraJSON{{ID: "bonificacion", Name: "Bonificación", Month: *s.BonusMonth, Kind: "days",
			Seniority: true, Base: "average", Tax: "scale"}}
	}
	s.BonusMonth = nil
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
	salary.upgrade()
	if salary.Entries == nil {
		salary.Entries = []salaryEntryJSON{}
	}
	if salary.Extras == nil {
		salary.Extras = []extraJSON{}
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

// cleanSalary checks the salary settings and tidies them: the entries one a
// month and sorted, with an amount above zero and deductions that fit in
// it; a real day the job started; and extra payments that say how much they
// are and what ISR they pay, each with an ID.
func cleanSalary(in salaryJSON) (salaryJSON, error) {
	in.upgrade()
	if len(in.Entries) > maxSalaryEntries {
		return salaryJSON{}, fmt.Errorf("más de %d sueldos", maxSalaryEntries)
	}
	out := salaryJSON{Entries: []salaryEntryJSON{}, HiredOn: strings.TrimSpace(in.HiredOn), Extras: []extraJSON{}}
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
		var taken int64
		for _, deduction := range []*int64{entry.ISR, entry.AFP, entry.SFS, entry.Other} {
			if deduction == nil {
				continue
			}
			if *deduction < 0 {
				return salaryJSON{}, fmt.Errorf("%s: un descuento no puede ser negativo", entry.Since)
			}
			taken += *deduction
		}
		if taken > entry.Amount {
			return salaryJSON{}, fmt.Errorf("%s: los descuentos pasan del sueldo", entry.Since)
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

	if len(in.Extras) > maxExtras {
		return salaryJSON{}, fmt.Errorf("más de %d pagos extra", maxExtras)
	}
	ids := map[string]bool{}
	for _, extra := range in.Extras {
		extra, err := cleanExtra(extra)
		if err != nil {
			return salaryJSON{}, err
		}
		if extra.ID != "" && ids[extra.ID] {
			return salaryJSON{}, fmt.Errorf("id repetido: %s", extra.ID)
		}
		if extra.ID != "" {
			ids[extra.ID] = true
		}
		out.Extras = append(out.Extras, extra)
	}
	// New ones get an ID from their name, after the ones already taken.
	for i, extra := range out.Extras {
		if extra.ID == "" {
			out.Extras[i].ID = freeID(assets.Slug(extra.Name), ids)
			ids[out.Extras[i].ID] = true
		}
	}
	return out, nil
}

// cleanExtra checks an extra payment and keeps only what its kind uses.
func cleanExtra(extra extraJSON) (extraJSON, error) {
	extra.ID = strings.TrimSpace(extra.ID)
	extra.Name = strings.TrimSpace(extra.Name)
	if extra.Name == "" || utf8.RuneCountInString(extra.Name) > maxName || len(extra.ID) > maxText {
		return extraJSON{}, fmt.Errorf("un pago extra necesita un nombre de hasta %d caracteres", maxName)
	}
	if extra.Month < 1 || extra.Month > 12 {
		return extraJSON{}, fmt.Errorf("%s: el mes va de 1 a 12", extra.Name)
	}
	if extra.Base == "" {
		extra.Base = "average"
	}
	switch extra.Kind {
	case "days":
		if extra.Seniority {
			extra.Value = 0
		} else if math.IsNaN(extra.Value) || extra.Value <= 0 || extra.Value > maxDays {
			return extraJSON{}, fmt.Errorf("%s: los días van de más de 0 a %d", extra.Name, maxDays)
		}
		extra.Amount = 0
	case "salaries":
		if math.IsNaN(extra.Value) || extra.Value <= 0 || extra.Value > maxSalaries {
			return extraJSON{}, fmt.Errorf("%s: los sueldos van de más de 0 a %d", extra.Name, maxSalaries)
		}
		extra.Seniority, extra.Amount = false, 0
	case "fixed":
		if extra.Amount <= 0 || extra.Amount > maxBudgetAmount {
			return extraJSON{}, fmt.Errorf("%s: el monto tiene que ser mayor que cero", extra.Name)
		}
		extra.Value, extra.Seniority, extra.Base = 0, false, ""
	default:
		return extraJSON{}, fmt.Errorf("%s: cuánto es, %q, no es días, sueldos ni un monto fijo", extra.Name, extra.Kind)
	}
	if extra.Base != "" && extra.Base != "average" && extra.Base != "month" {
		return extraJSON{}, fmt.Errorf("%s: sobre qué sueldo, %q", extra.Name, extra.Base)
	}
	switch extra.Tax {
	case "scale", "none":
		extra.Rate = 0
	case "rate":
		if math.IsNaN(extra.Rate) || extra.Rate <= 0 || extra.Rate >= 1 {
			return extraJSON{}, fmt.Errorf("%s: el ISR va de más de 0 a menos de 100%%", extra.Name)
		}
	default:
		return extraJSON{}, fmt.Errorf("%s: el ISR, %q, no es la escala, un porcentaje ni ninguno", extra.Name, extra.Tax)
	}
	return extra, nil
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

package books

import (
	"context"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

func TestSalary(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)

	if w := do(t, h, "GET", "/ledger/salary", "", nil); w.Code != 200 || w.Body.String() != "{\"entries\":[],\"extras\":[]}\n" {
		t.Fatalf("before saving: %d %s", w.Code, w.Body)
	}

	var saved salaryJSON
	w := do(t, h, "PUT", "/ledger/salary", `{
		"entries": [
			{"since": "2026-07", "amount": 9000000, "currency": "DOP", "isr": 1200000, "other": 50000},
			{"since": " 2026-01 ", "amount": 8500000, "currency": "DOP"}
		],
		"hiredOn": "2020-03-15",
		"extras": [
			{"name": " Bonificación ", "month": 12, "kind": "days", "seniority": true, "value": 60, "tax": "scale"},
			{"name": "Bono de desempeño", "month": 3, "kind": "salaries", "value": 1.5, "base": "month", "tax": "rate", "rate": 0.25},
			{"id": "escolar", "name": "Bono escolar", "month": 8, "kind": "fixed", "amount": 2000000, "value": 3, "base": "month", "tax": "none", "rate": 0.1}
		]
	}`, &saved)
	if w.Code != 200 {
		t.Fatalf("saving: %d %s", w.Code, w.Body)
	}
	if len(saved.Entries) != 2 || saved.Entries[0].Since != "2026-01" || saved.Entries[1].Amount != 9000000 {
		t.Errorf("entries, trimmed and oldest first: %+v", saved.Entries)
	}
	if july := saved.Entries[1]; july.ISR == nil || *july.ISR != 1200000 || july.AFP != nil || july.Other == nil || *july.Other != 50000 {
		t.Errorf("the deductions given, and only those: %+v", july)
	}
	if saved.HiredOn != "2020-03-15" || len(saved.Extras) != 3 {
		t.Fatalf("hired on %q, extras %+v", saved.HiredOn, saved.Extras)
	}
	bonus, performance, school := saved.Extras[0], saved.Extras[1], saved.Extras[2]
	if bonus.ID != "bonificacion" || bonus.Name != "Bonificación" || bonus.Value != 0 || bonus.Base != "average" {
		t.Errorf("by seniority, its days aren't kept; the base is the average by default: %+v", bonus)
	}
	if performance.ID != "bono-de-desempeno" || performance.Base != "month" || performance.Rate != 0.25 {
		t.Errorf("salaries with a flat ISR: %+v", performance)
	}
	if school.ID != "escolar" || school.Value != 0 || school.Base != "" || school.Rate != 0 {
		t.Errorf("a fixed amount keeps only its amount: %+v", school)
	}

	var read salaryJSON
	do(t, h, "GET", "/ledger/salary", "", &read)
	if len(read.Entries) != 2 || len(read.Extras) != 3 || read.Extras[2].Amount != 2000000 {
		t.Errorf("read back: %+v", read)
	}
}

func TestSalaryTurnsTheBonusMonthIntoAnExtra(t *testing.T) {
	s := openStore(t)
	h := Handler(s, testConvert, nil)
	// What the first version saved: the month of the law's bonus.
	if err := s.SetSetting(context.Background(), salaryKey, map[string]any{"entries": []any{}, "hiredOn": "2020-03-15", "bonusMonth": 12}); err != nil {
		t.Fatal(err)
	}
	var read salaryJSON
	do(t, h, "GET", "/ledger/salary", "", &read)
	want := extraJSON{ID: "bonificacion", Name: "Bonificación", Month: 12, Kind: "days", Seniority: true, Base: "average", Tax: "scale"}
	if read.BonusMonth != nil || len(read.Extras) != 1 || read.Extras[0] != want || read.HiredOn != "2020-03-15" {
		t.Errorf("read: %+v", read)
	}
}

func TestSalaryRejects(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	extra := func(fields string) string {
		return `{"entries": [], "extras": [{"name": "Bono", "month": 12, ` + fields + `}]}`
	}
	for name, body := range map[string]string{
		"bad month":           `{"entries": [{"since": "julio", "amount": 100, "currency": "DOP"}]}`,
		"same month":          `{"entries": [{"since": "2026-07", "amount": 100, "currency": "DOP"}, {"since": "2026-07", "amount": 200, "currency": "DOP"}]}`,
		"no amount":           `{"entries": [{"since": "2026-07", "amount": 0, "currency": "DOP"}]}`,
		"unknown money":       `{"entries": [{"since": "2026-07", "amount": 100, "currency": "EUR"}]}`,
		"negative deduction":  `{"entries": [{"since": "2026-07", "amount": 100, "currency": "DOP", "isr": -1}]}`,
		"deductions too big":  `{"entries": [{"since": "2026-07", "amount": 100, "currency": "DOP", "isr": 60, "afp": 50}]}`,
		"bad hire date":       `{"entries": [], "hiredOn": "15/03/2020"}`,
		"no name":             `{"entries": [], "extras": [{"name": " ", "month": 12, "kind": "fixed", "amount": 100, "tax": "none"}]}`,
		"month 13":            extra(`"kind": "fixed", "amount": 100, "tax": "none", "month": 13`),
		"no days":             extra(`"kind": "days", "value": 0, "tax": "scale"`),
		"too many salaries":   extra(`"kind": "salaries", "value": 25, "tax": "scale"`),
		"fixed without money": extra(`"kind": "fixed", "tax": "none"`),
		"unknown kind":        extra(`"kind": "percent", "value": 10, "tax": "none"`),
		"unknown base":        extra(`"kind": "salaries", "value": 1, "base": "max", "tax": "none"`),
		"rate as percent":     extra(`"kind": "salaries", "value": 1, "tax": "rate", "rate": 25`),
		"unknown tax":         extra(`"kind": "salaries", "value": 1, "tax": "half"`),
		"same id":             `{"entries": [], "extras": [{"id": "a", "name": "A", "month": 1, "kind": "fixed", "amount": 1, "tax": "none"}, {"id": "a", "name": "B", "month": 2, "kind": "fixed", "amount": 1, "tax": "none"}]}`,
		"unknown field":       `{"entries": [], "extra": true}`,
	} {
		if w := do(t, h, "PUT", "/ledger/salary", body, nil); w.Code != 400 {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
}

func TestPayslips(t *testing.T) {
	s := openStore(t)
	h := Handler(s, testConvert, nil)

	var empty struct {
		Payslips []payslipJSON `json:"payslips"`
	}
	if w := do(t, h, "GET", "/ledger/payslips", "", &empty); w.Code != 200 || empty.Payslips == nil || len(empty.Payslips) != 0 {
		t.Fatalf("none yet: %d %s", w.Code, w.Body)
	}

	slip := statements.Payslip{
		Employer: "EMPRESA DE PRUEBA", PaidOn: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), Net: 4_000_000,
		Lines: []statements.PayslipLine{
			{Concept: "SUELDO", Kind: statements.PaySalary, Amount: 4_500_000, YearToDate: 9_000_000},
			{Concept: "LEY 11-92", Kind: statements.DeductionISR, Deduction: true, Amount: 500_000, YearToDate: 1_000_000},
		},
	}
	if _, err := s.SavePayslip(context.Background(), slip, nil, store.Source{Name: "volante.pdf"}); err != nil {
		t.Fatal(err)
	}
	var read struct {
		Payslips []payslipJSON `json:"payslips"`
	}
	do(t, h, "GET", "/ledger/payslips", "", &read)
	if len(read.Payslips) != 1 {
		t.Fatalf("payslips: %+v", read.Payslips)
	}
	got := read.Payslips[0]
	if got.Employer != "EMPRESA DE PRUEBA" || got.PaidOn != "2026-01-28" || got.Net != 4_000_000 || got.Status != "ok" || len(got.Lines) != 2 {
		t.Errorf("payslip: %+v", got)
	}
	if isr := got.Lines[1]; isr.Kind != statements.DeductionISR || !isr.Deduction || isr.Amount != 500_000 || isr.YearToDate != 1_000_000 {
		t.Errorf("deduction: %+v", isr)
	}
}

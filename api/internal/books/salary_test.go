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

	if w := do(t, h, "GET", "/ledger/salary", "", nil); w.Code != 200 || w.Body.String() != "{\"entries\":[]}\n" {
		t.Fatalf("before saving: %d %s", w.Code, w.Body)
	}

	var saved salaryJSON
	w := do(t, h, "PUT", "/ledger/salary", `{
		"entries": [
			{"since": "2026-07", "amount": 9000000, "currency": "DOP"},
			{"since": " 2026-01 ", "amount": 8500000, "currency": "DOP"}
		],
		"hiredOn": "2020-03-15",
		"bonusMonth": 12
	}`, &saved)
	if w.Code != 200 {
		t.Fatalf("saving: %d %s", w.Code, w.Body)
	}
	if len(saved.Entries) != 2 || saved.Entries[0].Since != "2026-01" || saved.Entries[1].Amount != 9000000 {
		t.Errorf("entries, trimmed and oldest first: %+v", saved.Entries)
	}
	if saved.HiredOn != "2020-03-15" || saved.BonusMonth == nil || *saved.BonusMonth != 12 {
		t.Errorf("hired on %q, bonus month %v", saved.HiredOn, saved.BonusMonth)
	}

	// No bonus at all is month 0, which is kept.
	var none salaryJSON
	do(t, h, "PUT", "/ledger/salary", `{"entries": [], "bonusMonth": 0}`, &none)
	var read salaryJSON
	do(t, h, "GET", "/ledger/salary", "", &read)
	if len(read.Entries) != 0 || read.HiredOn != "" || read.BonusMonth == nil || *read.BonusMonth != 0 {
		t.Errorf("read back: %+v", read)
	}
}

func TestSalaryRejects(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	for name, body := range map[string]string{
		"bad month":      `{"entries": [{"since": "julio", "amount": 100, "currency": "DOP"}]}`,
		"same month":     `{"entries": [{"since": "2026-07", "amount": 100, "currency": "DOP"}, {"since": "2026-07", "amount": 200, "currency": "DOP"}]}`,
		"no amount":      `{"entries": [{"since": "2026-07", "amount": 0, "currency": "DOP"}]}`,
		"unknown money":  `{"entries": [{"since": "2026-07", "amount": 100, "currency": "EUR"}]}`,
		"bad hire date":  `{"entries": [], "hiredOn": "15/03/2020"}`,
		"month 13":       `{"entries": [], "bonusMonth": 13}`,
		"negative month": `{"entries": [], "bonusMonth": -1}`,
		"unknown field":  `{"entries": [], "extra": true}`,
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

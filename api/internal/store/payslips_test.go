package store

import (
	"context"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/statements"
)

// payslip is a made-up second-fortnight stub: the salary with its deductions.
func payslip(paidOn string, salary int64) statements.Payslip {
	isr := salary / 10
	return statements.Payslip{
		Employer: "EMPRESA DE PRUEBA", PaidOn: day(paidOn), Net: salary - isr,
		Lines: []statements.PayslipLine{
			{Concept: "SUELDO", Kind: statements.PaySalary, Amount: salary, YearToDate: 2 * salary},
			{Concept: "LEY 11-92", Kind: statements.DeductionISR, Deduction: true, Amount: isr, YearToDate: isr},
		},
	}
}

func TestSavePayslipKeepsOnePerEmployerDateAndConcept(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	src := Source{Name: "volante.pdf", SHA256: "abc"}

	for _, step := range []struct {
		slip statements.Payslip
		want Outcome
	}{
		{payslip("2026-01-28", 4_500_000), Added},
		{payslip("2026-01-28", 4_500_000), Unchanged},
		{payslip("2026-01-28", 4_800_000), Replaced},
		{payslip("2026-02-25", 4_800_000), Added},
	} {
		got, err := s.SavePayslip(ctx, step.slip, nil, src)
		if err != nil {
			t.Fatal(err)
		}
		if got != step.want {
			t.Errorf("%s: %s, want %s", step.slip.PaidOn.Format("2006-01-02"), got, step.want)
		}
	}

	// A bonus paid the same day as the salary is another stub.
	bonus := statements.Payslip{Employer: "EMPRESA DE PRUEBA", PaidOn: day("2026-02-25"), Net: 10_000_000,
		Lines: []statements.PayslipLine{{Concept: "BONIFICACION", Kind: statements.PayBonus, Amount: 10_000_000}}}
	if got, err := s.SavePayslip(ctx, bonus, []string{"algo no cuadra"}, src); err != nil || got != Added {
		t.Fatalf("bonus: %s, %v", got, err)
	}

	slips, err := s.Payslips(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(slips) != 3 {
		t.Fatalf("%d payslips, want 3", len(slips))
	}
	first := slips[0]
	if first.Net != 4_320_000 || first.Status != "ok" || len(first.Issues) != 0 ||
		!slices.Equal(first.Lines, payslip("2026-01-28", 4_800_000).Lines) {
		t.Errorf("first: %+v", first)
	}
	last := slips[2]
	if last.Lines[0].Concept != "BONIFICACION" || last.Status != "review" || !slices.Equal(last.Issues, []string{"algo no cuadra"}) {
		t.Errorf("bonus: %+v", last)
	}
}

func TestPayslipsMakeNoMovements(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if _, err := s.SavePayslip(ctx, payslip("2026-01-28", 4_500_000), nil, Source{Name: "volante.pdf"}); err != nil {
		t.Fatal(err)
	}
	movements, err := s.Movements(ctx, "2026-01-01", "2026-12-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(movements) != 0 {
		t.Errorf("%d movements from a pay stub, want none", len(movements))
	}
}

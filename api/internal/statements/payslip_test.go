package statements

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
	"github.com/powky/domfin/api/internal/testpdf"
)

func readPayslip(t *testing.T, pdf []byte) (Payslip, []string, error) {
	t.Helper()
	pages, err := pdftext.Read(pdf, "")
	if err != nil {
		t.Fatal(err)
	}
	return ParsePayslip(pages)
}

func TestParsePayslipReadsTheSalaryAndItsDeductions(t *testing.T) {
	pdf := testpdf.PopularPayslip(t, "28/01/2026", []testpdf.PayslipRow{
		{"SUELDO", "90,000.00", "45,000.00", ""},
		{"LEY 11-92", "10,000.00", "", "5,000.00"},
		{"APORTES AL PLAN LEY 87-01", "2,583.00", "", "2,583.00"},
		{"APORTES SEG. FAM. SALUD", "2,736.00", "", "2,736.00"},
		{"SEGURO SALUD VOLUNTARIO", "1,000.00", "", "1,000.00"},
	}, "45,000.00", "11,319.00", "33,681.00")

	slip, issues, err := readPayslip(t, pdf)
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) > 0 {
		t.Errorf("issues: %v", issues)
	}
	if slip.Employer != "BANCO POPULAR DOMINICANO" || !slip.PaidOn.Equal(time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("employer %q, paid on %s", slip.Employer, slip.PaidOn)
	}
	want := []PayslipLine{
		{Concept: "SUELDO", Kind: PaySalary, Amount: 4_500_000, YearToDate: 9_000_000},
		{Concept: "LEY 11-92", Kind: DeductionISR, Deduction: true, Amount: 500_000, YearToDate: 1_000_000},
		{Concept: "APORTES AL PLAN LEY 87-01", Kind: DeductionAFP, Deduction: true, Amount: 258_300, YearToDate: 258_300},
		{Concept: "APORTES SEG. FAM. SALUD", Kind: DeductionSFS, Deduction: true, Amount: 273_600, YearToDate: 273_600},
		{Concept: "SEGURO SALUD VOLUNTARIO", Kind: DeductionOther, Deduction: true, Amount: 100_000, YearToDate: 100_000},
	}
	if !slices.Equal(slip.Lines, want) {
		t.Errorf("lines:\n got %+v\nwant %+v", slip.Lines, want)
	}
	if slip.Income() != 4_500_000 || slip.Deductions() != 1_131_900 || slip.Net != 3_368_100 {
		t.Errorf("income %d, deductions %d, net %d", slip.Income(), slip.Deductions(), slip.Net)
	}
}

func TestParsePayslipReadsABonusTaxedAlone(t *testing.T) {
	pdf := testpdf.PopularPayslip(t, "06/03/2026", []testpdf.PayslipRow{
		{"BONIFICACION ESPECIAL", "300,000.00", "300,000.00", ""},
		{"LEY 11-92", "85,000.00", "", "75,000.00"},
	}, "300,000.00", "75,000.00", "225,000.00")

	slip, issues, err := readPayslip(t, pdf)
	if err != nil || len(issues) > 0 {
		t.Fatalf("err %v, issues %v", err, issues)
	}
	kinds := []string{slip.Lines[0].Kind, slip.Lines[1].Kind}
	if !slices.Equal(kinds, []string{PayBonus, DeductionISR}) || slip.Net != 22_500_000 {
		t.Errorf("kinds %v, net %d", kinds, slip.Net)
	}
}

func TestParsePayslipSaysWhatDoesNotAddUp(t *testing.T) {
	pdf := testpdf.PopularPayslip(t, "12/02/2026", []testpdf.PayslipRow{
		{"SUELDO", "90,000.00", "45,000.00", ""},
		{"CAFETERIA", "300.00", "", "300.00"},
	}, "45,000.00", "300.00", "44,000.00")

	_, issues, err := readPayslip(t, pdf)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(issues, []string{"el pago neto (44,000.00) no es lo pagado menos lo descontado (44,700.00)"}) {
		t.Errorf("issues: %v", issues)
	}
}

func TestParsePayslipLeavesOtherPDFsAlone(t *testing.T) {
	for name, pdf := range map[string][]byte{
		"card":  testpdf.PopularCard(t, ""),
		"loan":  testpdf.PopularLoan(t),
		"blank": testpdf.Build(t, "", []testpdf.Text{{X: 40, Y: 40, S: "Nada que ver"}}),
	} {
		if _, _, err := readPayslip(t, pdf); !errors.Is(err, ErrNotPayslip) {
			t.Errorf("%s: %v, want ErrNotPayslip", name, err)
		}
	}
}

func TestPayslipKindByConcept(t *testing.T) {
	for _, c := range []struct {
		concept   string
		deduction bool
		want      string
	}{
		{"SUELDO", false, PaySalary},
		{"VACACIONES", false, PaySalary},
		{"SALARIO DE NAVIDAD", false, PayChristmas},
		{"REGALÍA PASCUAL", false, PayChristmas},
		{"HORAS EXTRAS AL 35%", false, PayOvertime},
		{"BONO POR ANTIGUEDAD", false, PayBonus},
		{"BONIFICACIÓN", false, PayBonus},
		{"VISA FLOTILLA (GASOLINA)", false, PayBenefit},
		{"COMISIONES", false, PayOther},
		{"LEY 11-92", true, DeductionISR},
		{"RETENCION ISR", true, DeductionISR},
		{"APORTES AL PLAN LEY 87-01", true, DeductionAFP},
		{"AFP", true, DeductionAFP},
		{"APORTES SEG. FAM. SALUD", true, DeductionSFS},
		{"SEGURO SALUD VOLUNTARIO", true, DeductionOther},
		{"MEMBRESIA CLUB", true, DeductionOther},
	} {
		if got := payslipKind(c.concept, c.deduction); got != c.want {
			t.Errorf("%s: %s, want %s", c.concept, got, c.want)
		}
	}
}

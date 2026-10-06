package statements

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// ErrNotPayslip means the PDF isn't a pay stub Domfin reads.
var ErrNotPayslip = errors.New("not a pay stub")

// Payslip is a pay stub (volante de pago) like the ones Banco Popular's
// payroll gives its employees: what one payment paid and took, concept by
// concept, with each concept's total so far in the year. The money itself
// is already in the ledger, as the credit in the account it was paid into:
// the stub tells what that credit doesn't, the gross salary and the
// deductions.
type Payslip struct {
	Employer string
	// PaidOn is the payroll's date (Proceso de Nómina); the bank may post
	// the credit a day earlier.
	PaidOn time.Time
	Lines  []PayslipLine
	// Net is what reached the account, in cents.
	Net int64
}

// PayslipLine is one concept of a pay stub.
type PayslipLine struct {
	Concept string
	// Kind says what the concept is: one of the Pay or Deduction kinds.
	Kind string
	// Deduction is set for what the payment took, like the income tax.
	Deduction bool
	// Amount is the concept in this payment and YearToDate its total in the
	// year so far (Acumulado), both in cents.
	Amount     int64
	YearToDate int64
}

// What a pay stub's concepts are. The salary is what the law figures the
// Christmas salary and the profit-sharing bonus on: overtime and bonuses
// aren't part of it.
const (
	PaySalary    = "salary"
	PayOvertime  = "overtime"
	PayBonus     = "bonus"     // bonificación, bonos and incentives
	PayChristmas = "christmas" // the Christmas salary (regalía pascual)
	PayBenefit   = "benefit"   // allowances, like fuel on a fleet card
	PayOther     = "other"

	DeductionISR   = "isr" // income tax withheld (Ley 11-92)
	DeductionAFP   = "afp" // the pension fund (Ley 87-01)
	DeductionSFS   = "sfs" // family health insurance (Ley 87-01)
	DeductionOther = "other"
)

// Income is what the payment paid before deductions, in cents.
func (p Payslip) Income() int64 {
	var total int64
	for _, line := range p.Lines {
		if !line.Deduction {
			total += line.Amount
		}
	}
	return total
}

// Deductions is what the payment took, in cents.
func (p Payslip) Deductions() int64 {
	var total int64
	for _, line := range p.Lines {
		if line.Deduction {
			total += line.Amount
		}
	}
	return total
}

var payrollDatePattern = regexp.MustCompile(`PROCESO DE NOMINA\s+(\d{2}/\d{2}/\d{4})`)

// ParsePayslip reads a pay stub laid out like Banco Popular's: the employer
// (Empresa), the payroll's date (Proceso de Nómina), a table of concepts
// with their year's total (Acumulado), what they paid (Ingreso) or took
// (Deducciones), the totals and the net (Pago Neto). It keeps no one's name,
// ID or account: only the employer, the date and the money.
func ParsePayslip(pages []pdftext.Page) (Payslip, []string, error) {
	var slip Payslip
	var issues []string
	// Where the Acumulado, Ingreso and Deducciones columns start.
	var columns []float64
	var totalIncome, totalDeductions *int64
	netFound, inTable := false, false

	for _, page := range pages {
		for _, line := range page.Lines {
			if len(line.Cells) == 0 {
				continue
			}
			joined := fold(line.String())
			if m := payrollDatePattern.FindStringSubmatch(joined); m != nil && slip.PaidOn.IsZero() {
				date, err := parseDate(m[1])
				if err != nil {
					return Payslip{}, nil, err
				}
				slip.PaidOn = date
				continue
			}
			if i := cellIndex(line, "EMPRESA"); i >= 0 && i+1 < len(line.Cells) && slip.Employer == "" {
				slip.Employer = strings.TrimSpace(line.Cells[i+1].Text)
				continue
			}
			if isPayslipHeader(line) {
				columns = []float64{line.Cells[1].X, line.Cells[2].X, line.Cells[3].X}
				inTable = true
				continue
			}
			if !inTable {
				continue
			}

			label := fold(line.Cells[0].Text)
			ytd, income, deduction, found, err := payslipAmounts(line, columns)
			if err != nil {
				issues = append(issues, fmt.Sprintf("línea que no se pudo leer: %s", line))
				continue
			}
			switch {
			case label == "PAGO NETO":
				if income == nil && deduction == nil {
					return Payslip{}, nil, ErrNotPayslip
				}
				slip.Net = *firstSet(income, deduction)
				netFound, inTable = true, false
			case label == "TOTAL":
				totalIncome, totalDeductions = income, deduction
			case !found:
				// A concept too long for one line goes on in the next.
				if n := len(slip.Lines); n > 0 {
					slip.Lines[n-1].Concept += " " + strings.TrimSpace(line.Cells[0].Text)
				}
			default:
				concept := strings.TrimSpace(line.Cells[0].Text)
				if income != nil {
					slip.Lines = append(slip.Lines, PayslipLine{Concept: concept, Kind: payslipKind(concept, false), Amount: *income, YearToDate: ytd})
				}
				if deduction != nil {
					slip.Lines = append(slip.Lines, PayslipLine{Concept: concept, Kind: payslipKind(concept, true), Deduction: true, Amount: *deduction, YearToDate: ytd})
				}
			}
		}
	}
	if columns == nil || slip.PaidOn.IsZero() || !netFound || len(slip.Lines) == 0 {
		return Payslip{}, nil, ErrNotPayslip
	}

	if slip.Employer == "" {
		issues = append(issues, "no se encontró la empresa")
	}
	if totalIncome != nil && *totalIncome != slip.Income() {
		issues = append(issues, fmt.Sprintf("los ingresos suman %s, pero el total dice %s", FormatAmount(slip.Income()), FormatAmount(*totalIncome)))
	}
	if totalDeductions != nil && *totalDeductions != slip.Deductions() {
		issues = append(issues, fmt.Sprintf("las deducciones suman %s, pero el total dice %s", FormatAmount(slip.Deductions()), FormatAmount(*totalDeductions)))
	}
	if paid := slip.Income() - slip.Deductions(); paid != slip.Net {
		issues = append(issues, fmt.Sprintf("el pago neto (%s) no es lo pagado menos lo descontado (%s)", FormatAmount(slip.Net), FormatAmount(paid)))
	}
	return slip, issues, nil
}

// isPayslipHeader reports whether a line is the concepts table's header.
func isPayslipHeader(line pdftext.Line) bool {
	if len(line.Cells) != 4 {
		return false
	}
	want := []string{"CONCEPTO", "ACUMULADO", "INGRESO", "DEDUCCIONES"}
	for i, cell := range line.Cells {
		if fold(cell.Text) != want[i] {
			return false
		}
	}
	return true
}

// payslipAmounts reads a table line's amounts by the column each falls in.
// Amounts are right-aligned, so each starts left of its column's header but
// right of the middle between that header and the one before. found is false
// when the line has no amount at all.
func payslipAmounts(line pdftext.Line, columns []float64) (ytd int64, income, deduction *int64, found bool, err error) {
	ytdEnd := (columns[0] + columns[1]) / 2
	incomeEnd := (columns[1] + columns[2]) / 2
	for _, cell := range line.Cells[1:] {
		amount, err := parseAmount(strings.TrimSpace(cell.Text))
		if err != nil {
			return 0, nil, nil, false, err
		}
		found = true
		switch {
		case cell.X < ytdEnd:
			ytd = amount
		case cell.X < incomeEnd:
			income = &amount
		default:
			deduction = &amount
		}
	}
	return ytd, income, deduction, found, nil
}

// payslipKind says what a concept is from its name, in the words Dominican
// payrolls use.
func payslipKind(concept string, deduction bool) string {
	c := fold(concept)
	has := func(words ...string) bool {
		for _, word := range words {
			if strings.Contains(c, word) {
				return true
			}
		}
		return false
	}
	if deduction {
		switch {
		case has("11-92", "IMPUESTO SOBRE LA RENTA") || hasWord(c, "ISR"):
			return DeductionISR
		case has("SEG. FAM", "SEGURO FAMILIAR", "SEGURO DE SALUD FAMILIAR") || hasWord(c, "SFS"):
			return DeductionSFS
		case has("87-01", "PENSION") || hasWord(c, "AFP"):
			return DeductionAFP
		}
		return DeductionOther
	}
	switch {
	case has("NAVIDAD", "REGALIA"):
		return PayChristmas
	case has("HORA") && has("EXTRA"):
		return PayOvertime
	case has("BONIFICACION", "INCENTIVO") || hasWord(c, "BONO"):
		return PayBonus
	case has("FLOTILLA", "GASOLINA", "COMBUSTIBLE"):
		return PayBenefit
	case strings.HasPrefix(c, "SUELDO"), strings.HasPrefix(c, "SALARIO"), has("VACACIONES"):
		return PaySalary
	}
	return PayOther
}

// hasWord reports whether word stands alone in text.
func hasWord(text, word string) bool {
	return slices.Contains(strings.FieldsFunc(text, func(r rune) bool { return r < 'A' || r > 'Z' }), word)
}

// cellIndex is the position of the cell whose text is label, or -1.
func cellIndex(line pdftext.Line, label string) int {
	for i, cell := range line.Cells {
		if fold(cell.Text) == label {
			return i
		}
	}
	return -1
}

// firstSet is the first of the amounts that is set.
func firstSet(amounts ...*int64) *int64 {
	for _, amount := range amounts {
		if amount != nil {
			return amount
		}
	}
	return nil
}

var accents = strings.NewReplacer("Á", "A", "É", "E", "Í", "I", "Ó", "O", "Ú", "U", "Ü", "U", "Ñ", "N")

// fold is text in capitals without accents, to compare labels.
func fold(text string) string {
	return accents.Replace(strings.ToUpper(strings.TrimSpace(text)))
}

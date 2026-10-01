package statements

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// ErrNotPopularCertificate means the PDF isn't a Banco Popular certificate
// history.
var ErrNotPopularCertificate = errors.New("not a Banco Popular certificate history")

// CertificateHistory is a certificate of deposit (depósito a plazo) as the
// Banco Popular "Historial Depósito a Plazo" lists it, up to the day it was
// generated.
type CertificateHistory struct {
	Institution string
	Last4       string
	Currency    string
	// AsOf is the date printed on every page, when the history was generated.
	AsOf time.Time
	// Movements oldest first. Renewals, which move no money, aren't included.
	Movements []CertificateMovement
	// Rate is the annual interest rate of the last renewal, in percent, and
	// Matures the date it runs to, when printed.
	Rate    float64
	Matures time.Time
}

// CertificateMovement is one row of a certificate history.
type CertificateMovement struct {
	EffectiveOn time.Time // fecha efectiva
	// PostedOn is the posting date, which the bank prints only when it
	// differs; otherwise it is the effective date.
	PostedOn time.Time
	// Code is the bank's transaction code: 87 deposit, 20 interest added, 06
	// tax withheld, 15 renewal.
	Code        string
	Description string
	// Amount in cents, signed like the app: positive adds to the certificate
	// (a deposit, the interest), negative takes from it (the tax).
	Amount int64
	// Rate is the annual interest rate printed with it, in percent.
	Rate float64
	// Balance is the capital after the movement, as printed.
	Balance int64
}

// Kind says what a movement is to the certificate: deposit, interest_earned,
// withholding or withdrawal (the ledger's names).
func (m CertificateMovement) Kind() string {
	switch {
	case m.Code == "87":
		return "deposit"
	case m.Code == "20":
		return "interest_earned"
	case m.Code == "06":
		return "withholding"
	case m.Amount < 0:
		return "withdrawal"
	default:
		return "deposit"
	}
}

// Every page of the history repeats "Pág 1 de 9", the date it was generated,
// the product number and currency, the title "Historial Depósito a Plazo"
// and the columns: fecha efectiva, fecha de posteo, código y descripción de
// la transacción, tasa de interés, monto, tipo, saldo de capital and saldo
// de interés. A row wraps over three text lines (the description and the
// type take two), so its cells are gathered around the line with the date
// and placed in columns by where they start.
var (
	certificateTitle = regexp.MustCompile(`(?i)^historial dep\S*sito a plazo$`)
	certificateCode  = regexp.MustCompile(`^\d{2}$`)
	percentPattern   = regexp.MustCompile(`^(\d+(?:\.\d+)?)%$`)
	renewalDate      = regexp.MustCompile(`(\d{2})-(\d{2})-(\d{2})$`)
)

// certificateRenewal is the code of a renewal, which moves no money.
const certificateRenewal = "15"

// Where each column starts on the page, in points: the cells of a row are
// placed in the column whose start is closest on its left.
var certificateColumns = []struct {
	name  string
	start float64
}{
	{"effective", 0}, {"posted", 80}, {"code", 140}, {"description", 190}, {"rate", 305},
	{"amount", 345}, {"type", 405}, {"balance", 455}, {"interest", 530},
}

// ParsePopularCertificate reads a Banco Popular certificate history.
// Problems that leave it readable, like a missing page or a balance that
// doesn't follow from the one before, come back as issues, in Spanish.
func ParsePopularCertificate(pages []pdftext.Page) (CertificateHistory, []string, error) {
	var h CertificateHistory
	var issues []string
	isHistory := false
	total := 0
	seen := map[int]bool{}
	var movements []CertificateMovement
	for _, page := range pages {
		for i, line := range page.Lines {
			cells := texts(line)
			joined := strings.Join(cells, " ")
			switch {
			case certificateTitle.MatchString(joined):
				isHistory = true
			case loanPagePattern.MatchString(joined):
				m := loanPagePattern.FindStringSubmatch(joined)
				n, _ := strconv.Atoi(m[1])
				total, _ = strconv.Atoi(m[2])
				if seen[n] {
					issues = append(issues, fmt.Sprintf("la página %d aparece dos veces", n))
				}
				seen[n] = true
			case len(cells) == 1 && fullDatePattern.MatchString(cells[0]):
				date, err := parseDate(cells[0])
				if err != nil {
					return CertificateHistory{}, nil, fmt.Errorf("history date: %w", err)
				}
				if h.AsOf.IsZero() {
					h.AsOf = date
				} else if !date.Equal(h.AsOf) {
					issues = append(issues, fmt.Sprintf("página %d: trae otra fecha de generación (%s)", page.Number, cells[0]))
				}
			case len(line.Cells) > 2 && line.Cells[0].X < certificateColumns[1].start && fullDatePattern.MatchString(cells[0]):
				row := certificateRow(page.Lines, i)
				m, renewal, err := parseCertificateRow(row)
				if err != nil {
					issues = append(issues, fmt.Sprintf("página %d: movimiento que no se pudo leer: %s", page.Number, line))
					continue
				}
				if renewal != nil {
					h.Rate, h.Matures = m.Rate, *renewal
					continue
				}
				movements = append(movements, m)
			default:
				for c, cell := range cells[:len(cells)-1] {
					switch {
					case productNumberLabel.MatchString(cell):
						if digits := strings.TrimSpace(cells[c+1]); len(digits) >= 4 {
							h.Last4 = digits[len(digits)-4:]
						}
					case currencyLabel.MatchString(cell):
						h.Currency = currencyOf(cells[c+1])
					}
				}
			}
		}
	}
	if !isHistory || h.Last4 == "" {
		return CertificateHistory{}, nil, ErrNotPopularCertificate
	}
	if h.AsOf.IsZero() {
		return CertificateHistory{}, nil, errors.New("certificate history without its date")
	}
	h.Institution = "popular"
	if h.Currency == "" {
		h.Currency = defaultCurrency
		issues = append(issues, "no se encontró la moneda; se asume RD$")
	}
	var missing []string
	for n := 1; n <= total; n++ {
		if !seen[n] {
			missing = append(missing, strconv.Itoa(n))
		}
	}
	if len(missing) > 0 {
		issues = append(issues, fmt.Sprintf("faltan las páginas %s de %d", strings.Join(missing, ", "), total))
	}

	slices.SortStableFunc(movements, func(a, b CertificateMovement) int { return a.EffectiveOn.Compare(b.EffectiveOn) })
	for i := range movements {
		// Codes other than deposits, interest and tax say by the capital
		// whether they add or take away.
		if m := &movements[i]; i > 0 && m.Code != "87" && m.Code != "20" && m.Code != "06" && m.Balance < movements[i-1].Balance {
			m.Amount = -m.Amount
		}
	}
	for i, m := range movements {
		if i == 0 {
			if m.Balance != m.Amount && m.Kind() == "deposit" {
				issues = append(issues, fmt.Sprintf("el primer depósito (%s) no es el capital que muestra (%s)", FormatAmount(m.Amount), FormatAmount(m.Balance)))
			}
			continue
		}
		if previous := movements[i-1].Balance; previous+m.Amount != m.Balance {
			issues = append(issues, fmt.Sprintf("el capital después de %s del %s (%s) no sale del anterior (%s) con %s",
				collapse(m.Description), m.EffectiveOn.Format("02/01/2006"), FormatAmount(m.Balance), FormatAmount(previous), FormatAmount(m.Amount)))
		}
	}
	h.Movements = movements
	return h, issues, nil
}

// certificateRow gathers the cells of the row whose date is on line i: the
// lines a few points above and below it belong to it too.
func certificateRow(lines []pdftext.Line, i int) map[string][]pdftext.Cell {
	row := map[string][]pdftext.Cell{}
	center := lines[i].Y
	for _, line := range lines {
		if math.Abs(line.Y-center) > 8 {
			continue
		}
		for _, cell := range line.Cells {
			column := certificateColumns[0].name
			for _, c := range certificateColumns {
				if cell.X >= c.start {
					column = c.name
				}
			}
			row[column] = append(row[column], cell)
		}
	}
	return row
}

// parseCertificateRow reads a gathered row. For a renewal it returns the
// date the certificate now runs to instead of a movement.
func parseCertificateRow(row map[string][]pdftext.Cell) (CertificateMovement, *time.Time, error) {
	text := func(column string) string {
		var parts []string
		for _, cell := range row[column] {
			parts = append(parts, cell.Text)
		}
		joined := ""
		for _, part := range parts {
			// "RENOVACION DE CD 22-" wraps to "06-24".
			if joined != "" && !strings.HasSuffix(joined, "-") {
				joined += " "
			}
			joined += part
		}
		return joined
	}
	// The row's own line comes between the wrapped ones, so the first cell
	// of the date columns is on it.
	effective, err := parseDate(text("effective"))
	if err != nil {
		return CertificateMovement{}, nil, err
	}
	m := CertificateMovement{EffectiveOn: effective, PostedOn: effective, Code: text("code"), Description: text("description")}
	if posted := text("posted"); posted != "" {
		if m.PostedOn, err = parseDate(posted); err != nil {
			return CertificateMovement{}, nil, err
		}
	}
	if !certificateCode.MatchString(m.Code) {
		return CertificateMovement{}, nil, fmt.Errorf("not a transaction code: %q", m.Code)
	}
	if rate := percentPattern.FindStringSubmatch(text("rate")); rate != nil {
		m.Rate, _ = strconv.ParseFloat(rate[1], 64)
	}
	amount, err := parseMoney(text("amount"))
	if err != nil {
		return CertificateMovement{}, nil, err
	}
	if m.Balance, err = parseMoney(text("balance")); err != nil {
		return CertificateMovement{}, nil, err
	}
	if m.Code == certificateRenewal {
		d := renewalDate.FindStringSubmatch(m.Description)
		if d == nil {
			return m, &time.Time{}, nil
		}
		matures, err := parseDate(fmt.Sprintf("%s/%s/20%s", d[1], d[2], d[3]))
		if err != nil {
			return CertificateMovement{}, nil, err
		}
		return m, &matures, nil
	}
	m.Amount = amount
	if m.Kind() == "withholding" {
		m.Amount = -amount
	}
	return m, nil, nil
}

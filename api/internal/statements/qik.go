package statements

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// ErrNotQikCard means the PDF isn't a Qik credit card statement.
var ErrNotQikCard = errors.New("not a Qik credit card statement")

// A Qik credit card statement is a web page printed to PDF, in pesos, with
// its labels in the text:
//
//	Período: 06 ago - 05 sep 2026 · Fecha de corte: 05 sep 2026 · Límite Aprobado: RD$ 40,000.00
//	Número de tarjeta: ************1234
//	Balance al corte | Monto mínimo a pagar | Balance al corte anterior  (labels, then their values below)
//	Fecha Límite de Pago, and its date below
//	Fecha | Entrada | Descripción | Monto  (the transactions, a description
//	    sometimes going on in the next line; credits as "- RD$ 28.00")
//	Tu tasa de interés anual es de 60.00% | Tasa Anual Efectiva es de 60.00% …
//
// It prints no references and no merchant codes: purchases are told by
// what they aren't (payments, cashback, refunds), and each transaction by
// the cut date and its line. Merchants carry their city, state and country
// codes glued to the end: "Utopia Santo Domingododom".
var (
	qikCutPattern       = regexp.MustCompile(`^Fecha de corte:\s*(\d{1,2} \S+ \d{4})$`)
	qikLimitPattern     = regexp.MustCompile(`^L\S*mite Aprobado:\s*(RD\$|US\$)\s*([\d,]+\.\d{2})$`)
	qikCardPattern      = regexp.MustCompile(`^\*{8,}(\d{4})$`)
	qikDatePattern      = regexp.MustCompile(`^\d{2}/\d{2}/\d{4}$`)
	qikAmountPattern    = regexp.MustCompile(`^(-?)\s*(?:RD\$|US\$)?\s*([\d,]+\.\d{2})$`)
	qikLongDatePattern  = regexp.MustCompile(`^\d{1,2} \S+ \d{4}$`)
	qikRatePattern      = regexp.MustCompile(`(?i)inter\S*s anual es de\s*([\d.]+)\s*%`)
	qikEffectivePattern = regexp.MustCompile(`(?i)Tasa Anual Efectiva es de\s*([\d.]+)\s*%`)
	// A merchant's city, then its state and country codes glued on:
	// "Santo Domingododom", "San Franciscocausa".
	qikPlaceCodes = regexp.MustCompile(`^(.*[a-z])([a-z]{2})(dom|usa|can|mex|pri|esp|gbr|irl|nld|deu|fra|col|pan|bra|arg|chl|per)$`)
)

// qikCities are the cities to split from merchants, longest first.
var qikCities = []string{"Santo Domingo Este", "Santo Domingo", "San Francisco", "Punta Cana", "Santiago",
	"La Romana", "Puerto Plata", "Bavaro", "Higuey", "New York", "Miami"}

var spanishMonths = map[string]time.Month{
	"ene": time.January, "feb": time.February, "mar": time.March, "abr": time.April,
	"may": time.May, "jun": time.June, "jul": time.July, "ago": time.August,
	"sep": time.September, "oct": time.October, "nov": time.November, "dic": time.December,
}

// ParseQikCard reads a Qik card statement from its pages' text. It returns
// ErrNotQikCard for any other document, and the checks that failed as
// issues, in Spanish, like ParsePopularCard.
func ParseQikCard(pages []pdftext.Page) (Statement, []string, error) {
	if !isQik(pages) {
		return Statement{}, nil, ErrNotQikCard
	}
	pages = withPlainSpaces(pages)
	st := Statement{Institution: "qik", Product: "Qik"}
	section := Section{Currency: defaultCurrency}
	var labels []pdftext.Cell
	inTransactions, dueNext := false, false
	var last *Transaction

	for _, page := range pages {
		for _, line := range page.Lines {
			text := line.String()
			cells := line.Cells
			switch {
			case len(cells) > 0 && qikCardPattern.MatchString(cells[0].Text):
				st.Last4 = qikCardPattern.FindStringSubmatch(cells[0].Text)[1]
				continue
			case dueNext && len(cells) > 0 && qikLongDatePattern.MatchString(cells[0].Text):
				dueNext = false
				if date, err := parseSpanishDate(cells[0].Text); err == nil {
					st.DueDate = date
				}
				continue
			case strings.Contains(text, "Fecha Límite de Pago"):
				dueNext = true
			case strings.Contains(text, "Balance al corte") && strings.Contains(text, "Monto m"):
				labels = cells
				continue
			case labels != nil:
				values, err := qikHeaderValues(labels, cells)
				if err != nil {
					return Statement{}, nil, err
				}
				section.Balance, section.MinimumPayment, section.PreviousBalance = values[0], values[1], values[2]
				labels = nil
				continue
			case strings.HasPrefix(text, "Fecha | Entrada | Descripci"):
				inTransactions = true
				last = nil
				continue
			case strings.HasPrefix(text, "Información Adicional"), strings.HasPrefix(text, "Monto de cuotas vencidas"):
				inTransactions = false
			}

			for _, cell := range cells {
				switch {
				case qikCutPattern.MatchString(cell.Text):
					date, err := parseSpanishDate(qikCutPattern.FindStringSubmatch(cell.Text)[1])
					if err != nil {
						return Statement{}, nil, err
					}
					st.CutDate = date
				case qikLimitPattern.MatchString(cell.Text):
					m := qikLimitPattern.FindStringSubmatch(cell.Text)
					if m[1] == "US$" {
						section.Currency = "USD"
					}
					limit, err := parseAmount(m[2])
					if err != nil {
						return Statement{}, nil, err
					}
					section.CreditLimit = limit
				}
			}
			if m := qikRatePattern.FindStringSubmatch(text); m != nil {
				section.InterestRate, _ = strconv.ParseFloat(m[1], 64)
			}
			if m := qikEffectivePattern.FindStringSubmatch(text); m != nil {
				section.EffectiveRate, _ = strconv.ParseFloat(m[1], 64)
			}

			if !inTransactions {
				continue
			}
			if isQikFooter(text) {
				// The page ends; its last transaction can't go on after this.
				last = nil
				continue
			}
			if len(cells) >= 4 && qikDatePattern.MatchString(cells[0].Text) && qikDatePattern.MatchString(cells[1].Text) {
				t, err := qikTransaction(cells)
				if err != nil {
					return Statement{}, nil, err
				}
				section.Transactions = append(section.Transactions, t)
				last = &section.Transactions[len(section.Transactions)-1]
				continue
			}
			if last != nil && len(cells) == 1 {
				// The description goes on in the next line.
				last.Description = collapse(last.Description + " " + cells[0].Text)
			}
		}
	}

	if st.CutDate.IsZero() || st.Last4 == "" {
		return Statement{}, nil, fmt.Errorf("qik statement without %s", map[bool]string{true: "cut date", false: "card number"}[st.CutDate.IsZero()])
	}
	for i := range section.Transactions {
		t := &section.Transactions[i]
		t.Type = qikKind(t.Description, t.Amount)
		if t.Type == Purchase || t.Type == Refund {
			t.Description = qikMerchant(t.Description)
		}
	}
	st.Sections = []Section{section}

	var issues []string
	if !section.Reconciles() {
		issues = append(issues, fmt.Sprintf("el balance anterior (%s) más los movimientos (%s) no da el balance al corte (%s)",
			FormatAmount(section.PreviousBalance), FormatAmount(section.Movement()), FormatAmount(section.Balance)))
	}
	return st, issues, nil
}

// withPlainSpaces copies the pages with their no-break spaces ("RD$ 40.00"
// prints one) as plain ones.
func withPlainSpaces(pages []pdftext.Page) []pdftext.Page {
	out := make([]pdftext.Page, len(pages))
	for i, page := range pages {
		out[i] = pdftext.Page{Number: page.Number, Lines: make([]pdftext.Line, len(page.Lines))}
		for j, line := range page.Lines {
			cells := make([]pdftext.Cell, len(line.Cells))
			for k, cell := range line.Cells {
				cells[k] = pdftext.Cell{X: cell.X, Text: strings.ReplaceAll(cell.Text, "\u00a0", " ")}
			}
			out[i].Lines[j] = pdftext.Line{Y: line.Y, Cells: cells}
		}
	}
	return out
}

func isQikFooter(text string) bool {
	return strings.Contains(text, "qik.com.do") || strings.Contains(text, "Qik Banco Digital") ||
		strings.Contains(text, "Av. John F. Kennedy")
}

func isQik(pages []pdftext.Page) bool {
	for _, page := range pages {
		for _, line := range page.Lines {
			if strings.Contains(line.String(), "Qik Banco Digital Dominicano") {
				return true
			}
		}
	}
	return false
}

// qikHeaderValues matches each header label with the value printed under
// it, by position: balance, minimum payment and previous balance.
func qikHeaderValues(labels, values []pdftext.Cell) ([3]int64, error) {
	var out [3]int64
	names := []string{"Balance al corte", "Monto m", "Balance al corte anterior"}
	for i, name := range names {
		var label *pdftext.Cell
		for j := range labels {
			text := labels[j].Text
			if strings.HasPrefix(text, name) && (name != "Balance al corte" || text == "Balance al corte") {
				label = &labels[j]
			}
		}
		if label == nil {
			return out, fmt.Errorf("qik header without %q", name)
		}
		var nearest *pdftext.Cell
		for j := range values {
			if nearest == nil || math.Abs(values[j].X-label.X) < math.Abs(nearest.X-label.X) {
				nearest = &values[j]
			}
		}
		if nearest == nil {
			return out, fmt.Errorf("qik header without values")
		}
		amount, err := parseQikAmount(nearest.Text)
		if err != nil {
			return out, err
		}
		out[i] = amount
	}
	return out, nil
}

func qikTransaction(cells []pdftext.Cell) (Transaction, error) {
	transacted, err := parseDate(cells[0].Text)
	if err != nil {
		return Transaction{}, err
	}
	posted, err := parseDate(cells[1].Text)
	if err != nil {
		return Transaction{}, err
	}
	amount, err := parseQikAmount(cells[len(cells)-1].Text)
	if err != nil {
		return Transaction{}, err
	}
	var description []string
	for _, cell := range cells[2 : len(cells)-1] {
		description = append(description, cell.Text)
	}
	return Transaction{PostedOn: posted, TransactedOn: transacted, Description: collapse(strings.Join(description, " ")), Amount: amount}, nil
}

// parseQikAmount reads "RD$ 1,800.00" (a charge) or "- RD$ 28.00" (a
// credit) into cents, positive for charges like the Popular's statements.
func parseQikAmount(s string) (int64, error) {
	m := qikAmountPattern.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 0, fmt.Errorf("not an amount: %q", s)
	}
	cents, err := parseAmount(m[2])
	if err != nil {
		return 0, err
	}
	if m[1] == "-" {
		cents = -cents
	}
	return cents, nil
}

// parseSpanishDate reads "05 sep 2026".
func parseSpanishDate(s string) (time.Time, error) {
	fields := strings.Fields(s)
	if len(fields) != 3 {
		return time.Time{}, fmt.Errorf("not a date: %q", s)
	}
	day, err1 := strconv.Atoi(fields[0])
	month, ok := spanishMonths[strings.ToLower(fields[1])]
	year, err2 := strconv.Atoi(fields[2])
	if err1 != nil || err2 != nil || !ok {
		return time.Time{}, fmt.Errorf("not a date: %q", s)
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC), nil
}

// qikKind tells a transaction's kind from its description: Qik prints no
// merchant codes to tell purchases by.
func qikKind(description string, amount int64) Kind {
	d := strings.ToUpper(description)
	switch {
	case strings.HasPrefix(d, "PAGO") && amount < 0:
		return Payment
	case strings.Contains(d, "REBATE"), strings.Contains(d, "CASHBACK"):
		return Cashback
	case strings.Contains(d, "INTERES"):
		return Interest
	case strings.HasPrefix(d, "CARGO"), strings.HasPrefix(d, "COMISION"):
		return Fee
	case amount < 0:
		// Chargebacks, provisional credits and purchase returns.
		return Refund
	default:
		return Purchase
	}
}

// qikMerchant cleans a purchase's description into merchant and city
// separated by two spaces, the way the Popular prints them: "Utopia Santo
// Domingododom" becomes "Utopia  Santo Domingo".
func qikMerchant(description string) string {
	d := strings.TrimPrefix(description, "Purchase Returns - ")
	if m := qikPlaceCodes.FindStringSubmatch(d); m != nil {
		d = m[1]
	}
	for _, city := range qikCities {
		if merchant, ok := strings.CutSuffix(d, " "+city); ok && merchant != "" {
			return merchant + "  " + city
		}
	}
	return d
}

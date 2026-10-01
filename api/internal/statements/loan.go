package statements

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// ErrNotPopularLoan means the PDF isn't a Banco Popular loan history.
var ErrNotPopularLoan = errors.New("not a Banco Popular loan history")

// LoanHistory is a loan's movements as the Banco Popular "Historial
// préstamo" lists them, up to the day it was generated. It isn't a monthly
// statement: it covers whatever range was asked for, and prints the
// principal balance after each movement.
type LoanHistory struct {
	Institution string
	Last4       string
	Currency    string
	// Product type as printed: "Prestamos".
	Product string
	// AsOf is the date printed on every page, when the history was generated.
	AsOf time.Time
	// Movements in the order the bank applied them, oldest first.
	Movements []LoanMovement
}

// LoanMovement is one row of a loan history.
type LoanMovement struct {
	PostedOn    time.Time
	EffectiveOn time.Time
	Reference   string
	Description string
	// Amount as printed, in cents.
	Amount int64
	// Balance is the principal owed after the movement, as printed.
	Balance int64
	// Principal is how much the movement moved the balance: the amount for a
	// disbursement, the principal paid for a payment (the rest is interest
	// and charges). Nil when it can't be told, for a payment that opens the
	// history.
	Principal *int64
}

// LoanKind says what a movement is to the loan.
type LoanKind string

const (
	Disbursement LoanKind = "disbursement"
	LoanPayment  LoanKind = "payment"
	Payoff       LoanKind = "payoff"
	LoanOther    LoanKind = "other"
)

func (m LoanMovement) Kind() LoanKind {
	description := strings.ToUpper(collapse(m.Description))
	switch {
	case strings.HasPrefix(description, "DESEMBOLSO"):
		return Disbursement
	case strings.HasPrefix(description, "PAGO TOTAL"), strings.HasPrefix(description, "CANCELACION"):
		return Payoff
	case strings.HasPrefix(description, "PAGO"), strings.HasPrefix(description, "ABONO"):
		return LoanPayment
	default:
		return LoanOther
	}
}

// Every page of a Popular loan history repeats "Pág 1 de 2", the date it was
// generated, the customer's name and address next to the product number,
// type and currency, and the title "Historial préstamo". Then the movements:
//
//	Fecha de posteo | Fecha efectiva | Referencia | Descripción | Monto | Balance
//	10/01/2026 | 10/01/2026 | TESTREF0000001 | PAGO CUOTA | RD$ 5,000.00 | RD$ 100,000.00
//
// Round amounts come without cents ("RD$ 20,000"). Each day's movements are
// listed newest first.
var (
	loanTitlePattern   = regexp.MustCompile(`(?i)^historial pr\S*stamo$`)
	loanPagePattern    = regexp.MustCompile(`^P\S*g\s+(\d+)\s+de\s+(\d+)$`)
	fullDatePattern    = regexp.MustCompile(`^\d{2}/\d{2}/\d{4}$`)
	loanRefPattern     = regexp.MustCompile(`^[A-Z0-9]{6,}$`)
	moneyPattern       = regexp.MustCompile(`^(RD|US)\$\s*(-?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$`)
	productNumberLabel = regexp.MustCompile(`(?i)^n\S*mero de producto:?$`)
	productTypeLabel   = regexp.MustCompile(`(?i)^tipo de producto:?$`)
	currencyLabel      = regexp.MustCompile(`(?i)^moneda:?$`)
)

// ParsePopularLoan reads a Banco Popular loan history. Problems that leave
// it readable, like a missing page or a balance that doesn't follow from the
// one before, come back as issues, in Spanish.
func ParsePopularLoan(pages []pdftext.Page) (LoanHistory, []string, error) {
	var history LoanHistory
	var listed []LoanMovement
	var issues []string
	var number, total int
	seen := map[int]bool{}
	isHistory := false
	for _, page := range pages {
		for _, line := range page.Lines {
			cells := texts(line)
			joined := strings.Join(cells, " ")
			switch {
			case loanTitlePattern.MatchString(joined):
				isHistory = true
			case loanPagePattern.MatchString(joined):
				m := loanPagePattern.FindStringSubmatch(joined)
				number, _ = strconv.Atoi(m[1])
				total, _ = strconv.Atoi(m[2])
				if seen[number] {
					issues = append(issues, fmt.Sprintf("la página %d aparece dos veces", number))
				}
				seen[number] = true
			case len(cells) == 1 && fullDatePattern.MatchString(cells[0]):
				date, err := parseDate(cells[0])
				if err != nil {
					return LoanHistory{}, nil, fmt.Errorf("history date: %w", err)
				}
				if history.AsOf.IsZero() {
					history.AsOf = date
				} else if !date.Equal(history.AsOf) {
					issues = append(issues, fmt.Sprintf("página %d: trae otra fecha de generación (%s)", page.Number, cells[0]))
				}
			case len(cells) >= 6 && fullDatePattern.MatchString(cells[0]):
				movement, err := parseLoanMovement(cells)
				if err != nil {
					issues = append(issues, fmt.Sprintf("página %d: movimiento que no se pudo leer: %s", page.Number, line))
					continue
				}
				listed = append(listed, movement)
			case fullDatePattern.MatchString(cells[0]):
				issues = append(issues, fmt.Sprintf("página %d: línea con fecha que no se pudo leer como movimiento: %s", page.Number, line))
			default:
				for i, cell := range cells[:len(cells)-1] {
					value := cells[i+1]
					switch {
					case productNumberLabel.MatchString(cell):
						digits := strings.TrimSpace(value)
						if len(digits) >= 4 {
							history.Last4 = digits[len(digits)-4:]
						}
					case productTypeLabel.MatchString(cell):
						history.Product = value
					case currencyLabel.MatchString(cell):
						history.Currency = currencyOf(value)
					}
				}
			}
		}
	}
	if !isHistory || history.Last4 == "" {
		return LoanHistory{}, nil, ErrNotPopularLoan
	}
	if history.AsOf.IsZero() {
		return LoanHistory{}, nil, errors.New("loan history without its date")
	}
	history.Institution = "popular"
	if history.Currency == "" {
		history.Currency = defaultCurrency
		issues = append(issues, "no se encontró la moneda; se asume RD$")
	}
	if total == 0 {
		issues = append(issues, "no se encontró la numeración de páginas")
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

	movements, orderIssues := applicationOrder(listed)
	history.Movements = movements
	return history, append(issues, orderIssues...), nil
}

func parseLoanMovement(cells []string) (LoanMovement, error) {
	n := len(cells)
	posted, err := parseDate(cells[0])
	if err != nil {
		return LoanMovement{}, err
	}
	effective, err := parseDate(cells[1])
	if err != nil {
		return LoanMovement{}, err
	}
	if !loanRefPattern.MatchString(cells[2]) {
		return LoanMovement{}, fmt.Errorf("not a reference: %q", cells[2])
	}
	amount, err := parseMoney(cells[n-2])
	if err != nil {
		return LoanMovement{}, err
	}
	balance, err := parseMoney(cells[n-1])
	if err != nil {
		return LoanMovement{}, err
	}
	return LoanMovement{
		PostedOn:    posted,
		EffectiveOn: effective,
		Reference:   cells[2],
		Description: strings.Join(cells[3:n-2], " "),
		Amount:      amount,
		Balance:     balance,
	}, nil
}

// parseMoney reads an amount with its currency, like "RD$ 5,000.00" or
// "RD$ 20,000", into cents.
func parseMoney(s string) (int64, error) {
	m := moneyPattern.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 0, fmt.Errorf("not an amount: %q", s)
	}
	cents := m[4]
	for len(cents) < 2 {
		cents += "0"
	}
	value, err := strconv.ParseInt(strings.ReplaceAll(m[3], ",", "")+cents, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: %w", s, err)
	}
	if m[2] == "-" {
		value = -value
	}
	return value, nil
}

// currencyOf reads "RD$ (Peso Dominicano)" or "US$ (Dólar ...)".
func currencyOf(s string) string {
	switch {
	case strings.Contains(s, "US$"):
		return "USD"
	case strings.Contains(s, "RD$"):
		return "DOP"
	default:
		return ""
	}
}

// applicationOrder puts the movements in the order the bank applied them and
// works out how much each one moved the balance. The history lists days
// oldest first but each day's movements newest first, so a day is replayed
// backwards unless the balances only follow from each other as listed.
func applicationOrder(listed []LoanMovement) ([]LoanMovement, []string) {
	days := slices.Clone(listed)
	slices.SortStableFunc(days, func(a, b LoanMovement) int { return a.PostedOn.Compare(b.PostedOn) })

	var ordered []LoanMovement
	var issues []string
	var previous *int64
	for start := 0; start < len(days); {
		end := start + 1
		for end < len(days) && days[end].PostedOn.Equal(days[start].PostedOn) {
			end++
		}
		day := days[start:end]
		reversed := slices.Clone(day)
		slices.Reverse(reversed)
		chosen, bad := reversed, replay(reversed, previous)
		if bad >= 0 {
			if replay(day, previous) < 0 {
				chosen, bad = day, -1
			}
		}
		if bad >= 0 {
			before := chosen[bad].Balance
			if bad > 0 {
				before = chosen[bad-1].Balance
			} else if previous != nil {
				before = *previous
			}
			m := chosen[bad]
			issues = append(issues, fmt.Sprintf("el balance después de %s del %s (%s) no sale del anterior (%s) con %s",
				collapse(m.Description), m.PostedOn.Format("02/01/2006"), FormatAmount(m.Balance), FormatAmount(before), FormatAmount(m.Amount)))
		}
		for _, m := range chosen {
			if previous != nil {
				moved := m.Balance - *previous
				if m.Kind() != Disbursement {
					moved = -moved
				}
				m.Principal = &moved
			} else if m.Kind() == Disbursement {
				amount := m.Amount
				m.Principal = &amount
			}
			balance := m.Balance
			previous = &balance
			ordered = append(ordered, m)
		}
		start = end
	}
	return ordered, issues
}

// replay checks that each balance follows from the one before: a
// disbursement adds its amount and a payment takes off at most its amount
// (the rest pays interest). It returns the position of the first movement
// that doesn't, or -1.
func replay(movements []LoanMovement, previous *int64) int {
	for i, m := range movements {
		if previous != nil {
			delta := m.Balance - *previous
			switch m.Kind() {
			case Disbursement:
				if delta != m.Amount {
					return i
				}
			case LoanPayment, Payoff:
				if delta > 0 || -delta > m.Amount {
					return i
				}
			}
		}
		balance := m.Balance
		previous = &balance
	}
	return -1
}

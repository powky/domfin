package statements

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ErrNotPopularAccount means the text isn't a Banco Popular bank account
// statement.
var ErrNotPopularAccount = errors.New("not a Banco Popular account statement")

// AccountStatement is a month of a Banco Popular savings or checking
// account. The bank sends these as page images; the text comes from
// reading them (see gridocr).
type AccountStatement struct {
	Institution string
	// Product as printed: "AHORRO EMPLEADO", "CUENTA DIGITAL".
	Product  string
	Last4    string
	Currency string
	// CutDate closes the period (the date printed at the top).
	CutDate         time.Time
	PreviousBalance int64
	Balance         int64
	// Summary are the totals printed under the balances, like "+ DEPOSITOS
	// Y OTROS CREDITOS", signed like the transactions.
	Summary      []SummaryLine
	Transactions []AccountTransaction
}

// Checking reports whether the account is a checking account (the rest are
// savings accounts, like the payroll and digital ones).
func (s AccountStatement) Checking() bool {
	return strings.Contains(strings.ToUpper(s.Product), "CORRIENTE")
}

// Name is the product for display: "Ahorro Empleado".
func (s AccountStatement) Name() string { return titleWords(s.Product) }

// Month is the month of the cut date: "2026-08".
func (s AccountStatement) Month() string { return s.CutDate.Format("2006-01") }

// SummaryLine is one total of the statement's summary.
type SummaryLine struct {
	Label string
	// Count of transactions, when printed.
	Count int
	// Amount in cents: positive adds to the balance, negative takes off.
	Amount int64
}

// AccountTransaction is one movement of a bank account.
type AccountTransaction struct {
	PostedOn     time.Time // fecha de posteo o de entrada
	TransactedOn time.Time // fecha valor o de la transacción
	// Description joins every line printed for the movement.
	Description string
	// Amount in cents, signed like the app: negative is money out (the
	// statement prints a trailing minus).
	Amount int64
	// Balance after the movement.
	Balance int64
}

// Interest reports whether the movement pays the account's interest, which
// the summary totals apart from the other credits.
func (t AccountTransaction) Interest() bool {
	return strings.HasPrefix(strings.ToUpper(collapse(t.Description)), "PAGO INTERES")
}

// Withholding reports whether the movement is the tax withheld on that
// interest ("WH"), which the summary adds to the debits without counting it.
func (t AccountTransaction) Withholding() bool {
	return strings.ToUpper(collapse(t.Description)) == "WH"
}

var (
	accountLinePattern = regexp.MustCompile(`^\s*(\S.*?)\s{2,}(\d{6,})\s+(RD\$|US\$|USD|DOP)(?:\s|$)`)
	headerDatePattern  = regexp.MustCompile(`(\d{1,2}) ([A-Z]{3}) (\d{4})\s*$`)
	accountPagePattern = regexp.MustCompile(`PAG\s+(\d+)\s*$`)
	rowPattern         = regexp.MustCompile(`^\s*(\d{2}) ([A-Z]{3})(?:\s+(.*))?$`)
	dayMonthNamePrefix = regexp.MustCompile(`^(\d{2}) ([A-Z]{3})(?:\s+|$)`)
	summaryPattern     = regexp.MustCompile(`^\s*([+-])\s*(\S.*?)\s{2,}(?:(\d+)\s+)?(\S+)$`)
	statementAmount    = regexp.MustCompile(`^([0-9OoIlSB,.]*)[.,]([0-9Oo]{2})(-?)$`)
)

var monthNumbers = map[string]time.Month{
	"ENE": time.January, "FEB": time.February, "MAR": time.March, "ABR": time.April,
	"MAY": time.May, "JUN": time.June, "JUL": time.July, "AGO": time.August,
	"SEP": time.September, "SET": time.September, "OCT": time.October,
	"NOV": time.November, "DIC": time.December,
}

// ParsePopularAccount reads the text lines of each page of a Banco Popular
// account statement:
//
//	SR NOMBRE                                        PAG    1
//	...                                              20 AGO 2026
//	AHORRO EMPLEADO            800001234   RD$   NOMBRE
//	       BALANCE ANTERIOR                            5,000.00
//	       + DEPOSITOS Y OTROS CREDITOS    1          50,000.00
//	       - CHEQUES Y OTROS DEBITOS       1           3,000.76
//	       + INTERES PAGADO                                1.25
//	       BALANCE AL CORTE                           52,000.49
//	FECHA    FECHA      DESCRIPCION            MONTO         BALANCE
//	27 JUL  BALANCE ANTERIOR                                   5,000.00
//	28 JUL  28 JUL                         3,000.00-           2,000.00
//	                PagoTC Via MB************1234
//
// Every movement prints its balance after it, so each one is checked
// against the one before, and the totals against the summary. Problems come
// back as issues, in Spanish.
func ParsePopularAccount(pages [][]string) (AccountStatement, []string, error) {
	st := AccountStatement{Institution: "popular"}
	var issues []string
	var opening, closing *int64
	var summaryOpening, summaryClosing *int64
	seenPages := map[int]bool{}
	var current *AccountTransaction
	var rawDates []struct{ posted, transacted string }
	done := false

	for pageIndex, lines := range pages {
		inTable := false
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			if !inTable {
				switch {
				case accountPagePattern.MatchString(line) && seenPages != nil:
					n, _ := strconv.Atoi(accountPagePattern.FindStringSubmatch(line)[1])
					if seenPages[n] {
						issues = append(issues, fmt.Sprintf("la página %d aparece dos veces", n))
					}
					seenPages[n] = true
				case st.CutDate.IsZero() && headerDatePattern.MatchString(line) && !strings.Contains(line, "/"):
					m := headerDatePattern.FindStringSubmatch(line)
					date, err := monthNameDate(m[1], m[2], m[3])
					if err == nil {
						st.CutDate = date
					}
				case accountLinePattern.MatchString(line):
					m := accountLinePattern.FindStringSubmatch(line)
					number := m[2]
					product, currency := collapse(m[1]), currencyCode(m[3])
					if st.Last4 == "" {
						st.Product, st.Last4, st.Currency = product, number[len(number)-4:], currency
					} else if number[len(number)-4:] != st.Last4 {
						return AccountStatement{}, nil, fmt.Errorf("pages of accounts %s and %s in one statement", st.Last4, number[len(number)-4:])
					}
				case strings.HasPrefix(trimmed, "BALANCE ANTERIOR"):
					if v, err := parseStatementAmount(lastField(trimmed)); err == nil {
						summaryOpening = &v
					}
				case strings.HasPrefix(trimmed, "BALANCE AL CORTE"):
					if v, err := parseStatementAmount(lastField(trimmed)); err == nil {
						summaryClosing = &v
					}
				case summaryPattern.MatchString(line):
					m := summaryPattern.FindStringSubmatch(line)
					amount, err := parseStatementAmount(m[4])
					if err != nil {
						continue
					}
					if m[1] == "-" {
						amount = -amount
					}
					count, _ := strconv.Atoi(m[3])
					st.Summary = append(st.Summary, SummaryLine{Label: collapse(m[2]), Count: count, Amount: amount})
				case strings.Contains(line, "DESCRIPCION") && strings.Contains(line, "BALANCE"):
					inTable = true
				}
				continue
			}
			if done {
				continue
			}

			if tableHeader(trimmed) {
				continue
			}
			m := rowPattern.FindStringSubmatch(line)
			if m == nil {
				// A line of the description of the movement above.
				if current != nil {
					current.Description = strings.TrimSpace(current.Description + " " + collapse(trimmed))
				} else {
					issues = append(issues, fmt.Sprintf("página %d: línea antes del primer movimiento: %s", pageIndex+1, trimmed))
				}
				continue
			}
			if _, ok := monthNumbers[m[2]]; !ok {
				if current != nil {
					current.Description = strings.TrimSpace(current.Description + " " + collapse(trimmed))
				}
				continue
			}
			rest := strings.TrimSpace(m[3])
			switch {
			case strings.HasPrefix(rest, "BALANCE ANTERIOR"):
				if v, err := parseStatementAmount(lastField(rest)); err == nil {
					opening = &v
				}
				continue
			case strings.HasPrefix(rest, "BALANCE AL CORTE"):
				if v, err := parseStatementAmount(lastField(rest)); err == nil {
					closing = &v
				}
				done = true
				continue
			}

			t, transacted, err := parseAccountRow(rest)
			if err != nil {
				issues = append(issues, fmt.Sprintf("página %d: movimiento que no se pudo leer: %s", pageIndex+1, trimmed))
				current = nil
				continue
			}
			st.Transactions = append(st.Transactions, t)
			current = &st.Transactions[len(st.Transactions)-1]
			rawDates = append(rawDates, struct{ posted, transacted string }{m[1] + " " + m[2], transacted})
		}
	}

	if st.Last4 == "" || (opening == nil && summaryOpening == nil) {
		return AccountStatement{}, nil, ErrNotPopularAccount
	}
	if st.CutDate.IsZero() {
		return AccountStatement{}, nil, errors.New("account statement without its date")
	}
	for i := range st.Transactions {
		t := &st.Transactions[i]
		posted, err := dayMonthName(rawDates[i].posted, st.CutDate)
		if err != nil {
			return AccountStatement{}, nil, err
		}
		t.PostedOn, t.TransactedOn = posted, posted
		if rawDates[i].transacted != "" {
			if transacted, err := dayMonthName(rawDates[i].transacted, st.CutDate); err == nil {
				t.TransactedOn = transacted
			}
		}
	}

	issuef := func(format string, args ...any) { issues = append(issues, fmt.Sprintf(format, args...)) }
	switch {
	case opening != nil:
		st.PreviousBalance = *opening
		if summaryOpening != nil && *summaryOpening != *opening {
			issuef("el balance anterior del resumen (%s) no es el de la tabla (%s)", FormatAmount(*summaryOpening), FormatAmount(*opening))
		}
	default:
		st.PreviousBalance = *summaryOpening
	}
	st.Balance = st.PreviousBalance
	for _, t := range st.Transactions {
		if st.Balance+t.Amount != t.Balance {
			issuef("el balance después de %s del %s (%s) no sale del anterior (%s) con %s",
				shortDescription(t.Description), t.PostedOn.Format("02/01/2006"), FormatAmount(t.Balance),
				FormatAmount(st.Balance), FormatAmount(t.Amount))
		}
		st.Balance = t.Balance
	}
	for _, printed := range []*int64{closing, summaryClosing} {
		if printed != nil && *printed != st.Balance {
			issuef("el estado cierra en %s, pero los movimientos llegan a %s", FormatAmount(*printed), FormatAmount(st.Balance))
			break
		}
	}
	if closing == nil && summaryClosing == nil {
		issuef("no se encontró el balance al corte")
	}
	issues = append(issues, st.summaryIssues()...)
	for n := 1; n <= len(seenPages); n++ {
		if !seenPages[n] {
			issuef("falta la página %d", n)
		}
	}
	return st, issues, nil
}

// summaryIssues compares the summary's totals with the movements: the
// deposits and debits (with their counts) and the interest paid, which the
// bank counts apart from the other credits. The withholding on the interest
// adds to the debits but not to their count.
func (s AccountStatement) summaryIssues() []string {
	var credits, debits, interest int64
	var nCredits, nDebits int
	for _, t := range s.Transactions {
		switch {
		case t.Interest():
			interest += t.Amount
		case t.Amount >= 0:
			credits += t.Amount
			nCredits++
		default:
			debits += t.Amount
			if !t.Withholding() {
				nDebits++
			}
		}
	}
	var issues []string
	for _, line := range s.Summary {
		label := strings.ToUpper(line.Label)
		var amount int64
		var count int
		switch {
		case strings.Contains(label, "INTERES"):
			amount, count = interest, line.Count
		case strings.Contains(label, "DEPOSITO") || strings.Contains(label, "CREDITO"):
			amount, count = credits, nCredits
		case strings.Contains(label, "DEBITO") || strings.Contains(label, "CHEQUE"):
			amount, count = debits, nDebits
		default:
			continue
		}
		if amount != line.Amount || line.Count > 0 && count != line.Count {
			issues = append(issues, fmt.Sprintf("el resumen dice %s: %d por %s, y los movimientos suman %d por %s",
				strings.ToLower(line.Label), line.Count, FormatAmount(line.Amount), count, FormatAmount(amount)))
		}
	}
	return issues
}

// parseAccountRow reads what follows a movement's posting date: the other
// date, the description when it fits on the line, the amount and the
// balance, the last two right-aligned in their columns.
func parseAccountRow(rest string) (AccountTransaction, string, error) {
	var transacted string
	if m := dayMonthNamePrefix.FindStringSubmatch(rest); m != nil {
		if _, ok := monthNumbers[m[2]]; ok {
			transacted = m[1] + " " + m[2]
			rest = strings.TrimSpace(rest[len(m[0]):])
		}
	}
	fields := strings.Fields(rest)
	if len(fields) < 2 {
		return AccountTransaction{}, "", fmt.Errorf("no amount and balance in %q", rest)
	}
	balance, err := parseStatementAmount(fields[len(fields)-1])
	if err != nil {
		return AccountTransaction{}, "", err
	}
	amount, err := parseStatementAmount(fields[len(fields)-2])
	if err != nil {
		return AccountTransaction{}, "", err
	}
	// The description is the text before the amount, which comes right
	// before the balance.
	beforeBalance := rest[:strings.LastIndex(rest, fields[len(fields)-1])]
	description := strings.TrimSpace(beforeBalance[:strings.LastIndex(beforeBalance, fields[len(fields)-2])])
	return AccountTransaction{Description: collapse(description), Amount: amount, Balance: balance}, transacted, nil
}

// parseStatementAmount reads an amount of an account statement, like
// "1,234.00-" (a debit) or ".76-", into signed cents. Letters that the
// scan reads alike (O for 0, I or l for 1) count as the digit, and a comma
// before the cents reads as the decimal point.
func parseStatementAmount(s string) (int64, error) {
	m := statementAmount.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("not an amount: %q", s)
	}
	digits := strings.NewReplacer("O", "0", "o", "0", "I", "1", "l", "1", "S", "5", "B", "8", ",", "", ".", "").
		Replace(m[1] + m[2])
	value, err := strconv.ParseInt(digits, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: %w", s, err)
	}
	if m[3] == "-" {
		value = -value
	}
	return value, nil
}

// The words of the table's header, which takes two lines: "FECHA FECHA
// DESCRIPCION MONTO BALANCE" over "POSTEO VALOR" (or "NUM DE" over
// "ENTRADA TRANS CHEQUE" on later pages).
var tableHeaderWords = map[string]bool{
	"FECHA": true, "POSTEO": true, "VALOR": true, "ENTRADA": true, "TRANS": true,
	"NUM": true, "DE": true, "CHEQUE": true, "DESCRIPCION": true, "MONTO": true, "BALANCE": true,
}

func tableHeader(line string) bool {
	words := strings.Fields(line)
	for _, w := range words {
		if !tableHeaderWords[w] {
			return false
		}
	}
	return len(words) > 0
}

func lastField(s string) string {
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return ""
	}
	return fields[len(fields)-1]
}

func currencyCode(s string) string {
	if s == "USD" || s == "US$" {
		return "USD"
	}
	return "DOP"
}

// monthNameDate reads "20", "AGO", "2026".
func monthNameDate(day, month, year string) (time.Time, error) {
	d, _ := strconv.Atoi(day)
	y, _ := strconv.Atoi(year)
	mo, ok := monthNumbers[month]
	if !ok {
		return time.Time{}, fmt.Errorf("unknown month %q", month)
	}
	date := time.Date(y, mo, d, 0, 0, 0, 0, time.UTC)
	if date.Day() != d {
		return time.Time{}, fmt.Errorf("not a date: %s %s %s", day, month, year)
	}
	return date, nil
}

// dayMonthName reads "28 JUL" as the latest such date on or before the cut.
func dayMonthName(s string, cut time.Time) (time.Time, error) {
	day, month, _ := strings.Cut(s, " ")
	mo, ok := monthNumbers[month]
	if !ok {
		return time.Time{}, fmt.Errorf("unknown month in %q", s)
	}
	return parseDayMonth(fmt.Sprintf("%s/%02d", day, int(mo)), cut)
}

func shortDescription(s string) string {
	if s == "" {
		return "un movimiento"
	}
	if r := []rune(s); len(r) > 40 {
		return string(r[:40]) + "…"
	}
	return s
}

// titleWords capitalizes words longer than three letters: "AHORRO US$
// PERS" reads "Ahorro US$ Pers".
func titleWords(s string) string {
	words := strings.Fields(s)
	for i, word := range words {
		if len([]rune(word)) > 3 && strings.ToUpper(word) == word {
			lower := []rune(strings.ToLower(word))
			words[i] = strings.ToUpper(string(lower[0])) + string(lower[1:])
		}
	}
	return strings.Join(words, " ")
}

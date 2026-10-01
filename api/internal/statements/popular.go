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

// ErrNotPopularCard means the PDF isn't a Banco Popular credit card statement.
var ErrNotPopularCard = errors.New("not a Banco Popular credit card statement")

// A Banco Popular credit card statement prints one section per currency (a
// dual-currency card has "MC CONTIGO DOP" and then "MC CONTIGO USD"), each
// with its own page count. The labels are drawn outside the text layer, so
// only the values come out, always in the same columns. Every page repeats:
//
//	MC CONTIGO DOP                                  (product and currency)
//	****-****-****-1234 | línea de crédito | crédito disponible | fecha de corte | fecha límite de pago | balance anterior
//	...transactions: fecha de entrada | fecha de la transacción | referencia | descripción | cantidad
//	   with the merchant category and authorization on the next line
//	cuotas vencidas | monto vencido | pago mínimo | balance a pagar | balance total
//	Página: 1 / 7
//
// The last page of a section adds the interest rates. Amounts are negative
// for credits (payments, cashback, refunds).
var (
	cardPattern          = regexp.MustCompile(`^\*{4}-\*{4}-\*{4}-(\d{4})$`)
	referencePattern     = regexp.MustCompile(`^\d{6,}$`)
	detailPattern        = regexp.MustCompile(`^(\d{4})(?:\s+(\S+))?$`)
	countPattern         = regexp.MustCompile(`^\d+$`)
	pagePattern          = regexp.MustCompile(`^P\S*gina:\s*(\d+)\s*/\s*(\d+)$`)
	interestRatePattern  = regexp.MustCompile(`(?i)^Tasa de Inter\S*s Anual\.*:\s*([\d.]+)\s*%$`)
	effectiveRatePattern = regexp.MustCompile(`(?i)\bTAE\.*:\s*([\d.]+)\s*%$`)
)

// Sections whose product doesn't end in a currency are in pesos.
const defaultCurrency = "DOP"

// popularPage holds one page's values as printed.
type popularPage struct {
	pdfPage       int
	product       string
	header        []string
	footer        []string
	number, total int
	interestRate  string
	effectiveRate string
	transactions  []rawTransaction
}

type rawTransaction struct {
	posted, transacted, reference, description, amount string
	mcc, authorization                                 string
}

// ParsePopularCard reads a Banco Popular credit card statement from its
// pages. Problems that leave the statement readable, like a missing page or
// totals that don't add up, come back as issues, in Spanish for the person
// importing.
func ParsePopularCard(pages []pdftext.Page) (Statement, []string, error) {
	var issues []string
	var parsed []popularPage
	for _, page := range pages {
		p, ok, pageIssues := readPopularPage(page)
		issues = append(issues, pageIssues...)
		if ok {
			parsed = append(parsed, p)
		}
	}
	if len(parsed) == 0 {
		return Statement{}, nil, ErrNotPopularCard
	}

	var groups [][]popularPage
	for _, p := range parsed {
		n := len(groups)
		if n == 0 || groups[n-1][0].product != p.product || p.number == 1 && hasPage(groups[n-1], 1) {
			groups = append(groups, nil)
			n++
		}
		groups[n-1] = append(groups[n-1], p)
	}

	var st Statement
	for i, group := range groups {
		section, header, sectionIssues, err := buildSection(group)
		if err != nil {
			return Statement{}, nil, err
		}
		issues = append(issues, sectionIssues...)
		last4 := cardPattern.FindStringSubmatch(header.card)[1]
		product, _ := splitProduct(group[0].product)
		if i == 0 {
			st = Statement{
				Institution: "popular",
				Product:     product,
				Last4:       last4,
				CutDate:     header.cut,
				DueDate:     header.due,
			}
			if words := strings.Fields(product); len(words) > 0 {
				st.Brand = brands[strings.ToUpper(words[0])]
			}
		} else {
			if last4 != st.Last4 {
				return Statement{}, nil, fmt.Errorf("sections for cards %s and %s in one statement", st.Last4, last4)
			}
			if !header.cut.Equal(st.CutDate) || !header.due.Equal(st.DueDate) {
				return Statement{}, nil, fmt.Errorf("sections with different cut or due dates in one statement")
			}
			if product != st.Product {
				issues = append(issues, fmt.Sprintf("%s: el producto %q no coincide con %q", section.Currency, product, st.Product))
			}
			for _, other := range st.Sections {
				if other.Currency == section.Currency {
					issues = append(issues, fmt.Sprintf("%s: la moneda aparece en dos secciones", section.Currency))
				}
			}
		}
		st.Sections = append(st.Sections, section)
	}
	return st, issues, nil
}

// splitProduct separates the currency a section's product line ends with:
// "MC CONTIGO USD" is the MC CONTIGO product in dollars.
func splitProduct(line string) (product, currency string) {
	words := strings.Fields(line)
	if n := len(words); n > 1 && (words[n-1] == "DOP" || words[n-1] == "USD") {
		return strings.Join(words[:n-1], " "), words[n-1]
	}
	return strings.Join(words, " "), defaultCurrency
}

func hasPage(group []popularPage, number int) bool {
	return slices.ContainsFunc(group, func(p popularPage) bool { return p.number == number })
}

// readPopularPage picks the values out of one page. ok is false for pages
// without a card header.
func readPopularPage(page pdftext.Page) (p popularPage, ok bool, issues []string) {
	headerAt := slices.IndexFunc(page.Lines, func(line pdftext.Line) bool {
		return len(line.Cells) == 6 && cardPattern.MatchString(line.Cells[0].Text)
	})
	if headerAt < 1 {
		return popularPage{}, false, nil
	}
	p = popularPage{
		pdfPage: page.Number,
		product: collapse(strings.Join(texts(page.Lines[headerAt-1]), " ")),
		header:  texts(page.Lines[headerAt]),
	}

	afterTransaction := false
	for _, line := range page.Lines[headerAt+1:] {
		cells := texts(line)
		joined := strings.Join(cells, " ")
		wasTransaction := afterTransaction
		afterTransaction = false
		switch {
		case isTransaction(cells):
			last := len(cells) - 1
			p.transactions = append(p.transactions, rawTransaction{
				posted:      cells[0],
				transacted:  cells[1],
				reference:   cells[2],
				description: strings.Join(cells[3:last], "  "),
				amount:      cells[last],
			})
			afterTransaction = true
		case wasTransaction && len(cells) == 1 && detailPattern.MatchString(cells[0]):
			m := detailPattern.FindStringSubmatch(cells[0])
			t := &p.transactions[len(p.transactions)-1]
			t.mcc, t.authorization = m[1], m[2]
		case isFooter(cells):
			p.footer = cells
		case pagePattern.MatchString(joined):
			m := pagePattern.FindStringSubmatch(joined)
			p.number, _ = strconv.Atoi(m[1])
			p.total, _ = strconv.Atoi(m[2])
		case interestRatePattern.MatchString(joined):
			p.interestRate = interestRatePattern.FindStringSubmatch(joined)[1]
		case effectiveRatePattern.MatchString(joined):
			p.effectiveRate = effectiveRatePattern.FindStringSubmatch(joined)[1]
		case dayMonthPattern.MatchString(cells[0]):
			issues = append(issues, fmt.Sprintf("página %d: línea con fecha que no se pudo leer como movimiento: %s", page.Number, line))
		}
	}
	return p, true, issues
}

func isTransaction(cells []string) bool {
	return len(cells) >= 4 &&
		dayMonthPattern.MatchString(cells[0]) &&
		dayMonthPattern.MatchString(cells[1]) &&
		referencePattern.MatchString(cells[2]) &&
		amountPattern.MatchString(cells[len(cells)-1])
}

func isFooter(cells []string) bool {
	if len(cells) != 5 || !countPattern.MatchString(cells[0]) {
		return false
	}
	for _, cell := range cells[1:] {
		if !amountPattern.MatchString(cell) {
			return false
		}
	}
	return true
}

type sectionHeader struct {
	card     string
	cut, due time.Time
}

// buildSection turns the pages of one currency into a section, checking
// that no page is missing, that every page repeats the same balances and
// that the transactions add up to them.
func buildSection(pages []popularPage) (Section, sectionHeader, []string, error) {
	first := pages[0]
	_, currency := splitProduct(first.product)
	var issues []string
	issuef := func(format string, args ...any) {
		issues = append(issues, currency+": "+fmt.Sprintf(format, args...))
	}

	footer := first.footer
	var interestRate, effectiveRate string
	seen := map[int]bool{}
	for _, p := range pages {
		if !slices.Equal(p.header, first.header) {
			issuef("el encabezado de la página %d no coincide con el de la primera", p.pdfPage)
		}
		if footer == nil {
			footer = p.footer
		} else if p.footer != nil && !slices.Equal(p.footer, footer) {
			issuef("el resumen de la página %d no coincide con el de la primera", p.pdfPage)
		}
		if p.number > 0 {
			if seen[p.number] {
				issuef("la página %d aparece dos veces", p.number)
			}
			seen[p.number] = true
		}
		interestRate = firstNonEmpty(interestRate, p.interestRate)
		effectiveRate = firstNonEmpty(effectiveRate, p.effectiveRate)
	}
	if footer == nil {
		return Section{}, sectionHeader{}, nil, fmt.Errorf("%s section without its balance summary", currency)
	}
	if first.total == 0 {
		issuef("no se encontró la numeración de páginas")
	}
	var missing []string
	for n := 1; n <= first.total; n++ {
		if !seen[n] {
			missing = append(missing, strconv.Itoa(n))
		}
	}
	if len(missing) > 0 {
		issuef("faltan las páginas %s de %d", strings.Join(missing, ", "), first.total)
	}

	header := sectionHeader{card: first.header[0]}
	cut, err := parseDate(first.header[3])
	if err != nil {
		return Section{}, sectionHeader{}, nil, fmt.Errorf("cut date: %w", err)
	}
	due, err := parseDate(first.header[4])
	if err != nil {
		return Section{}, sectionHeader{}, nil, fmt.Errorf("due date: %w", err)
	}
	header.cut, header.due = cut, due

	section := Section{Currency: currency}
	if section.PastDueCount, err = strconv.Atoi(footer[0]); err != nil {
		return Section{}, sectionHeader{}, nil, fmt.Errorf("%s past-due count: %w", currency, err)
	}
	for _, field := range []struct {
		text string
		into *int64
	}{
		{first.header[1], &section.CreditLimit},
		{first.header[2], &section.AvailableCredit},
		{first.header[5], &section.PreviousBalance},
		{footer[1], &section.PastDueAmount},
		{footer[2], &section.MinimumPayment},
		{footer[3], &section.AmountDue},
		{footer[4], &section.Balance},
	} {
		value, err := parseAmount(field.text)
		if err != nil {
			return Section{}, sectionHeader{}, nil, fmt.Errorf("%s balances: %w", currency, err)
		}
		*field.into = value
	}
	if section.InterestRate, err = parsePercent(interestRate); err != nil {
		issuef("tasa de interés ilegible: %q", interestRate)
	}
	if section.EffectiveRate, err = parsePercent(effectiveRate); err != nil {
		issuef("tasa anual efectiva ilegible: %q", effectiveRate)
	}

	for _, p := range pages {
		for _, raw := range p.transactions {
			t, err := raw.parse(cut)
			if err != nil {
				return Section{}, sectionHeader{}, nil, fmt.Errorf("%s transaction on page %d: %w", currency, p.pdfPage, err)
			}
			section.Transactions = append(section.Transactions, t)
		}
	}
	if !section.Reconciles() {
		issuef("el balance anterior (%s) más los movimientos (%s) da %s, pero el estado cierra en %s",
			FormatAmount(section.PreviousBalance), FormatAmount(section.Movement()),
			FormatAmount(section.PreviousBalance+section.Movement()), FormatAmount(section.Balance))
	}
	return section, header, issues, nil
}

func (raw rawTransaction) parse(cut time.Time) (Transaction, error) {
	posted, err := parseDayMonth(raw.posted, cut)
	if err != nil {
		return Transaction{}, err
	}
	transacted, err := parseDayMonth(raw.transacted, cut)
	if err != nil {
		return Transaction{}, err
	}
	amount, err := parseAmount(raw.amount)
	if err != nil {
		return Transaction{}, err
	}
	return Transaction{
		PostedOn:      posted,
		TransactedOn:  transacted,
		Reference:     raw.reference,
		Description:   strings.TrimSpace(raw.description),
		MCC:           raw.mcc,
		Authorization: raw.authorization,
		Amount:        amount,
	}, nil
}

// parsePercent reads "25.00"; an empty rate (not printed) is zero.
func parsePercent(s string) (float64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseFloat(s, 64)
}

func firstNonEmpty(current, next string) string {
	if current != "" {
		return current
	}
	return next
}

func texts(line pdftext.Line) []string {
	out := make([]string, len(line.Cells))
	for i, cell := range line.Cells {
		out[i] = cell.Text
	}
	return out
}

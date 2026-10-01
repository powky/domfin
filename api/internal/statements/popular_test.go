package statements

import (
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// page builds a page the way pdftext reads a Popular statement: one line per
// row, one cell per column. Everything here is made up.
func page(number int, rows ...[]string) pdftext.Page {
	p := pdftext.Page{Number: number}
	y := 700.0
	for _, row := range rows {
		line := pdftext.Line{Y: y}
		for i, text := range row {
			line.Cells = append(line.Cells, pdftext.Cell{X: 25 + 100*float64(i), Text: text})
		}
		p.Lines = append(p.Lines, line)
		y -= 12
	}
	return p
}

var (
	pesosHeader   = []string{"****-****-****-1234", "50,000.00", "38,250.00", "28/01/2026", "23/02/2026", "10,000.00"}
	pesosFooter   = []string{"0", "0.00", "450.00", "11,750.00", "11,750.00"}
	dollarsHeader = []string{"****-****-****-1234", "1,000.00", "975.01", "28/01/2026", "23/02/2026", "30.00"}
	dollarsFooter = []string{"0", "0.00", "5.00", "24.99", "24.99"}
	personalLines = [][]string{{"NOMBRE DE PRUEBA"}, {"correo@example.com"}}
)

func dualCurrencyStatement() []pdftext.Page {
	return []pdftext.Page{
		page(1, append([][]string{
			{"MC PRUEBA DOP"}, pesosHeader,
			{"28/01", "28/01", "0570000001", "Cashback Prueba", "-50.00"},
			{"30/12", "29/12", "10000000000000000000001", "SUPERMERCADO UNO  SANTO DOMINGO", "2,500.00"},
			{"5411   000101"},
			{"30/12", "30/12", "0560000002", "Pago Via App", "-10,000.00"},
			pesosFooter, {"Página: 1 / 2"},
		}, personalLines...)...),
		page(2,
			[]string{"MC PRUEBA DOP"}, pesosHeader,
			[]string{"05/01", "04/01", "0562300001", "RETIROS TH VIA MBanking", "9,000.00"},
			[]string{"6011   000103"},
			[]string{"05/01", "04/01", "0562300002", "COM. AVANCE EFECTIVO APP", "300.00"},
			[]string{"Puede recibir su próximo estado de cuenta vía SMS o correo"},
			[]string{"Tasa de Interés Anual....: 24.00 %"},
			[]string{"Saldo Promedio Diario de los Consumos del Mes", "1,000.00"},
			pesosFooter, []string{"Página: 2 / 2"},
		),
		page(3,
			[]string{"MC PRUEBA USD"}, dollarsHeader,
			[]string{"01/01", "01/01", "10000000000000000000003", "TIENDA   *APPS  CUPERTNO", "-5.00"},
			[]string{"5735   0A0105"},
			[]string{"17/01", "16/01", "10000000000000000000002", "SERVICIO WEB  SAN FRANCISCO", "19.99"},
			[]string{"5734   000102"},
			[]string{"26/01", "25/01", "0569100003", "Pago Via App", "-20.00"},
			[]string{"Tasa de Interés Anual....: 21.00 %"},
			[]string{"Tasa anual efectiva- TAE....:26.00%"},
			dollarsFooter, []string{"Página: 1 / 1"},
		),
	}
}

func date(s string) time.Time {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return d
}

func TestParsePopularCardDualCurrency(t *testing.T) {
	st, issues, err := ParsePopularCard(dualCurrencyStatement())
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) > 0 {
		t.Errorf("unexpected issues: %q", issues)
	}
	if st.Institution != "popular" || st.Last4 != "1234" || st.Product != "MC PRUEBA" || st.Brand != "Mastercard" || st.Name() != "Prueba" {
		t.Errorf("card = %s %s %q %s %q", st.Institution, st.Last4, st.Product, st.Brand, st.Name())
	}
	if !st.CutDate.Equal(date("2026-01-28")) || !st.DueDate.Equal(date("2026-02-23")) || st.Month() != "2026-01" {
		t.Errorf("dates = %v %v", st.CutDate, st.DueDate)
	}
	if len(st.Sections) != 2 {
		t.Fatalf("got %d sections, want 2", len(st.Sections))
	}

	pesos := st.Sections[0]
	want := Section{
		Currency: "DOP", CreditLimit: 5_000_000, AvailableCredit: 3_825_000, PreviousBalance: 1_000_000,
		Balance: 1_175_000, AmountDue: 1_175_000, MinimumPayment: 45_000, InterestRate: 24,
	}
	if got := pesos; got.Currency != want.Currency || got.CreditLimit != want.CreditLimit ||
		got.AvailableCredit != want.AvailableCredit || got.PreviousBalance != want.PreviousBalance ||
		got.Balance != want.Balance || got.AmountDue != want.AmountDue || got.MinimumPayment != want.MinimumPayment ||
		got.InterestRate != want.InterestRate || got.EffectiveRate != 0 {
		t.Errorf("pesos section = %+v", got)
	}
	if !pesos.Reconciles() || pesos.Movement() != 175_000 {
		t.Errorf("pesos movement = %d", pesos.Movement())
	}

	var got []string
	for _, tr := range pesos.Transactions {
		got = append(got, strings.Join([]string{
			tr.PostedOn.Format("2006-01-02"), tr.TransactedOn.Format("2006-01-02"), tr.Reference,
			tr.Merchant(), tr.Location(), tr.MCC, tr.Authorization, string(tr.Kind()), FormatAmount(tr.Amount),
		}, " | "))
	}
	wantLines := []string{
		"2026-01-28 | 2026-01-28 | 0570000001 | Cashback Prueba |  |  |  | cashback | -50.00",
		// December purchases belong to the year before the January cut.
		"2025-12-30 | 2025-12-29 | 10000000000000000000001 | SUPERMERCADO UNO | SANTO DOMINGO | 5411 | 000101 | purchase | 2,500.00",
		"2025-12-30 | 2025-12-30 | 0560000002 | Pago Via App |  |  |  | payment | -10,000.00",
		"2026-01-05 | 2026-01-04 | 0562300001 | RETIROS TH VIA MBanking |  | 6011 | 000103 | cash_advance | 9,000.00",
		"2026-01-05 | 2026-01-04 | 0562300002 | COM. AVANCE EFECTIVO APP |  |  |  | fee | 300.00",
	}
	if !slices.Equal(got, wantLines) {
		t.Errorf("pesos transactions:\n got %q\nwant %q", got, wantLines)
	}

	dollars := st.Sections[1]
	if dollars.Currency != "USD" || dollars.PreviousBalance != 3000 || dollars.Balance != 2499 ||
		dollars.InterestRate != 21 || dollars.EffectiveRate != 26 || !dollars.Reconciles() {
		t.Errorf("dollars section = %+v", dollars)
	}
	if refund := dollars.Transactions[0]; refund.Kind() != Refund || refund.Merchant() != "TIENDA *APPS" ||
		refund.Location() != "CUPERTNO" || refund.Authorization != "0A0105" {
		t.Errorf("refund = %+v (%s, %q, %q)", refund, refund.Kind(), refund.Merchant(), refund.Location())
	}
}

func TestParsePopularCardSingleCurrencyIsPesos(t *testing.T) {
	pages := []pdftext.Page{page(1,
		[]string{"VISA PRUEBA"}, pesosHeader,
		[]string{"02/01", "01/01", "0560000009", "Pago Via App", "-10,000.00"},
		[]string{"10/01", "09/01", "10000000000000000000004", "ESTACION DE PRUEBA  DISTRITO NACI", "11,750.00"},
		[]string{"5541   000104"},
		pesosFooter, []string{"Página: 1 / 1"},
	)}
	st, issues, err := ParsePopularCard(pages)
	if err != nil || len(issues) > 0 {
		t.Fatalf("err = %v, issues = %q", err, issues)
	}
	if len(st.Sections) != 1 || st.Sections[0].Currency != "DOP" || st.Brand != "Visa" || st.Product != "VISA PRUEBA" {
		t.Errorf("statement = %+v", st)
	}
}

func TestParsePopularCardReportsProblems(t *testing.T) {
	pages := dualCurrencyStatement()
	// Drop the second pesos page, which takes its transactions with it: the
	// balance no longer adds up.
	pages = slices.Delete(pages, 1, 2)
	// A line with a date that isn't a transaction.
	pages[0].Lines = append(pages[0].Lines, pdftext.Line{Cells: []pdftext.Cell{{Text: "29/12"}, {Text: "cargo raro"}}})
	// A dollars page whose header differs from the section's first page.
	extra := page(4, []string{"MC PRUEBA USD"}, slices.Concat(dollarsHeader[:5], []string{"31.00"}), dollarsFooter)
	pages = append(pages, extra)

	_, issues, err := ParsePopularCard(pages)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"página 1: línea con fecha que no se pudo leer como movimiento: 29/12 | cargo raro",
		"DOP: faltan las páginas 2 de 2",
		"DOP: el balance anterior (10,000.00) más los movimientos (-7,550.00) da 2,450.00, pero el estado cierra en 11,750.00",
		"USD: el encabezado de la página 4 no coincide con el de la primera",
	}
	if !slices.Equal(issues, want) {
		t.Errorf("issues:\n got %q\nwant %q", issues, want)
	}
}

func TestParsePopularCardRejectsOtherDocuments(t *testing.T) {
	pages := []pdftext.Page{page(1, []string{"Estado de Cuenta"}, []string{"05/01", "Compra", "100.00"})}
	if _, _, err := ParsePopularCard(pages); !errors.Is(err, ErrNotPopularCard) {
		t.Errorf("err = %v, want ErrNotPopularCard", err)
	}
}

func TestParseDayMonth(t *testing.T) {
	for _, tc := range []struct {
		dayMonth, cut, want string
	}{
		{"28/01", "2026-01-28", "2026-01-28"},
		{"30/12", "2026-01-28", "2025-12-30"},
		{"15/06", "2026-06-29", "2026-06-15"},
		{"29/02", "2024-03-28", "2024-02-29"},
		{"29/02", "2026-03-28", ""}, // neither 2026 nor 2025 is a leap year
		{"31/04", "2026-05-28", ""},
		{"1/05", "2026-05-28", ""},
	} {
		got, err := parseDayMonth(tc.dayMonth, date(tc.cut))
		switch {
		case tc.want == "" && err == nil:
			t.Errorf("%s before %s = %v, want an error", tc.dayMonth, tc.cut, got)
		case tc.want != "" && (err != nil || !got.Equal(date(tc.want))):
			t.Errorf("%s before %s = %v, %v; want %s", tc.dayMonth, tc.cut, got, err, tc.want)
		}
	}
}

func TestAmounts(t *testing.T) {
	for _, tc := range []struct {
		text  string
		cents int64
	}{
		{"0.00", 0}, {"-0.01", -1}, {"0.28", 28}, {"1,700.00", 170_000}, {"-123,456.78", -12_345_678}, {"1234.50", 123_450},
	} {
		got, err := parseAmount(tc.text)
		if err != nil || got != tc.cents {
			t.Errorf("parseAmount(%q) = %d, %v; want %d", tc.text, got, err, tc.cents)
		}
	}
	if got, _ := parseAmount("-0.00"); got != 0 {
		t.Errorf("-0.00 = %d", got)
	}
	for _, bad := range []string{"12.5", "1,70.00", "abc", "", "--1.00"} {
		if _, err := parseAmount(bad); err == nil {
			t.Errorf("parseAmount(%q) should fail", bad)
		}
	}
	for cents, want := range map[int64]string{0: "0.00", -1: "-0.01", 170_000: "1,700.00", -12_345_678: "-123,456.78", 100_000_000: "1,000,000.00"} {
		if got := FormatAmount(cents); got != want {
			t.Errorf("FormatAmount(%d) = %q, want %q", cents, got, want)
		}
	}
}

func TestNames(t *testing.T) {
	for product, want := range map[string]string{
		"MC CONTIGO": "Contigo", "MASTERCARD INFINIA": "Infinia", "VISA ISI": "ISI", "MC GNIAL": "Gnial", "PRUEBA": "Prueba",
	} {
		if got := (Statement{Product: product}).Name(); got != want {
			t.Errorf("Name(%q) = %q, want %q", product, got, want)
		}
	}
}

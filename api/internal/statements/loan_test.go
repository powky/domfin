package statements

import (
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/pdftext"
)

// loanPage builds a page the way pdftext reads a Popular loan history, with
// made-up data. Rows are listed like the bank does: days oldest first, each
// day's movements newest first.
func loanPage(number, total int, rows ...[]string) pdftext.Page {
	lines := [][]string{
		{"Pág", fmt.Sprintf("%d de", number), fmt.Sprint(total)},
		{"30/09/2026"},
		{"NOMBRE DE PRUEBA", "Número de producto:", "000999991234"},
		{"CALLE DE PRUEBA 1", "Tipo de producto:", "Prestamos"},
		{"SANTO DOMINGO"},
		{"CIUDAD DE PRUEBA", "Moneda:", "RD$ (Peso Dominicano)"},
		{"Historial préstamo"},
		{"Fecha de posteo", "Fecha efectiva", "Referencia", "Descripción", "Monto", "Balance"},
	}
	lines = append(lines, rows...)
	lines = append(lines, []string{"BANCO POPULAR DOMINICANO, S. A. - BANCO MÚLTIPLE", "TEL.: 809 544 5555"})
	return page(number, lines...)
}

func loanHistoryPages() []pdftext.Page {
	return []pdftext.Page{
		loanPage(1, 2,
			[]string{"10/01/2026", "10/01/2026", "TESTREF0000001", "PAGO CUOTA", "RD$ 5,000.00", "RD$ 100,000.00"},
			// Same day, newest first: the payment came before the disbursement.
			[]string{"10/02/2026", "10/02/2026", "TESTREF0000003", "DESEMBOLSO", "RD$ 50,000", "RD$ 148,000.00"},
			[]string{"10/02/2026", "10/02/2026", "TESTREF0000002", "PAGO CUOTA", "RD$ 5,000.00", "RD$ 98,000.00"},
		),
		loanPage(2, 2,
			[]string{"10/03/2026", "10/03/2026", "TESTREF0000004", "PAGO CUOTA", "RD$ 2,000.00", "RD$ 148,000.00"},
			[]string{"20/03/2026", "20/03/2026", "TESTREF0000005", "PAGO TOTAL", "RD$ 150,120.50", "RD$ 0.00"},
		),
	}
}

func TestParsePopularLoan(t *testing.T) {
	history, issues, err := ParsePopularLoan(loanHistoryPages())
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) > 0 {
		t.Errorf("unexpected issues: %q", issues)
	}
	if history.Institution != "popular" || history.Last4 != "1234" || history.Currency != "DOP" ||
		history.Product != "Prestamos" || !history.AsOf.Equal(date("2026-09-30")) {
		t.Errorf("history = %+v", history)
	}

	var got []string
	for _, m := range history.Movements {
		principal := "?"
		if m.Principal != nil {
			principal = FormatAmount(*m.Principal)
		}
		got = append(got, fmt.Sprintf("%s %s %s %s %s %s", m.PostedOn.Format("2006-01-02"), m.Reference, m.Kind(),
			FormatAmount(m.Amount), FormatAmount(m.Balance), principal))
	}
	want := []string{
		// Nothing before it to tell how much of the first payment was principal.
		"2026-01-10 TESTREF0000001 payment 5,000.00 100,000.00 ?",
		"2026-02-10 TESTREF0000002 payment 5,000.00 98,000.00 2,000.00",
		"2026-02-10 TESTREF0000003 disbursement 50,000.00 148,000.00 50,000.00",
		// Only interest.
		"2026-03-10 TESTREF0000004 payment 2,000.00 148,000.00 0.00",
		"2026-03-20 TESTREF0000005 payoff 150,120.50 0.00 148,000.00",
	}
	if !slices.Equal(got, want) {
		t.Errorf("movements:\n got %q\nwant %q", got, want)
	}
}

func TestParsePopularLoanReportsProblems(t *testing.T) {
	pages := loanHistoryPages()[:1] // page 2 is missing
	// The February payment raises the balance instead of lowering it.
	payment := pages[0].Lines[10]
	if payment.Cells[2].Text != "TESTREF0000002" {
		t.Fatalf("line 10 is %s", payment)
	}
	payment.Cells[5].Text = "RD$ 101,000.00"
	pages[0].Lines = append(pages[0].Lines, pdftext.Line{Cells: []pdftext.Cell{{Text: "11/02/2026"}, {Text: "movimiento raro"}}})

	_, issues, err := ParsePopularLoan(pages)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"página 1: línea con fecha que no se pudo leer como movimiento: 11/02/2026 | movimiento raro",
		"faltan las páginas 2 de 2",
		"el balance después de PAGO CUOTA del 10/02/2026 (101,000.00) no sale del anterior (100,000.00) con 5,000.00",
	}
	if !slices.Equal(issues, want) {
		t.Errorf("issues:\n got %q\nwant %q", issues, want)
	}
}

func TestParsePopularLoanRejectsOtherDocuments(t *testing.T) {
	if _, _, err := ParsePopularLoan(dualCurrencyStatement()); !errors.Is(err, ErrNotPopularLoan) {
		t.Errorf("card statement: err = %v, want ErrNotPopularLoan", err)
	}
	if _, _, err := ParsePopularCard(loanHistoryPages()); !errors.Is(err, ErrNotPopularCard) {
		t.Errorf("loan history as a card: err = %v, want ErrNotPopularCard", err)
	}
}

func TestParseMoney(t *testing.T) {
	for text, want := range map[string]int64{
		"RD$ 5,432.10": 543_210, "RD$ 20,000": 2_000_000, "US$ 5.5": 550, "RD$ 0.00": 0, "RD$ -1,000.00": -100_000, "US$1,700": 170_000,
	} {
		if got, err := parseMoney(text); err != nil || got != want {
			t.Errorf("parseMoney(%q) = %d, %v; want %d", text, got, err, want)
		}
	}
	for _, bad := range []string{"12.00", "RD$", "RD$ 1,00.00", "EUR 5.00", "RD$ 1.234"} {
		if _, err := parseMoney(bad); err == nil {
			t.Errorf("parseMoney(%q) should fail", bad)
		}
	}
}

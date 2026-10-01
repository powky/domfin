// Package testpdf writes small PDFs for tests: text at given spots, and
// encrypted like the Banco Popular statements (40-bit RC4) when there's a
// password. It also lays out made-up Popular statements the way the real
// ones are.
package testpdf

import (
	"bytes"
	"fmt"
	"testing"

	"github.com/go-pdf/fpdf"
)

// Text is a string drawn at X, Y points from the page's top-left corner
// (Y is the baseline).
type Text struct {
	X, Y float64
	S    string
}

// Build writes a Letter-size PDF with one page per slice of texts, in 8 pt
// Courier like the statements.
func Build(t testing.TB, password string, pages ...[]Text) []byte {
	t.Helper()
	doc := fpdf.New("P", "pt", "Letter", "")
	if password != "" {
		doc.SetProtection(fpdf.CnProtectPrint, password, "owner "+password)
	}
	encode := doc.UnicodeTranslatorFromDescriptor("")
	for _, texts := range pages {
		doc.AddPage()
		doc.SetFont("Courier", "", 8)
		for _, text := range texts {
			doc.Text(text.X, text.Y, encode(text.S))
		}
	}
	var out bytes.Buffer
	if err := doc.Output(&out); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

// PopularCard is a made-up Banco Popular dual-currency card statement laid
// out like the real ones: card ****1234, cut on 2026-01-28, two
// transactions in pesos and one in dollars, encrypted with password.
func PopularCard(t testing.TB, password string) []byte {
	t.Helper()
	card := "****-****-****-1234"
	return Build(t, password,
		popularCardPage("MC PRUEBA DOP",
			[]string{card, "50,000.00", "38,250.00", "28/01/2026", "23/02/2026", "10,000.00"},
			[][]string{
				{"30/12", "29/12", "10000000000000000000001", "SUPERMERCADO UNO  SANTO DOMINGO", "11,750.00", "5411   000101"},
				{"30/12", "30/12", "0560000002", "Pago Via App", "-10,000.00"},
			},
			[]string{"0", "0.00", "450.00", "11,750.00", "11,750.00"}, 1, 1),
		popularCardPage("MC PRUEBA USD",
			[]string{card, "1,000.00", "975.01", "28/01/2026", "23/02/2026", "5.00"},
			[][]string{{"17/01", "16/01", "10000000000000000000002", "SERVICIO WEB  SAN FRANCISCO", "19.99", "5734   000102"}},
			[]string{"0", "0.00", "5.00", "24.99", "24.99"}, 1, 1),
	)
}

// popularCardPage places a page's values where a Popular card statement
// does. Each transaction is posted date, transaction date, reference,
// description, amount and, for card purchases, the line printed under it.
func popularCardPage(product string, header []string, transactions [][]string, footer []string, number, total int) []Text {
	texts := []Text{{X: 25.5, Y: 96, S: product}}
	for i, x := range []float64{25.5, 195.6, 273.3, 375.3, 458.8, 536} {
		texts = append(texts, Text{X: x, Y: 114, S: header[i]})
	}
	y := 178.0
	for _, t := range transactions {
		for i, x := range []float64{29.1, 60.3, 91.5, 251.2, 540} {
			texts = append(texts, Text{X: x, Y: y, S: t[i]})
		}
		if len(t) > 5 {
			texts = append(texts, Text{X: 251.2, Y: y + 11.5, S: t[5]})
		}
		y += 25.5
	}
	for i, x := range []float64{46.4, 165.8, 273.5, 389.1, 512.2} {
		texts = append(texts, Text{X: x, Y: 575, S: footer[i]})
	}
	return append(texts,
		Text{X: 16.4, Y: 665, S: "NOMBRE DE PRUEBA"},
		Text{X: 501.1, Y: 736, S: fmt.Sprintf("Página: %d / %d", number, total)})
}

// PopularLoan is a made-up Banco Popular loan history laid out like the real
// ones (which have no password): loan ****1234, generated on 2026-09-30,
// with a disbursement in January and a payment in February.
func PopularLoan(t testing.TB) []byte {
	t.Helper()
	texts := []Text{
		{X: 540, Y: 37, S: "Pág 1 de 1"},
		{X: 539, Y: 49, S: "30/09/2026"},
		{X: 24, Y: 111, S: "NOMBRE DE PRUEBA"}, {X: 330, Y: 111, S: "Número de producto:"}, {X: 440, Y: 111, S: "000999991234"},
		{X: 24, Y: 139, S: "CALLE DE PRUEBA 1"}, {X: 330, Y: 139, S: "Tipo de producto:"}, {X: 440, Y: 139, S: "Prestamos"},
		{X: 24, Y: 166, S: "CIUDAD DE PRUEBA"}, {X: 330, Y: 166, S: "Moneda:"}, {X: 440, Y: 166, S: "RD$ (Peso Dominicano)"},
		{X: 251, Y: 215, S: "Historial préstamo"},
	}
	columns := []float64{45, 110, 190, 300, 400, 490}
	for i, header := range []string{"Fecha de posteo", "Fecha efectiva", "Referencia", "Descripción", "Monto", "Balance"} {
		texts = append(texts, Text{X: columns[i], Y: 242, S: header})
	}
	for r, row := range [][]string{
		{"10/01/2026", "10/01/2026", "TESTREF0000001", "DESEMBOLSO", "RD$ 100,000", "RD$ 100,000.00"},
		{"10/02/2026", "10/02/2026", "TESTREF0000002", "PAGO CUOTA", "RD$ 5,000.00", "RD$ 97,000.00"},
	} {
		for i, cell := range row {
			texts = append(texts, Text{X: columns[i], Y: 283 + 47*float64(r), S: cell})
		}
	}
	return Build(t, "", texts)
}

// PopularCertificate is a made-up Banco Popular certificate history laid out
// like the real ones (no password): certificate ****1234, generated on
// 2026-09-30, opened with 100,000.00 in July that earns interest monthly,
// with the tax withheld and a renewal each time. Rows wrap over three text
// lines, like the bank's.
func PopularCertificate(t testing.TB) []byte {
	t.Helper()
	texts := []Text{
		{X: 540, Y: 37, S: "Pág 1 de 1"},
		{X: 539, Y: 49, S: "30/09/2026"},
		{X: 24, Y: 111, S: "NOMBRE DE PRUEBA"}, {X: 330, Y: 111, S: "Número de producto:"}, {X: 440, Y: 111, S: "000999991234"},
		{X: 24, Y: 166, S: "CIUDAD DE PRUEBA"}, {X: 330, Y: 166, S: "Moneda:"}, {X: 440, Y: 166, S: "RD$ (Peso Dominicano)"},
		{X: 230, Y: 215, S: "Historial Depósito a Plazo"},
	}
	// Each row: its line (date, posting date, code, description, rate,
	// amount, capital) plus what the description and type wrap to above
	// and below it.
	rows := []struct {
		line                       []string
		above, below, typeA, typeB string
	}{
		{[]string{"22/07/2026", "", "87", "DEPOSITO 100,000.00", "10.00%", "RD$100,000", "RD$100,000"}, "", "", "Capital", ""},
		{[]string{"22/08/2026", "21/08/2026", "20", "", "10.00%", "RD$833.33", "RD$100,833.33"}, "INTERES AGREGAD", "833.33", "Interés", "paga"},
		{[]string{"22/08/2026", "21/08/2026", "06", "RETENCION DGII 83.33", "0.00%", "RD$83.33", "RD$100,750"}, "", "", "Interés", "rete"},
		{[]string{"22/08/2026", "21/08/2026", "15", "", "9.50%", "RD$0", "RD$100,750"}, "RENOVACION DE CD 22-", "09-26", "Próx fcha", "ve"},
		{[]string{"22/09/2026", "", "20", "", "9.50%", "RD$797.6", "RD$101,547.6"}, "INTERES AGREGAD", "797.60", "Interés", "paga"},
		{[]string{"22/09/2026", "", "06", "RETENCION DGII 79.76", "0.00%", "RD$79.76", "RD$101,467.84"}, "", "", "Interés", "rete"},
		{[]string{"22/09/2026", "", "15", "", "9.50%", "RD$0", "RD$101,467.84"}, "RENOVACION DE CD 22-", "10-26", "Próx fcha", "ve"},
	}
	columns := []float64{31, 88, 160, 205, 316, 360, 467}
	for r, row := range rows {
		y := 290 + 47*float64(r)
		for i, cell := range row.line {
			if cell != "" {
				texts = append(texts, Text{X: columns[i], Y: y, S: cell})
			}
		}
		texts = append(texts, Text{X: 545, Y: y, S: "0.00%"})
		for _, wrapped := range []struct {
			x, dy float64
			s     string
		}{{210, -5.5, row.above}, {238, 5.5, row.below}, {419, -5.5, row.typeA}, {424, 5.5, row.typeB}} {
			if wrapped.s != "" {
				texts = append(texts, Text{X: wrapped.x, Y: y + wrapped.dy, S: wrapped.s})
			}
		}
	}
	return Build(t, "", texts)
}

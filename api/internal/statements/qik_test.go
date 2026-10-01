package statements

import (
	"errors"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/pdftext"
)

// qikLine lays cells out at the given X positions, like pdftext reads a Qik
// statement. Everything here is made up.
func qikLine(cells ...any) pdftext.Line {
	var line pdftext.Line
	for i := 0; i < len(cells); i += 2 {
		line.Cells = append(line.Cells, pdftext.Cell{X: cells[i].(float64), Text: cells[i+1].(string)})
	}
	return line
}

func qikStatement(transactions ...pdftext.Line) []pdftext.Page {
	lines := []pdftext.Line{
		qikLine(300.0, "Período: 06 ago - 05 sep 2026"),
		qikLine(20.0, "Hola, Nombre De Prueba", 400.0, "Fecha de corte: 05 sep 2026"),
		qikLine(400.0, "Límite Aprobado: RD$ 40,000.00"),
		qikLine(20.0, "************1234"),
		qikLine(209.0, "Balance al corte", 334.0, "Monto mínimo a pagar", 464.0, "Balance al corte anterior"),
		qikLine(69.0, "Fecha Límite de Pago"),
		// The values sit under their labels, whatever their order.
		qikLine(475.0, "2,800.00", 198.0, "RD$ 4,330.52", 337.0, "RD$ 120.29"),
		qikLine(69.0, "01 oct 2026"),
		qikLine(40.0, "Fecha", 150.0, "Entrada", 250.0, "Descripción", 500.0, "Monto"),
	}
	lines = append(lines, transactions...)
	lines = append(lines,
		qikLine(20.0, "www.qik.com.do"),
		qikLine(20.0, "Qik Banco Digital Dominicano, S.A. - Banco Múltiple."),
		qikLine(20.0, "Información Adicional"),
		qikLine(20.0, "Tu tasa de interés anual es de 60.00%", 300.0, "Tasa Anual Efectiva es de 60.00% en caso de ﬁnanciamiento"),
	)
	return []pdftext.Page{{Number: 1, Lines: lines}}
}

func TestParseQikCard(t *testing.T) {
	pages := qikStatement(
		qikLine(40.0, "10/08/2026", 150.0, "10/08/2026", 250.0, "Pago A Tarjeta - Cuenta De Ahorro Qik", 500.0, "- RD$ 2,800.00"),
		qikLine(40.0, "10/08/2026", 150.0, "10/08/2026", 250.0, "Payment Return/prepaid Activation And Load/prepaid Load -", 500.0, "- RD$ 28.00"),
		qikLine(250.0, "Recompensas Qik Rebate Modom"),
		qikLine(40.0, "14/08/2026", 150.0, "15/08/2026", 250.0, "Heladeria Prueba Santo Domingododom", 500.0, "RD$ 1,800.00"),
		qikLine(40.0, "16/08/2026", 150.0, "17/08/2026", 250.0, "Servicio Web San Franciscocausa", 500.0, "RD$ 2,581.29"),
		qikLine(40.0, "20/08/2026", 150.0, "20/08/2026", 250.0, "Purchase Returns - Heladeria Prueba Santo Domingododom", 500.0, "- RD$ 22.77"),
	)
	st, issues, err := ParseQikCard(pages)
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 0 {
		t.Errorf("issues: %v", issues)
	}
	date := func(s string) time.Time { d, _ := time.Parse("2006-01-02", s); return d }
	if st.Institution != "qik" || st.Name() != "Qik" || st.Last4 != "1234" ||
		!st.CutDate.Equal(date("2026-09-05")) || !st.DueDate.Equal(date("2026-10-01")) {
		t.Errorf("statement: %+v", st)
	}
	s := st.Sections[0]
	if s.Currency != "DOP" || s.CreditLimit != 4_000_000 || s.Balance != 433_052 || s.MinimumPayment != 12_029 ||
		s.PreviousBalance != 280_000 || s.InterestRate != 60 || s.EffectiveRate != 60 {
		t.Errorf("section: %+v", s)
	}
	want := []struct {
		kind               Kind
		merchant, location string
		amount             int64
		transacted, posted string
	}{
		{Payment, "Pago A Tarjeta - Cuenta De Ahorro Qik", "", -280_000, "2026-08-10", "2026-08-10"},
		{Cashback, "Payment Return/prepaid Activation And Load/prepaid Load - Recompensas Qik Rebate Modom", "", -2_800, "2026-08-10", "2026-08-10"},
		{Purchase, "Heladeria Prueba", "Santo Domingo", 180_000, "2026-08-14", "2026-08-15"},
		{Purchase, "Servicio Web", "San Francisco", 258_129, "2026-08-16", "2026-08-17"},
		{Refund, "Heladeria Prueba", "Santo Domingo", -2_277, "2026-08-20", "2026-08-20"},
	}
	if len(s.Transactions) != len(want) {
		t.Fatalf("transactions: %+v", s.Transactions)
	}
	for i, w := range want {
		got := s.Transactions[i]
		if got.Kind() != w.kind || got.Merchant() != w.merchant || got.Location() != w.location || got.Amount != w.amount ||
			!got.TransactedOn.Equal(date(w.transacted)) || !got.PostedOn.Equal(date(w.posted)) {
			t.Errorf("transaction %d: %+v (kind %s, merchant %q, location %q)", i, got, got.Kind(), got.Merchant(), got.Location())
		}
	}
}

func TestParseQikCardReportsWhatDoesntAddUp(t *testing.T) {
	pages := qikStatement(
		qikLine(40.0, "14/08/2026", 150.0, "15/08/2026", 250.0, "Heladeria Prueba Santo Domingododom", 500.0, "RD$ 1,800.00"),
	)
	_, issues, err := ParseQikCard(pages)
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 1 {
		t.Errorf("issues: %v", issues)
	}
}

func TestParseQikCardRejectsOtherDocuments(t *testing.T) {
	if _, _, err := ParseQikCard(dualCurrencyStatement()); !errors.Is(err, ErrNotQikCard) {
		t.Errorf("err = %v, want ErrNotQikCard", err)
	}
}

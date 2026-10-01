package statements

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// accountPages is a made-up Popular account statement as read from its
// page images: a January cut, so December movements belong to the year
// before.
func accountPages() [][]string {
	header := func(page int) []string {
		return []string{
			fmt.Sprintf("       SR NOMBRE DE PRUEBA                                                        PAG    %d", page),
			"       CALLE DE PRUEBA 1",
			"       CIUDAD DE PRUEBA                                                       27 ENE 2026",
			"                                      ESTADO DE CUENTA",
			"       AHORRO EMPLEADO            800001234   RD$   NOMBRE DE PRUEBA",
		}
	}
	return [][]string{
		append(header(1),
			"       NUMERO DE CUENTA REGIONAL DO00BPDO00000000000800001234",
			"                                                    CANTIDAD           MONTO",
			"              BALANCE ANTERIOR                                           5,000.00",
			"              + DEPOSITOS Y OTROS CREDITOS              1                50,000.00",
			"              - CHEQUES Y OTROS DEBITOS                 1                 3,000.76",
			"              + INTERES PAGADO                                                1.25",
			"              BALANCE AL CORTE                                           52,000.49",
			"       FECHA    FECHA           DESCRIPCION                      MONTO           BALANCE",
			"       POSTEO   VALOR",
			"       26 DIC  BALANCE ANTERIOR                                                  5,000.00",
			"       29 DIC  28 DIC                                         3,000.00-          2,000.00",
			"                               PagoTC Via MB************1234",
		),
		append(header(2),
			"       FECHA    FECHA   NUM DE  DESCRIPCION                      MONTO           BALANCE",
			"       ENTRADA  TRANS   CHEQUE",
			"       31 DIC  31 DIC          PAGO INTERES                        1.25           2,001.25",
			"       31 DIC  31 DIC          WH                                   .76-           2,000.49",
			"       12 ENE  12 ENE          CREDITO NOMINA                 5O,OOO.00          52,000.49",
			"                               EMPRESA DE PRUEBA",
			"       27 ENE  BALANCE AL CORTE                                                 52,000.49",
			"                               Un mensaje del banco",
		),
	}
}

func TestParsePopularAccount(t *testing.T) {
	st, issues, err := ParsePopularAccount(accountPages())
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) > 0 {
		t.Errorf("unexpected issues: %q", issues)
	}
	if st.Institution != "popular" || st.Product != "AHORRO EMPLEADO" || st.Name() != "Ahorro Empleado" ||
		st.Last4 != "1234" || st.Currency != "DOP" || st.Checking() || !st.CutDate.Equal(date("2026-01-27")) ||
		st.PreviousBalance != 500_000 || st.Balance != 5_200_049 {
		t.Errorf("statement = %+v", st)
	}
	var got []string
	for _, tr := range st.Transactions {
		got = append(got, fmt.Sprintf("%s %s %s %s %s", tr.PostedOn.Format("2006-01-02"), tr.TransactedOn.Format("2006-01-02"),
			tr.Description, FormatAmount(tr.Amount), FormatAmount(tr.Balance)))
	}
	want := []string{
		"2025-12-29 2025-12-28 PagoTC Via MB************1234 -3,000.00 2,000.00",
		"2025-12-31 2025-12-31 PAGO INTERES 1.25 2,001.25",
		"2025-12-31 2025-12-31 WH -0.76 2,000.49",
		// Letter O read for a zero in an amount counts as the digit.
		"2026-01-12 2026-01-12 CREDITO NOMINA EMPRESA DE PRUEBA 50,000.00 52,000.49",
	}
	if !slices.Equal(got, want) {
		t.Errorf("transactions:\n got %q\nwant %q", got, want)
	}
	if !st.Transactions[1].Interest() || !st.Transactions[2].Withholding() {
		t.Error("interest and withholding not recognized")
	}
}

func TestParsePopularAccountReportsProblems(t *testing.T) {
	pages := accountPages()
	// The interest's balance doesn't follow from the one before, and the
	// summary counts a debit more (the withholding isn't counted).
	pages[1] = slices.Clone(pages[1])
	for i, line := range pages[1] {
		pages[1][i] = strings.Replace(line, "1.25           2,001.25", "1.25           2,011.25", 1)
	}
	pages[0] = slices.Clone(pages[0])
	for i, line := range pages[0] {
		pages[0][i] = strings.Replace(line, "DEBITOS                 1", "DEBITOS                 2", 1)
	}
	_, issues, err := ParsePopularAccount(pages)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"el balance después de PAGO INTERES del 31/12/2025 (2,011.25) no sale del anterior (2,000.00) con 1.25",
		"el balance después de WH del 31/12/2025 (2,000.49) no sale del anterior (2,011.25) con -0.76",
		"el resumen dice cheques y otros debitos: 2 por -3,000.76, y los movimientos suman 1 por -3,000.76",
	}
	if !slices.Equal(issues, want) {
		t.Errorf("issues:\n got %q\nwant %q", issues, want)
	}

	// Without its second page the movements don't reach the closing balance.
	_, issues, err = ParsePopularAccount(accountPages()[:1])
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) == 0 || !strings.Contains(issues[0], "el estado cierra en 52,000.49, pero los movimientos llegan a 2,000.00") {
		t.Errorf("issues without page 2: %q", issues)
	}
}

func TestParsePopularAccountRejectsOtherDocuments(t *testing.T) {
	for name, pages := range map[string][][]string{
		"empty":       nil,
		"other text":  {{"ESTADO DE CUENTA", "Otro banco"}},
		"no balances": {{"       AHORRO EMPLEADO            800001234   RD$   NOMBRE"}},
	} {
		if _, _, err := ParsePopularAccount(pages); !errors.Is(err, ErrNotPopularAccount) {
			t.Errorf("%s: err = %v, want ErrNotPopularAccount", name, err)
		}
	}
}

func TestParseStatementAmount(t *testing.T) {
	for text, want := range map[string]int64{
		"1,234.00-": -123_400, ".76-": -76, "123,456.78": 12_345_678, "0.00": 0, "1,2OO.5O": 120_050, "12,5l0.00": 1_251_000, "1.234,56": 123_456,
	} {
		if got, err := parseStatementAmount(text); err != nil || got != want {
			t.Errorf("parseStatementAmount(%q) = %d, %v; want %d", text, got, err, want)
		}
	}
	for _, bad := range []string{"12", "1.2", "abc", "12.345", "-1.00"} {
		if _, err := parseStatementAmount(bad); err == nil {
			t.Errorf("parseStatementAmount(%q) should fail", bad)
		}
	}
}

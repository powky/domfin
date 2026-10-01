package store

import (
	"context"
	"path/filepath"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "data", "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func day(s string) time.Time {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return d
}

// statement is a made-up dual-currency statement that adds up: pesos grow
// by 2,000.00 and dollars by 15.00.
func statement(cut string, previousPesos, previousDollars int64) statements.Statement {
	cutDate := day(cut)
	return statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234",
		CutDate: cutDate, DueDate: cutDate.AddDate(0, 0, 25),
		Sections: []statements.Section{
			{
				Currency: "DOP", CreditLimit: 5_000_000, PreviousBalance: previousPesos, Balance: previousPesos + 200_000,
				Transactions: []statements.Transaction{
					{PostedOn: cutDate, TransactedOn: cutDate, Reference: "0570000001", Description: "Pago Via App", Amount: -previousPesos},
					{PostedOn: cutDate, TransactedOn: cutDate.AddDate(0, 0, -1), Reference: "10000000000000000000001",
						Description: "SUPERMERCADO UNO  SANTO DOMINGO", MCC: "5411", Authorization: "000101", Amount: previousPesos + 200_000},
				},
			},
			{
				Currency: "USD", CreditLimit: 100_000, PreviousBalance: previousDollars, Balance: previousDollars + 1500,
				Transactions: []statements.Transaction{
					{PostedOn: cutDate, TransactedOn: cutDate, Reference: "10000000000000000000002",
						Description: "SERVICIO WEB  SAN FRANCISCO", MCC: "5734", Authorization: "000102", Amount: 1500},
				},
			},
		},
	}
}

func TestSaveStatement(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	jan := statement("2026-01-28", 1_000_000, 1000)

	outcome, err := s.SaveStatement(ctx, jan, nil, Source{Name: "enero.pdf", SHA256: "a"})
	if err != nil || outcome != Added {
		t.Fatalf("first save = %s, %v", outcome, err)
	}
	// The same statement from another download of the file.
	outcome, err = s.SaveStatement(ctx, jan, nil, Source{Name: "enero (1).pdf", SHA256: "b"})
	if err != nil || outcome != Unchanged {
		t.Fatalf("second save = %s, %v", outcome, err)
	}
	// Same card and cut date, different contents: it replaces the first.
	changed := statement("2026-01-28", 1_000_000, 1000)
	changed.Sections[1].Transactions[0].Description = "SERVICIO WEB PRO  SAN FRANCISCO"
	outcome, err = s.SaveStatement(ctx, changed, []string{"USD: algo raro"}, Source{Name: "enero.pdf", SHA256: "c"})
	if err != nil || outcome != Replaced {
		t.Fatalf("third save = %s, %v", outcome, err)
	}

	var statementsCount, transactionsCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM statements`).Scan(&statementsCount)
	s.db.QueryRow(`SELECT COUNT(*) FROM transactions`).Scan(&transactionsCount)
	if statementsCount != 1 || transactionsCount != 3 {
		t.Errorf("rows: %d statements, %d transactions; want 1 and 3", statementsCount, transactionsCount)
	}

	rows, err := s.db.Query(`SELECT currency, merchant, location, kind, amount FROM transactions ORDER BY currency, position`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type row struct {
		currency, merchant, location, kind string
		amount                             int64
	}
	var got []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.currency, &r.merchant, &r.location, &r.kind, &r.amount); err != nil {
			t.Fatal(err)
		}
		got = append(got, r)
	}
	// Charges are money out (negative), payments money in, like the app.
	want := []row{
		{"DOP", "Pago Via App", "", "payment", 1_000_000},
		{"DOP", "SUPERMERCADO UNO", "SANTO DOMINGO", "purchase", -1_200_000},
		{"USD", "SERVICIO WEB PRO", "SAN FRANCISCO", "purchase", -1500},
	}
	if !slices.Equal(got, want) {
		t.Errorf("transactions:\n got %+v\nwant %+v", got, want)
	}
}

func TestCoverage(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	jan := statement("2026-01-28", 1_000_000, 1000)
	feb := statement("2026-02-28", jan.Sections[0].Balance, jan.Sections[1].Balance)
	// March opens its pesos with a balance February didn't close with.
	mar := statement("2026-03-28", feb.Sections[0].Balance+1, feb.Sections[1].Balance)
	// April is missing, so May's opening balances can't be checked.
	may := statement("2026-05-28", 500_000, 0)
	for _, st := range []statements.Statement{may, jan, mar, feb} {
		if _, err := s.SaveStatement(ctx, st, nil, Source{Name: st.Month() + ".pdf"}); err != nil {
			t.Fatal(err)
		}
	}

	cards, err := s.Coverage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 1 || cards[0].Account.Last4 != "1234" || cards[0].Account.Name != "Prueba" {
		t.Fatalf("cards = %+v", cards)
	}
	var got []string
	for _, month := range cards[0].Months {
		status := "missing"
		if month.Imported() {
			status = "ok"
			if !month.OK() {
				status = month.Issues[0]
			}
		}
		got = append(got, month.Month+" "+status)
	}
	want := []string{
		"2026-01 ok",
		"2026-02 ok",
		"2026-03 DOP: el balance anterior (14,000.01) no es el balance con que cerró 2026-02 (14,000.00)",
		"2026-04 missing",
		"2026-05 ok",
	}
	if !slices.Equal(got, want) {
		t.Errorf("months:\n got %q\nwant %q", got, want)
	}
	if sections := cards[0].Months[0].Sections; len(sections) != 2 || sections[0].Currency != "DOP" ||
		sections[0].Transactions != 2 || sections[1].Currency != "USD" || sections[1].Transactions != 1 {
		t.Errorf("January sections = %+v", sections)
	}
}

// history is a made-up loan history: a disbursement, then payments of
// 1,000.00 that pay 400.00 of principal each month up to asOf.
func history(asOf string, from string, months int) statements.LoanHistory {
	h := statements.LoanHistory{Institution: "popular", Last4: "9876", Currency: "DOP", Product: "Prestamos", AsOf: day(asOf)}
	start := day(from)
	balance := int64(10_000_000)
	principal := balance
	h.Movements = append(h.Movements, statements.LoanMovement{
		PostedOn: start, EffectiveOn: start, Reference: "REF" + start.Format("20060102"), Description: "DESEMBOLSO",
		Amount: balance, Balance: balance, Principal: &principal,
	})
	for i := 1; i < months; i++ {
		date := start.AddDate(0, i, 0)
		balance -= 40_000
		paid := int64(40_000)
		h.Movements = append(h.Movements, statements.LoanMovement{
			PostedOn: date, EffectiveOn: date, Reference: "REF" + date.Format("20060102"), Description: "PAGO CUOTA",
			Amount: 100_000, Balance: balance, Principal: &paid,
		})
	}
	return h
}

func TestSaveLoanHistory(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	// January to March, then the same history again, then one that runs to June.
	spring := history("2026-03-30", "2026-01-15", 3)
	if got, err := s.SaveLoanHistory(ctx, spring, nil, Source{Name: "marzo.pdf"}); err != nil || got != Added {
		t.Fatalf("save = %s, %v", got, err)
	}
	if got, err := s.SaveLoanHistory(ctx, spring, nil, Source{Name: "marzo (1).pdf"}); err != nil || got != Unchanged {
		t.Fatalf("second save = %s, %v", got, err)
	}
	summer := history("2026-06-30", "2026-01-15", 6)
	if got, err := s.SaveLoanHistory(ctx, summer, nil, Source{Name: "junio.pdf"}); err != nil || got != Added {
		t.Fatalf("overlapping save = %s, %v", got, err)
	}

	var count int
	var disbursement, payment int64
	s.db.QueryRow(`SELECT COUNT(*) FROM loan_movements`).Scan(&count)
	s.db.QueryRow(`SELECT amount FROM loan_movements WHERE kind = 'disbursement'`).Scan(&disbursement)
	s.db.QueryRow(`SELECT amount FROM loan_movements WHERE kind = 'payment' LIMIT 1`).Scan(&payment)
	if count != 6 || disbursement != -10_000_000 || payment != 100_000 {
		t.Errorf("movements: %d, disbursement %d, payment %d; want 6, -10,000,000, 100,000", count, disbursement, payment)
	}
}

func TestLoanCoverage(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	// January to March, then August to September with a problem: April to
	// July is missing.
	for _, h := range []struct {
		history statements.LoanHistory
		issues  []string
	}{
		{history("2026-03-30", "2026-01-15", 3), nil},
		{history("2026-09-29", "2026-08-10", 2), []string{"faltan las páginas 2 de 2"}},
	} {
		if _, err := s.SaveLoanHistory(ctx, h.history, h.issues, Source{Name: "historial.pdf"}); err != nil {
			t.Fatal(err)
		}
	}
	accounts, err := s.Coverage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 1 || accounts[0].Account.Kind != Loan || accounts[0].Account.Last4 != "9876" || accounts[0].Account.Currency != "DOP" {
		t.Fatalf("accounts = %+v", accounts)
	}
	var got []string
	for _, month := range accounts[0].Months {
		count := 0
		if len(month.Sections) > 0 {
			count = month.Sections[0].Transactions
		}
		got = append(got, month.Month+" "+month.Status()+" "+month.Date+" "+strconv.Itoa(count))
	}
	want := []string{
		"2026-01 ok 2026-03-30 1",
		"2026-02 ok 2026-03-30 1",
		"2026-03 ok 2026-03-30 1",
		"2026-04 missing  0",
		"2026-05 missing  0",
		"2026-06 missing  0",
		"2026-07 missing  0",
		"2026-08 review 2026-09-29 1",
		"2026-09 review 2026-09-29 1",
	}
	if !slices.Equal(got, want) {
		t.Errorf("months:\n got %q\nwant %q", got, want)
	}
}

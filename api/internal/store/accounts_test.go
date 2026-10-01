package store

import (
	"context"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
)

// accountStatement is a made-up payroll account statement: it opens with
// previous, gets the salary and pays a card.
func accountStatement(cut string, previous int64) statements.AccountStatement {
	cutDate := day(cut)
	st := statements.AccountStatement{
		Institution: "popular", Product: "AHORRO EMPLEADO", Last4: "1234", Currency: "DOP",
		CutDate: cutDate, PreviousBalance: previous,
	}
	balance := previous
	for i, amount := range []int64{5_000_000, -1_000_000} {
		balance += amount
		st.Transactions = append(st.Transactions, statements.AccountTransaction{
			PostedOn: cutDate.AddDate(0, 0, -10+i), TransactedOn: cutDate.AddDate(0, 0, -10+i),
			Description: []string{"CREDITO NOMINA", "PagoTC Via MB************5678"}[i], Amount: amount, Balance: balance,
		})
	}
	st.Balance = balance
	return st
}

func TestSaveAccountStatement(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	jan := accountStatement("2026-01-27", 100_000)
	for i, want := range []Outcome{Added, Unchanged} {
		got, err := s.SaveAccountStatement(ctx, jan, nil, Source{Name: "enero.pdf"})
		if err != nil || got != want {
			t.Fatalf("save %d = %s, %v; want %s", i+1, got, err, want)
		}
	}
	changed := jan
	changed.Transactions = slices.Clone(jan.Transactions)
	changed.Transactions[1].Description = "PagoTC Via MB************9999"
	if got, err := s.SaveAccountStatement(ctx, changed, nil, Source{Name: "enero.pdf"}); err != nil || got != Replaced {
		t.Fatalf("replace = %s, %v", got, err)
	}

	// February opens with January's closing balance; April doesn't follow
	// from March, which is missing.
	feb := accountStatement("2026-02-23", jan.Balance)
	apr := accountStatement("2026-04-20", 42)
	for _, st := range []statements.AccountStatement{apr, feb} {
		if _, err := s.SaveAccountStatement(ctx, st, nil, Source{Name: st.Month() + ".pdf"}); err != nil {
			t.Fatal(err)
		}
	}
	accounts, err := s.Coverage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 1 || accounts[0].Account.Kind != Savings || accounts[0].Account.Name != "Ahorro Empleado" ||
		accounts[0].Account.Currency != "DOP" {
		t.Fatalf("accounts = %+v", accounts)
	}
	var got []string
	for _, m := range accounts[0].Months {
		got = append(got, m.Month+" "+m.Status())
	}
	if want := []string{"2026-01 ok", "2026-02 ok", "2026-03 missing", "2026-04 ok"}; !slices.Equal(got, want) {
		t.Errorf("months = %q, want %q", got, want)
	}

	// March arrives, closing with a balance April doesn't open with.
	mar := accountStatement("2026-03-24", feb.Balance)
	if _, err := s.SaveAccountStatement(ctx, mar, nil, Source{Name: "marzo.pdf"}); err != nil {
		t.Fatal(err)
	}
	accounts, _ = s.Coverage(ctx)
	if april := accounts[0].Months[3]; april.Status() != "review" || len(april.Issues) != 1 {
		t.Errorf("April = %+v", april)
	}
}

func TestBankAccountsInTheLedger(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if _, err := s.SaveAccountStatement(ctx, accountStatement("2026-01-27", 100_000), nil, Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	accounts, err := s.Accounts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := ledger.Account{ID: "popular:savings:1234:DOP", Institution: "popular", Kind: ledger.Savings, Name: "Ahorro Empleado", Last4: "1234", Currency: "DOP"}
	if !slices.ContainsFunc(accounts, func(a ledger.Account) bool { return a == want }) {
		t.Errorf("accounts = %+v, want %+v among them", accounts, want)
	}
	movements, err := s.Movements(ctx, "2026-01-01", "2026-01-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(movements) != 2 {
		t.Fatalf("movements = %+v", movements)
	}
	salary, card := movements[0], movements[1]
	if salary.ID != "popular:savings:1234:DOP:2026-01-27#1" || salary.AccountID != want.ID || salary.Date != "2026-01-17" ||
		salary.Amount != 5_000_000 || salary.Description != "CREDITO NOMINA" || salary.Kind != "" {
		t.Errorf("salary = %+v", salary)
	}
	if card.ID != "popular:savings:1234:DOP:2026-01-27#2" || card.Amount != -1_000_000 {
		t.Errorf("card payment = %+v", card)
	}
}

package ledger

import (
	"slices"
	"testing"
)

func TestCashAccounts(t *testing.T) {
	var ids []string
	for _, a := range CashAccounts([]Account{dollarAccount, payrollAccount, card}) {
		ids = append(ids, a.ID+" "+a.Name)
	}
	if want := []string{"cash:cash::DOP Efectivo", "cash:cash::USD Efectivo"}; !slices.Equal(ids, want) {
		t.Errorf("cash accounts = %q, want %q", ids, want)
	}
	// Pesos even before there's an account.
	if cash := CashAccounts(nil); len(cash) != 1 || cash[0].Currency != "DOP" {
		t.Errorf("without accounts: %+v", cash)
	}
}

func TestUndetailedCash(t *testing.T) {
	c := classifier()
	c.Accounts = append(c.Accounts, CashAccounts(c.Accounts)...)
	pesos := c.Accounts[len(c.Accounts)-2]
	byHand := func(account Account, date, description string, amount int64) Movement {
		m := move(account, date, description, amount)
		m.ID, m.Manual = "manual:"+date, true
		return m
	}
	hidden := move(payrollAccount, "2026-03-28", "COD CASH 99", -100_000)
	movements := []Movement{
		// Spent before any withdrawal Domfin knows of: it takes from none.
		byHand(pesos, "2026-02-27", "Propina", -10_000),
		move(payrollAccount, "2026-03-01", "COD CASH 12", -500_000),
		byHand(pesos, "2026-03-05", "Colmado", -120_000),
		move(payrollAccount, "2026-03-15", "COD CASH 34", -300_000),
		// The 15th's 3,000 first, then 1,000 of the 1st's.
		byHand(pesos, "2026-03-20", "Motoconcho", -400_000),
		cardMove("2026-03-22", CashAdvance, "6011", -200_000),
		// 1,500 back into the bank, from the card's cash.
		move(payrollAccount, "2026-03-25", "DEP AHORRO", 150_000),
		hidden,
		// Dollars are cash of their own.
		move(dollarAccount, "2026-03-26", "COD CASH 56", -10_000),
		// Cash someone paid, not spent yet as far as Domfin knows.
		byHand(pesos, "2026-03-30", "Venta de la bicicleta", 800_000),
	}
	classes := c.Classify(movements)
	if classes[1].CategoryID != CategoryCashWithdrawal || classes[5].CategoryID != CategoryCashWithdrawal ||
		classes[6].CategoryID != CategoryCashDeposit {
		t.Fatalf("withdrawals and deposit: %+v %+v %+v", classes[1], classes[5], classes[6])
	}
	cash := c.UndetailedCash(movements, classes, func(m Movement) bool { return m.ID == hidden.ID })
	var got []string
	for _, m := range cash {
		got = append(got, m.ID+" "+m.AccountID+" "+m.Date+" "+m.Description)
		if m.Kind != UndetailedCash {
			t.Errorf("%s: kind %q", m.ID, m.Kind)
		}
	}
	wantIDs := []string{
		"cash:" + movements[1].ID + " cash:cash::DOP 2026-03-01 Efectivo sin detallar",
		"cash:" + movements[5].ID + " cash:cash::DOP 2026-03-22 Efectivo sin detallar",
		"cash:" + movements[8].ID + " cash:cash::USD 2026-03-26 Efectivo sin detallar",
		"cash:manual:2026-03-30 cash:cash::DOP 2026-03-30 Efectivo sin detallar",
	}
	if !slices.Equal(got, wantIDs) {
		t.Fatalf("undetailed:\n%q\nwant\n%q", got, wantIDs)
	}
	var amounts []int64
	for _, m := range cash {
		amounts = append(amounts, m.Amount)
	}
	if wantAmounts := []int64{-280_000, -50_000, -10_000, -800_000}; !slices.Equal(amounts, wantAmounts) {
		t.Errorf("amounts = %v, want %v", amounts, wantAmounts)
	}

	// It's spent unless the user files it elsewhere.
	c.Overrides = map[string]string{cash[1].ID: "personal-care"}
	check(t, c, cash, []want{
		{Expense, CategoryUndetailedCash, ByCash, false},
		{Expense, "personal-care", ByManual, false},
	})
}

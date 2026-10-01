package books

import (
	"context"
	"errors"
	"maps"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

func TestValued(t *testing.T) {
	const buy, sell = 58, 60
	for name, c := range map[string]struct {
		amount   int64
		currency string
		flow     ledger.Flow
		want     map[string]int64
	}{
		// Dollars you get are worth what the bank pays for them; dollars you
		// pay cost what it charges, and a refund undoes the purchase exactly.
		"dollars earned":      {10_000, "USD", ledger.Income, map[string]int64{"USD": 10_000, "DOP": 580_000}},
		"dollars spent":       {-10_000, "USD", ledger.Expense, map[string]int64{"USD": -10_000, "DOP": -600_000}},
		"dollars refunded":    {10_000, "USD", ledger.Expense, map[string]int64{"USD": 10_000, "DOP": 600_000}},
		"dollars moved in":    {10_000, "USD", ledger.Transfer, map[string]int64{"USD": 10_000, "DOP": 580_000}},
		"dollars moved out":   {-10_000, "USD", ledger.Transfer, map[string]int64{"USD": -10_000, "DOP": -600_000}},
		"pesos earned":        {600_000, "DOP", ledger.Income, map[string]int64{"DOP": 600_000, "USD": 10_000}},
		"pesos spent":         {-580_000, "DOP", ledger.Expense, map[string]int64{"DOP": -580_000, "USD": -10_000}},
		"pesos moved out":     {-580_000, "DOP", ledger.Transfer, map[string]int64{"DOP": -580_000, "USD": -10_000}},
		"a cent rounds":       {1, "USD", ledger.Income, map[string]int64{"USD": 1, "DOP": 58}},
		"an unknown currency": {100, "EUR", ledger.Income, nil},
	} {
		if got := valued(c.amount, c.currency, c.flow, buy, sell); !maps.Equal(got, c.want) {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
	if got := valued(100, "USD", ledger.Income, 0, 0); got != nil {
		t.Errorf("without a rate: %v", got)
	}
}

func TestMovementsAtTheirDatesRate(t *testing.T) {
	s := openStore(t)
	cut := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)
	st := statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234", CutDate: cut, DueDate: cut.AddDate(0, 0, 25),
		Sections: []statements.Section{{
			Currency: "USD", CreditLimit: 500_000, PreviousBalance: 100_000, Balance: 300_000,
			Transactions: []statements.Transaction{
				{PostedOn: cut.AddDate(0, 0, -20), TransactedOn: cut.AddDate(0, 0, -20), Reference: "0570000001", Description: "Pago Via App", Amount: -100_000},
				{PostedOn: cut, TransactedOn: cut, Reference: "10000000000000000000001",
					Description: "TIENDA DE PRUEBA  MIAMI", MCC: "5311", Authorization: "000101", Amount: 300_000},
			},
		}},
	}
	if _, err := s.SaveStatement(context.Background(), st, nil, store.Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	// The peso got weaker in mid-January.
	rateOn := func(_ context.Context, date string) (float64, float64, error) {
		if date < "2026-01-15" {
			return 58, 60, nil
		}
		return 59, 61, nil
	}
	var list movementsResponse
	do(t, Handler(s, testConvert, rateOn), "GET", "/ledger/movements?from=2026-01-01&to=2026-01-31", "", &list)
	purchase, payment := list.Movements[0], list.Movements[1]
	if purchase.Amounts["DOP"] != -18_300_000 || purchase.Amounts["USD"] != -300_000 || payment.Amounts["DOP"] != 5_800_000 {
		t.Errorf("purchase %v, payment %v", purchase.Amounts, payment.Amounts)
	}

	// Without the rate of a day, the app converts at today's.
	failing := func(context.Context, string) (float64, float64, error) { return 0, 0, errors.New("sin tasa") }
	var without movementsResponse
	do(t, Handler(s, testConvert, failing), "GET", "/ledger/movements?from=2026-01-01&to=2026-01-31", "", &without)
	if without.Movements[0].Amounts != nil {
		t.Errorf("amounts without a rate: %v", without.Movements[0].Amounts)
	}
}

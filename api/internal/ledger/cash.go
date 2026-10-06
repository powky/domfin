package ledger

import (
	"maps"
	"slices"
	"strings"
)

// Cash is where the user writes down what they spend in cash: an account
// in each currency of their accounts, Efectivo, with no statements.
const Cash AccountKind = "cash"

// UndetailedCash is the kind of the movements UndetailedCash makes.
const UndetailedCash Kind = "undetailed_cash"

// CategoryUndetailedCash is cash withdrawn that the user hasn't said how
// they spent.
const CategoryUndetailedCash = "undetailed-cash"

// cashInstitution stands for the user's own pocket in a cash account's ID.
const cashInstitution = "cash"

// undetailedPrefix starts the ID of a movement UndetailedCash makes, before
// the ID of the cash it comes from.
const undetailedPrefix = "cash:"

// CashAccountID is the ID of the cash account in a currency.
func CashAccountID(currency string) string {
	return AccountID(cashInstitution, Cash, "", currency)
}

// CashAccounts are the cash accounts to go with these accounts: one in
// pesos, and one in each other currency they have.
func CashAccounts(accounts []Account) []Account {
	currencies := []string{"DOP"}
	for _, a := range accounts {
		if !slices.Contains(currencies, a.Currency) {
			currencies = append(currencies, a.Currency)
		}
	}
	slices.Sort(currencies[1:])
	cash := make([]Account, 0, len(currencies))
	for _, currency := range currencies {
		cash = append(cash, Account{ID: CashAccountID(currency), Institution: cashInstitution, Kind: Cash,
			Name: "Efectivo", Currency: currency})
	}
	return cash
}

// UndetailedCash works out the cash the user hasn't said how they spent.
// Cash comes in with each withdrawal (what's filed as Retiro de efectivo,
// out of a bank account or a card) and with what the user adds by hand to a
// cash account; it goes out with what they add by hand there as spent, and
// with what goes back into a bank (Depósito de efectivo). What goes out
// takes from the latest cash that came in by its date, going further back
// as needed. What's left of each counts as spent the day it came in: a
// movement of the cash account, Efectivo sin detallar, whose ID is "cash:"
// and the ID of the cash it comes from. movements and classes go together,
// oldest first; skip leaves movements out (the hidden ones).
func (c Classifier) UndetailedCash(movements []Movement, classes []Classification, skip func(Movement) bool) []Movement {
	kinds := make(map[string]AccountKind, len(c.Accounts))
	for _, a := range c.Accounts {
		kinds[a.ID] = a.Kind
	}
	type cash struct {
		at   int // index in movements
		left int64
	}
	in := map[string][]cash{}
	type spent struct {
		date   string
		amount int64
	}
	out := map[string][]spent{}
	for i, m := range movements {
		if skip(m) || m.Kind == UndetailedCash {
			continue
		}
		kind, category := kinds[m.AccountID], classes[i].CategoryID
		switch {
		case kind == Cash && m.Amount > 0:
			in[m.Currency] = append(in[m.Currency], cash{i, m.Amount})
		case kind == Cash:
			out[m.Currency] = append(out[m.Currency], spent{m.Date, -m.Amount})
		case category == CategoryCashWithdrawal && m.Amount < 0:
			in[m.Currency] = append(in[m.Currency], cash{i, -m.Amount})
		case category == CategoryCashDeposit && m.Amount > 0:
			out[m.Currency] = append(out[m.Currency], spent{m.Date, m.Amount})
		}
	}

	var undetailed []Movement
	for _, currency := range slices.Sorted(maps.Keys(in)) {
		sources := in[currency]
		slices.SortStableFunc(sources, func(a, b cash) int { return strings.Compare(movements[a.at].Date, movements[b.at].Date) })
		uses := out[currency]
		slices.SortStableFunc(uses, func(a, b spent) int { return strings.Compare(a.date, b.date) })
		for _, use := range uses {
			// The latest cash by its date, then back.
			last := len(sources) - 1
			for last >= 0 && movements[sources[last].at].Date > use.date {
				last--
			}
			for k := last; k >= 0 && use.amount > 0; k-- {
				take := min(use.amount, sources[k].left)
				sources[k].left -= take
				use.amount -= take
			}
		}
		for _, source := range sources {
			if source.left == 0 {
				continue
			}
			from := movements[source.at]
			undetailed = append(undetailed, Movement{
				ID: undetailedPrefix + from.ID, AccountID: CashAccountID(currency), Date: from.Date,
				Description: "Efectivo sin detallar", Kind: UndetailedCash, Amount: -source.left, Currency: currency,
			})
		}
	}
	slices.SortStableFunc(undetailed, func(a, b Movement) int { return strings.Compare(a.Date, b.Date) })
	return undetailed
}

// Package ledger is Domfin's ledger: every account and movement, whatever
// statement it came from, with one shape, and the classification of each
// movement as income, an expense or a transfer between your own accounts.
// docs/modelo-de-datos.md explains the model and the rules.
package ledger

import "strings"

// Flow is what a movement does to your finances.
type Flow string

const (
	// Income is money that comes in from outside: salary, bonuses, returns.
	Income Flow = "income"
	// Expense is money that goes out: purchases, fees, loan installments,
	// taxes. A refund is an expense with a positive amount: it lowers spending.
	Expense Flow = "expense"
	// Transfer moves money between your own accounts, like a card payment or
	// a contribution to a certificate. It is neither income nor an expense.
	Transfer Flow = "transfer"
)

// AccountKind is what an account is.
type AccountKind string

const (
	Checking    AccountKind = "checking"
	Savings     AccountKind = "savings"
	CreditCard  AccountKind = "credit_card"
	Loan        AccountKind = "loan"
	Certificate AccountKind = "certificate"
	Brokerage   AccountKind = "brokerage"
	// RealEstate is a home or land (see internal/assets).
	RealEstate AccountKind = "real_estate"
	// Pension is a pension fund, an AFP (see internal/assets).
	Pension AccountKind = "pension"
	// Vehicle is a car or another vehicle (see internal/assets).
	Vehicle AccountKind = "vehicle"
)

// isBank tells the accounts money is paid from and into: checking and savings.
func (k AccountKind) isBank() bool { return k == Checking || k == Savings }

// Account holds one currency: a card billed in pesos and dollars is two
// accounts.
type Account struct {
	// ID is stable and readable, see AccountID.
	ID          string
	Institution string
	Kind        AccountKind
	Name        string
	Last4       string
	Currency    string
}

// AccountID builds an account's ID from what the bank prints:
// "popular:credit_card:5678:DOP".
func AccountID(institution string, kind AccountKind, last4, currency string) string {
	return institution + ":" + string(kind) + ":" + last4 + ":" + currency
}

// Kind is what the bank says a movement is to its account. Cards, loans and
// investments say it; bank accounts leave it empty.
type Kind string

const (
	// Cards.
	Purchase    Kind = "purchase"
	Refund      Kind = "refund"
	Payment     Kind = "payment" // also a loan's
	Cashback    Kind = "cashback"
	Fee         Kind = "fee"
	Interest    Kind = "interest" // interest charged
	CashAdvance Kind = "cash_advance"
	// Loans.
	Disbursement Kind = "disbursement"
	Payoff       Kind = "payoff"
	// Certificates and brokerage accounts.
	Deposit        Kind = "deposit"    // money put in: opening, adding, buying
	Withdrawal     Kind = "withdrawal" // money taken out: maturing, cancelling, selling
	InterestEarned Kind = "interest_earned"
	Dividend       Kind = "dividend"
	Withholding    Kind = "withholding" // tax withheld (DGII)
)

// Movement is one line of a statement with the same shape whatever its
// source.
type Movement struct {
	// ID is stable across re-imports: the account ID and the bank's reference.
	ID        string
	AccountID string
	// Date is when the bank posted it, "YYYY-MM-DD".
	Date        string
	Description string
	// Merchant is a card purchase's merchant, without the city.
	Merchant string
	// MCC is a card purchase's merchant category code.
	MCC  string
	Kind Kind
	// Amount in cents of the account's currency: positive comes into the
	// account, negative goes out.
	Amount   int64
	Currency string
	// Principal is, for a loan's movement, how much it moved the balance:
	// of a payment, what went to capital (the rest was interest and
	// charges). Nil for other accounts, and when the history can't tell.
	Principal *int64
}

var accents = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")

// Normalize lowercases text, drops Spanish accents and collapses spaces, so
// "NÓMINA" matches "nomina".
func Normalize(s string) string {
	return strings.Join(strings.Fields(accents.Replace(strings.ToLower(s))), " ")
}

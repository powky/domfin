// Package statements reads credit card statements into balances and
// transactions and checks that they add up.
package statements

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Statement is one credit card statement: the cut date plus one section per
// currency the card carries (a dual-currency card has DOP and USD).
type Statement struct {
	Institution string
	// Product as printed, without its currency: "MC CONTIGO".
	Product string
	// Card network from the product: "Mastercard", "Visa" or "".
	Brand string
	Last4 string
	// CutDate (fecha de corte) closes the period; DueDate is the payment deadline.
	CutDate  time.Time
	DueDate  time.Time
	Sections []Section
}

// Name is the product without its network, for display: "Contigo".
func (s Statement) Name() string {
	words := strings.Fields(s.Product)
	if len(words) > 1 && brands[strings.ToUpper(words[0])] != "" {
		words = words[1:]
	}
	for i, word := range words {
		if len([]rune(word)) > 3 {
			lower := []rune(strings.ToLower(word))
			words[i] = strings.ToUpper(string(lower[0])) + string(lower[1:])
		}
	}
	return strings.Join(words, " ")
}

// Month is the statement's month, the one its cut date falls in: "2026-01".
func (s Statement) Month() string { return s.CutDate.Format("2006-01") }

var brands = map[string]string{"MC": "Mastercard", "MASTERCARD": "Mastercard", "VISA": "Visa"}

// Section is the part of a statement in one currency. Amounts are in cents.
type Section struct {
	Currency        string
	CreditLimit     int64
	AvailableCredit int64
	PreviousBalance int64 // balance anterior
	Balance         int64 // balance total at the cut date
	AmountDue       int64 // balance a pagar
	MinimumPayment  int64
	PastDueAmount   int64
	PastDueCount    int // cuotas vencidas
	// Annual interest rate and, when printed, the effective annual rate
	// (TAE), in percent.
	InterestRate  float64
	EffectiveRate float64
	Transactions  []Transaction
}

// Movement is the sum of the section's transactions, as printed.
func (s Section) Movement() int64 {
	var total int64
	for _, t := range s.Transactions {
		total += t.Amount
	}
	return total
}

// Reconciles reports whether the previous balance plus the transactions
// gives the balance the statement closes with.
func (s Section) Reconciles() bool { return s.PreviousBalance+s.Movement() == s.Balance }

// Transaction is one line of the statement.
type Transaction struct {
	PostedOn     time.Time // fecha de entrada
	TransactedOn time.Time // fecha de la transacción
	Reference    string
	// Description as printed; for card purchases it is the merchant and its
	// city, separated by two or more spaces.
	Description string
	// Merchant category code and authorization, printed under card
	// purchases; empty for the bank's own entries (payments, fees, cashback).
	MCC           string
	Authorization string
	// Amount as printed, in cents: positive is a charge, negative a credit.
	Amount int64
	// Type is what the transaction is, when the statement's reader tells it
	// (Qik prints no merchant codes to tell purchases by); otherwise Kind
	// works it out. Left out of the statement's fingerprint when empty, so
	// the statements read before it existed keep theirs.
	Type Kind `json:",omitempty"`
}

// Merchant and Location split a card purchase's description at its wide gap.
func (t Transaction) Merchant() string {
	merchant, _ := t.split()
	return merchant
}

func (t Transaction) Location() string {
	_, location := t.split()
	return location
}

var wideGap = regexp.MustCompile(`\s{2,}`)

func (t Transaction) split() (string, string) {
	if t.MCC == "" && t.Type != Purchase && t.Type != Refund {
		return collapse(t.Description), ""
	}
	loc := wideGap.FindAllStringIndex(t.Description, -1)
	if len(loc) == 0 {
		return collapse(t.Description), ""
	}
	last := loc[len(loc)-1]
	return collapse(t.Description[:last[0]]), collapse(t.Description[last[1]:])
}

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// Kind says what a transaction is to the card.
type Kind string

const (
	Purchase    Kind = "purchase"
	Refund      Kind = "refund"
	Payment     Kind = "payment"
	Cashback    Kind = "cashback"
	Fee         Kind = "fee"
	Interest    Kind = "interest"
	CashAdvance Kind = "cash_advance"
	Other       Kind = "other"
)

// Kind classifies the transaction from its description, category and sign,
// unless its reader said what it is.
func (t Transaction) Kind() Kind {
	if t.Type != "" {
		return t.Type
	}
	description := strings.ToUpper(collapse(t.Description))
	switch {
	case t.MCC == "6011" || t.MCC == "6010":
		return CashAdvance
	case t.MCC != "" && t.Amount < 0:
		return Refund
	case t.MCC != "":
		return Purchase
	case strings.HasPrefix(description, "PAGO"):
		return Payment
	case strings.HasPrefix(description, "CASHBACK"), strings.HasPrefix(description, "REBATE"):
		return Cashback
	case strings.Contains(description, "INTERES"):
		return Interest
	case strings.HasPrefix(description, "COM."), strings.HasPrefix(description, "COMISION"),
		strings.HasPrefix(description, "CARGO"), strings.HasPrefix(description, "CUOTA ANUAL"):
		return Fee
	default:
		return Other
	}
}

var amountPattern = regexp.MustCompile(`^(-?)(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$`)

// parseAmount reads an amount like "-123,456.78" into cents.
func parseAmount(s string) (int64, error) {
	m := amountPattern.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("not an amount: %q", s)
	}
	cents, err := strconv.ParseInt(strings.ReplaceAll(m[2], ",", "")+m[3], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("amount %q: %w", s, err)
	}
	if m[1] == "-" {
		cents = -cents
	}
	return cents, nil
}

// FormatAmount writes cents the way statements print them: "-1,234.56".
func FormatAmount(cents int64) string {
	sign := ""
	if cents < 0 {
		sign, cents = "-", -cents
	}
	whole := strconv.FormatInt(cents/100, 10)
	var grouped strings.Builder
	for i, digit := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			grouped.WriteByte(',')
		}
		grouped.WriteRune(digit)
	}
	return fmt.Sprintf("%s%s.%02d", sign, grouped.String(), cents%100)
}

// parseDate reads a full date like "28/01/2026".
func parseDate(s string) (time.Time, error) {
	date, err := time.Parse("02/01/2006", s)
	if err != nil {
		return time.Time{}, fmt.Errorf("not a date: %q", s)
	}
	return date, nil
}

var dayMonthPattern = regexp.MustCompile(`^(\d{2})/(\d{2})$`)

// parseDayMonth reads a "DD/MM" date inside the period that ends on cut:
// the latest such date on or before the cut date.
func parseDayMonth(s string, cut time.Time) (time.Time, error) {
	m := dayMonthPattern.FindStringSubmatch(s)
	if m == nil {
		return time.Time{}, fmt.Errorf("not a day and month: %q", s)
	}
	day, _ := strconv.Atoi(m[1])
	month, _ := strconv.Atoi(m[2])
	for _, year := range []int{cut.Year(), cut.Year() - 1} {
		date := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
		if date.Day() != day || date.Month() != time.Month(month) {
			continue // 29/02 outside a leap year
		}
		if !date.After(cut) {
			return date, nil
		}
	}
	return time.Time{}, fmt.Errorf("day and month %q don't fit before the cut date %s", s, cut.Format("2006-01-02"))
}

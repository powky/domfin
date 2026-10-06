package ledger

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Source says what decided a movement's category.
type Source string

const (
	ByManual   Source = "manual"   // the user's correction
	ByAsset    Source = "asset"    // linked to an asset it pays into (see internal/assets)
	ByRule     Source = "rule"     // one of the user's rules
	ByPayroll  Source = "payroll"  // the payroll settings
	ByTransfer Source = "transfer" // paired with its other side in another account
	ByBank     Source = "bank"     // what the bank says the movement is, and its MCC
	ByMerchant Source = "merchant" // the category its merchant has in your other purchases
	ByDefault  Source = "default"  // nothing recognized it
)

// Classification is where a movement counts.
type Classification struct {
	Flow Flow
	// CategoryID is empty when nothing recognized the movement: Sin categoría.
	CategoryID string
	By         Source
	// RuleID is the rule that decided, when By is ByRule.
	RuleID string
	// Review asks for a second look: nothing recognized the movement, a rule
	// asked for it, or it's a second payroll credit on a payday.
	Review bool
	// PairID is the movement on the other side of a transfer, when found.
	PairID string
	// AssetID is the asset the movement pays into (or comes back from).
	AssetID string
}

// Classifier classifies movements, in this order: the user's corrections,
// the assets they pay into, the user's rules, the payroll settings, transfers between the user's
// accounts, what the bank says, and the merchant's category elsewhere.
type Classifier struct {
	Accounts   []Account
	Categories []Category
	// Rules in order: the first that matches wins.
	Rules   []Rule
	Payroll Payroll
	// Overrides are the user's corrections, movement ID to category ID.
	Overrides map[string]string
	// Links are the movements that pay into an asset (contributions to an
	// investment, or withdrawals from it) or move a debt outside a bank
	// (lent to you, or paid back), by movement ID.
	Links map[string]Link
	// MCC maps merchant category codes to categories; nil uses DefaultMCC.
	MCC map[string]string
}

// Link ties a movement to an asset, or to a debt outside a bank.
type Link struct {
	AssetID string
	Debt    bool
}

// pairWindow is how far apart the two sides of a transfer can be posted.
const pairWindow = 5 * 24 * time.Hour

// exchangeWindow is the same for money changed between your dollar and peso
// accounts, which the bank does on the spot.
const exchangeWindow = 24 * time.Hour

// reversalWindow is how long after a movement the bank may send it back.
const reversalWindow = 15 * 24 * time.Hour

// Classify returns one classification per movement, in the same order.
func (c Classifier) Classify(movements []Movement) []Classification {
	accounts := make(map[string]Account, len(c.Accounts))
	for _, account := range c.Accounts {
		accounts[account.ID] = account
	}
	categories := make(map[string]Category, len(c.Categories))
	for _, category := range c.Categories {
		categories[category.ID] = category
	}
	mcc := c.MCC
	if mcc == nil {
		mcc = DefaultMCC
	}

	out := make([]Classification, len(movements))
	decided := make([]bool, len(movements))
	// decide files movement i under a category, if that category exists.
	decide := func(i int, categoryID string, by Source) bool {
		category, ok := categories[categoryID]
		if !ok || decided[i] {
			return false
		}
		out[i] = Classification{Flow: category.Flow, CategoryID: categoryID, By: by}
		decided[i] = true
		return true
	}

	for i, m := range movements {
		if categoryID, ok := c.Overrides[m.ID]; ok {
			decide(i, categoryID, ByManual)
		}
	}

	for i, m := range movements {
		link, ok := c.Links[m.ID]
		if !ok {
			continue
		}
		var categoryID string
		switch {
		case link.Debt && m.Amount > 0:
			categoryID = CategoryDisbursement
		case link.Debt:
			categoryID = CategoryLoanPayment
		case m.Amount > 0:
			categoryID = CategoryInvestmentOut
		default:
			categoryID = CategoryInvestmentIn
		}
		if decide(i, categoryID, ByAsset) || decided[i] {
			out[i].AssetID = link.AssetID
		}
	}

	for i, m := range movements {
		if decided[i] {
			continue
		}
		for _, rule := range c.Rules {
			if rule.Matches(m) && decide(i, rule.CategoryID, ByRule) {
				out[i].RuleID = rule.ID
				out[i].Review = rule.Review
				break
			}
		}
	}

	// Payroll: each payday's salary; any other payroll credit is extra income.
	var credits []int
	for i, m := range movements {
		if !decided[i] && c.Payroll.isCredit(m) {
			credits = append(credits, i)
		}
	}
	salary, onPayday := c.Payroll.salaries(movements, credits)
	for _, i := range credits {
		if salary[i] {
			decide(i, CategorySalary, ByPayroll)
		} else if decide(i, CategoryExtraIncome, ByPayroll) {
			out[i].Review = onPayday[i]
		}
	}

	// What the user added by hand pairs with nothing: it would take the
	// place of the bank's own movement on the other side.
	taken := slices.Clone(decided)
	for i, m := range movements {
		taken[i] = taken[i] || m.Manual
	}
	pairTransfers(movements, accounts, taken, func(i, j int, this, bank string) {
		if decide(i, this, ByTransfer) && decide(j, bank, ByTransfer) {
			out[i].PairID, out[j].PairID = movements[j].ID, movements[i].ID
		}
	})

	for i, m := range movements {
		if !decided[i] {
			categoryID := bankCategory(accounts[m.AccountID].Kind, m, mcc)
			if categoryID == "" {
				categoryID = describedCategory(m, accounts)
			}
			if categoryID != "" {
				decide(i, categoryID, ByBank)
			}
		}
	}

	// Purchases without a merchant code (Qik prints none) take the category
	// the same merchant has in the purchases that carry one.
	learned := map[string]map[string]int{}
	for i, m := range movements {
		if decided[i] && out[i].By == ByBank && m.MCC != "" && m.Merchant != "" && (m.Kind == Purchase || m.Kind == Refund) {
			key := merchantKey(m.Merchant)
			if learned[key] == nil {
				learned[key] = map[string]int{}
			}
			learned[key][out[i].CategoryID]++
		}
	}
	for i, m := range movements {
		if !decided[i] && m.MCC == "" && m.Merchant != "" && (m.Kind == Purchase || m.Kind == Refund) {
			if categoryID := mostUsed(learned[merchantKey(m.Merchant)]); categoryID != "" {
				decide(i, categoryID, ByMerchant)
			}
		}
	}

	for i, m := range movements {
		if decided[i] {
			continue
		}
		flow := Expense
		if kind := accounts[m.AccountID].Kind; m.Amount > 0 && kind != CreditCard && kind != Loan {
			flow = Income
		}
		out[i] = Classification{Flow: flow, By: ByDefault, Review: true}
	}

	// The user wrote what they added by hand: it asks for a look only when
	// its statement came without it.
	for i, m := range movements {
		if m.Manual {
			out[i].Review = m.Missing
		}
	}
	return out
}

// pairCategories says, for a movement the bank marks as moving money from
// or to another account, where it and its other side in a bank account go.
func pairCategories(kind AccountKind, m Movement) (this, bank string) {
	switch {
	case kind == CreditCard && m.Kind == Payment:
		return CategoryCardPayment, CategoryCardPayment
	case kind == CreditCard && m.Kind == CashAdvance:
		// Cash the card lends into your account: your debt and your cash
		// grow alike. What it costs (the fee, the interest) is the expense.
		return CategoryCashAdvance, CategoryCashAdvance
	case kind == Loan && (m.Kind == Payment || m.Kind == Payoff):
		// The installment is the expense, counted once: in the account that paid it.
		return CategoryLoanPayment, CategoryLoanPayments
	case kind == Loan && m.Kind == Disbursement:
		return CategoryDisbursement, CategoryDisbursement
	case (kind == Certificate || kind == Brokerage) && m.Kind == Deposit:
		return CategoryInvestmentIn, CategoryInvestmentIn
	case (kind == Certificate || kind == Brokerage) && m.Kind == Withdrawal:
		return CategoryInvestmentOut, CategoryInvestmentOut
	}
	return "", ""
}

// pairTransfers finds the two sides of money moved between the user's own
// accounts: first each card or loan payment, disbursement, or investment
// deposit or withdrawal with its movement in a checking or savings account,
// then money moved between two checking or savings accounts. The two sides
// have the same amount the other way, in the same currency, posted within
// pairWindow; the closest in date wins.
func pairTransfers(movements []Movement, accounts map[string]Account, decided []bool, pair func(i, j int, this, other string)) {
	dates := make([]time.Time, len(movements))
	// Checking and savings movements by currency and amount: the other side
	// of every transfer is one of them.
	banked := map[string][]int{}
	for i, m := range movements {
		dates[i], _ = time.Parse(dateLayout, m.Date)
		if !decided[i] && !dates[i].IsZero() && accounts[m.AccountID].Kind.isBank() {
			key := m.Currency + " " + strconv.FormatInt(m.Amount, 10)
			banked[key] = append(banked[key], i)
		}
	}
	paired := make([]bool, len(movements))
	// closest is the unpaired bank movement that can be i's other side and
	// that fits, nearest in date; -1 if none.
	closest := func(i int, fits func(j int) bool) int {
		best := -1
		for _, j := range banked[movements[i].Currency+" "+strconv.FormatInt(-movements[i].Amount, 10)] {
			gap := dates[j].Sub(dates[i]).Abs()
			if paired[j] || gap > pairWindow || !fits(j) {
				continue
			}
			if best == -1 || gap < dates[best].Sub(dates[i]).Abs() {
				best = j
			}
		}
		return best
	}
	link := func(i, j int, this, other string) {
		paired[i], paired[j] = true, true
		pair(i, j, this, other)
	}

	for i, m := range movements {
		this, other := pairCategories(accounts[m.AccountID].Kind, m)
		if decided[i] || this == "" || dates[i].IsZero() {
			continue
		}
		fits := func(int) bool { return true }
		if m.Kind == CashAdvance {
			// Cash advances are round amounts that other movements share: the
			// deposit must say it's one.
			fits = func(j int) bool { return describedCategory(movements[j], accounts) == CategoryCashAdvance }
		}
		if j := closest(i, fits); j != -1 {
			link(i, j, this, other)
		}
	}

	// The bank sending money back (a failed transfer returned, a
	// correction) undoes a movement of the same account: the same amount the
	// other way, up to reversalWindow before. Both are Reversos y devoluciones.
	for i, m := range movements {
		if decided[i] || paired[i] || !accounts[m.AccountID].Kind.isBank() || dates[i].IsZero() || !isReturn(m) {
			continue
		}
		best := -1
		for j, n := range movements {
			if j == i || decided[j] || paired[j] || n.AccountID != m.AccountID || n.Amount != -m.Amount || isReturn(n) ||
				dates[j].IsZero() || describedCategory(n, accounts) != "" {
				continue // a fee or tax isn't what comes back
			}
			if gap := dates[i].Sub(dates[j]); gap >= 0 && gap <= reversalWindow &&
				(best == -1 || gap < dates[i].Sub(dates[best])) {
				best = j
			}
		}
		if best != -1 {
			link(best, i, CategoryReversal, CategoryReversal)
		}
	}

	// Between two bank accounts the same amount can go out of one and into
	// another by chance, so one side must name the other account.
	for i, m := range movements {
		from := accounts[m.AccountID]
		if decided[i] || paired[i] || m.Amount >= 0 || !from.Kind.isBank() || dates[i].IsZero() {
			continue
		}
		j := closest(i, func(j int) bool {
			to := accounts[movements[j].AccountID]
			return to.ID != from.ID && (names(m.Description, to) || names(movements[j].Description, from))
		})
		if j != -1 {
			link(i, j, CategoryOwnTransfer, CategoryOwnTransfer)
		}
	}

	// Money changed between a dollar and a peso account arrives as another
	// amount, so one side must name the other (or both, the person who
	// bought or sold the dollars) and the amounts must imply a plausible rate.
	for i, m := range movements {
		from := accounts[m.AccountID]
		if decided[i] || paired[i] || m.Amount >= 0 || !from.Kind.isBank() || dates[i].IsZero() {
			continue
		}
		best := -1
		for j, n := range movements {
			to := accounts[n.AccountID]
			if decided[j] || paired[j] || n.Amount <= 0 || !to.Kind.isBank() || to.ID == from.ID ||
				n.Currency == m.Currency || dates[j].IsZero() || dates[j].Sub(dates[i]).Abs() > exchangeWindow ||
				!plausibleRate(m, n) || !names(m.Description, to) && !names(n.Description, from) && !sameCounterparty(m, n) {
				continue
			}
			if best == -1 || dates[j].Sub(dates[i]).Abs() < dates[best].Sub(dates[i]).Abs() {
				best = j
			}
		}
		if best != -1 {
			link(i, best, CategoryExchange, CategoryExchange)
		}
	}
}

// Pesos per dollar a currency exchange can imply: wide around the BCRD's
// rates of these years (about 56 to 64), to allow for a bank's spread.
const minPesosPerDollar, maxPesosPerDollar = 40, 90

// plausibleRate reports whether two amounts in different currencies, one
// going out and one coming in, look like the same money changed between
// dollars and pesos.
func plausibleRate(a, b Movement) bool {
	dollars, pesos := abs(a.Amount), abs(b.Amount)
	switch {
	case a.Currency == "USD" && b.Currency == "DOP":
	case a.Currency == "DOP" && b.Currency == "USD":
		dollars, pesos = pesos, dollars
	default:
		return false
	}
	rate := float64(pesos) / float64(dollars)
	return rate >= minPesosPerDollar && rate <= maxPesosPerDollar
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

// isReturn reports whether the bank describes a movement as money sent
// back: "DEV LBTR … BENEF. INCORR" (a transfer that failed), "Desde
// SCONTAINER" (an ACH payment that did), "CORREC IB" (a correction).
func isReturn(m Movement) bool {
	text := strings.ReplaceAll(Normalize(m.Description), " ", "")
	return strings.HasPrefix(text, "devlbtr") || strings.Contains(text, "scontainer") || strings.HasPrefix(text, "correcib") ||
		strings.Contains(text, "devolucion") || strings.Contains(text, "reverso")
}

// counterpartyPattern finds the person a transfer names, after the account
// number: "MB a 0123456789 ANA PEREZ DE LA", "MB desde 987654321 ANA PEREZ DE".
var counterpartyPattern = regexp.MustCompile(`(?i)^(?:mb|transf\.?(?: via)? mb) (?:a|desde) \d+ (.+)$`)

// sameCounterparty reports whether two transfers name the same person: the
// bank cuts names short, so one name may begin the other.
func sameCounterparty(a, b Movement) bool {
	name := func(m Movement) string {
		match := counterpartyPattern.FindStringSubmatch(strings.TrimSpace(m.Description))
		if match == nil {
			return ""
		}
		return merchantKey(match[1])
	}
	x, y := name(a), name(b)
	if len(x) > len(y) {
		x, y = y, x
	}
	return len(x) >= 5 && strings.HasPrefix(y, x)
}

// merchantKey is a merchant's name as each bank's statements agree on it:
// "EXCITING BAR" and "Exciting Bar" are "excitingbar".
func merchantKey(merchant string) string {
	var b strings.Builder
	for _, r := range Normalize(merchant) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// mostUsed is the category counted the most, the first by ID on a tie.
func mostUsed(counts map[string]int) string {
	best := ""
	for categoryID, n := range counts {
		if best == "" || n > counts[best] || n == counts[best] && categoryID < best {
			best = categoryID
		}
	}
	return best
}

var digitRun = regexp.MustCompile(`\d+`)

// names reports whether a description mentions account the way banks print
// the other side of a transfer: a number ending in its last 4 digits, as in
// "Transf. via MB a 700121234" for the account ending in 1234.
func names(description string, account Account) bool {
	if len(account.Last4) != 4 {
		return false
	}
	for _, number := range digitRun.FindAllString(description, -1) {
		if len(number) >= 4 && strings.HasSuffix(number, account.Last4) {
			return true
		}
	}
	return false
}

// bankCategory is where a movement goes by what the bank says it is: its
// kind and, for card purchases, the merchant's category code.
func bankCategory(kind AccountKind, m Movement, mcc map[string]string) string {
	if m.Kind == CashAdvance {
		// Not into one of your accounts: cash taken out.
		return CategoryCashWithdrawal
	}
	if this, _ := pairCategories(kind, m); this != "" {
		if kind == Loan && this == CategoryLoanPayment {
			// Paid from an account Domfin doesn't see: the expense is here.
			return CategoryLoanPayments
		}
		return this
	}
	switch m.Kind {
	case Purchase, Refund:
		if categoryID := namedMerchant(m); categoryID != "" {
			return categoryID
		}
		return mccCategory(mcc, m.MCC)
	case Cashback:
		return CategoryCashback
	case Fee:
		return CategoryBankFees
	case Interest:
		return CategoryInterestCharged
	case InterestEarned:
		return CategoryInterestIncome
	case Dividend:
		return CategoryDividends
	case Withholding:
		return CategoryWithholding
	}
	return ""
}

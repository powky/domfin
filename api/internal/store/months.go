package store

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

// Kinds of account with imported statements (plus Savings and Checking).
const (
	CreditCard = "credit_card"
	Loan       = "loan"
)

// Account is a bank account, card or loan with imported statements.
type Account struct {
	Kind        string
	Institution string
	Last4       string
	Brand       string
	Product     string
	// Name is the product for display ("Contigo", "Ahorro Empleado"); loan
	// histories print none.
	Name string
	// Currency of a bank account or loan; a card's sections say theirs.
	Currency string
}

// AccountMonths lists an account's months from its first imported statement
// to its last, including the missing months in between.
type AccountMonths struct {
	Account Account
	Months  []Month
}

// Month is what's imported for an account in one month: for a card, the
// statement whose cut date falls in it; for a loan, the history that covers it.
type Month struct {
	Month string // "2026-01"
	// Date is the card statement's cut date, or the date of the loan history
	// that covers the month; empty when nothing covers it.
	Date       string
	SourceFile string
	Sections   []SectionSummary
	// Issues are the problems found when importing plus, for cards, balances
	// that don't carry over from the previous month's statement.
	Issues []string
}

func (m Month) Imported() bool { return m.Date != "" }

// OK means the month was imported and checks out.
func (m Month) OK() bool { return m.Imported() && len(m.Issues) == 0 }

// Status is "ok", "review" (imported with problems) or "missing".
func (m Month) Status() string {
	switch {
	case !m.Imported():
		return "missing"
	case len(m.Issues) > 0:
		return "review"
	default:
		return "ok"
	}
}

// SectionSummary counts a month's transactions in one currency. The
// balances are only kept for card statements.
type SectionSummary struct {
	Currency        string
	Transactions    int
	PreviousBalance int64
	Balance         int64
}

// Coverage reports, account by account (bank accounts, cards, loans, then
// certificates), which months are imported and whether they check out.
func (s *Store) Coverage(ctx context.Context) ([]AccountMonths, error) {
	banks, err := s.bankCoverage(ctx)
	if err != nil {
		return nil, err
	}
	cards, err := s.cardCoverage(ctx)
	if err != nil {
		return nil, err
	}
	loans, err := s.loanCoverage(ctx)
	if err != nil {
		return nil, err
	}
	certificates, err := s.certificateCoverage(ctx)
	if err != nil {
		return nil, err
	}
	return slices.Concat(banks, cards, loans, certificates), nil
}

// bankCoverage checks each statement on its own and against the month
// before, like cards: it must open with the balance that month closed with.
func (s *Store) bankCoverage(ctx context.Context) ([]AccountMonths, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.institution, a.kind, a.last4, a.currency, a.product, a.name,
			st.id, st.cut_date, st.source_file, st.issues, st.previous_balance, st.balance,
			(SELECT COUNT(*) FROM bank_transactions t WHERE t.statement_id = st.id)
		FROM bank_statements st JOIN bank_accounts a ON a.id = st.account_id
		ORDER BY a.name, a.last4, st.cut_date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []AccountMonths
	var lastID int64
	for rows.Next() {
		var accountID, statementID int64
		var account Account
		var month Month
		var issues string
		var section SectionSummary
		if err := rows.Scan(&accountID, &account.Institution, &account.Kind, &account.Last4, &account.Currency,
			&account.Product, &account.Name, &statementID, &month.Date, &month.SourceFile, &issues,
			&section.PreviousBalance, &section.Balance, &section.Transactions); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(issues), &month.Issues); err != nil {
			return nil, fmt.Errorf("bank statement %d issues: %w", statementID, err)
		}
		section.Currency = account.Currency
		month.Month = month.Date[:len("2006-01")]
		month.Sections = []SectionSummary{section}

		if len(accounts) == 0 || lastID != accountID {
			accounts = append(accounts, AccountMonths{Account: account})
			lastID = accountID
		}
		current := &accounts[len(accounts)-1]
		if n := len(current.Months); n > 0 {
			previous := current.Months[n-1]
			for gap := nextMonth(previous.Month); gap < month.Month; gap = nextMonth(gap) {
				current.Months = append(current.Months, Month{Month: gap})
			}
			if nextMonth(previous.Month) == month.Month {
				month.Issues = append(month.Issues, carryOverIssues(previous, month)...)
			}
		}
		current.Months = append(current.Months, month)
	}
	return accounts, rows.Err()
}

// cardCoverage checks each statement on its own and against the month
// before: its previous balance must be the balance that month closed with.
func (s *Store) cardCoverage(ctx context.Context) ([]AccountMonths, error) {
	sections, err := s.sectionSummaries(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.institution, c.last4, c.brand, c.product, c.name, st.id, st.cut_date, st.source_file, st.issues
		FROM statements st JOIN cards c ON c.id = st.card_id
		ORDER BY c.name, c.last4, st.cut_date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []AccountMonths
	var lastCardID int64
	for rows.Next() {
		var cardID, statementID int64
		account := Account{Kind: CreditCard}
		var month Month
		var issues string
		if err := rows.Scan(&cardID, &account.Institution, &account.Last4, &account.Brand, &account.Product, &account.Name,
			&statementID, &month.Date, &month.SourceFile, &issues); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(issues), &month.Issues); err != nil {
			return nil, fmt.Errorf("statement %d issues: %w", statementID, err)
		}
		month.Month = month.Date[:len("2006-01")]
		month.Sections = sections[statementID]

		if len(cards) == 0 || lastCardID != cardID {
			cards = append(cards, AccountMonths{Account: account})
			lastCardID = cardID
		}
		current := &cards[len(cards)-1]
		if n := len(current.Months); n > 0 {
			previous := current.Months[n-1]
			for gap := nextMonth(previous.Month); gap < month.Month; gap = nextMonth(gap) {
				current.Months = append(current.Months, Month{Month: gap})
			}
			if nextMonth(previous.Month) == month.Month {
				month.Issues = append(month.Issues, carryOverIssues(previous, month)...)
			}
		}
		current.Months = append(current.Months, month)
	}
	return cards, rows.Err()
}

// carryOverIssues checks that each currency opens where the month before closed.
func carryOverIssues(previous, month Month) []string {
	var issues []string
	for _, section := range month.Sections {
		for _, before := range previous.Sections {
			if before.Currency == section.Currency && before.Balance != section.PreviousBalance {
				issues = append(issues, fmt.Sprintf("%s: el balance anterior (%s) no es el balance con que cerró %s (%s)",
					section.Currency, statements.FormatAmount(section.PreviousBalance), previous.Month,
					statements.FormatAmount(before.Balance)))
			}
		}
	}
	return issues
}

// sectionSummaries returns each card statement's balances and transaction
// counts per currency, keyed by statement id.
func (s *Store) sectionSummaries(ctx context.Context) (map[int64][]SectionSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ss.statement_id, ss.currency, ss.previous_balance, ss.balance,
			(SELECT COUNT(*) FROM transactions t WHERE t.statement_id = ss.statement_id AND t.currency = ss.currency)
		FROM statement_sections ss
		ORDER BY ss.statement_id, ss.rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]SectionSummary{}
	for rows.Next() {
		var statementID int64
		var summary SectionSummary
		if err := rows.Scan(&statementID, &summary.Currency, &summary.PreviousBalance, &summary.Balance, &summary.Transactions); err != nil {
			return nil, err
		}
		out[statementID] = append(out[statementID], summary)
	}
	return out, rows.Err()
}

type loanHistoryRow struct {
	asOf, first, sourceFile string
	issues                  []string
}

// loanCoverage and certificateCoverage mark every month a history spans,
// from its first movement to the day it was generated, as covered; months
// between histories that don't meet are missing.
func (s *Store) loanCoverage(ctx context.Context) ([]AccountMonths, error) {
	return s.historyCoverage(ctx, Loan, `
		SELECT l.id, l.institution, l.last4, l.currency, l.product, h.as_of, h.first_date, h.source_file, h.issues
		FROM loan_histories h JOIN loans l ON l.id = h.loan_id
		ORDER BY l.last4, l.id, h.as_of`,
		`SELECT loan_id, substr(posted_on, 1, 7), COUNT(*) FROM loan_movements GROUP BY 1, 2`)
}

func (s *Store) certificateCoverage(ctx context.Context) ([]AccountMonths, error) {
	return s.historyCoverage(ctx, Certificate, `
		SELECT c.id, c.institution, c.last4, c.currency, '', h.as_of, h.first_date, h.source_file, h.issues
		FROM certificate_histories h JOIN certificates c ON c.id = h.certificate_id
		ORDER BY c.last4, c.id, h.as_of`,
		`SELECT certificate_id, substr(posted_on, 1, 7), COUNT(*) FROM certificate_movements GROUP BY 1, 2`)
}

func (s *Store) historyCoverage(ctx context.Context, kind, historiesQuery, countsQuery string) ([]AccountMonths, error) {
	counts, err := s.movementCounts(ctx, countsQuery)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, historiesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type account struct {
		id        int64
		account   Account
		histories []loanHistoryRow
	}
	var accounts []*account
	for rows.Next() {
		var id int64
		a := Account{Kind: kind}
		var history loanHistoryRow
		var issues string
		if err := rows.Scan(&id, &a.Institution, &a.Last4, &a.Currency, &a.Product,
			&history.asOf, &history.first, &history.sourceFile, &issues); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(issues), &history.issues); err != nil {
			return nil, fmt.Errorf("%s history issues: %w", kind, err)
		}
		if len(accounts) == 0 || accounts[len(accounts)-1].id != id {
			accounts = append(accounts, &account{id: id, account: a})
		}
		current := accounts[len(accounts)-1]
		current.histories = append(current.histories, history)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var out []AccountMonths
	for _, a := range accounts {
		// Each month takes the latest history that spans it (they come
		// sorted by date).
		covering := map[string]loanHistoryRow{}
		var first, last string
		for _, h := range a.histories {
			for m := h.first[:7]; m <= h.asOf[:7]; m = nextMonth(m) {
				covering[m] = h
			}
			if first == "" || h.first[:7] < first {
				first = h.first[:7]
			}
			if h.asOf[:7] > last {
				last = h.asOf[:7]
			}
		}
		months := AccountMonths{Account: a.account}
		for m := first; m <= last; m = nextMonth(m) {
			month := Month{Month: m}
			if h, ok := covering[m]; ok {
				month.Date = h.asOf
				month.SourceFile = h.sourceFile
				month.Issues = slices.Clone(h.issues)
				month.Sections = []SectionSummary{{Currency: a.account.Currency, Transactions: counts[a.id][m]}}
			}
			months.Months = append(months.Months, month)
		}
		out = append(out, months)
	}
	return out, nil
}

// movementCounts counts movements by account and month: the query returns
// the account's id, the month and the count.
func (s *Store) movementCounts(ctx context.Context, query string) (map[int64]map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]map[string]int{}
	for rows.Next() {
		var id int64
		var month string
		var count int
		if err := rows.Scan(&id, &month, &count); err != nil {
			return nil, err
		}
		if out[id] == nil {
			out[id] = map[string]int{}
		}
		out[id][month] = count
	}
	return out, rows.Err()
}

// nextMonth returns the month after one like "2026-01".
func nextMonth(month string) string {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return "9999-12" // not a month: stop filling gaps
	}
	return t.AddDate(0, 1, 0).Format("2006-01")
}

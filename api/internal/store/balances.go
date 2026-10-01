package store

import (
	"cmp"
	"context"
	"math"
	"slices"
	"time"

	"github.com/powky/domfin/api/internal/ledger"
)

// AccountBalance is a ledger account with where its balance stands: the
// latest one the statements print and the one at the end of each month
// asked for. Balances are in cents, as the bank prints them: what a bank
// account or certificate holds, what's owed on a card or loan.
type AccountBalance struct {
	Account ledger.Account
	Balance int64
	// AsOf is the date of the latest statement (its cut date) or history
	// (the day it was generated).
	AsOf string
	// CreditLimit of a card, from its latest statement.
	CreditLimit int64
	Months      []MonthBalance
}

// MonthBalance is the balance at the end of a month; nil before the
// account's first statement.
type MonthBalance struct {
	Month   string
	Balance *int64
}

// balancePoint is a balance the statements tell at a date: after a
// movement, or before a statement's first one. Order sorts points of the
// same day.
type balancePoint struct {
	date    string
	order   int
	balance int64
}

// AccountBalances lists every account of the ledger with its balances at
// the end of each month ("2026-01"...). A month's balance is the one after
// the last movement posted by its end, so bank accounts, whose statements
// print the balance after each movement, are exact; cards run their
// statement's previous balance through the movements; loans and
// certificates print the balance after each movement too.
func (s *Store) AccountBalances(ctx context.Context, months []string) ([]AccountBalance, error) {
	accounts, err := s.Accounts(ctx)
	if err != nil {
		return nil, err
	}
	points := map[string][]balancePoint{}
	asOf := map[string]string{}
	limits := map[string]int64{}
	for _, collect := range []func(context.Context, map[string][]balancePoint, map[string]string, map[string]int64) error{
		s.bankPoints, s.cardPoints, s.loanPoints, s.certificatePoints,
	} {
		if err := collect(ctx, points, asOf, limits); err != nil {
			return nil, err
		}
	}

	out := make([]AccountBalance, 0, len(accounts))
	for _, a := range accounts {
		list := points[a.ID]
		slices.SortStableFunc(list, func(x, y balancePoint) int {
			return cmp.Or(cmp.Compare(x.date, y.date), cmp.Compare(x.order, y.order))
		})
		b := AccountBalance{Account: a, AsOf: asOf[a.ID], CreditLimit: limits[a.ID]}
		if len(list) > 0 {
			b.Balance = list[len(list)-1].balance
		}
		for _, month := range months {
			end := monthEnd(month)
			i := slices.IndexFunc(list, func(p balancePoint) bool { return p.date > end })
			if i < 0 {
				i = len(list)
			}
			mb := MonthBalance{Month: month}
			if i > 0 {
				balance := list[i-1].balance
				mb.Balance = &balance
			}
			b.Months = append(b.Months, mb)
		}
		out = append(out, b)
	}
	return out, nil
}

// monthEnd is the last day of a month like "2026-02": "2026-02-28".
func monthEnd(month string) string {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return month + "-31"
	}
	return t.AddDate(0, 1, -1).Format(dateLayout)
}

// statementBalances are the balances one statement tells about an
// account: the one after each movement, the closing one at the cut and the
// previous one, which the account had at the previous cut.
type statementBalances struct {
	account  string
	cut      string
	previous int64
	// first is the date of the first movement, "" without any.
	first  string
	points []balancePoint
}

// addStatements adds the balances the statements tell. A statement's
// previous balance is the account's at the previous cut, about a month
// before its own. When that statement was imported too, its closing
// balance says so already; when it wasn't (an account's first statement,
// or one after a missing month), the previous balance goes at that date,
// so the month it falls in has a balance. Otherwise it goes just before
// the first movement.
func addStatements(points map[string][]balancePoint, list []statementBalances) {
	cuts := map[string][]string{}
	for _, st := range list {
		cuts[st.account] = append(cuts[st.account], st.cut)
	}
	for _, st := range list {
		points[st.account] = append(points[st.account], st.points...)
		previousCut := previousCut(st.cut)
		imported := slices.ContainsFunc(cuts[st.account], func(cut string) bool { return daysApart(cut, previousCut) <= 10 })
		switch {
		case !imported && (st.first == "" || previousCut < st.first):
			points[st.account] = append(points[st.account], balancePoint{previousCut, math.MaxInt, st.previous})
		case st.first != "":
			points[st.account] = append(points[st.account], balancePoint{st.first, -1, st.previous})
		}
	}
}

// previousCut is the same day of the month before, or that month's last
// day: "2026-03-31" → "2026-02-28".
func previousCut(cut string) string {
	t, err := time.Parse(dateLayout, cut)
	if err != nil {
		return cut
	}
	first := time.Date(t.Year(), t.Month()-1, 1, 0, 0, 0, 0, time.UTC)
	return first.AddDate(0, 0, min(t.Day(), first.AddDate(0, 1, -1).Day())-1).Format(dateLayout)
}

// daysApart is how many days there are between two dates, either way.
func daysApart(a, b string) int {
	x, errA := time.Parse(dateLayout, a)
	y, errB := time.Parse(dateLayout, b)
	if errA != nil || errB != nil {
		return math.MaxInt
	}
	return int(math.Abs(x.Sub(y).Hours() / 24))
}

// bankPoints reads bank accounts: the balance after each movement, as
// printed.
func (s *Store) bankPoints(ctx context.Context, points map[string][]balancePoint, asOf map[string]string, _ map[string]int64) error {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.institution, a.kind, a.last4, a.currency, st.id, st.cut_date, st.previous_balance, st.balance,
			t.posted_on, t.position, t.balance
		FROM bank_statements st
		JOIN bank_accounts a ON a.id = st.account_id
		LEFT JOIN bank_transactions t ON t.statement_id = st.id
		ORDER BY st.id, t.posted_on, t.position`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var list []statementBalances
	lastStatement := int64(-1)
	for rows.Next() {
		var institution, kind, last4, currency, cut string
		var statementID, previous, closing int64
		var posted *string
		var position, balance *int64
		if err := rows.Scan(&institution, &kind, &last4, &currency, &statementID, &cut, &previous, &closing,
			&posted, &position, &balance); err != nil {
			return err
		}
		id := ledger.AccountID(institution, ledger.AccountKind(kind), last4, currency)
		asOf[id] = max(asOf[id], cut)
		if statementID != lastStatement {
			lastStatement = statementID
			list = append(list, statementBalances{account: id, cut: cut, previous: previous,
				points: []balancePoint{{cut, math.MaxInt, closing}}})
		}
		if st := &list[len(list)-1]; posted != nil {
			if st.first == "" {
				st.first = *posted
			}
			st.points = append(st.points, balancePoint{*posted, int(*position), *balance})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	addStatements(points, list)
	return nil
}

// cardPoints runs each statement's previous balance through its movements,
// currency by currency: a charge (negative, like the app) adds to what's owed.
func (s *Store) cardPoints(ctx context.Context, points map[string][]balancePoint, asOf map[string]string, limits map[string]int64) error {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.institution, c.last4, ss.currency, st.id, st.cut_date, ss.previous_balance, ss.balance, ss.credit_limit,
			t.posted_on, t.position, t.amount
		FROM statement_sections ss
		JOIN statements st ON st.id = ss.statement_id
		JOIN cards c ON c.id = st.card_id
		LEFT JOIN transactions t ON t.statement_id = st.id AND t.currency = ss.currency
		ORDER BY st.id, ss.currency, t.posted_on, t.position`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type section struct {
		statement int64
		currency  string
	}
	var list []statementBalances
	var current section
	var running int64
	latestCut := map[string]string{}
	for rows.Next() {
		var institution, last4, currency, cut string
		var statementID, previous, closing, limit int64
		var posted *string
		var position, amount *int64
		if err := rows.Scan(&institution, &last4, &currency, &statementID, &cut, &previous, &closing, &limit,
			&posted, &position, &amount); err != nil {
			return err
		}
		id := ledger.AccountID(institution, ledger.CreditCard, last4, currency)
		if cut >= latestCut[id] {
			latestCut[id], limits[id] = cut, limit
		}
		asOf[id] = max(asOf[id], cut)
		if (section{statementID, currency}) != current {
			current, running = section{statementID, currency}, previous
			list = append(list, statementBalances{account: id, cut: cut, previous: previous,
				points: []balancePoint{{cut, math.MaxInt, closing}}})
		}
		if st := &list[len(list)-1]; posted != nil {
			if st.first == "" {
				st.first = *posted
			}
			running -= *amount
			st.points = append(st.points, balancePoint{*posted, int(*position), running})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	addStatements(points, list)
	return nil
}

// loanPoints and certificatePoints read the balance printed after each
// movement of their histories.
func (s *Store) loanPoints(ctx context.Context, points map[string][]balancePoint, asOf map[string]string, _ map[string]int64) error {
	return s.historyPoints(ctx, ledger.Loan, points, asOf, `
		SELECT l.institution, l.last4, l.currency, m.posted_on, m.position, m.balance,
			(SELECT MAX(h.as_of) FROM loan_histories h WHERE h.loan_id = l.id)
		FROM loan_movements m JOIN loans l ON l.id = m.loan_id`)
}

func (s *Store) certificatePoints(ctx context.Context, points map[string][]balancePoint, asOf map[string]string, _ map[string]int64) error {
	return s.historyPoints(ctx, ledger.Certificate, points, asOf, `
		SELECT c.institution, c.last4, c.currency, m.posted_on, m.position, m.balance,
			(SELECT MAX(h.as_of) FROM certificate_histories h WHERE h.certificate_id = c.id)
		FROM certificate_movements m JOIN certificates c ON c.id = m.certificate_id`)
}

func (s *Store) historyPoints(ctx context.Context, kind ledger.AccountKind, points map[string][]balancePoint, asOf map[string]string, query string) error {
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var institution, last4, currency, posted, historyDate string
		var position int
		var balance int64
		if err := rows.Scan(&institution, &last4, &currency, &posted, &position, &balance, &historyDate); err != nil {
			return err
		}
		id := ledger.AccountID(institution, kind, last4, currency)
		asOf[id] = max(asOf[id], historyDate)
		points[id] = append(points[id], balancePoint{posted, position, balance})
	}
	return rows.Err()
}

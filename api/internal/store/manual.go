package store

import (
	"cmp"
	"context"
	"database/sql"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/powky/domfin/api/internal/ledger"
)

// How a movement added by hand stands with its account's statements (see
// the manual_movements table and settleManual).
const (
	manualPending = "pending"
	manualMatched = "matched"
	manualMissing = "missing"
	manualKept    = "kept"
)

// matchDays is how many days apart a movement added by hand and the
// statement's movement that brings it can be: the bank posts a purchase a
// few days after it was made, and the day typed may be off.
const matchDays = 7

// manualPrefix starts the ID of a movement added by hand.
const manualPrefix = "manual:"

// Limits of what a movement added by hand says.
const (
	maxDescription = 200
	maxNotes       = 1000
)

// Manual is a movement the user adds by hand.
type Manual struct {
	AccountID string
	// Date is "YYYY-MM-DD".
	Date        string
	Description string
	// Amount in cents of the account's currency: positive comes into the
	// account, negative goes out.
	Amount int64
	// CategoryID files it under a category; empty leaves it to the rules,
	// like an imported movement.
	CategoryID string
	Notes      string
}

// AddManual adds a movement by hand and returns its ID. When the account's
// statements don't cover its days yet, it waits for the one that brings it
// (see settleManual), which may be here already; one in a cash account has
// no statements to wait for.
func (s *Store) AddManual(ctx context.Context, m Manual) (string, error) {
	m.Description, m.Notes = strings.TrimSpace(m.Description), strings.TrimSpace(m.Notes)
	date, err := time.Parse(dateLayout, m.Date)
	switch {
	case err != nil:
		return "", fmt.Errorf("%w: bad date %q", ErrInvalid, m.Date)
	case m.Description == "" || utf8.RuneCountInString(m.Description) > maxDescription:
		return "", fmt.Errorf("%w: the description takes 1 to %d characters", ErrInvalid, maxDescription)
	case utf8.RuneCountInString(m.Notes) > maxNotes:
		return "", fmt.Errorf("%w: the notes take up to %d characters", ErrInvalid, maxNotes)
	case m.Amount == 0:
		return "", fmt.Errorf("%w: no amount", ErrInvalid)
	}
	accounts, err := s.Accounts(ctx)
	if err != nil {
		return "", err
	}
	accounts = append(accounts, ledger.CashAccounts(accounts)...)
	i := slices.IndexFunc(accounts, func(a ledger.Account) bool { return a.ID == m.AccountID })
	if i == -1 {
		return "", fmt.Errorf("%w: no account %q", ErrInvalid, m.AccountID)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	ends, err := coverageEnds(ctx, tx)
	if err != nil {
		return "", err
	}
	status := manualPending
	if accounts[i].Kind == ledger.Cash || ends[m.AccountID] >= date.AddDate(0, 0, matchDays).Format(dateLayout) {
		// Its statements are here already, or there are none: it's what
		// they don't show.
		status = manualKept
	}
	now := s.now().UTC().Format(time.RFC3339)
	var row int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO manual_movements (account_id, posted_on, description, amount, currency, notes, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		m.AccountID, m.Date, m.Description, m.Amount, accounts[i].Currency, m.Notes, status, now).Scan(&row)
	if err != nil {
		return "", err
	}
	id := manualPrefix + strconv.FormatInt(row, 10)
	if m.CategoryID != "" {
		_, err := tx.ExecContext(ctx, `INSERT INTO classifications (movement_id, category_id, updated_at) VALUES (?, ?, ?)`,
			id, m.CategoryID, now)
		if isForeignKey(err) {
			return "", fmt.Errorf("%w: no category %q", ErrInvalid, m.CategoryID)
		}
		if err != nil {
			return "", err
		}
	}
	if err := settleManual(ctx, tx); err != nil {
		return "", err
	}
	return id, tx.Commit()
}

// DeleteManual removes a movement added by hand, with its category, its
// marks and its link to an asset.
func (s *Store) DeleteManual(ctx context.Context, id string) error {
	row, ok := strings.CutPrefix(id, manualPrefix)
	if !ok {
		return ErrNotFound
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `DELETE FROM manual_movements WHERE id = ?`, row)
	if err != nil {
		return err
	}
	if n, err := result.RowsAffected(); err != nil || n == 0 {
		return cmp.Or(err, ErrNotFound)
	}
	for _, table := range []string{"classifications", "movement_marks", "asset_links"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE movement_id = ?`, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Mark is what the user marked on a movement.
type Mark struct {
	// Reviewed: it no longer asks for a look. Hidden: it stays out of lists
	// and totals.
	Reviewed, Hidden bool
}

// Marks returns what the user marked, by movement ID.
func (s *Store) Marks(ctx context.Context) (map[string]Mark, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT movement_id, reviewed, hidden FROM movement_marks`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	marks := map[string]Mark{}
	for rows.Next() {
		var id string
		var mark Mark
		if err := rows.Scan(&id, &mark.Reviewed, &mark.Hidden); err != nil {
			return nil, err
		}
		marks[id] = mark
	}
	return marks, rows.Err()
}

// SetMarks marks movements reviewed or not, and hidden or not; a nil one
// stays as it was.
func (s *Store) SetMarks(ctx context.Context, ids []string, reviewed, hidden *bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.now().UTC().Format(time.RFC3339)
	for _, id := range ids {
		if id == "" {
			return fmt.Errorf("%w: a movement without an ID", ErrInvalid)
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO movement_marks (movement_id, reviewed, hidden, updated_at)
			VALUES (?1, coalesce(?2, 0), coalesce(?3, 0), ?4)
			ON CONFLICT (movement_id) DO UPDATE SET
				reviewed = coalesce(?2, reviewed), hidden = coalesce(?3, hidden), updated_at = ?4`,
			id, reviewed, hidden, now)
		if err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM movement_marks WHERE reviewed = 0 AND hidden = 0`); err != nil {
		return err
	}
	return tx.Commit()
}

// manualMovements lists the movements added by hand posted from one date to
// another that no statement brought, oldest first, and the notes of the
// ones a statement brought, by the movement that took their place.
func manualMovements(ctx context.Context, q querier, from, to string) ([]ledger.Movement, map[string]string, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT id, account_id, posted_on, description, amount, currency, notes, status, coalesce(matched_id, '')
		FROM manual_movements
		WHERE posted_on BETWEEN ? AND ? OR status = ? AND notes != ''
		ORDER BY posted_on, id`, from, to, manualMatched)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var movements []ledger.Movement
	notes := map[string]string{}
	for rows.Next() {
		var (
			m              ledger.Movement
			row            int64
			status, merged string
		)
		if err := rows.Scan(&row, &m.AccountID, &m.Date, &m.Description, &m.Amount, &m.Currency, &m.Notes,
			&status, &merged); err != nil {
			return nil, nil, err
		}
		if status == manualMatched {
			if m.Notes != "" {
				notes[merged] = m.Notes
			}
			continue
		}
		m.ID, m.Manual, m.Missing = manualPrefix+strconv.FormatInt(row, 10), true, status == manualMissing
		movements = append(movements, m)
	}
	return movements, notes, rows.Err()
}

// settleManual looks, for each movement added by hand that waits for its
// statement, for the statement's movement that brings it: in the same
// account, for the same amount, matchDays apart at most (the nearest, and
// one for each). That movement takes its place, with the category, the
// marks and the asset link the user gave it. Once the statements cover
// matchDays past its date without bringing it, it's missing: it stays, but
// asks for a look. It runs when a statement is saved and when a movement is
// added by hand, in their transaction.
func settleManual(ctx context.Context, tx *sql.Tx) error {
	pending, err := pendingManual(ctx, tx)
	if err != nil || len(pending) == 0 {
		return err
	}
	ends, err := coverageEnds(ctx, tx)
	if err != nil {
		return err
	}
	imported, err := importedMovements(ctx, tx, shift(pending[0].date, -matchDays), shift(pending[len(pending)-1].date, matchDays))
	if err != nil {
		return err
	}
	taken, err := matchedIDs(ctx, tx)
	if err != nil {
		return err
	}
	for _, w := range pending {
		best, bestGap := -1, 0
		for j, m := range imported {
			if m.AccountID != w.account || m.Amount != w.amount || taken[m.ID] {
				continue
			}
			if gap := daysApart(w.date, m.Date); gap <= matchDays && (best == -1 || gap < bestGap) {
				best, bestGap = j, gap
			}
		}
		switch {
		case best != -1:
			taken[imported[best].ID] = true
			if err := match(ctx, tx, w.row, imported[best]); err != nil {
				return err
			}
		case ends[w.account] >= shift(w.date, matchDays):
			if _, err := tx.ExecContext(ctx, `UPDATE manual_movements SET status = ? WHERE id = ?`, manualMissing, w.row); err != nil {
				return err
			}
		}
	}
	return nil
}

// waiting is a movement added by hand that waits for its statement.
type waiting struct {
	row           int64
	account, date string
	amount        int64
}

// pendingManual lists the movements added by hand that wait for their
// statement, oldest first.
func pendingManual(ctx context.Context, q querier) ([]waiting, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT id, account_id, posted_on, amount FROM manual_movements WHERE status = ? ORDER BY posted_on, id`,
		manualPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pending []waiting
	for rows.Next() {
		var w waiting
		if err := rows.Scan(&w.row, &w.account, &w.date, &w.amount); err != nil {
			return nil, err
		}
		pending = append(pending, w)
	}
	return pending, rows.Err()
}

// match puts the statement's movement in the place of a movement added by
// hand, with what the user gave that one (unless it has its own).
func match(ctx context.Context, tx *sql.Tx, row int64, by ledger.Movement) error {
	id := manualPrefix + strconv.FormatInt(row, 10)
	steps := []struct {
		query string
		args  []any
	}{
		{`UPDATE manual_movements SET status = ?, matched_id = ? WHERE id = ?`, []any{manualMatched, by.ID, row}},
		{`INSERT OR IGNORE INTO classifications (movement_id, category_id, updated_at)
			SELECT ?, category_id, updated_at FROM classifications WHERE movement_id = ?`, []any{by.ID, id}},
		{`INSERT OR IGNORE INTO movement_marks (movement_id, reviewed, hidden, updated_at)
			SELECT ?, reviewed, hidden, updated_at FROM movement_marks WHERE movement_id = ?`, []any{by.ID, id}},
		{`INSERT OR IGNORE INTO asset_links (movement_id, asset_id, date, value, auto)
			SELECT ?, asset_id, ?, value, auto FROM asset_links WHERE movement_id = ?`, []any{by.ID, by.Date, id}},
		{`DELETE FROM classifications WHERE movement_id = ?`, []any{id}},
		{`DELETE FROM movement_marks WHERE movement_id = ?`, []any{id}},
		{`DELETE FROM asset_links WHERE movement_id = ?`, []any{id}},
	}
	for _, step := range steps {
		if _, err := tx.ExecContext(ctx, step.query, step.args...); err != nil {
			return err
		}
	}
	return nil
}

// matchedIDs are the statements' movements that took the place of one added
// by hand.
func matchedIDs(ctx context.Context, q querier) (map[string]bool, error) {
	rows, err := q.QueryContext(ctx, `SELECT matched_id FROM manual_movements WHERE status = ?`, manualMatched)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, rows.Err()
}

// coverageEnds gives, by the ledger's account ID, the last day the
// account's statements cover: a card's or bank account's latest cut date,
// the day a loan's or certificate's latest history was generated.
func coverageEnds(ctx context.Context, q querier) (map[string]string, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT c.institution, 'credit_card', c.last4, ss.currency, MAX(st.cut_date)
		FROM cards c
		JOIN statements st ON st.card_id = c.id
		JOIN statement_sections ss ON ss.statement_id = st.id
		GROUP BY c.id, ss.currency
		UNION ALL
		SELECT a.institution, a.kind, a.last4, a.currency, MAX(st.cut_date)
		FROM bank_accounts a JOIN bank_statements st ON st.account_id = a.id
		GROUP BY a.id
		UNION ALL
		SELECT l.institution, 'loan', l.last4, l.currency, MAX(h.as_of)
		FROM loans l JOIN loan_histories h ON h.loan_id = l.id
		GROUP BY l.id
		UNION ALL
		SELECT c.institution, 'certificate', c.last4, c.currency, MAX(h.as_of)
		FROM certificates c JOIN certificate_histories h ON h.certificate_id = c.id
		GROUP BY c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ends := map[string]string{}
	for rows.Next() {
		var institution, kind, last4, currency, end string
		if err := rows.Scan(&institution, &kind, &last4, &currency, &end); err != nil {
			return nil, err
		}
		ends[ledger.AccountID(institution, ledger.AccountKind(kind), last4, currency)] = end
	}
	return ends, rows.Err()
}

// shift moves a "YYYY-MM-DD" date by some days.
func shift(date string, days int) string {
	d, err := time.Parse(dateLayout, date)
	if err != nil {
		return date
	}
	return d.AddDate(0, 0, days).Format(dateLayout)
}

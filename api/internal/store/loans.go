package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

// SaveLoanHistory stores a loan history with the issues its checks found.
// Histories overlap, since each lists everything in the range asked for:
// saving one adds the movements that are new and refreshes the ones already
// kept, and saving the same history again changes nothing.
func (s *Store) SaveLoanHistory(ctx context.Context, h statements.LoanHistory, issues []string, src Source) (Outcome, error) {
	contentHash, issuesJSON, err := fingerprint(h, issues)
	if err != nil {
		return "", err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var loanID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO loans (institution, last4, currency, product) VALUES (?, ?, ?, ?)
		ON CONFLICT (institution, last4) DO UPDATE SET currency = excluded.currency, product = excluded.product
		RETURNING id`,
		h.Institution, h.Last4, h.Currency, h.Product).Scan(&loanID)
	if err != nil {
		return "", fmt.Errorf("save loan: %w", err)
	}

	var existing int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM loan_histories WHERE loan_id = ? AND content_sha256 = ?`,
		loanID, contentHash).Scan(&existing)
	switch {
	case err == nil:
		return Unchanged, tx.Commit()
	case !errors.Is(err, sql.ErrNoRows):
		return "", err
	}

	first := h.AsOf
	for _, m := range h.Movements {
		if m.PostedOn.Before(first) {
			first = m.PostedOn
		}
	}
	var historyID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO loan_histories (loan_id, as_of, first_date, source_file, source_sha256, content_sha256, status, issues, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		loanID, h.AsOf.Format(dateLayout), first.Format(dateLayout), src.Name, src.SHA256, contentHash,
		statusOf(issues), issuesJSON, s.now().UTC().Format(time.RFC3339)).Scan(&historyID)
	if err != nil {
		return "", fmt.Errorf("save loan history: %w", err)
	}

	for i, m := range h.Movements {
		var principal sql.NullInt64
		if m.Principal != nil {
			principal = sql.NullInt64{Int64: *m.Principal, Valid: true}
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO loan_movements (loan_id, history_id, position, posted_on, effective_on, reference, description,
				kind, amount, principal, balance)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (loan_id, reference) DO UPDATE SET
				history_id = excluded.history_id, position = excluded.position, posted_on = excluded.posted_on,
				effective_on = excluded.effective_on, description = excluded.description, kind = excluded.kind,
				amount = excluded.amount, principal = excluded.principal, balance = excluded.balance`,
			loanID, historyID, i+1, m.PostedOn.Format(dateLayout), m.EffectiveOn.Format(dateLayout), m.Reference,
			m.Description, string(m.Kind()), signedLoanAmount(m), principal, m.Balance)
		if err != nil {
			return "", fmt.Errorf("save loan movement %d: %w", i+1, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return Added, nil
}

// signedLoanAmount signs a movement like the app does: what makes the debt
// grow (a disbursement) is money out of the loan, a payment money in.
func signedLoanAmount(m statements.LoanMovement) int64 {
	switch {
	case m.Kind() == statements.Disbursement:
		return -m.Amount
	case m.Kind() == statements.LoanOther && m.Principal != nil && *m.Principal < 0:
		return -m.Amount
	default:
		return m.Amount
	}
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

// Kinds of bank account.
const (
	Savings  = "savings"
	Checking = "checking"
)

// SaveAccountStatement stores a bank account statement with the issues its
// checks found. An account has one statement per cut date: saving it again
// replaces it, or leaves it alone when its contents are the same.
func (s *Store) SaveAccountStatement(ctx context.Context, st statements.AccountStatement, issues []string, src Source) (Outcome, error) {
	contentHash, issuesJSON, err := fingerprint(st, issues)
	if err != nil {
		return "", err
	}
	kind := Savings
	if st.Checking() {
		kind = Checking
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var accountID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO bank_accounts (institution, kind, last4, currency, product, name) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (institution, last4) DO UPDATE SET
			kind = excluded.kind, currency = excluded.currency, product = excluded.product, name = excluded.name
		RETURNING id`,
		st.Institution, kind, st.Last4, st.Currency, st.Product, st.Name()).Scan(&accountID)
	if err != nil {
		return "", fmt.Errorf("save bank account: %w", err)
	}

	outcome := Added
	var existingID int64
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT id, content_sha256 FROM bank_statements WHERE account_id = ? AND cut_date = ?`,
		accountID, st.CutDate.Format(dateLayout)).Scan(&existingID, &existingHash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return "", err
	case existingHash == contentHash:
		return Unchanged, tx.Commit()
	default:
		if _, err := tx.ExecContext(ctx, `DELETE FROM bank_statements WHERE id = ?`, existingID); err != nil {
			return "", err
		}
		outcome = Replaced
	}

	var statementID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO bank_statements (account_id, cut_date, previous_balance, balance, source_file, source_sha256,
			content_sha256, status, issues, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		accountID, st.CutDate.Format(dateLayout), st.PreviousBalance, st.Balance, src.Name, src.SHA256,
		contentHash, statusOf(issues), issuesJSON, s.now().UTC().Format(time.RFC3339)).Scan(&statementID)
	if err != nil {
		return "", fmt.Errorf("save bank statement: %w", err)
	}
	for i, t := range st.Transactions {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO bank_transactions (statement_id, account_id, position, posted_on, transacted_on, description, amount, balance)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			statementID, accountID, i+1, t.PostedOn.Format(dateLayout), t.TransactedOn.Format(dateLayout),
			t.Description, t.Amount, t.Balance)
		if err != nil {
			return "", fmt.Errorf("save bank transaction %d: %w", i+1, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return outcome, nil
}

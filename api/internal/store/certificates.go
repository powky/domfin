package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

// Certificate is the kind of account of a certificate of deposit.
const Certificate = "certificate"

// SaveCertificateHistory stores a certificate history with the issues its
// checks found. Like loan histories, histories overlap: saving one adds the
// movements that are new and refreshes the rest, and saving the same
// history again changes nothing.
func (s *Store) SaveCertificateHistory(ctx context.Context, h statements.CertificateHistory, issues []string, src Source) (Outcome, error) {
	contentHash, issuesJSON, err := fingerprint(h, issues)
	if err != nil {
		return "", err
	}
	matures := ""
	if !h.Matures.IsZero() {
		matures = h.Matures.Format(dateLayout)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var certificateID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO certificates (institution, last4, currency, rate, matures) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (institution, last4) DO UPDATE SET currency = excluded.currency, rate = excluded.rate, matures = excluded.matures
		RETURNING id`,
		h.Institution, h.Last4, h.Currency, h.Rate, matures).Scan(&certificateID)
	if err != nil {
		return "", fmt.Errorf("save certificate: %w", err)
	}

	var existing int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM certificate_histories WHERE certificate_id = ? AND content_sha256 = ?`,
		certificateID, contentHash).Scan(&existing)
	switch {
	case err == nil:
		return Unchanged, tx.Commit()
	case !errors.Is(err, sql.ErrNoRows):
		return "", err
	}

	first := h.AsOf
	for _, m := range h.Movements {
		if m.EffectiveOn.Before(first) {
			first = m.EffectiveOn
		}
	}
	var historyID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO certificate_histories (certificate_id, as_of, first_date, source_file, source_sha256, content_sha256,
			status, issues, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		certificateID, h.AsOf.Format(dateLayout), first.Format(dateLayout), src.Name, src.SHA256, contentHash,
		statusOf(issues), issuesJSON, s.now().UTC().Format(time.RFC3339)).Scan(&historyID)
	if err != nil {
		return "", fmt.Errorf("save certificate history: %w", err)
	}
	for i, m := range h.Movements {
		reference := m.EffectiveOn.Format(dateLayout) + "/" + m.Code
		_, err := tx.ExecContext(ctx, `
			INSERT INTO certificate_movements (certificate_id, history_id, position, reference, effective_on, posted_on,
				code, description, kind, amount, rate, balance)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (certificate_id, reference) DO UPDATE SET
				history_id = excluded.history_id, position = excluded.position, posted_on = excluded.posted_on,
				code = excluded.code, description = excluded.description, kind = excluded.kind,
				amount = excluded.amount, rate = excluded.rate, balance = excluded.balance`,
			certificateID, historyID, i+1, reference, m.EffectiveOn.Format(dateLayout), m.PostedOn.Format(dateLayout),
			m.Code, m.Description, m.Kind(), m.Amount, m.Rate, m.Balance)
		if err != nil {
			return "", fmt.Errorf("save certificate movement %d: %w", i+1, err)
		}
	}
	// What the user added by hand before this statement may be in it.
	if err := settleManual(ctx, tx); err != nil {
		return "", fmt.Errorf("settle movements added by hand: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return Added, nil
}

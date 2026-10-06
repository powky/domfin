package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/powky/domfin/api/internal/statements"
)

// Payslip is a pay stub as stored, with what its checks found.
type Payslip struct {
	ID int64
	statements.Payslip
	Status string
	Issues []string
}

// SavePayslip stores a parsed pay stub with the issues its checks found. A
// stub is its employer, payroll date and first concept: saving it again
// replaces it, or leaves it alone when its contents are the same. It makes
// no movements: its money is already in the ledger, as the credit in the
// account it was paid into.
func (s *Store) SavePayslip(ctx context.Context, p statements.Payslip, issues []string, src Source) (Outcome, error) {
	contentHash, issuesJSON, err := fingerprint(p, issues)
	if err != nil {
		return "", err
	}
	concept := ""
	if len(p.Lines) > 0 {
		concept = p.Lines[0].Concept
	}
	paidOn := p.PaidOn.Format(dateLayout)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	outcome := Added
	var existingID int64
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT id, content_sha256 FROM payslips WHERE employer = ? AND paid_on = ? AND concept = ?`,
		p.Employer, paidOn, concept).Scan(&existingID, &existingHash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return "", err
	case existingHash == contentHash:
		return Unchanged, tx.Commit()
	default:
		if _, err := tx.ExecContext(ctx, `DELETE FROM payslips WHERE id = ?`, existingID); err != nil {
			return "", err
		}
		outcome = Replaced
	}

	var id int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO payslips (employer, paid_on, concept, net, source_file, source_sha256, content_sha256, status, issues, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		p.Employer, paidOn, concept, p.Net, src.Name, src.SHA256, contentHash, statusOf(issues), issuesJSON,
		s.now().UTC().Format(time.RFC3339)).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("save payslip: %w", err)
	}
	for i, line := range p.Lines {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO payslip_lines (payslip_id, position, concept, kind, deduction, amount, year_to_date)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, i+1, line.Concept, line.Kind, line.Deduction, line.Amount, line.YearToDate)
		if err != nil {
			return "", fmt.Errorf("save payslip line %d: %w", i+1, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return outcome, nil
}

// Payslips lists the stored pay stubs, oldest first.
func (s *Store) Payslips(ctx context.Context) ([]Payslip, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.employer, p.paid_on, p.net, p.status, p.issues,
			l.concept, l.kind, l.deduction, l.amount, l.year_to_date
		FROM payslips p JOIN payslip_lines l ON l.payslip_id = p.id
		ORDER BY p.paid_on, p.id, l.position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Payslip
	for rows.Next() {
		var p Payslip
		var paidOn, issues string
		var line statements.PayslipLine
		if err := rows.Scan(&p.ID, &p.Employer, &paidOn, &p.Net, &p.Status, &issues,
			&line.Concept, &line.Kind, &line.Deduction, &line.Amount, &line.YearToDate); err != nil {
			return nil, err
		}
		if n := len(out); n > 0 && out[n-1].ID == p.ID {
			out[n-1].Lines = append(out[n-1].Lines, line)
			continue
		}
		if p.PaidOn, err = time.Parse(dateLayout, paidOn); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(issues), &p.Issues); err != nil {
			return nil, fmt.Errorf("payslip %d issues: %w", p.ID, err)
		}
		p.Lines = []statements.PayslipLine{line}
		out = append(out, p)
	}
	return out, rows.Err()
}

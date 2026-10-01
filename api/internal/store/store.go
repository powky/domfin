// Package store keeps imported statements in a local SQLite database.
package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"

	"github.com/powky/domfin/api/internal/statements"
)

// Each entry upgrades the schema by one version (PRAGMA user_version).
var migrations = []string{`
CREATE TABLE cards (
	id          INTEGER PRIMARY KEY,
	institution TEXT NOT NULL,
	last4       TEXT NOT NULL,
	brand       TEXT NOT NULL,
	product     TEXT NOT NULL,
	name        TEXT NOT NULL,
	UNIQUE (institution, last4)
);

-- One row per statement: a card and its cut date, from one PDF.
CREATE TABLE statements (
	id             INTEGER PRIMARY KEY,
	card_id        INTEGER NOT NULL REFERENCES cards (id),
	cut_date       TEXT NOT NULL,
	due_date       TEXT NOT NULL,
	source_file    TEXT NOT NULL,
	source_sha256  TEXT NOT NULL,
	-- Hash of the parsed statement, to tell a re-download from a change.
	content_sha256 TEXT NOT NULL,
	-- "ok" when the statement checks out, "review" when issues lists problems.
	status         TEXT NOT NULL,
	issues         TEXT NOT NULL,
	imported_at    TEXT NOT NULL,
	UNIQUE (card_id, cut_date)
);

-- Balances per currency, in cents, as the statement prints them (a debt is positive).
CREATE TABLE statement_sections (
	statement_id     INTEGER NOT NULL REFERENCES statements (id) ON DELETE CASCADE,
	currency         TEXT NOT NULL,
	credit_limit     INTEGER NOT NULL,
	available_credit INTEGER NOT NULL,
	previous_balance INTEGER NOT NULL,
	balance          INTEGER NOT NULL,
	amount_due       INTEGER NOT NULL,
	minimum_payment  INTEGER NOT NULL,
	past_due_amount  INTEGER NOT NULL,
	past_due_count   INTEGER NOT NULL,
	interest_rate    REAL NOT NULL,
	effective_rate   REAL NOT NULL,
	PRIMARY KEY (statement_id, currency)
);

-- amount is in cents and signed like the app: negative is money out (a
-- charge), positive money in (a payment, cashback or refund).
CREATE TABLE transactions (
	id            INTEGER PRIMARY KEY,
	statement_id  INTEGER NOT NULL REFERENCES statements (id) ON DELETE CASCADE,
	card_id       INTEGER NOT NULL REFERENCES cards (id),
	currency      TEXT NOT NULL,
	position      INTEGER NOT NULL,
	posted_on     TEXT NOT NULL,
	transacted_on TEXT NOT NULL,
	reference     TEXT NOT NULL,
	description   TEXT NOT NULL,
	merchant      TEXT NOT NULL,
	location      TEXT NOT NULL,
	mcc           TEXT NOT NULL,
	auth_code     TEXT NOT NULL,
	kind          TEXT NOT NULL,
	amount        INTEGER NOT NULL
);
CREATE INDEX transactions_by_card_date ON transactions (card_id, transacted_on);
`, `
CREATE TABLE loans (
	id          INTEGER PRIMARY KEY,
	institution TEXT NOT NULL,
	last4       TEXT NOT NULL,
	currency    TEXT NOT NULL,
	product     TEXT NOT NULL,
	UNIQUE (institution, last4)
);

-- One row per imported history: the bank lists a loan's movements, in the
-- range asked for, up to the day it generates the PDF (as_of).
CREATE TABLE loan_histories (
	id             INTEGER PRIMARY KEY,
	loan_id        INTEGER NOT NULL REFERENCES loans (id),
	as_of          TEXT NOT NULL,
	first_date     TEXT NOT NULL,
	source_file    TEXT NOT NULL,
	source_sha256  TEXT NOT NULL,
	content_sha256 TEXT NOT NULL,
	status         TEXT NOT NULL,
	issues         TEXT NOT NULL,
	imported_at    TEXT NOT NULL,
	UNIQUE (loan_id, content_sha256)
);

-- Histories overlap, so each movement is kept once per loan, by reference,
-- and belongs to the last history that listed it. amount is in cents and
-- signed like the app: disbursements negative (the debt grows), payments
-- positive. principal is how much the movement moved the balance (NULL when
-- the history can't tell) and balance the principal owed after it.
CREATE TABLE loan_movements (
	id           INTEGER PRIMARY KEY,
	loan_id      INTEGER NOT NULL REFERENCES loans (id),
	history_id   INTEGER NOT NULL REFERENCES loan_histories (id),
	position     INTEGER NOT NULL,
	posted_on    TEXT NOT NULL,
	effective_on TEXT NOT NULL,
	reference    TEXT NOT NULL,
	description  TEXT NOT NULL,
	kind         TEXT NOT NULL,
	amount       INTEGER NOT NULL,
	principal    INTEGER,
	balance      INTEGER NOT NULL,
	UNIQUE (loan_id, reference)
);
`, `
-- The ledger (docs/modelo-de-datos.md): how movements are classified.
-- Domfin's own groups and categories are added when the store opens.
CREATE TABLE category_groups (
	id       TEXT PRIMARY KEY,
	name     TEXT NOT NULL,
	flow     TEXT NOT NULL CHECK (flow IN ('income', 'expense', 'transfer')),
	position INTEGER NOT NULL
);

-- system marks Domfin's own categories: they can be renamed or archived,
-- not deleted.
CREATE TABLE categories (
	id       TEXT PRIMARY KEY,
	name     TEXT NOT NULL,
	flow     TEXT NOT NULL CHECK (flow IN ('income', 'expense', 'transfer')),
	group_id TEXT NOT NULL REFERENCES category_groups (id),
	system   INTEGER NOT NULL DEFAULT 0,
	archived INTEGER NOT NULL DEFAULT 0,
	position INTEGER NOT NULL
);

-- The user's rules, in order: the first that matches a movement wins.
-- conditions is JSON, see ruleConditions.
CREATE TABLE rules (
	id          INTEGER PRIMARY KEY,
	position    INTEGER NOT NULL,
	name        TEXT NOT NULL,
	conditions  TEXT NOT NULL,
	category_id TEXT NOT NULL REFERENCES categories (id),
	review      INTEGER NOT NULL DEFAULT 0
);

-- The user's corrections, by movement ID: they win over every rule.
CREATE TABLE classifications (
	movement_id TEXT PRIMARY KEY,
	category_id TEXT NOT NULL REFERENCES categories (id),
	updated_at  TEXT NOT NULL
);

-- Settings as JSON by key, like "payroll".
CREATE TABLE settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
`, `
-- Savings and checking accounts, from their monthly statements (page
-- images the importer reads). kind is "savings" or "checking".
CREATE TABLE bank_accounts (
	id          INTEGER PRIMARY KEY,
	institution TEXT NOT NULL,
	kind        TEXT NOT NULL,
	last4       TEXT NOT NULL,
	currency    TEXT NOT NULL,
	product     TEXT NOT NULL,
	name        TEXT NOT NULL,
	UNIQUE (institution, last4)
);

-- One row per statement: an account and its cut date. Balances in cents.
CREATE TABLE bank_statements (
	id               INTEGER PRIMARY KEY,
	account_id       INTEGER NOT NULL REFERENCES bank_accounts (id),
	cut_date         TEXT NOT NULL,
	previous_balance INTEGER NOT NULL,
	balance          INTEGER NOT NULL,
	source_file      TEXT NOT NULL,
	source_sha256    TEXT NOT NULL,
	content_sha256   TEXT NOT NULL,
	status           TEXT NOT NULL,
	issues           TEXT NOT NULL,
	imported_at      TEXT NOT NULL,
	UNIQUE (account_id, cut_date)
);

-- amount is in cents and signed like the app (negative is money out);
-- balance is the account's balance after the movement, as printed. The
-- statements print no reference, so a movement is its statement and
-- position.
CREATE TABLE bank_transactions (
	id            INTEGER PRIMARY KEY,
	statement_id  INTEGER NOT NULL REFERENCES bank_statements (id) ON DELETE CASCADE,
	account_id    INTEGER NOT NULL REFERENCES bank_accounts (id),
	position      INTEGER NOT NULL,
	posted_on     TEXT NOT NULL,
	transacted_on TEXT NOT NULL,
	description   TEXT NOT NULL,
	amount        INTEGER NOT NULL,
	balance       INTEGER NOT NULL
);
CREATE INDEX bank_transactions_by_account_date ON bank_transactions (account_id, posted_on);
`, `
-- Certificates of deposit (depósitos a plazo), from the bank's history of
-- each one. rate is the annual rate of the last renewal, in percent, and
-- matures the date it runs to ('' when unknown).
CREATE TABLE certificates (
	id          INTEGER PRIMARY KEY,
	institution TEXT NOT NULL,
	last4       TEXT NOT NULL,
	currency    TEXT NOT NULL,
	rate        REAL NOT NULL,
	matures     TEXT NOT NULL,
	UNIQUE (institution, last4)
);

-- One row per imported history, like loan_histories.
CREATE TABLE certificate_histories (
	id             INTEGER PRIMARY KEY,
	certificate_id INTEGER NOT NULL REFERENCES certificates (id),
	as_of          TEXT NOT NULL,
	first_date     TEXT NOT NULL,
	source_file    TEXT NOT NULL,
	source_sha256  TEXT NOT NULL,
	content_sha256 TEXT NOT NULL,
	status         TEXT NOT NULL,
	issues         TEXT NOT NULL,
	imported_at    TEXT NOT NULL,
	UNIQUE (certificate_id, content_sha256)
);

-- The histories print no reference, so a movement is its effective date
-- and transaction code (reference, like "2026-09-22/20"); it is kept once
-- per certificate. amount is in cents and signed like the app: deposits
-- and interest positive, the tax withheld negative. balance is the capital
-- after it. Renewals move no money and aren't kept.
CREATE TABLE certificate_movements (
	id             INTEGER PRIMARY KEY,
	certificate_id INTEGER NOT NULL REFERENCES certificates (id),
	history_id     INTEGER NOT NULL REFERENCES certificate_histories (id),
	position       INTEGER NOT NULL,
	reference      TEXT NOT NULL,
	effective_on   TEXT NOT NULL,
	posted_on      TEXT NOT NULL,
	code           TEXT NOT NULL,
	description    TEXT NOT NULL,
	kind           TEXT NOT NULL,
	amount         INTEGER NOT NULL,
	rate           REAL NOT NULL,
	balance        INTEGER NOT NULL,
	UNIQUE (certificate_id, reference)
);
`, `
-- What you own that no statement shows: a home bought off-plan, shares.
-- details is the rest of the assets.Asset as JSON (its plan or holding and
-- the texts that link movements to it).
CREATE TABLE assets (
	id         TEXT PRIMARY KEY,
	kind       TEXT NOT NULL,
	name       TEXT NOT NULL,
	currency   TEXT NOT NULL,
	details    TEXT NOT NULL,
	created_at TEXT NOT NULL
);

-- Movements that pay into an asset (or come back from it), by the ledger's
-- movement ID. value is the movement in the asset's currency, in cents,
-- positive for money paid in, converted at the rate of its date. auto marks
-- the links an asset's texts made; a NULL asset_id is a movement the user
-- unlinked, which no text links again.
CREATE TABLE asset_links (
	movement_id TEXT PRIMARY KEY,
	asset_id    TEXT REFERENCES assets (id) ON DELETE CASCADE,
	date        TEXT NOT NULL,
	value       INTEGER NOT NULL,
	auto        INTEGER NOT NULL
);
`, `
-- "Ingresos en dólares" no longer comes with Domfin: the currency doesn't
-- say what the money is for. What was filed under it is Ingreso adicional.
UPDATE classifications SET category_id = 'extra-income' WHERE category_id = 'usd-income';
UPDATE rules SET category_id = 'extra-income' WHERE category_id = 'usd-income';
DELETE FROM categories WHERE id = 'usd-income';
`}

const dateLayout = "2006-01-02"

type Store struct {
	db  *sql.DB
	now func() time.Time
}

// DefaultPath is $DOMFIN_DATA_DIR/domfin.db, by default in the user's
// configuration folder (~/Library/Application Support/domfin-api on macOS),
// out of the repository.
func DefaultPath() string {
	dir := os.Getenv("DOMFIN_DATA_DIR")
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			base = "."
		}
		dir = filepath.Join(base, "domfin-api")
	}
	return filepath.Join(dir, "domfin.db")
}

// Open opens (or creates) the database at path. The file only its owner can
// read, since it holds bank data.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_RDONLY|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	file.Close()

	dsn := (&url.URL{
		Scheme:   "file",
		OmitHost: true,
		Path:     path,
		RawQuery: "_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)",
	}).String()
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db, now: time.Now}
	if err := s.migrate(context.Background()); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate %s: %w", path, err)
	}
	if err := s.addDefaultCategories(context.Background()); err != nil {
		db.Close()
		return nil, fmt.Errorf("default categories in %s: %w", path, err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	var version int
	if err := s.db.QueryRowContext(ctx, `PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	for ; version < len(migrations); version++ {
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, migrations[version]); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`PRAGMA user_version = %d`, version+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Source is the file a statement came from.
type Source struct {
	Name   string
	SHA256 string
}

// SourceOf describes a file from its name and contents.
func SourceOf(name string, data []byte) Source {
	sum := sha256.Sum256(data)
	return Source{Name: name, SHA256: hex.EncodeToString(sum[:])}
}

// Outcome says what saving a statement did.
type Outcome string

const (
	Added     Outcome = "added"
	Replaced  Outcome = "replaced"  // the card and cut date were there with other contents
	Unchanged Outcome = "unchanged" // already imported, maybe from another copy of the file
)

// SaveStatement stores a parsed statement with the issues its checks found.
// A card has one statement per cut date: saving it again replaces it, or
// leaves it alone when its contents are the same.
func (s *Store) SaveStatement(ctx context.Context, st statements.Statement, issues []string, src Source) (Outcome, error) {
	contentHash, issuesJSON, err := fingerprint(st, issues)
	if err != nil {
		return "", err
	}
	status := statusOf(issues)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var cardID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO cards (institution, last4, brand, product, name) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (institution, last4) DO UPDATE SET brand = excluded.brand, product = excluded.product, name = excluded.name
		RETURNING id`,
		st.Institution, st.Last4, st.Brand, st.Product, st.Name()).Scan(&cardID)
	if err != nil {
		return "", fmt.Errorf("save card: %w", err)
	}

	outcome := Added
	var existingID int64
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT id, content_sha256 FROM statements WHERE card_id = ? AND cut_date = ?`,
		cardID, st.CutDate.Format(dateLayout)).Scan(&existingID, &existingHash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return "", err
	case existingHash == contentHash:
		return Unchanged, tx.Commit()
	default:
		if _, err := tx.ExecContext(ctx, `DELETE FROM statements WHERE id = ?`, existingID); err != nil {
			return "", err
		}
		outcome = Replaced
	}

	var statementID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO statements (card_id, cut_date, due_date, source_file, source_sha256, content_sha256, status, issues, imported_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		cardID, st.CutDate.Format(dateLayout), st.DueDate.Format(dateLayout), src.Name, src.SHA256,
		contentHash, status, issuesJSON, s.now().UTC().Format(time.RFC3339)).Scan(&statementID)
	if err != nil {
		return "", fmt.Errorf("save statement: %w", err)
	}

	for _, section := range st.Sections {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO statement_sections (statement_id, currency, credit_limit, available_credit, previous_balance,
				balance, amount_due, minimum_payment, past_due_amount, past_due_count, interest_rate, effective_rate)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			statementID, section.Currency, section.CreditLimit, section.AvailableCredit, section.PreviousBalance,
			section.Balance, section.AmountDue, section.MinimumPayment, section.PastDueAmount, section.PastDueCount,
			section.InterestRate, section.EffectiveRate)
		if err != nil {
			return "", fmt.Errorf("save %s balances: %w", section.Currency, err)
		}
		for i, t := range section.Transactions {
			_, err := tx.ExecContext(ctx, `
				INSERT INTO transactions (statement_id, card_id, currency, position, posted_on, transacted_on, reference,
					description, merchant, location, mcc, auth_code, kind, amount)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				statementID, cardID, section.Currency, i+1, t.PostedOn.Format(dateLayout), t.TransactedOn.Format(dateLayout),
				t.Reference, t.Description, t.Merchant(), t.Location(), t.MCC, t.Authorization, string(t.Kind()),
				// The statement prints charges as positive; the app counts them as money out.
				-t.Amount)
			if err != nil {
				return "", fmt.Errorf("save transaction %d: %w", i+1, err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return outcome, nil
}

// fingerprint hashes what was parsed, to tell a re-download from a change,
// and encodes the issues for their column.
func fingerprint(parsed any, issues []string) (hash, issuesJSON string, err error) {
	content, err := json.Marshal(parsed)
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256(content)
	if issues == nil {
		issues = []string{}
	}
	encoded, err := json.Marshal(issues)
	if err != nil {
		return "", "", err
	}
	return hex.EncodeToString(sum[:]), string(encoded), nil
}

// statusOf is "ok" when the checks found nothing and "review" otherwise.
func statusOf(issues []string) string {
	if len(issues) > 0 {
		return "review"
	}
	return "ok"
}

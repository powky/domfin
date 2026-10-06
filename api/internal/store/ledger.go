package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/ledger"
)

// addDefaultCategories adds Domfin's own groups and categories that are
// missing and keeps them in the order they come in (a new one goes where it
// belongs, not last), leaving alone what the user renamed, moved or
// archived.
func (s *Store) addDefaultCategories(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, g := range ledger.DefaultGroups {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO category_groups (id, name, flow, position) VALUES (?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET position = excluded.position`,
			g.ID, g.Name, g.Flow, i); err != nil {
			return err
		}
	}
	for i, c := range ledger.DefaultCategories {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO categories (id, name, flow, group_id, system, position) VALUES (?, ?, ?, ?, 1, ?)
			ON CONFLICT (id) DO UPDATE SET position = excluded.position WHERE categories.system = 1`,
			c.ID, c.Name, c.Flow, c.Group, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Category is a ledger category with what the user did to it.
type Category struct {
	ledger.Category
	// System marks Domfin's own: they can be renamed or archived, not deleted.
	System   bool
	Archived bool
}

// Categories lists the groups and every category, archived ones included,
// in the order screens show them.
func (s *Store) Categories(ctx context.Context) ([]ledger.Group, []Category, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, flow FROM category_groups ORDER BY position, name`)
	if err != nil {
		return nil, nil, err
	}
	var groups []ledger.Group
	for rows.Next() {
		var g ledger.Group
		if err := rows.Scan(&g.ID, &g.Name, &g.Flow); err != nil {
			rows.Close()
			return nil, nil, err
		}
		groups = append(groups, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	rows, err = s.db.QueryContext(ctx, `
		SELECT id, name, flow, group_id, system, archived FROM categories ORDER BY position, name`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var categories []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Flow, &c.Group, &c.System, &c.Archived); err != nil {
			return nil, nil, err
		}
		categories = append(categories, c)
	}
	return groups, categories, rows.Err()
}

// ErrNotFound means there's no such category.
var ErrNotFound = errors.New("not found")

// ErrInvalid means the change doesn't fit the ledger, like a category in a
// group of another flow.
var ErrInvalid = errors.New("invalid")

var notSlug = regexp.MustCompile(`[^a-z0-9]+`)

// AddCategory creates one of the user's categories, in a group of its flow,
// and returns it with its new ID.
func (s *Store) AddCategory(ctx context.Context, c ledger.Category) (ledger.Category, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return c, err
	}
	defer tx.Rollback()

	if err := checkGroup(ctx, tx, c.Group, c.Flow); err != nil {
		return c, err
	}
	base := strings.Trim(notSlug.ReplaceAllString(strings.ToLower(ledger.Normalize(c.Name)), "-"), "-")
	if base == "" {
		base = "category"
	}
	c.ID = base
	for n := 2; ; n++ {
		var taken bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM categories WHERE id = ?)`, c.ID).Scan(&taken); err != nil {
			return c, err
		}
		if !taken {
			break
		}
		c.ID = base + "-" + strconv.Itoa(n)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO categories (id, name, flow, group_id, position)
		VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))`,
		c.ID, c.Name, c.Flow, c.Group); err != nil {
		return c, err
	}
	return c, tx.Commit()
}

// AddGroup creates one of the user's groups for a flow, like "Pareja" for
// what goes to someone, and returns it with its new ID.
func (s *Store) AddGroup(ctx context.Context, g ledger.Group) (ledger.Group, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return g, err
	}
	defer tx.Rollback()
	base := strings.Trim(notSlug.ReplaceAllString(strings.ToLower(ledger.Normalize(g.Name)), "-"), "-")
	if base == "" {
		base = "group"
	}
	g.ID = base
	for n := 2; ; n++ {
		var taken bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM category_groups WHERE id = ?)`, g.ID).Scan(&taken); err != nil {
			return g, err
		}
		if !taken {
			break
		}
		g.ID = base + "-" + strconv.Itoa(n)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO category_groups (id, name, flow, position)
		VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM category_groups))`,
		g.ID, g.Name, g.Flow); err != nil {
		return g, err
	}
	return g, tx.Commit()
}

// RenameGroup gives a group another name; its ID, and what's filed under
// it, stay as they are.
func (s *Store) RenameGroup(ctx context.Context, id, name string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE category_groups SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return err
	}
	if n, err := result.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return ErrNotFound
	}
	return nil
}

// CategoryChange is what UpdateCategory changes; nil fields stay as they are.
type CategoryChange struct {
	Name     *string
	Group    *string
	Archived *bool
}

// UpdateCategory renames a category, moves it to another group of its flow
// or archives it. Its flow never changes: movements already filed under it
// would change sides.
func (s *Store) UpdateCategory(ctx context.Context, id string, change CategoryChange) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var flow ledger.Flow
	if err := tx.QueryRowContext(ctx, `SELECT flow FROM categories WHERE id = ?`, id).Scan(&flow); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if change.Group != nil {
		if err := checkGroup(ctx, tx, *change.Group, flow); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE categories SET group_id = ? WHERE id = ?`, *change.Group, id); err != nil {
			return err
		}
	}
	if change.Name != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE categories SET name = ? WHERE id = ?`, *change.Name, id); err != nil {
			return err
		}
	}
	if change.Archived != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE categories SET archived = ? WHERE id = ?`, *change.Archived, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func checkGroup(ctx context.Context, tx *sql.Tx, group string, flow ledger.Flow) error {
	var groupFlow ledger.Flow
	err := tx.QueryRowContext(ctx, `SELECT flow FROM category_groups WHERE id = ?`, group).Scan(&groupFlow)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && groupFlow != flow) {
		return fmt.Errorf("%w: group %q is not a %s group", ErrInvalid, group, flow)
	}
	return err
}

// ruleConditions is how a rule's conditions are kept, as JSON.
type ruleConditions struct {
	Accounts  []string         `json:"accounts,omitempty"`
	Direction ledger.Direction `json:"direction,omitempty"`
	Currency  string           `json:"currency,omitempty"`
	Contains  []string         `json:"contains,omitempty"`
	MCCs      []string         `json:"mccs,omitempty"`
	MinAmount int64            `json:"minAmount,omitempty"`
	MaxAmount int64            `json:"maxAmount,omitempty"`
	Months    []int            `json:"months,omitempty"`
}

// Rules lists the user's rules in order.
func (s *Store) Rules(ctx context.Context) ([]ledger.Rule, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, conditions, category_id, review FROM rules ORDER BY position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rules []ledger.Rule
	for rows.Next() {
		var (
			r          ledger.Rule
			id         int64
			conditions string
		)
		if err := rows.Scan(&id, &r.Name, &conditions, &r.CategoryID, &r.Review); err != nil {
			return nil, err
		}
		var c ruleConditions
		if err := json.Unmarshal([]byte(conditions), &c); err != nil {
			return nil, fmt.Errorf("rule %d: %w", id, err)
		}
		r.ID = strconv.FormatInt(id, 10)
		r.Accounts, r.Direction, r.Currency, r.Contains = c.Accounts, c.Direction, c.Currency, c.Contains
		r.MCCs, r.MinAmount, r.MaxAmount, r.Months = c.MCCs, c.MinAmount, c.MaxAmount, c.Months
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

// SetRules replaces the user's rules with these, in this order. Each needs
// a condition and an existing category.
func (s *Store) SetRules(ctx context.Context, rules []ledger.Rule) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM rules`); err != nil {
		return err
	}
	for i, r := range rules {
		if !r.HasConditions() {
			return fmt.Errorf("%w: rule %d has no conditions", ErrInvalid, i+1)
		}
		conditions, err := json.Marshal(ruleConditions{
			Accounts: r.Accounts, Direction: r.Direction, Currency: r.Currency, Contains: r.Contains,
			MCCs: r.MCCs, MinAmount: r.MinAmount, MaxAmount: r.MaxAmount, Months: r.Months,
		})
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO rules (position, name, conditions, category_id, review) VALUES (?, ?, ?, ?, ?)`,
			i, r.Name, conditions, r.CategoryID, r.Review); err != nil {
			if isForeignKey(err) {
				return fmt.Errorf("%w: rule %d: no category %q", ErrInvalid, i+1, r.CategoryID)
			}
			return err
		}
	}
	return tx.Commit()
}

const payrollKey = "payroll"

type payrollJSON struct {
	AccountID  string `json:"accountId"`
	Keyword    string `json:"keyword"`
	Days       []int  `json:"days"`
	DaysBefore int    `json:"daysBefore"`
	DaysAfter  int    `json:"daysAfter"`
}

// Payroll returns the payroll settings, or the defaults if never set.
func (s *Store) Payroll(ctx context.Context) (ledger.Payroll, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, payrollKey).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return ledger.DefaultPayroll(), nil
	}
	if err != nil {
		return ledger.Payroll{}, err
	}
	var p payrollJSON
	if err := json.Unmarshal([]byte(value), &p); err != nil {
		return ledger.Payroll{}, fmt.Errorf("payroll settings: %w", err)
	}
	return ledger.Payroll{AccountID: p.AccountID, Keyword: p.Keyword, Days: p.Days, DaysBefore: p.DaysBefore, DaysAfter: p.DaysAfter}, nil
}

// SetPayroll saves the payroll settings.
func (s *Store) SetPayroll(ctx context.Context, p ledger.Payroll) error {
	value, err := json.Marshal(payrollJSON{AccountID: p.AccountID, Keyword: p.Keyword, Days: p.Days, DaysBefore: p.DaysBefore, DaysAfter: p.DaysAfter})
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
		payrollKey, value)
	return err
}

// Overrides returns the user's corrections: movement ID to category ID.
func (s *Store) Overrides(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT movement_id, category_id FROM classifications`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	overrides := map[string]string{}
	for rows.Next() {
		var movement, category string
		if err := rows.Scan(&movement, &category); err != nil {
			return nil, err
		}
		overrides[movement] = category
	}
	return overrides, rows.Err()
}

// SetOverride files a movement under a category, over any rule; an empty
// category removes the correction.
func (s *Store) SetOverride(ctx context.Context, movementID, categoryID string) error {
	if categoryID == "" {
		_, err := s.db.ExecContext(ctx, `DELETE FROM classifications WHERE movement_id = ?`, movementID)
		return err
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO classifications (movement_id, category_id, updated_at) VALUES (?, ?, ?)
		ON CONFLICT (movement_id) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at`,
		movementID, categoryID, s.now().UTC().Format(time.RFC3339))
	if isForeignKey(err) {
		return fmt.Errorf("%w: no category %q", ErrInvalid, categoryID)
	}
	return err
}

func isForeignKey(err error) bool {
	return err != nil && strings.Contains(err.Error(), "FOREIGN KEY")
}

// Accounts lists every imported account, one per currency: a card billed in
// pesos and dollars is two.
func (s *Store) Accounts(ctx context.Context) ([]ledger.Account, error) {
	var accounts []ledger.Account
	add := func(kind ledger.AccountKind, query string) error {
		rows, err := s.db.QueryContext(ctx, query)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			a := ledger.Account{Kind: kind}
			if err := rows.Scan(&a.Institution, &a.Last4, &a.Name, &a.Currency); err != nil {
				return err
			}
			a.ID = ledger.AccountID(a.Institution, a.Kind, a.Last4, a.Currency)
			accounts = append(accounts, a)
		}
		return rows.Err()
	}
	if err := add(ledger.CreditCard, `
		SELECT DISTINCT c.institution, c.last4, c.name, ss.currency
		FROM cards c
		JOIN statements st ON st.card_id = c.id
		JOIN statement_sections ss ON ss.statement_id = st.id
		ORDER BY 1, 2, 4`); err != nil {
		return nil, err
	}
	if err := add(ledger.Loan, `SELECT institution, last4, product, currency FROM loans ORDER BY 1, 2`); err != nil {
		return nil, err
	}
	if err := add(ledger.Certificate, `SELECT institution, last4, 'Certificado', currency FROM certificates ORDER BY 1, 2`); err != nil {
		return nil, err
	}
	// Bank accounts say their own kind (savings or checking).
	rows, err := s.db.QueryContext(ctx, `SELECT institution, kind, last4, name, currency FROM bank_accounts ORDER BY 1, 3`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a ledger.Account
		var kind string
		if err := rows.Scan(&a.Institution, &kind, &a.Last4, &a.Name, &a.Currency); err != nil {
			return nil, err
		}
		a.Kind = ledger.AccountKind(kind)
		a.ID = ledger.AccountID(a.Institution, a.Kind, a.Last4, a.Currency)
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

// Movements lists the movements of every account posted from one date to
// another, both included, oldest first.
func (s *Store) Movements(ctx context.Context, from, to string) ([]ledger.Movement, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.institution, c.last4, t.currency, t.reference, st.cut_date, t.position, t.posted_on,
			t.description, t.merchant, t.mcc, t.kind, t.amount, 'card', NULL
		FROM transactions t
		JOIN cards c ON c.id = t.card_id
		JOIN statements st ON st.id = t.statement_id
		WHERE t.posted_on BETWEEN ? AND ?
		UNION ALL
		SELECT l.institution, l.last4, l.currency, m.reference, '', m.position, m.posted_on,
			m.description, '', '', m.kind, m.amount, 'loan', m.principal
		FROM loan_movements m
		JOIN loans l ON l.id = m.loan_id
		WHERE m.posted_on BETWEEN ? AND ?
		UNION ALL
		SELECT a.institution, a.last4, a.currency, '', st.cut_date, t.position, t.posted_on,
			t.description, '', '', '', t.amount, a.kind, NULL
		FROM bank_transactions t
		JOIN bank_accounts a ON a.id = t.account_id
		JOIN bank_statements st ON st.id = t.statement_id
		WHERE t.posted_on BETWEEN ? AND ?
		UNION ALL
		SELECT c.institution, c.last4, c.currency, m.reference, '', m.position, m.posted_on,
			m.description, '', '', m.kind, m.amount, 'certificate', NULL
		FROM certificate_movements m
		JOIN certificates c ON c.id = m.certificate_id
		WHERE m.posted_on BETWEEN ? AND ?
		ORDER BY 7, 1, 2, 3, 5, 6`, from, to, from, to, from, to, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var movements []ledger.Movement
	for rows.Next() {
		var (
			m                                        ledger.Movement
			institution, last4, reference, cut, kind string
			position                                 int
			source                                   string
			principal                                sql.NullInt64
		)
		if err := rows.Scan(&institution, &last4, &m.Currency, &reference, &cut, &position, &m.Date,
			&m.Description, &m.Merchant, &m.MCC, &kind, &m.Amount, &source, &principal); err != nil {
			return nil, err
		}
		if principal.Valid {
			m.Principal = &principal.Int64
		}
		accountKind := ledger.CreditCard
		switch source {
		case "loan":
			accountKind = ledger.Loan
		case "certificate":
			accountKind = ledger.Certificate
		case string(ledger.Savings), string(ledger.Checking):
			// Bank statements print no reference: their movements are
			// told apart by cut date and line, below.
			accountKind = ledger.AccountKind(source)
		}
		m.AccountID = ledger.AccountID(institution, accountKind, last4, m.Currency)
		m.Kind = ledger.Kind(kind)
		m.ID = m.AccountID + ":" + reference
		if reference == "" {
			// Unlikely, but the statement's cut date and line still tell it apart.
			m.ID = m.AccountID + ":" + cut + "#" + strconv.Itoa(position)
		}
		movements = append(movements, m)
	}
	return movements, rows.Err()
}

// Classifier loads what classifies movements: the accounts, the categories,
// the user's rules and corrections and the payroll settings.
func (s *Store) Classifier(ctx context.Context) (ledger.Classifier, error) {
	var c ledger.Classifier
	accounts, err := s.Accounts(ctx)
	if err != nil {
		return c, err
	}
	_, categories, err := s.Categories(ctx)
	if err != nil {
		return c, err
	}
	rules, err := s.Rules(ctx)
	if err != nil {
		return c, err
	}
	payroll, err := s.Payroll(ctx)
	if err != nil {
		return c, err
	}
	overrides, err := s.Overrides(ctx)
	if err != nil {
		return c, err
	}
	links, err := s.Links(ctx)
	if err != nil {
		return c, err
	}
	c.Accounts, c.Rules, c.Payroll, c.Overrides, c.Links = accounts, rules, payroll, overrides, links
	for _, category := range categories {
		c.Categories = append(c.Categories, category.Category)
	}
	return c, nil
}

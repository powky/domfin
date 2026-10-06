package store

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
)

func TestDefaultCategories(t *testing.T) {
	path := filepath.Join(t.TempDir(), "domfin.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	name := "Quincena"
	if err := s.UpdateCategory(ctx, ledger.CategorySalary, CategoryChange{Name: &name}); err != nil {
		t.Fatal(err)
	}
	s.Close()

	// Opening again adds nothing twice and keeps the new name.
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	groups, categories, err := s.Categories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != len(ledger.DefaultGroups) || len(categories) != len(ledger.DefaultCategories) {
		t.Fatalf("%d groups and %d categories", len(groups), len(categories))
	}
	if categories[0].ID != ledger.CategorySalary || categories[0].Name != "Quincena" || !categories[0].System {
		t.Errorf("first category = %+v", categories[0])
	}
}

func TestDefaultCategoriesUpgrade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "domfin.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// A database from before "Ingresos en dólares" was retired, with a
	// correction and a rule under it and a category out of place (and from
	// before the pay stubs, which came later).
	for _, q := range []string{
		`DROP TABLE payslip_lines`,
		`DROP TABLE payslips`,
		`INSERT INTO categories (id, name, flow, group_id, system, position) VALUES ('usd-income', 'Ingresos en dólares', 'income', 'other-income', 1, 6)`,
		`INSERT INTO classifications (movement_id, category_id, updated_at) VALUES ('m1', 'usd-income', '2026-07-01T00:00:00Z')`,
		`INSERT INTO rules (position, name, conditions, category_id, review) VALUES (0, 'Dólares', '{"contains":["trnfusd"]}', 'usd-income', 0)`,
		`UPDATE categories SET position = 999 WHERE id = 'profit-sharing'`,
		`PRAGMA user_version = 6`,
	} {
		if _, err := s.db.ExecContext(ctx, q); err != nil {
			t.Fatal(q, err)
		}
	}
	s.Close()

	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var moved int
	if err := s.db.QueryRowContext(ctx, `
		SELECT (SELECT COUNT(*) FROM classifications WHERE category_id = 'extra-income')
		     + (SELECT COUNT(*) FROM rules WHERE category_id = 'extra-income')`).Scan(&moved); err != nil || moved != 2 {
		t.Errorf("moved to extra income: %d, %v", moved, err)
	}
	_, categories, err := s.Categories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var got, want []string
	for _, c := range categories {
		got = append(got, c.ID)
	}
	for _, c := range ledger.DefaultCategories {
		want = append(want, c.ID)
	}
	if !slices.Equal(got, want) {
		t.Errorf("categories = %v, want %v", got, want)
	}
}

func TestAddAndUpdateCategory(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	added, err := s.AddCategory(ctx, ledger.Category{Name: "Pagos del exterior", Flow: ledger.Income, Group: "other-income"})
	if err != nil || added.ID != "pagos-del-exterior" {
		t.Fatalf("added %+v, %v", added, err)
	}
	again, err := s.AddCategory(ctx, ledger.Category{Name: "Pagos del éxterior", Flow: ledger.Income, Group: "work"})
	if err != nil || again.ID != "pagos-del-exterior-2" {
		t.Errorf("added again %+v, %v", again, err)
	}
	if _, err := s.AddCategory(ctx, ledger.Category{Name: "Mal", Flow: ledger.Income, Group: "food"}); !errors.Is(err, ErrInvalid) {
		t.Errorf("income in an expense group: %v", err)
	}

	archived, food := true, "food"
	if err := s.UpdateCategory(ctx, added.ID, CategoryChange{Archived: &archived}); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateCategory(ctx, added.ID, CategoryChange{Group: &food}); !errors.Is(err, ErrInvalid) {
		t.Errorf("moved to an expense group: %v", err)
	}
	if err := s.UpdateCategory(ctx, "nope", CategoryChange{Archived: &archived}); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing category: %v", err)
	}
	_, categories, _ := s.Categories(ctx)
	i := slices.IndexFunc(categories, func(c Category) bool { return c.ID == added.ID })
	if i < 0 || !categories[i].Archived || categories[i].System || categories[i].Group != "other-income" {
		t.Errorf("category = %+v", categories[i])
	}
}

func TestRulesPayrollAndOverrides(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()

	rules := []ledger.Rule{
		{Name: "Regalía", Contains: []string{"nomina"}, Months: []int{12}, MinAmount: 8_000_000, CategoryID: "bonus"},
		{Name: "Dólares", Accounts: []string{"popular:savings:2222:USD"}, Direction: ledger.In, CategoryID: ledger.CategoryExtraIncome, Review: true},
	}
	if err := s.SetRules(ctx, rules); err != nil {
		t.Fatal(err)
	}
	got, err := s.Rules(ctx)
	if err != nil || len(got) != 2 || got[0].Name != "Regalía" || got[0].Months[0] != 12 || got[0].MinAmount != 8_000_000 ||
		got[1].Direction != ledger.In || !got[1].Review || got[1].ID == "" {
		t.Fatalf("rules = %+v, %v", got, err)
	}
	if err := s.SetRules(ctx, []ledger.Rule{{Name: "Todo", CategoryID: "bonus"}}); !errors.Is(err, ErrInvalid) {
		t.Errorf("rule without conditions: %v", err)
	}
	if err := s.SetRules(ctx, []ledger.Rule{{Contains: []string{"x"}, CategoryID: "nope"}}); !errors.Is(err, ErrInvalid) {
		t.Errorf("rule with a missing category: %v", err)
	}
	if got, _ := s.Rules(ctx); len(got) != 2 {
		t.Errorf("a failed save changed the rules: %+v", got)
	}

	if p, err := s.Payroll(ctx); err != nil || p.Keyword != "nomina" || !slices.Equal(p.Days, []int{15, 30}) {
		t.Errorf("default payroll = %+v, %v", p, err)
	}
	payroll := ledger.Payroll{AccountID: "popular:checking:1111:DOP", Keyword: "nomina", Days: []int{14, 29}, DaysBefore: 2, DaysAfter: 2}
	if err := s.SetPayroll(ctx, payroll); err != nil {
		t.Fatal(err)
	}
	if p, err := s.Payroll(ctx); err != nil || p.AccountID != payroll.AccountID || !slices.Equal(p.Days, payroll.Days) || p.DaysAfter != 2 {
		t.Errorf("payroll = %+v, %v", p, err)
	}

	if err := s.SetOverride(ctx, "m1", "bonus"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetOverride(ctx, "m1", "one-off"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetOverride(ctx, "m2", "nope"); !errors.Is(err, ErrInvalid) {
		t.Errorf("override with a missing category: %v", err)
	}
	if overrides, _ := s.Overrides(ctx); len(overrides) != 1 || overrides["m1"] != "one-off" {
		t.Errorf("overrides = %v", overrides)
	}
	if err := s.SetOverride(ctx, "m1", ""); err != nil {
		t.Fatal(err)
	}
	if overrides, _ := s.Overrides(ctx); len(overrides) != 0 {
		t.Errorf("overrides after removing = %v", overrides)
	}
}

func TestMovements(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if _, err := s.SaveStatement(ctx, statement("2026-01-28", 100_000, 0), nil, Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveLoanHistory(ctx, history("2026-03-30", "2026-01-15", 3), nil, Source{Name: "prestamo.pdf"}); err != nil {
		t.Fatal(err)
	}

	accounts, err := s.Accounts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, a := range accounts {
		ids = append(ids, a.ID)
	}
	want := []string{"popular:credit_card:1234:DOP", "popular:credit_card:1234:USD", "popular:loan:9876:DOP"}
	if !slices.Equal(ids, want) || accounts[0].Name != "Prueba" {
		t.Fatalf("accounts = %+v", accounts)
	}

	movements, err := s.Movements(ctx, "2026-01-01", "2026-02-28")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, m := range movements {
		got = append(got, m.ID+" "+m.Date+" "+string(m.Kind))
	}
	wantMovements := []string{
		"popular:loan:9876:DOP:REF20260115 2026-01-15 disbursement",
		"popular:credit_card:1234:DOP:0570000001 2026-01-28 payment",
		"popular:credit_card:1234:DOP:10000000000000000000001 2026-01-28 purchase",
		"popular:credit_card:1234:USD:10000000000000000000002 2026-01-28 purchase",
		"popular:loan:9876:DOP:REF20260215 2026-02-15 payment",
	}
	if !slices.Equal(got, wantMovements) {
		t.Fatalf("movements:\n%v\nwant\n%v", got, wantMovements)
	}
	if movements[2].Amount != -300_000 || movements[2].MCC != "5411" || movements[1].Amount != 100_000 {
		t.Errorf("amounts: %+v", movements[1:3])
	}
	// A loan's movements say what went to capital; a card's, nothing.
	if p := movements[4].Principal; p == nil || *p != 40_000 || movements[4].Amount != 100_000 {
		t.Errorf("loan payment: principal %v of %d", p, movements[4].Amount)
	}
	if p := movements[0].Principal; p == nil || *p != 10_000_000 {
		t.Errorf("disbursement: principal %v", p)
	}
	if movements[1].Principal != nil {
		t.Errorf("card payment with a principal: %d", *movements[1].Principal)
	}

	c, err := s.Classifier(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var categories []string
	for _, class := range c.Classify(movements) {
		categories = append(categories, class.CategoryID)
	}
	wantCategories := []string{ledger.CategoryDisbursement, ledger.CategoryCardPayment, "groceries", "electronics", ledger.CategoryLoanPayments}
	if !slices.Equal(categories, wantCategories) {
		t.Errorf("categories = %v, want %v", categories, wantCategories)
	}
}

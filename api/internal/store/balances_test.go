package store

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/powky/domfin/api/internal/statements"
)

func TestAccountBalances(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	src := Source{Name: "prueba.pdf"}
	// A payroll account paid on 2026-01-17 and 18 and a month later, a card
	// cut on 2026-01-28 and 2026-03-28 (February's statement is missing), a
	// loan from January to March and a certificate opened in July.
	if _, err := s.SaveAccountStatement(ctx, accountStatement("2026-01-27", 100_000), nil, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveAccountStatement(ctx, accountStatement("2026-02-27", 4_100_000), nil, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveStatement(ctx, statement("2026-01-28", 1_000_000, 1000), nil, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveStatement(ctx, statement("2026-03-28", 2_000_000, 2500), nil, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveLoanHistory(ctx, history("2026-03-30", "2026-01-15", 3), nil, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveCertificateHistory(ctx, certificateHistory("2026-09-30"), nil, src); err != nil {
		t.Fatal(err)
	}

	balances, err := s.AccountBalances(ctx, []string{"2025-12", "2026-01", "2026-02", "2026-08"})
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, b := range balances {
		var months []string
		for _, m := range b.Months {
			if m.Balance == nil {
				months = append(months, "-")
			} else {
				months = append(months, statements.FormatAmount(*m.Balance))
			}
		}
		got = append(got, fmt.Sprintf("%s %s as of %s limit %s: %s", b.Account.ID, statements.FormatAmount(b.Balance), b.AsOf,
			statements.FormatAmount(b.CreditLimit), strings.Join(months, " ")))
	}
	slices.Sort(got)
	// A statement's previous balance is the one at the previous cut, a month
	// before: December for January's statements, and February for March's,
	// whose own previous statement is missing. Loans and certificates have
	// no balance before their first movement, and after the last one, the
	// balance carries over. January's card payment clears the 10,000.00 it
	// opened with and its purchase leaves 12,000.00 owed.
	want := []string{
		"popular:certificate:1234:DOP 101,547.60 as of 2026-09-30 limit 0.00: - - - 100,750.00",
		"popular:credit_card:1234:DOP 22,000.00 as of 2026-03-28 limit 50,000.00: 10,000.00 12,000.00 20,000.00 22,000.00",
		"popular:credit_card:1234:USD 40.00 as of 2026-03-28 limit 1,000.00: 10.00 25.00 25.00 40.00",
		"popular:loan:9876:DOP 99,200.00 as of 2026-03-30 limit 0.00: - 100,000.00 99,600.00 99,200.00",
		"popular:savings:1234:DOP 81,000.00 as of 2026-02-27 limit 0.00: 1,000.00 41,000.00 81,000.00 81,000.00",
	}
	if !slices.Equal(got, want) {
		t.Errorf("balances:\n got %q\nwant %q", got, want)
	}
}

func TestPreviousCut(t *testing.T) {
	for cut, want := range map[string]string{
		"2026-01-28": "2025-12-28",
		"2026-03-31": "2026-02-28",
		"2026-03-08": "2026-02-08",
	} {
		if got := previousCut(cut); got != want {
			t.Errorf("previousCut(%s) = %s, want %s", cut, got, want)
		}
	}
}

package store

import (
	"context"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
)

func certificateHistory(asOf string) statements.CertificateHistory {
	h := statements.CertificateHistory{Institution: "popular", Last4: "1234", Currency: "DOP", AsOf: day(asOf), Rate: 9.5, Matures: day("2026-10-22")}
	balance := int64(0)
	for _, m := range []struct {
		date, code string
		amount     int64
	}{{"2026-07-22", "87", 10_000_000}, {"2026-08-22", "20", 83_333}, {"2026-08-22", "06", -8_333}, {"2026-09-22", "20", 79_760}} {
		if m.date > asOf {
			break
		}
		balance += m.amount
		h.Movements = append(h.Movements, statements.CertificateMovement{
			EffectiveOn: day(m.date), PostedOn: day(m.date), Code: m.code, Description: "MOVIMIENTO " + m.code,
			Amount: m.amount, Balance: balance,
		})
	}
	return h
}

func TestSaveCertificateHistory(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	august := certificateHistory("2026-08-30")
	for i, want := range []Outcome{Added, Unchanged} {
		if got, err := s.SaveCertificateHistory(ctx, august, nil, Source{Name: "agosto.pdf"}); err != nil || got != want {
			t.Fatalf("save %d = %s, %v; want %s", i+1, got, err, want)
		}
	}
	// A later history repeats August's movements and adds September's.
	if got, err := s.SaveCertificateHistory(ctx, certificateHistory("2026-09-30"), nil, Source{Name: "septiembre.pdf"}); err != nil || got != Added {
		t.Fatalf("later history = %s, %v", got, err)
	}

	accounts, err := s.Coverage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 1 || accounts[0].Account.Kind != Certificate {
		t.Fatalf("coverage = %+v", accounts)
	}
	var months []string
	for _, m := range accounts[0].Months {
		months = append(months, m.Month+" "+m.Status())
	}
	if want := []string{"2026-07 ok", "2026-08 ok", "2026-09 ok"}; !slices.Equal(months, want) {
		t.Errorf("months = %q, want %q", months, want)
	}

	ledgerAccounts, err := s.Accounts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := ledger.Account{ID: "popular:certificate:1234:DOP", Institution: "popular", Kind: ledger.Certificate, Name: "Certificado", Last4: "1234", Currency: "DOP"}
	if !slices.Contains(ledgerAccounts, want) {
		t.Errorf("ledger accounts = %+v", ledgerAccounts)
	}
	movements, err := s.Movements(ctx, "2026-01-01", "2026-12-31")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, m := range movements {
		got = append(got, m.ID+" "+string(m.Kind)+" "+statements.FormatAmount(m.Amount))
	}
	wantMovements := []string{
		"popular:certificate:1234:DOP:2026-07-22/87 deposit 100,000.00",
		"popular:certificate:1234:DOP:2026-08-22/06 withholding -83.33",
		"popular:certificate:1234:DOP:2026-08-22/20 interest_earned 833.33",
		"popular:certificate:1234:DOP:2026-09-22/20 interest_earned 797.60",
	}
	slices.Sort(got)
	if !slices.Equal(got, wantMovements) {
		t.Errorf("movements:\n got %q\nwant %q", got, wantMovements)
	}
}

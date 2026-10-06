package main

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/store"
)

func TestDemo(t *testing.T) {
	t.Setenv("DOMFIN_DATA_DIR", t.TempDir())
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	if err := run(now); err != nil {
		t.Fatal(err)
	}
	// Never over a database that's there.
	if err := run(now); err == nil {
		t.Error("ran over an existing database")
	}

	db, err := store.Open(store.DefaultPath())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	classifier, err := db.Classifier(ctx)
	if err != nil {
		t.Fatal(err)
	}
	movements, err := db.Movements(ctx, "2025-01-01", "2026-09-30")
	if err != nil {
		t.Fatal(err)
	}
	uncategorized := 0
	for _, c := range classifier.Classify(movements) {
		if c.CategoryID == "" {
			uncategorized++
		}
	}
	if len(movements) < 800 || uncategorized > len(movements)/50 {
		t.Errorf("%d movements, %d uncategorized", len(movements), uncategorized)
	}

	// This year's pay stubs: two a month and the March bonus, each net a
	// payroll credit that's already in the ledger (they add no movements).
	slips, err := db.Payslips(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(slips) != 2*9+1 {
		t.Errorf("%d pay stubs, want 19", len(slips))
	}
	credits := map[string]int{}
	for _, m := range movements {
		if m.Amount > 0 && m.Description == "CREDITO NOMINA" {
			credits[m.Date+"/"+fmt.Sprint(m.Amount)]++
		}
	}
	for _, slip := range slips {
		if credits[slip.PaidOn.Format(time.DateOnly)+"/"+fmt.Sprint(slip.Net)] != 1 || slip.Income()-slip.Deductions() != slip.Net {
			t.Errorf("stub of %s: net %d has no credit, or doesn't add up", slip.PaidOn.Format(time.DateOnly), slip.Net)
		}
	}

	// Every month of every account checks out.
	coverage, err := db.Coverage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, account := range coverage {
		for _, month := range account.Months {
			if status := month.Status(); status != "ok" {
				t.Errorf("%s %s: %s %+v", account.Account.Last4, month.Month, status, month)
			}
		}
	}
}

package main

import (
	"context"
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

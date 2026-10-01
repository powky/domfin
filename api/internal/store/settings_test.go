package store

import (
	"context"
	"testing"
)

func TestStatementsPassword(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if got, err := s.StatementsPassword(ctx); err != nil || got != "" {
		t.Fatalf("before saving: %q, %v", got, err)
	}
	for _, password := range []string{"clave de prueba", "otra 'clave' #2"} {
		if err := s.SetStatementsPassword(ctx, password); err != nil {
			t.Fatal(err)
		}
		if got, _ := s.StatementsPassword(ctx); got != password {
			t.Errorf("saved %q, read %q", password, got)
		}
	}
	if err := s.SetStatementsPassword(ctx, ""); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.StatementsPassword(ctx); got != "" {
		t.Errorf("after forgetting it: %q", got)
	}
}

package books

import (
	"slices"
	"testing"
)

func TestBudget(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)

	var empty budgetJSON
	if w := do(t, h, "GET", "/ledger/budget", "", &empty); w.Code != 200 || len(empty.Items) != 0 || len(empty.Dismissed) != 0 || empty.Income != nil {
		t.Fatalf("before saving: %d %+v", w.Code, empty)
	}
	if w := do(t, h, "GET", "/ledger/budget", "", nil); w.Body.String() != "{\"items\":[],\"dismissed\":[]}\n" {
		t.Errorf("empty lists, not null: %s", w.Body)
	}

	var saved budgetJSON
	w := do(t, h, "PUT", "/ledger/budget", `{
		"items": [
			{"name": "  Claro ", "match": "PAG CLARO", "categoryId": "telecom", "amount": 245000, "currency": "DOP", "day": 3},
			{"id": "claro", "name": "Otro Claro", "amount": 100, "currency": "DOP"},
			{"name": "Netflix", "match": "NETFLIX COM", "accountId": "popular:credit_card:5678:USD", "amount": 1549, "currency": "USD", "day": 28},
			{"name": "Empleada", "amount": 1200000, "currency": "DOP"}
		],
		"dismissed": ["SUPERMERCADO", " SUPERMERCADO ", ""],
		"income": {"amount": 11700000, "currency": "DOP"}
	}`, &saved)
	if w.Code != 200 {
		t.Fatalf("saving: %d %s", w.Code, w.Body)
	}
	ids := []string{}
	for _, item := range saved.Items {
		ids = append(ids, item.ID)
	}
	// The ID a fixed cost brings stays; the rest come from their names, after it.
	if want := []string{"claro-2", "claro", "netflix", "empleada"}; !slices.Equal(ids, want) {
		t.Errorf("ids %v, want %v", ids, want)
	}
	if saved.Items[0].Name != "Claro" || saved.Items[0].Day != 3 || saved.Items[2].Currency != "USD" ||
		saved.Items[2].AccountID != "popular:credit_card:5678:USD" {
		t.Errorf("items: %+v", saved.Items)
	}
	if !slices.Equal(saved.Dismissed, []string{"SUPERMERCADO"}) {
		t.Errorf("dismissed: %v", saved.Dismissed)
	}
	if saved.Income == nil || saved.Income.Amount != 11700000 {
		t.Errorf("income: %+v", saved.Income)
	}

	var read budgetJSON
	do(t, h, "GET", "/ledger/budget", "", &read)
	if len(read.Items) != 4 || read.Items[3].Name != "Empleada" || read.Income == nil {
		t.Errorf("read back: %+v", read)
	}

	// Without income, it's planned with the salary again.
	var cleared budgetJSON
	do(t, h, "PUT", "/ledger/budget", `{"items": [], "dismissed": []}`, &cleared)
	if cleared.Income != nil || len(cleared.Items) != 0 {
		t.Errorf("cleared: %+v", cleared)
	}
}

func TestBudgetRejects(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	for name, body := range map[string]string{
		"no name":       `{"items": [{"name": " ", "amount": 100, "currency": "DOP"}], "dismissed": []}`,
		"no amount":     `{"items": [{"name": "Claro", "amount": 0, "currency": "DOP"}], "dismissed": []}`,
		"currency":      `{"items": [{"name": "Claro", "amount": 100, "currency": "EUR"}], "dismissed": []}`,
		"day":           `{"items": [{"name": "Claro", "amount": 100, "currency": "DOP", "day": 32}], "dismissed": []}`,
		"repeated id":   `{"items": [{"id": "a", "name": "A", "amount": 1, "currency": "DOP"}, {"id": "a", "name": "B", "amount": 1, "currency": "DOP"}], "dismissed": []}`,
		"income":        `{"items": [], "dismissed": [], "income": {"amount": -5, "currency": "DOP"}}`,
		"unknown field": `{"items": [], "dismissed": [], "extra": true}`,
	} {
		if w := do(t, h, "PUT", "/ledger/budget", body, nil); w.Code != 400 {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
	var read budgetJSON
	if do(t, h, "GET", "/ledger/budget", "", &read); len(read.Items) != 0 {
		t.Errorf("a rejected budget was saved: %+v", read)
	}
}

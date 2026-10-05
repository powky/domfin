package books

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/powky/domfin/api/internal/assets"
)

// budgetKey is the setting that keeps the monthly budget.
const budgetKey = "budget"

// Limits of what a budget keeps, so a mistaken request can't grow it
// without end.
const (
	maxFixedCosts = 200
	maxDismissed  = 1000
	maxText       = 200
	maxName       = 100
	// maxBudgetAmount is a trillion pesos (or dollars), in cents.
	maxBudgetAmount = 100_000_000_000_000
)

// fixedCostJSON is something paid every month that the user put in their
// budget, usually from a suggestion: the app finds the payments that repeat
// month after month and matches them to it by Match.
type fixedCostJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Match is who the app groups its payments by (the payee, as it
	// normalizes it, like "PAG CLARO"); empty for one added by hand, which
	// no movement pays.
	Match      string `json:"match,omitempty"`
	CategoryID string `json:"categoryId,omitempty"`
	// AccountID is the account it's paid from, whose statements say whether
	// it's been paid yet; empty for one added by hand.
	AccountID string `json:"accountId,omitempty"`
	// Amount is what it costs a month, in cents of Currency.
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	// Day is the day of the month it's usually paid; 0 when it doesn't matter.
	Day int `json:"day,omitempty"`
}

type moneyJSON struct {
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
}

// budgetJSON is the monthly budget: the fixed costs, the suggestions the
// user turned down (by Match) and the income the month is planned with, when
// they set one (without it the app estimates it from the salary).
type budgetJSON struct {
	Items     []fixedCostJSON `json:"items"`
	Dismissed []string        `json:"dismissed"`
	Income    *moneyJSON      `json:"income,omitempty"`
}

func (b *books) serveBudget(w http.ResponseWriter, r *http.Request) {
	budget, err := b.budget(r.Context())
	if err != nil {
		log.Printf("presupuesto: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	writeJSON(w, http.StatusOK, budget)
}

func (b *books) budget(ctx context.Context) (budgetJSON, error) {
	var budget budgetJSON
	if _, err := b.store.Setting(ctx, budgetKey, &budget); err != nil {
		return budgetJSON{}, err
	}
	if budget.Items == nil {
		budget.Items = []fixedCostJSON{}
	}
	if budget.Dismissed == nil {
		budget.Dismissed = []string{}
	}
	return budget, nil
}

// setBudget replaces the whole budget, like the rules: the app sends it back
// with each change.
func (b *books) setBudget(w http.ResponseWriter, r *http.Request) {
	var body budgetJSON
	if !readJSON(w, r, &body) {
		return
	}
	budget, err := cleanBudget(body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_budget", "detail": err.Error()})
		return
	}
	if b.ok(w, b.store.SetSetting(r.Context(), budgetKey, budget)) {
		writeJSON(w, http.StatusOK, budget)
	}
}

// cleanBudget checks a budget and tidies it: trims the texts, gives an ID to
// each fixed cost that comes without one and drops repeated dismissals.
func cleanBudget(in budgetJSON) (budgetJSON, error) {
	if len(in.Items) > maxFixedCosts {
		return budgetJSON{}, fmt.Errorf("más de %d gastos fijos", maxFixedCosts)
	}
	if len(in.Dismissed) > maxDismissed {
		return budgetJSON{}, fmt.Errorf("más de %d sugerencias descartadas", maxDismissed)
	}
	out := budgetJSON{Items: []fixedCostJSON{}, Dismissed: []string{}}
	ids := map[string]bool{}
	for _, item := range in.Items {
		item.ID = strings.TrimSpace(item.ID)
		item.Name = strings.TrimSpace(item.Name)
		item.Match = strings.TrimSpace(item.Match)
		item.CategoryID = strings.TrimSpace(item.CategoryID)
		item.AccountID = strings.TrimSpace(item.AccountID)
		switch {
		case item.Name == "" || utf8.RuneCountInString(item.Name) > maxName:
			return budgetJSON{}, fmt.Errorf("un gasto fijo necesita un nombre de hasta %d caracteres", maxName)
		case len(item.Match) > maxText || len(item.CategoryID) > maxText || len(item.AccountID) > maxText || len(item.ID) > maxText:
			return budgetJSON{}, fmt.Errorf("%s: texto demasiado largo", item.Name)
		case item.Amount <= 0 || item.Amount > maxBudgetAmount:
			return budgetJSON{}, fmt.Errorf("%s: el monto tiene que ser mayor que cero", item.Name)
		case !knownCurrency(item.Currency):
			return budgetJSON{}, fmt.Errorf("%s: moneda %q", item.Name, item.Currency)
		case item.Day < 0 || item.Day > 31:
			return budgetJSON{}, fmt.Errorf("%s: día %d", item.Name, item.Day)
		case item.ID != "" && ids[item.ID]:
			return budgetJSON{}, fmt.Errorf("id repetido: %s", item.ID)
		}
		if item.ID != "" {
			ids[item.ID] = true
		}
		out.Items = append(out.Items, item)
	}
	// New ones get an ID from their name, after the ones already taken.
	for i, item := range out.Items {
		if item.ID == "" {
			out.Items[i].ID = freeID(assets.Slug(item.Name), ids)
			ids[out.Items[i].ID] = true
		}
	}
	for _, match := range in.Dismissed {
		match = strings.TrimSpace(match)
		if len(match) > maxText {
			return budgetJSON{}, fmt.Errorf("sugerencia descartada demasiado larga")
		}
		if match != "" && !slices.Contains(out.Dismissed, match) {
			out.Dismissed = append(out.Dismissed, match)
		}
	}
	if in.Income != nil {
		if in.Income.Amount <= 0 || in.Income.Amount > maxBudgetAmount || !knownCurrency(in.Income.Currency) {
			return budgetJSON{}, fmt.Errorf("ingreso del mes inválido")
		}
		income := *in.Income
		out.Income = &income
	}
	return out, nil
}

func knownCurrency(currency string) bool { return currency == "DOP" || currency == "USD" }

// freeID is base, or base-2, base-3… when it's taken; "gasto" for a name
// without letters or digits.
func freeID(base string, taken map[string]bool) string {
	if base == "" {
		base = "gasto"
	}
	id := base
	for n := 2; taken[id]; n++ {
		id = fmt.Sprintf("%s-%d", base, n)
	}
	return id
}

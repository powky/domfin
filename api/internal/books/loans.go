package books

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
)

// loansKey is the setting that keeps what the user told about their loans.
const loansKey = "loans"

// Limits of what the loans' plans keep, so a mistaken request can't grow
// them without end.
const (
	maxLoanPlans = 100
	// maxRate is 100% a year: no loan charges that, so more is a typo.
	maxRate = 1.0
)

// loanPlanJSON is what the user told about a loan that its history doesn't
// print: the annual interest rate and the monthly installment, and how much
// of each installment someone else pays (an employer that subsidizes it).
// With them the app works out when the loan ends and what it costs.
type loanPlanJSON struct {
	// Rate is the annual interest rate: 0.125 is 12.5%.
	Rate float64 `json:"rate"`
	// Installment is what's paid each month, capital and interest, in cents
	// of the loan's currency.
	Installment int64 `json:"installment"`
	// Subsidy is how much of each installment someone else pays, in cents;
	// 0 when you pay it all.
	Subsidy int64 `json:"subsidy,omitempty"`
}

// loansJSON is each loan's plan by its account's ID: "popular:loan:1234:DOP",
// or "asset:…" for a debt outside the bank.
type loansJSON struct {
	Plans map[string]loanPlanJSON `json:"plans"`
}

func (b *books) serveLoans(w http.ResponseWriter, r *http.Request) {
	loans, err := b.loans(r.Context())
	if err != nil {
		log.Printf("préstamos: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	writeJSON(w, http.StatusOK, loans)
}

func (b *books) loans(ctx context.Context) (loansJSON, error) {
	var loans loansJSON
	if _, err := b.store.Setting(ctx, loansKey, &loans); err != nil {
		return loansJSON{}, err
	}
	if loans.Plans == nil {
		loans.Plans = map[string]loanPlanJSON{}
	}
	return loans, nil
}

// setLoans replaces every plan, like the budget: the app sends them back
// with each change.
func (b *books) setLoans(w http.ResponseWriter, r *http.Request) {
	var body loansJSON
	if !readJSON(w, r, &body) {
		return
	}
	loans, err := cleanLoans(body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_loans", "detail": err.Error()})
		return
	}
	if b.ok(w, b.store.SetSetting(r.Context(), loansKey, loans)) {
		writeJSON(w, http.StatusOK, loans)
	}
}

// cleanLoans checks the plans: a rate from 0 up to 100% a year, an
// installment above zero and a subsidy no bigger than it.
func cleanLoans(in loansJSON) (loansJSON, error) {
	if len(in.Plans) > maxLoanPlans {
		return loansJSON{}, fmt.Errorf("más de %d préstamos", maxLoanPlans)
	}
	out := loansJSON{Plans: map[string]loanPlanJSON{}}
	for id, plan := range in.Plans {
		id = strings.TrimSpace(id)
		switch {
		case id == "" || len(id) > maxText:
			return loansJSON{}, fmt.Errorf("un préstamo necesita el id de su cuenta")
		case math.IsNaN(plan.Rate) || plan.Rate < 0 || plan.Rate >= maxRate:
			return loansJSON{}, fmt.Errorf("%s: la tasa va de 0 a 100%% al año", id)
		case plan.Installment <= 0 || plan.Installment > maxBudgetAmount:
			return loansJSON{}, fmt.Errorf("%s: la cuota tiene que ser mayor que cero", id)
		case plan.Subsidy < 0 || plan.Subsidy > plan.Installment:
			return loansJSON{}, fmt.Errorf("%s: lo que paga otro no puede pasar de la cuota", id)
		}
		out.Plans[id] = plan
	}
	return out, nil
}

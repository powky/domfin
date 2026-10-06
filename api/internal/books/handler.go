// Package books serves Domfin's ledger over HTTP: every account's movements,
// already classified, what classifies them (the categories, the user's
// rules and corrections, and the payroll settings) and the assets they pay
// into. docs/modelo-de-datos.md
// explains the model.
package books

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/localonly"
	"github.com/powky/domfin/api/internal/store"
)

// margin widens the movements read around the range asked for, so a
// transfer or a payday at its edges still finds its other side.
const margin = 10

// The Dominican Republic keeps UTC−4 all year.
var santoDomingo = time.FixedZone("AST", -4*60*60)

// Handler serves the ledger endpoints:
//
//	GET   /ledger/movements?from=&to=  movements posted in the range, classified, newest first
//	GET   /ledger/categories           groups and categories
//	POST  /ledger/categories           adds a category
//	PATCH /ledger/categories/{id}      renames, moves or archives a category
//	POST  /ledger/groups               adds a group of income or expense categories
//	PATCH /ledger/groups/{id}          renames a group
//	GET   /ledger/rules                the user's rules, in order
//	PUT   /ledger/rules                replaces them
//	GET   /ledger/payroll              how the salary is told apart
//	PUT   /ledger/payroll              changes it
//	PUT   /ledger/classifications      files a movement under a category, or undoes it
//	GET   /ledger/assets               assets (a home bought off-plan, shares, a pension fund) and debts, with what was paid into them
//	POST  /ledger/assets               adds one
//	PUT   /ledger/assets/{id}          changes one
//	DELETE /ledger/assets/{id}         removes one
//	PUT   /ledger/assets/links         links movements to an asset, or unlinks them
//	GET   /ledger/budget               the monthly budget: fixed costs, dismissed suggestions, planned income
//	PUT   /ledger/budget               replaces it
//	GET   /ledger/loans                each loan's rate, installment and what someone else pays of it
//	PUT   /ledger/loans                replaces them
//	GET   /ledger/payslips             the imported pay stubs, concept by concept
//	GET   /ledger/salary               salaries set by hand, the day the job started and the extra payments
//	PUT   /ledger/salary               replaces them
//
// Like the statement endpoints, they only answer this computer and pages
// served from localhost. convert expresses a movement in an asset's
// currency at the rate of its date; rateOn gives the BCRD's buy and sell
// rates of a day, to value each movement in pesos and dollars (nil leaves
// them out).
func Handler(s *store.Store, convert store.Converter, rateOn assets.RateOn) http.Handler {
	b := &books{store: s, convert: convert, rateOn: rateOn}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ledger/movements", b.serveMovements)
	mux.HandleFunc("GET /ledger/categories", b.serveCategories)
	mux.HandleFunc("POST /ledger/categories", b.addCategory)
	mux.HandleFunc("PATCH /ledger/categories/{id}", b.updateCategory)
	mux.HandleFunc("POST /ledger/groups", b.addGroup)
	mux.HandleFunc("PATCH /ledger/groups/{id}", b.renameGroup)
	mux.HandleFunc("GET /ledger/rules", b.serveRules)
	mux.HandleFunc("PUT /ledger/rules", b.setRules)
	mux.HandleFunc("GET /ledger/payroll", b.servePayroll)
	mux.HandleFunc("PUT /ledger/payroll", b.setPayroll)
	mux.HandleFunc("PUT /ledger/classifications", b.classify)
	mux.HandleFunc("GET /ledger/assets", b.serveAssets)
	mux.HandleFunc("POST /ledger/assets", b.addAsset)
	mux.HandleFunc("PUT /ledger/assets/links", b.linkAssets)
	mux.HandleFunc("PUT /ledger/assets/{id}", b.updateAsset)
	mux.HandleFunc("DELETE /ledger/assets/{id}", b.deleteAsset)
	mux.HandleFunc("GET /ledger/budget", b.serveBudget)
	mux.HandleFunc("PUT /ledger/budget", b.setBudget)
	mux.HandleFunc("GET /ledger/loans", b.serveLoans)
	mux.HandleFunc("PUT /ledger/loans", b.setLoans)
	mux.HandleFunc("GET /ledger/payslips", b.servePayslips)
	mux.HandleFunc("GET /ledger/salary", b.serveSalary)
	mux.HandleFunc("PUT /ledger/salary", b.setSalary)
	return localonly.Handler(b.withStore(mux))
}

type books struct {
	store   *store.Store
	convert store.Converter
	rateOn  assets.RateOn
}

func (b *books) withStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if b.store == nil {
			writeError(w, http.StatusServiceUnavailable, "store_unavailable")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type accountJSON struct {
	ID          string `json:"id"`
	Institution string `json:"institution"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	Last4       string `json:"last4"`
	Currency    string `json:"currency"`
}

type movementJSON struct {
	ID          string `json:"id"`
	AccountID   string `json:"accountId"`
	Date        string `json:"date"`
	Description string `json:"description"`
	Merchant    string `json:"merchant,omitempty"`
	MCC         string `json:"mcc,omitempty"`
	Kind        string `json:"kind,omitempty"`
	// Amount in cents: positive comes into the account, negative goes out.
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	// Amounts is the movement in pesos and in dollars, in cents, at the
	// BCRD rate of its date (see valued); absent without one.
	Amounts map[string]int64 `json:"amounts,omitempty"`
	Flow    string           `json:"flow"`
	// CategoryID is null for Sin categoría.
	CategoryID *string `json:"categoryId"`
	By         string  `json:"by"`
	RuleID     string  `json:"ruleId,omitempty"`
	Review     bool    `json:"review"`
	PairID     string  `json:"pairId,omitempty"`
	AssetID    string  `json:"assetId,omitempty"`
	// Principal is what a loan's movement moved its balance: of a payment,
	// the capital (the rest was interest and charges). Absent otherwise.
	Principal *int64 `json:"principal,omitempty"`
}

type movementsResponse struct {
	From      string         `json:"from"`
	To        string         `json:"to"`
	Accounts  []accountJSON  `json:"accounts"`
	Movements []movementJSON `json:"movements"`
}

func (b *books) serveMovements(w http.ResponseWriter, r *http.Request) {
	from, to, ok := dateRange(r.URL.Query(), time.Now().In(santoDomingo))
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_range")
		return
	}
	ctx := r.Context()
	classifier, err := b.store.Classifier(ctx)
	if err != nil {
		log.Printf("clasificador: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	movements, err := b.store.Movements(ctx, day(from.AddDate(0, 0, -margin)), day(to.AddDate(0, 0, margin)))
	if err != nil {
		log.Printf("movimientos: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	classes := classifier.Classify(movements)

	body := movementsResponse{From: day(from), To: day(to), Accounts: []accountJSON{}, Movements: []movementJSON{}}
	for _, a := range classifier.Accounts {
		body.Accounts = append(body.Accounts, accountJSON{a.ID, a.Institution, string(a.Kind), a.Name, a.Last4, a.Currency})
	}
	rates := &dayRates{rateOn: b.rateOn, seen: map[string][2]float64{}}
	for i := len(movements) - 1; i >= 0; i-- {
		m, c := movements[i], classes[i]
		if m.Date < body.From || m.Date > body.To {
			continue
		}
		var category *string
		if c.CategoryID != "" {
			category = &c.CategoryID
		}
		body.Movements = append(body.Movements, movementJSON{
			ID: m.ID, AccountID: m.AccountID, Date: m.Date, Description: m.Description, Merchant: m.Merchant,
			MCC: m.MCC, Kind: string(m.Kind), Amount: m.Amount, Currency: m.Currency, Amounts: rates.value(ctx, m, c.Flow),
			Flow:       string(c.Flow),
			CategoryID: category, By: string(c.By), RuleID: c.RuleID, Review: c.Review, PairID: c.PairID, AssetID: c.AssetID,
			Principal: m.Principal,
		})
	}
	writeJSON(w, http.StatusOK, body)
}

// dateRange reads from and to (YYYY-MM-DD, both included); by default the
// year so far.
func dateRange(query url.Values, now time.Time) (from, to time.Time, ok bool) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	from, to = time.Date(today.Year(), 1, 1, 0, 0, 0, 0, time.UTC), today
	var err error
	if s := query.Get("from"); s != "" {
		if from, err = time.Parse(time.DateOnly, s); err != nil {
			return from, to, false
		}
	}
	if s := query.Get("to"); s != "" {
		if to, err = time.Parse(time.DateOnly, s); err != nil {
			return from, to, false
		}
	}
	return from, to, !to.Before(from)
}

func day(t time.Time) string { return t.Format(time.DateOnly) }

type groupJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Flow string `json:"flow"`
}

type categoryJSON struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Flow     string `json:"flow"`
	Group    string `json:"group"`
	System   bool   `json:"system"`
	Archived bool   `json:"archived"`
}

type categoriesResponse struct {
	Groups     []groupJSON    `json:"groups"`
	Categories []categoryJSON `json:"categories"`
}

func (b *books) serveCategories(w http.ResponseWriter, r *http.Request) {
	groups, categories, err := b.store.Categories(r.Context())
	if err != nil {
		log.Printf("categorías: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	body := categoriesResponse{Groups: []groupJSON{}, Categories: []categoryJSON{}}
	for _, g := range groups {
		body.Groups = append(body.Groups, groupJSON{g.ID, g.Name, string(g.Flow)})
	}
	for _, c := range categories {
		body.Categories = append(body.Categories, toCategoryJSON(c))
	}
	writeJSON(w, http.StatusOK, body)
}

func toCategoryJSON(c store.Category) categoryJSON {
	return categoryJSON{c.ID, c.Name, string(c.Flow), c.Group, c.System, c.Archived}
}

// defaultGroup is where a new category goes when no group is given.
var defaultGroup = map[ledger.Flow]string{
	ledger.Income:   "other-income",
	ledger.Expense:  "other-expenses",
	ledger.Transfer: "transfers",
}

func (b *books) addCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  string `json:"name"`
		Flow  string `json:"flow"`
		Group string `json:"group"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	flow := ledger.Flow(body.Flow)
	name := strings.TrimSpace(body.Name)
	if _, known := defaultGroup[flow]; !known || name == "" {
		writeError(w, http.StatusBadRequest, "bad_category")
		return
	}
	if body.Group == "" {
		body.Group = defaultGroup[flow]
	}
	added, err := b.store.AddCategory(r.Context(), ledger.Category{Name: name, Flow: flow, Group: body.Group})
	if !b.ok(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, toCategoryJSON(store.Category{Category: added}))
}

func (b *books) addGroup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Flow string `json:"flow"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	flow := ledger.Flow(body.Flow)
	name := strings.TrimSpace(body.Name)
	if _, known := defaultGroup[flow]; !known || name == "" || flow == ledger.Transfer {
		writeError(w, http.StatusBadRequest, "bad_group")
		return
	}
	added, err := b.store.AddGroup(r.Context(), ledger.Group{Name: name, Flow: flow})
	if b.ok(w, err) {
		writeJSON(w, http.StatusCreated, groupJSON{added.ID, added.Name, string(added.Flow)})
	}
}

func (b *books) renameGroup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "bad_group")
		return
	}
	if b.ok(w, b.store.RenameGroup(r.Context(), r.PathValue("id"), name)) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (b *books) updateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     *string `json:"name"`
		Group    *string `json:"group"`
		Archived *bool   `json:"archived"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "bad_category")
			return
		}
		body.Name = &name
	}
	err := b.store.UpdateCategory(r.Context(), r.PathValue("id"), store.CategoryChange{Name: body.Name, Group: body.Group, Archived: body.Archived})
	if b.ok(w, err) {
		w.WriteHeader(http.StatusNoContent)
	}
}

type ruleJSON struct {
	ID         string   `json:"id,omitempty"`
	Name       string   `json:"name"`
	Accounts   []string `json:"accounts,omitempty"`
	Direction  string   `json:"direction,omitempty"`
	Currency   string   `json:"currency,omitempty"`
	Contains   []string `json:"contains,omitempty"`
	MCCs       []string `json:"mccs,omitempty"`
	MinAmount  int64    `json:"minAmount,omitempty"`
	MaxAmount  int64    `json:"maxAmount,omitempty"`
	Months     []int    `json:"months,omitempty"`
	CategoryID string   `json:"categoryId"`
	Review     bool     `json:"review"`
}

type rulesBody struct {
	Rules []ruleJSON `json:"rules"`
}

func (b *books) serveRules(w http.ResponseWriter, r *http.Request) {
	rules, err := b.store.Rules(r.Context())
	if err != nil {
		log.Printf("reglas: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	body := rulesBody{Rules: []ruleJSON{}}
	for _, rule := range rules {
		body.Rules = append(body.Rules, ruleJSON{
			ID: rule.ID, Name: rule.Name, Accounts: rule.Accounts, Direction: string(rule.Direction), Currency: rule.Currency,
			Contains: rule.Contains, MCCs: rule.MCCs, MinAmount: rule.MinAmount, MaxAmount: rule.MaxAmount,
			Months: rule.Months, CategoryID: rule.CategoryID, Review: rule.Review,
		})
	}
	writeJSON(w, http.StatusOK, body)
}

func (b *books) setRules(w http.ResponseWriter, r *http.Request) {
	var body rulesBody
	if !readJSON(w, r, &body) {
		return
	}
	rules := make([]ledger.Rule, len(body.Rules))
	for i, rule := range body.Rules {
		direction := ledger.Direction(rule.Direction)
		if direction != "" && direction != ledger.In && direction != ledger.Out ||
			rule.MinAmount < 0 || rule.MaxAmount < 0 ||
			slices.ContainsFunc(rule.Months, func(month int) bool { return month < 1 || month > 12 }) {
			writeError(w, http.StatusBadRequest, "bad_rule")
			return
		}
		rules[i] = ledger.Rule{
			Name: strings.TrimSpace(rule.Name), Accounts: rule.Accounts, Direction: direction, Currency: rule.Currency,
			Contains: rule.Contains, MCCs: rule.MCCs, MinAmount: rule.MinAmount, MaxAmount: rule.MaxAmount,
			Months: rule.Months, CategoryID: rule.CategoryID, Review: rule.Review,
		}
	}
	if b.ok(w, b.store.SetRules(r.Context(), rules)) {
		b.serveRules(w, r)
	}
}

type payrollJSON struct {
	AccountID  string `json:"accountId"`
	Keyword    string `json:"keyword"`
	Days       []int  `json:"days"`
	DaysBefore int    `json:"daysBefore"`
	DaysAfter  int    `json:"daysAfter"`
}

func (b *books) servePayroll(w http.ResponseWriter, r *http.Request) {
	p, err := b.store.Payroll(r.Context())
	if err != nil {
		log.Printf("nómina: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
		return
	}
	if p.Days == nil {
		p.Days = []int{}
	}
	writeJSON(w, http.StatusOK, payrollJSON{p.AccountID, p.Keyword, p.Days, p.DaysBefore, p.DaysAfter})
}

func (b *books) setPayroll(w http.ResponseWriter, r *http.Request) {
	var body payrollJSON
	if !readJSON(w, r, &body) {
		return
	}
	if body.DaysBefore < 0 || body.DaysBefore > 10 || body.DaysAfter < 0 || body.DaysAfter > 10 ||
		slices.ContainsFunc(body.Days, func(day int) bool { return day < 1 || day > 31 }) {
		writeError(w, http.StatusBadRequest, "bad_payroll")
		return
	}
	days := slices.Sorted(slices.Values(body.Days))
	p := ledger.Payroll{AccountID: body.AccountID, Keyword: strings.TrimSpace(body.Keyword), Days: slices.Compact(days),
		DaysBefore: body.DaysBefore, DaysAfter: body.DaysAfter}
	if b.ok(w, b.store.SetPayroll(r.Context(), p)) {
		b.servePayroll(w, r)
	}
}

func (b *books) classify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MovementID string `json:"movementId"`
		// Null undoes the correction.
		CategoryID *string `json:"categoryId"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.MovementID == "" || (body.CategoryID != nil && *body.CategoryID == "") {
		writeError(w, http.StatusBadRequest, "bad_classification")
		return
	}
	category := ""
	if body.CategoryID != nil {
		category = *body.CategoryID
	}
	if b.ok(w, b.store.SetOverride(r.Context(), body.MovementID, category)) {
		w.WriteHeader(http.StatusNoContent)
	}
}

// ok answers a failed change and reports whether it went through.
func (b *books) ok(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, store.ErrInvalid):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid", "detail": err.Error()})
	default:
		log.Printf("libro: %v", err)
		writeError(w, http.StatusInternalServerError, "ledger_failed")
	}
	return false
}

// readJSON decodes a small JSON body, answering 400 if it can't.
func readJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("responder: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

// Package accounts serves the accounts found in the imported statements,
// with their balances, for the app's Accounts screen.
package accounts

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/powky/domfin/api/internal/localonly"
	"github.com/powky/domfin/api/internal/store"
)

// At most this many months per request.
const maxMonths = 60

// Handler serves
//
//	GET /accounts?from=2026-01&to=2026-09
//
// every account of the ledger (one per currency: a card billed in pesos
// and dollars is two) with its latest balance and the balance at the end
// of each month in the range. Without a range it answers the last twelve
// months up to the latest statement. Like the statement endpoints, it only
// answers this computer and pages served from localhost.
func Handler(s *store.Store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /accounts", func(w http.ResponseWriter, r *http.Request) {
		if s == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store_unavailable"})
			return
		}
		months, ok := monthRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_range"})
			return
		}
		if months == nil {
			// Twelve months up to the latest statement.
			latest, err := s.AccountBalances(r.Context(), nil)
			if err != nil {
				fail(w, err)
				return
			}
			last := time.Now().Format("2006-01")
			if newest := newestMonth(latest); newest != "" {
				last = newest
			}
			months, _ = monthRange(addMonths(last, -11), last)
		}
		balances, err := s.AccountBalances(r.Context(), months)
		if err != nil {
			fail(w, err)
			return
		}
		owned, err := s.AssetBalances(r.Context(), months)
		if err != nil {
			fail(w, err)
			return
		}
		balances = append(balances, owned...)
		body := response{Accounts: make([]accountJSON, len(balances))}
		for i, b := range balances {
			a := accountJSON{
				ID: b.Account.ID, Institution: b.Account.Institution, Kind: string(b.Account.Kind), Name: b.Account.Name,
				Last4: b.Account.Last4, Currency: b.Account.Currency, Balance: b.Balance, AsOf: b.AsOf,
				CreditLimit: b.CreditLimit, Months: make([]monthJSON, len(b.Months)),
			}
			for j, m := range b.Months {
				a.Months[j] = monthJSON{Month: m.Month, Balance: m.Balance}
			}
			body.Accounts[i] = a
		}
		writeJSON(w, http.StatusOK, body)
	})
	return localonly.Handler(mux)
}

type response struct {
	Accounts []accountJSON `json:"accounts"`
}

// Amounts are in cents, as the bank prints them: what a bank account or
// certificate holds, what's owed on a card or loan.
type accountJSON struct {
	ID          string      `json:"id"`
	Institution string      `json:"institution"`
	Kind        string      `json:"kind"`
	Name        string      `json:"name"`
	Last4       string      `json:"last4"`
	Currency    string      `json:"currency"`
	Balance     int64       `json:"balance"`
	AsOf        string      `json:"asOf"`
	CreditLimit int64       `json:"creditLimit,omitempty"`
	Months      []monthJSON `json:"months"`
}

// Balance is null before the account's first statement.
type monthJSON struct {
	Month   string `json:"month"`
	Balance *int64 `json:"balance"`
}

// monthRange lists the months from one to another, both included. Both
// empty means no range (nil, true).
func monthRange(from, to string) ([]string, bool) {
	if from == "" && to == "" {
		return nil, true
	}
	start, err1 := time.Parse("2006-01", from)
	end, err2 := time.Parse("2006-01", to)
	if err1 != nil || err2 != nil || end.Before(start) {
		return nil, false
	}
	var months []string
	for m := start; !m.After(end); m = m.AddDate(0, 1, 0) {
		months = append(months, m.Format("2006-01"))
		if len(months) > maxMonths {
			return nil, false
		}
	}
	return months, true
}

func addMonths(month string, n int) string {
	t, _ := time.Parse("2006-01", month)
	return t.AddDate(0, n, 0).Format("2006-01")
}

func newestMonth(balances []store.AccountBalance) string {
	newest := ""
	for _, b := range balances {
		if len(b.AsOf) >= 7 && b.AsOf[:7] > newest {
			newest = b.AsOf[:7]
		}
	}
	return newest
}

func fail(w http.ResponseWriter, err error) {
	log.Printf("cuentas: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "accounts_failed"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("responder: %v", err)
	}
}

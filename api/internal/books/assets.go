package books

import (
	"errors"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
)

type assetInput struct {
	Kind     assets.Kind          `json:"kind"`
	Name     string               `json:"name"`
	Currency string               `json:"currency"`
	Match    []string             `json:"match"`
	Property *assets.Plan         `json:"property"`
	Shares   *assets.Holding      `json:"shares"`
	Pension  *assets.Fund         `json:"pension"`
	Vehicle  *assets.Depreciation `json:"vehicle"`
	Schedule *assets.Schedule     `json:"schedule"`
}

type assetJSON struct {
	ID       string               `json:"id"`
	Kind     assets.Kind          `json:"kind"`
	Name     string               `json:"name"`
	Currency string               `json:"currency"`
	Match    []string             `json:"match"`
	Property *assets.Plan         `json:"property,omitempty"`
	Shares   *assets.Holding      `json:"shares,omitempty"`
	Pension  *assets.Fund         `json:"pension,omitempty"`
	Vehicle  *assets.Depreciation `json:"vehicle,omitempty"`
	Schedule *assets.Schedule     `json:"schedule,omitempty"`
	// Installment and Remaining, for a debt with a schedule: what each
	// installment pays of capital and interest (cents) and how many are left.
	Installment int64 `json:"installment,omitempty"`
	Remaining   int   `json:"remaining,omitempty"`
	// Value is what it's worth now (for a debt, what's owed) and Paid what
	// was paid into it (for a debt, paid back), in cents of its currency.
	Value    int64         `json:"value"`
	Paid     int64         `json:"paid"`
	Payments []paymentJSON `json:"payments"`
}

// paymentJSON is a movement linked to an asset: as its account shows it,
// and its value in the asset's currency (positive when paid in).
type paymentJSON struct {
	MovementID  string `json:"movementId"`
	AccountID   string `json:"accountId"`
	Date        string `json:"date"`
	Description string `json:"description"`
	Amount      int64  `json:"amount"`
	Currency    string `json:"currency"`
	Value       int64  `json:"value"`
	Auto        bool   `json:"auto"`
}

// serveAssets lists the assets with what was paid into each, after linking
// the movements their texts match.
func (b *books) serveAssets(w http.ResponseWriter, r *http.Request) {
	if err := b.store.SyncAssetLinks(r.Context(), b.convert); err != nil {
		log.Printf("activos: %v", err)
	}
	list, err := b.store.Assets(r.Context())
	if err != nil {
		b.fail(w, "activos", err)
		return
	}
	links, err := b.store.AssetLinks(r.Context())
	if err != nil {
		b.fail(w, "activos", err)
		return
	}
	movements, err := b.store.Movements(r.Context(), "0000-01-01", "9999-12-31")
	if err != nil {
		b.fail(w, "activos", err)
		return
	}
	byID := make(map[string]ledger.Movement, len(movements))
	for _, m := range movements {
		byID[m.ID] = m
	}
	body := struct {
		Assets []assetJSON `json:"assets"`
	}{Assets: []assetJSON{}}
	today := time.Now().In(santoDomingo).Format(time.DateOnly)
	for _, a := range list {
		out := assetJSON{ID: a.ID, Kind: a.Kind, Name: a.Name, Currency: a.Currency, Match: a.Match,
			Property: a.Property, Shares: a.Shares, Pension: a.Pension, Vehicle: a.Vehicle, Schedule: a.Schedule,
			Payments: []paymentJSON{}}
		if a.Schedule != nil {
			out.Installment, out.Remaining = a.Schedule.Installment(), a.Schedule.Remaining(today)
		}
		if out.Match == nil {
			out.Match = []string{}
		}
		var paid []assets.Paid
		for _, l := range links {
			if l.AssetID != a.ID {
				continue
			}
			m := byID[l.MovementID]
			out.Payments = append(out.Payments, paymentJSON{MovementID: l.MovementID, AccountID: m.AccountID, Date: l.Date,
				Description: m.Description, Amount: m.Amount, Currency: m.Currency, Value: l.Value, Auto: l.Auto})
			paid = append(paid, assets.Paid{Date: l.Date, Value: l.Value})
			if a.Kind != assets.Debt || l.Value > 0 {
				out.Paid += l.Value
			}
		}
		out.Value, _ = a.ValueOn(today, paid)
		body.Assets = append(body.Assets, out)
	}
	writeJSON(w, http.StatusOK, body)
}

func (b *books) addAsset(w http.ResponseWriter, r *http.Request) {
	b.saveAsset(w, r, "")
}

func (b *books) updateAsset(w http.ResponseWriter, r *http.Request) {
	b.saveAsset(w, r, r.PathValue("id"))
}

func (b *books) saveAsset(w http.ResponseWriter, r *http.Request, id string) {
	var in assetInput
	if !readJSON(w, r, &in) {
		return
	}
	match := make([]string, 0, len(in.Match))
	for _, text := range in.Match {
		if text = strings.TrimSpace(text); text != "" {
			match = append(match, text)
		}
	}
	if in.Pension != nil {
		// Oldest first, however they came.
		slices.SortFunc(in.Pension.Balances, func(a, b assets.Balance) int { return strings.Compare(a.Date, b.Date) })
	}
	a := assets.Asset{ID: id, Kind: in.Kind, Name: strings.TrimSpace(in.Name), Currency: in.Currency, Match: match,
		Property: in.Property, Shares: in.Shares, Pension: in.Pension, Vehicle: in.Vehicle, Schedule: in.Schedule}
	saved, err := b.store.SaveAsset(r.Context(), a, b.convert)
	if errors.Is(err, assets.ErrInvalid) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_asset", "detail": err.Error()})
		return
	}
	if !b.ok(w, err) {
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]string{"id": saved.ID})
}

func (b *books) deleteAsset(w http.ResponseWriter, r *http.Request) {
	if b.ok(w, b.store.DeleteAsset(r.Context(), r.PathValue("id"))) {
		w.WriteHeader(http.StatusNoContent)
	}
}

// linkAssets links movements to an asset, or unlinks them with a null one.
func (b *books) linkAssets(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MovementIDs []string `json:"movementIds"`
		AssetID     *string  `json:"assetId"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if len(body.MovementIDs) == 0 || body.AssetID != nil && *body.AssetID == "" {
		writeError(w, http.StatusBadRequest, "bad_link")
		return
	}
	assetID := ""
	if body.AssetID != nil {
		assetID = *body.AssetID
	}
	if b.ok(w, b.store.LinkMovements(r.Context(), body.MovementIDs, assetID, b.convert)) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (b *books) fail(w http.ResponseWriter, what string, err error) {
	log.Printf("%s: %v", what, err)
	writeError(w, http.StatusInternalServerError, "ledger_failed")
}

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"strconv"
	"time"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
)

// assetDetails is what the assets table keeps as JSON.
type assetDetails struct {
	Match    []string             `json:"match,omitempty"`
	Property *assets.Plan         `json:"property,omitempty"`
	Shares   *assets.Holding      `json:"shares,omitempty"`
	Pension  *assets.Fund         `json:"pension,omitempty"`
	Vehicle  *assets.Depreciation `json:"vehicle,omitempty"`
	Schedule *assets.Schedule     `json:"schedule,omitempty"`
}

// Assets lists the assets in the order they were added.
func (s *Store) Assets(ctx context.Context) ([]assets.Asset, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, kind, name, currency, details FROM assets ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []assets.Asset
	for rows.Next() {
		var a assets.Asset
		var details string
		if err := rows.Scan(&a.ID, &a.Kind, &a.Name, &a.Currency, &details); err != nil {
			return nil, err
		}
		var d assetDetails
		if err := json.Unmarshal([]byte(details), &d); err != nil {
			return nil, fmt.Errorf("asset %s: %w", a.ID, err)
		}
		a.Match, a.Property, a.Shares, a.Pension, a.Vehicle, a.Schedule = d.Match, d.Property, d.Shares, d.Pension, d.Vehicle, d.Schedule
		list = append(list, a)
	}
	return list, rows.Err()
}

// SaveAsset adds an asset (without an ID, which comes from its name) or
// replaces one by its ID, and links the movements its texts match.
func (s *Store) SaveAsset(ctx context.Context, a assets.Asset, convert Converter) (assets.Asset, error) {
	if err := a.Validate(); err != nil {
		return assets.Asset{}, err
	}
	details, err := json.Marshal(assetDetails{Match: a.Match, Property: a.Property, Shares: a.Shares, Pension: a.Pension,
		Vehicle: a.Vehicle, Schedule: a.Schedule})
	if err != nil {
		return assets.Asset{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return assets.Asset{}, err
	}
	defer tx.Rollback()
	if a.ID == "" {
		if a.ID, err = freeAssetID(ctx, tx, assets.Slug(a.Name)); err != nil {
			return assets.Asset{}, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO assets (id, kind, name, currency, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			a.ID, a.Kind, a.Name, a.Currency, string(details), s.now().UTC().Format(time.RFC3339Nano))
	} else {
		var result sql.Result
		result, err = tx.ExecContext(ctx, `UPDATE assets SET kind = ?, name = ?, currency = ?, details = ? WHERE id = ?`,
			a.Kind, a.Name, a.Currency, string(details), a.ID)
		if err == nil {
			if n, _ := result.RowsAffected(); n == 0 {
				return assets.Asset{}, fmt.Errorf("%w: no asset %q", ErrNotFound, a.ID)
			}
		}
		// Its texts or currency may have changed: what they linked is redone.
		if err == nil {
			_, err = tx.ExecContext(ctx, `DELETE FROM asset_links WHERE asset_id = ? AND auto = 1`, a.ID)
		}
	}
	if err != nil {
		return assets.Asset{}, err
	}
	if err := tx.Commit(); err != nil {
		return assets.Asset{}, err
	}
	if err := s.SyncAssetLinks(ctx, convert); err != nil {
		return a, err
	}
	return a, nil
}

// freeAssetID is the slug, or the slug with a number when it's taken.
func freeAssetID(ctx context.Context, tx *sql.Tx, slug string) (string, error) {
	if slug == "" {
		slug = "activo"
	}
	for n := 1; ; n++ {
		id := slug
		if n > 1 {
			id += "-" + strconv.Itoa(n)
		}
		var taken int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM assets WHERE id = ?`, id).Scan(&taken); err != nil {
			return "", err
		}
		if taken == 0 {
			return id, nil
		}
	}
}

// DeleteAsset removes an asset and its links.
func (s *Store) DeleteAsset(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM assets WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("%w: no asset %q", ErrNotFound, id)
	}
	return nil
}

// Converter expresses cents of one currency in another at a day's rate.
type Converter func(ctx context.Context, cents int64, from, to, date string) (int64, error)

// AssetLink is a movement linked to an asset.
type AssetLink struct {
	MovementID string
	AssetID    string
	Date       string
	// Value is the movement in the asset's currency, positive when paid in.
	Value int64
	// Auto marks the links the asset's texts made.
	Auto bool
}

// AssetLinks lists the movements linked to an asset, oldest first; the ones
// the user unlinked are left out.
func (s *Store) AssetLinks(ctx context.Context) ([]AssetLink, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT movement_id, asset_id, date, value, auto FROM asset_links
		WHERE asset_id IS NOT NULL ORDER BY date, movement_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var links []AssetLink
	for rows.Next() {
		var l AssetLink
		if err := rows.Scan(&l.MovementID, &l.AssetID, &l.Date, &l.Value, &l.Auto); err != nil {
			return nil, err
		}
		links = append(links, l)
	}
	return links, rows.Err()
}

// Links maps each linked movement to its asset, for the classifier.
func (s *Store) Links(ctx context.Context) (map[string]ledger.Link, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT l.movement_id, l.asset_id, a.kind FROM asset_links l JOIN assets a ON a.id = l.asset_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ledger.Link{}
	for rows.Next() {
		var movement, asset, kind string
		if err := rows.Scan(&movement, &asset, &kind); err != nil {
			return nil, err
		}
		out[movement] = ledger.Link{AssetID: asset, Debt: assets.Kind(kind) == assets.Debt}
	}
	return out, rows.Err()
}

// LinkMovements links movements to an asset by hand, converting each to the
// asset's currency at its date, or unlinks them with an empty asset ID, for
// good: the asset's texts don't link them again.
func (s *Store) LinkMovements(ctx context.Context, movementIDs []string, assetID string, convert Converter) error {
	movements, err := s.Movements(ctx, "0000-01-01", "9999-12-31")
	if err != nil {
		return err
	}
	byID := make(map[string]ledger.Movement, len(movements))
	for _, m := range movements {
		byID[m.ID] = m
	}
	var asset *assets.Asset
	if assetID != "" {
		list, err := s.Assets(ctx)
		if err != nil {
			return err
		}
		i := slices.IndexFunc(list, func(a assets.Asset) bool { return a.ID == assetID })
		if i < 0 {
			return fmt.Errorf("%w: no asset %q", ErrNotFound, assetID)
		}
		asset = &list[i]
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range movementIDs {
		m, ok := byID[id]
		if !ok {
			return fmt.Errorf("%w: no movement %q", ErrNotFound, id)
		}
		var target any
		value := int64(0)
		if asset != nil {
			if value, err = convert(ctx, -m.Amount, m.Currency, asset.Currency, m.Date); err != nil {
				return fmt.Errorf("convert %s: %w", id, err)
			}
			target = asset.ID
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO asset_links (movement_id, asset_id, date, value, auto) VALUES (?, ?, ?, ?, 0)
			ON CONFLICT (movement_id) DO UPDATE SET asset_id = excluded.asset_id, date = excluded.date,
				value = excluded.value, auto = 0`, id, target, m.Date, value); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SyncAssetLinks links to each asset the movements its texts match that
// aren't linked (or unlinked) yet: after importing statements, or when an
// asset changes. A movement a rate can't convert yet waits for the next time.
func (s *Store) SyncAssetLinks(ctx context.Context, convert Converter) error {
	list, err := s.Assets(ctx)
	if err != nil {
		return err
	}
	list = slices.DeleteFunc(list, func(a assets.Asset) bool { return len(a.Match) == 0 })
	if len(list) == 0 {
		return nil
	}
	known := map[string]bool{}
	rows, err := s.db.QueryContext(ctx, `SELECT movement_id FROM asset_links`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		known[id] = true
	}
	rows.Close()
	movements, err := s.Movements(ctx, "0000-01-01", "9999-12-31")
	if err != nil {
		return err
	}
	for _, m := range movements {
		if known[m.ID] {
			continue
		}
		for _, a := range list {
			if !a.Matches(m.Description) {
				continue
			}
			value, err := convert(ctx, -m.Amount, m.Currency, a.Currency, m.Date)
			if err != nil {
				log.Printf("activos: no se pudo convertir %s: %v", m.ID, err)
				break
			}
			if _, err := s.db.ExecContext(ctx, `
				INSERT OR IGNORE INTO asset_links (movement_id, asset_id, date, value, auto) VALUES (?, ?, ?, ?, 1)`,
				m.ID, a.ID, m.Date, value); err != nil {
				return err
			}
			break
		}
	}
	return nil
}

// AssetBalances gives each asset as an account: its value at the end of
// each month asked for (nil before anything was paid into it) and now, and
// as of its latest payment (or its shares' price).
func (s *Store) AssetBalances(ctx context.Context, months []string) ([]AccountBalance, error) {
	list, err := s.Assets(ctx)
	if err != nil {
		return nil, err
	}
	links, err := s.AssetLinks(ctx)
	if err != nil {
		return nil, err
	}
	paid := map[string][]assets.Paid{}
	for _, l := range links {
		paid[l.AssetID] = append(paid[l.AssetID], assets.Paid{Date: l.Date, Value: l.Value})
	}
	out := make([]AccountBalance, 0, len(list))
	// Worth what it is today (a vehicle loses value, a loan gets paid down).
	today := s.now().Format(time.DateOnly)
	for _, a := range list {
		b := AccountBalance{Account: ledger.Account{
			ID: assets.AccountID(a.ID), Kind: a.Kind.AccountKind(), Name: a.Name, Currency: a.Currency,
		}}
		b.Balance, _ = a.ValueOn(today, paid[a.ID])
		if n := len(paid[a.ID]); n > 0 {
			b.AsOf = paid[a.ID][n-1].Date
		}
		if a.Shares != nil && a.Shares.PriceDate > b.AsOf {
			b.AsOf = a.Shares.PriceDate
		}
		if a.Pension != nil {
			b.AsOf = max(b.AsOf, a.Pension.Latest())
		}
		if a.Vehicle != nil {
			b.AsOf = max(b.AsOf, a.Vehicle.Date)
		}
		if a.Schedule != nil {
			b.AsOf = max(b.AsOf, a.Schedule.AsOf)
		}
		for _, month := range months {
			mb := MonthBalance{Month: month}
			if value, ok := a.ValueOn(monthEnd(month), paid[a.ID]); ok {
				mb.Balance = &value
			}
			b.Months = append(b.Months, mb)
		}
		out = append(out, b)
	}
	return out, nil
}

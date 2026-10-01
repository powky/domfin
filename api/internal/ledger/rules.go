package ledger

import (
	"slices"
	"strconv"
	"strings"
)

// Direction is which way money moves in an account.
type Direction string

const (
	In  Direction = "in"
	Out Direction = "out"
)

// Rule gives a category to the movements that meet all of its conditions.
// A condition left empty doesn't filter, but a rule needs at least one.
type Rule struct {
	ID   string
	Name string

	// Accounts it looks at, by ID.
	Accounts  []string
	Direction Direction
	Currency  string
	// Contains matches when the description has any of these texts; capitals
	// and accents don't matter.
	Contains []string
	MCCs     []string
	// MinAmount and MaxAmount bound the amount in cents, without its sign.
	// Zero leaves that end open.
	MinAmount int64
	MaxAmount int64
	// Months of the year, 1 to 12, for things like the December bonus.
	Months []int

	CategoryID string
	// Review marks what the rule catches for a second look.
	Review bool
}

// HasConditions reports whether the rule filters anything: one without
// conditions would take every movement.
func (r Rule) HasConditions() bool {
	return len(r.Accounts) > 0 || r.Direction != "" || r.Currency != "" || len(r.Contains) > 0 ||
		len(r.MCCs) > 0 || r.MinAmount > 0 || r.MaxAmount > 0 || len(r.Months) > 0
}

// Matches reports whether m meets every condition of the rule.
func (r Rule) Matches(m Movement) bool {
	if !r.HasConditions() {
		return false
	}
	if len(r.Accounts) > 0 && !slices.Contains(r.Accounts, m.AccountID) {
		return false
	}
	switch r.Direction {
	case In:
		if m.Amount <= 0 {
			return false
		}
	case Out:
		if m.Amount >= 0 {
			return false
		}
	}
	if r.Currency != "" && r.Currency != m.Currency {
		return false
	}
	if len(r.Contains) > 0 {
		description := Normalize(m.Description)
		if !slices.ContainsFunc(r.Contains, func(text string) bool {
			text = Normalize(text)
			return text != "" && strings.Contains(description, text)
		}) {
			return false
		}
	}
	if len(r.MCCs) > 0 && !slices.Contains(r.MCCs, m.MCC) {
		return false
	}
	amount := m.Amount
	if amount < 0 {
		amount = -amount
	}
	if r.MinAmount > 0 && amount < r.MinAmount {
		return false
	}
	if r.MaxAmount > 0 && amount > r.MaxAmount {
		return false
	}
	if len(r.Months) > 0 {
		if len(m.Date) < 7 {
			return false
		}
		month, err := strconv.Atoi(m.Date[5:7])
		if err != nil || !slices.Contains(r.Months, month) {
			return false
		}
	}
	return true
}

// Package assets models what you own that no statement shows: a home
// bought off-plan, paid in installments to its developer, shares bought
// outright, a pension fund or a vehicle; and what you owe outside your
// statements. Their value comes from the movements linked to them (what you
// paid in), from a price you give, from the balances the fund's statements
// report, from a depreciation or from a loan's installments.
// docs/modelo-de-datos.md explains how they enter the ledger.
package assets

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode"

	"github.com/powky/domfin/api/internal/ledger"
)

// Kind is what an asset is.
type Kind string

const (
	// Property is a home or land, bought finished or off-plan.
	Property Kind = "property"
	// Shares are shares of a company, like the Grupo Popular's.
	Shares Kind = "shares"
	// Debt is money someone lent you outside a bank, like a relative: what
	// they paid in is owed, and what you pay back lowers it.
	Debt Kind = "debt"
	// Pension is a pension fund (an AFP): what the payroll puts in never
	// reaches your accounts, so it's worth what its latest statement says.
	Pension Kind = "pension"
	// Vehicle is a car or another vehicle: worth what it cost, less what it
	// loses in value every year.
	Vehicle Kind = "vehicle"
)

// AccountKind is how the ledger and the accounts list show each kind.
func (k Kind) AccountKind() ledger.AccountKind {
	switch k {
	case Shares:
		return ledger.Brokerage
	case Debt:
		return ledger.Loan
	case Pension:
		return ledger.Pension
	case Vehicle:
		return ledger.Vehicle
	}
	return ledger.RealEstate
}

// Asset is something you own that no statement shows.
type Asset struct {
	// ID is a slug of the name, stable once created: "torre-las-palmas".
	ID       string `json:"id"`
	Kind     Kind   `json:"kind"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
	// Match links, on their own, the movements whose description has any of
	// these texts, without minding case or accents ("fideicomiso torre").
	Match    []string      `json:"match,omitempty"`
	Property *Plan         `json:"property,omitempty"`
	Shares   *Holding      `json:"shares,omitempty"`
	Pension  *Fund         `json:"pension,omitempty"`
	Vehicle  *Depreciation `json:"vehicle,omitempty"`
	// Schedule, on a debt, pays it off in equal monthly installments: what's
	// owed follows them, not the linked movements. For a loan someone else
	// pays, like an employer, that never goes through your accounts.
	Schedule *Schedule `json:"schedule,omitempty"`
}

// Plan is how a property is paid, in the asset's currency. Anything the
// payments before handover don't cover is paid on Delivery.
type Plan struct {
	// Price is what the property costs, in cents; zero while it isn't known.
	Price        int64         `json:"price"`
	Reservation  *Payment      `json:"reservation,omitempty"`
	DownPayment  *Payment      `json:"downPayment,omitempty"`
	Installments *Installments `json:"installments,omitempty"`
	// Delivery is when the property is handed over, "YYYY-MM-DD".
	Delivery string `json:"delivery,omitempty"`
}

// Payment is one payment of the plan.
type Payment struct {
	Amount int64  `json:"amount"`
	Date   string `json:"date"`
}

// Installments are a payment of Amount every EveryMonths months, from First
// to Last ("YYYY-MM-DD"), both included.
type Installments struct {
	Amount      int64  `json:"amount"`
	EveryMonths int    `json:"everyMonths"`
	First       string `json:"first"`
	Last        string `json:"last"`
}

// Holding is a number of shares and what one is worth.
type Holding struct {
	Quantity int64 `json:"quantity"`
	// Price of one share, in cents, as of PriceDate. Without one, the
	// shares are worth what was paid for them.
	Price     int64  `json:"price,omitempty"`
	PriceDate string `json:"priceDate,omitempty"`
}

// Fund is a pension fund as its statements report it.
type Fund struct {
	// Balances are what the fund held on the dates its statements give,
	// oldest first.
	Balances []Balance `json:"balances"`
}

// Balance is what a fund held at the end of a day, in cents.
type Balance struct {
	Date   string `json:"date"`
	Amount int64  `json:"amount"`
}

// On is the balance of the latest statement by the end of date; false
// before the first one.
func (f Fund) On(date string) (int64, bool) {
	var found Balance
	for _, b := range f.Balances {
		if b.Date <= date && b.Date >= found.Date {
			found = b
		}
	}
	return found.Amount, found.Date != ""
}

// Latest is the date of the newest statement, "" without any.
func (f Fund) Latest() string {
	latest := ""
	for _, b := range f.Balances {
		latest = max(latest, b.Date)
	}
	return latest
}

// Depreciation is what a vehicle cost the day it was bought and the share
// of its value it loses every year (0.1 is 10%).
type Depreciation struct {
	Price int64   `json:"price"`
	Date  string  `json:"date"`
	Rate  float64 `json:"rate"`
}

// On is what the vehicle is worth at the end of a day: its price, less Rate
// of what's left every year since it was bought. False before then.
func (d Depreciation) On(date string) (int64, bool) {
	bought, err1 := time.Parse(time.DateOnly, d.Date)
	day, err2 := time.Parse(time.DateOnly, date)
	if err1 != nil || err2 != nil || day.Before(bought) {
		return 0, false
	}
	years := day.Sub(bought).Hours() / 24 / 365.25
	return int64(math.Round(float64(d.Price) * math.Pow(1-d.Rate, years))), true
}

// Schedule is a loan paid off in equal monthly installments from First to
// Last ("YYYY-MM-DD", both included) at Rate a year (0.05 is 5%). It owed
// Balance (cents) at the end of AsOf, after that day's installment if one
// was due; it was taken a month before the first installment.
type Schedule struct {
	Balance int64   `json:"balance"`
	AsOf    string  `json:"asOf"`
	Rate    float64 `json:"rate"`
	First   string  `json:"first"`
	Last    string  `json:"last"`
}

func (s Schedule) dates() []string {
	return Installments{EveryMonths: 1, First: s.First, Last: s.Last}.Dates()
}

// Remaining are the installments due after date.
func (s Schedule) Remaining(date string) int {
	n := 0
	for _, d := range s.dates() {
		if d > date {
			n++
		}
	}
	return n
}

// Installment is what each installment pays of capital and interest, in
// cents: the equal payment that leaves nothing owed after the last one.
// Insurance or anything else the bank adds to it isn't here.
func (s Schedule) Installment() int64 {
	n := float64(s.Remaining(s.AsOf))
	if n == 0 {
		return 0
	}
	r := s.Rate / 12
	if r == 0 {
		return int64(math.Round(float64(s.Balance) / n))
	}
	return int64(math.Round(float64(s.Balance) * r / (1 - math.Pow(1+r, -n))))
}

// On is what's owed at the end of a day, going forward or back from AsOf
// one installment at a time; false before the loan was taken.
func (s Schedule) On(date string) (int64, bool) {
	first, err := time.Parse(time.DateOnly, s.First)
	if err != nil || date < addMonths(first, -1).Format(time.DateOnly) {
		return 0, false
	}
	payment, r := float64(s.Installment()), s.Rate/12
	owed := float64(s.Balance)
	for _, d := range s.dates() {
		switch {
		case d > s.AsOf && d <= date: // paid after AsOf, by date
			owed = owed*(1+r) - payment
		case d <= s.AsOf && d > date: // paid by AsOf, after date: undo it
			owed = (owed + payment) / (1 + r)
		}
	}
	if date >= s.Last || owed < 0 {
		owed = 0
	}
	return int64(math.Round(owed)), true
}

// ErrInvalid means an asset or a change to it doesn't make sense.
var ErrInvalid = errors.New("invalid asset")

// AccountID is the asset's ID among the accounts: "asset:torre-las-palmas".
func AccountID(id string) string { return "asset:" + id }

// Validate checks what the user entered: a name, a known kind and currency,
// and a plan or holding that adds up.
func (a Asset) Validate() error {
	invalid := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
	}
	if strings.TrimSpace(a.Name) == "" {
		return invalid("sin nombre")
	}
	if a.Currency != "DOP" && a.Currency != "USD" {
		return invalid("moneda %q", a.Currency)
	}
	for _, text := range a.Match {
		if strings.TrimSpace(text) == "" {
			return invalid("un texto vacío que buscar")
		}
	}
	if a.Schedule != nil && a.Kind != Debt || a.Vehicle != nil && a.Kind != Vehicle {
		return invalid("un plan de cuotas es de una deuda, y una depreciación, de un vehículo")
	}
	switch a.Kind {
	case Property:
		p := a.Property
		if p == nil || p.Price < 0 {
			return invalid("un inmueble necesita su plan, aunque sea sin precio")
		}
		planned := int64(0)
		for _, payment := range []*Payment{p.Reservation, p.DownPayment} {
			if payment == nil {
				continue
			}
			if payment.Amount <= 0 || !isDate(payment.Date) {
				return invalid("un pago sin monto o sin fecha")
			}
			planned += payment.Amount
		}
		if i := p.Installments; i != nil {
			if i.Amount <= 0 || i.EveryMonths < 1 || i.EveryMonths > 24 || !isDate(i.First) || !isDate(i.Last) || i.Last < i.First {
				return invalid("las cuotas necesitan monto, cada cuántos meses y sus fechas")
			}
			planned += i.Amount * int64(len(i.Dates()))
		}
		if p.Delivery != "" && !isDate(p.Delivery) {
			return invalid("fecha de entrega %q", p.Delivery)
		}
		if p.Price > 0 && planned > p.Price {
			return invalid("los pagos suman más que el precio")
		}
		if p.Price == 0 && planned > 0 {
			return invalid("un plan de pagos necesita el precio")
		}
	case Debt:
		if a.Property != nil || a.Shares != nil || a.Pension != nil {
			return invalid("una deuda no lleva plan, acciones ni saldos")
		}
		if s := a.Schedule; s != nil {
			if s.Balance <= 0 || s.Rate < 0 || s.Rate >= 1 || !isDate(s.AsOf) || !isDate(s.First) || !isDate(s.Last) ||
				s.Last < s.First || s.Remaining(s.AsOf) == 0 {
				return invalid("las cuotas necesitan el saldo, su fecha, la tasa y la primera y la última, con alguna pendiente")
			}
		}
	case Vehicle:
		if a.Property != nil || a.Shares != nil || a.Pension != nil {
			return invalid("un vehículo no lleva plan, acciones ni saldos")
		}
		if v := a.Vehicle; v == nil || v.Price <= 0 || !isDate(v.Date) || v.Rate < 0 || v.Rate >= 1 {
			return invalid("un vehículo necesita su precio, cuándo lo compraste y cuánto pierde al año")
		}
	case Pension:
		if a.Property != nil || a.Shares != nil {
			return invalid("un fondo de pensiones no lleva plan ni acciones")
		}
		if a.Pension == nil || len(a.Pension.Balances) == 0 {
			return invalid("un fondo de pensiones necesita al menos un saldo")
		}
		seen := map[string]bool{}
		for _, b := range a.Pension.Balances {
			if !isDate(b.Date) || b.Amount < 0 {
				return invalid("un saldo sin fecha o con monto negativo")
			}
			if seen[b.Date] {
				return invalid("dos saldos del %s", b.Date)
			}
			seen[b.Date] = true
		}
	case Shares:
		if a.Shares == nil || a.Shares.Quantity <= 0 || a.Shares.Price < 0 {
			return invalid("las acciones necesitan su cantidad")
		}
		if a.Shares.PriceDate != "" && !isDate(a.Shares.PriceDate) {
			return invalid("fecha del precio %q", a.Shares.PriceDate)
		}
	default:
		return invalid("tipo %q", a.Kind)
	}
	return nil
}

func isDate(s string) bool {
	_, err := time.Parse(time.DateOnly, s)
	return err == nil
}

// Dates are the installments' due dates, from the first to the last.
func (i Installments) Dates() []string {
	first, err1 := time.Parse(time.DateOnly, i.First)
	last, err2 := time.Parse(time.DateOnly, i.Last)
	if err1 != nil || err2 != nil || i.EveryMonths < 1 {
		return nil
	}
	var dates []string
	for n := 0; ; n++ {
		date := addMonths(first, n*i.EveryMonths)
		if date.After(last) || n > 600 {
			return dates
		}
		dates = append(dates, date.Format(time.DateOnly))
	}
}

// addMonths keeps the day of the month, or the month's last day when it's
// shorter: the 31st of January plus a month is the 28th (or 29th) of February.
func addMonths(t time.Time, n int) time.Time {
	first := time.Date(t.Year(), t.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	return time.Date(first.Year(), first.Month(), min(t.Day(), last), 0, 0, 0, 0, time.UTC)
}

// Slug makes an ID from a name: "Torre Las Palmas" is
// "torre-las-palmas".
func Slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range ledger.Normalize(name) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

// Matches reports whether a movement's description has one of the asset's
// texts.
func (a Asset) Matches(description string) bool {
	text := ledger.Normalize(description)
	for _, match := range a.Match {
		if m := ledger.Normalize(match); m != "" && strings.Contains(text, m) {
			return true
		}
	}
	return false
}

// Paid is a movement linked to an asset, dated, with its value in the
// asset's currency (positive: money paid into the asset).
type Paid struct {
	Date  string
	Value int64
}

// ValueOn is what the asset is worth at the end of a day, in cents of its
// currency, given what was paid into it: a property is worth what was paid
// by then; shares, their quantity at their price once the first payment is
// made (at cost without a price); a debt, what's owed (lent to you minus
// paid back). Before anything is paid it's worth nothing, and ok is false.
// A pension fund is worth the balance of its latest statement by then, a
// vehicle its depreciated price and a debt with a schedule what's owed by
// its installments, whatever was linked to them.
func (a Asset) ValueOn(date string, paid []Paid) (value int64, ok bool) {
	switch {
	case a.Kind == Pension && a.Pension != nil:
		return a.Pension.On(date)
	case a.Kind == Vehicle && a.Vehicle != nil:
		return a.Vehicle.On(date)
	case a.Kind == Debt && a.Schedule != nil:
		return a.Schedule.On(date)
	case a.Kind == Pension || a.Kind == Vehicle:
		return 0, false
	}
	var total int64
	for _, p := range paid {
		if p.Date <= date {
			total += p.Value
			ok = true
		}
	}
	if !ok {
		return 0, false
	}
	if a.Kind == Debt {
		return -total, true
	}
	if a.Kind == Shares && a.Shares != nil && a.Shares.Price > 0 {
		return a.Shares.Quantity * a.Shares.Price, true
	}
	return total, true
}

// RateOn gives the BCRD's pesos per dollar, buy and sell, of a day.
type RateOn func(ctx context.Context, date string) (buy, sell float64, err error)

// Convert expresses cents of one currency in another at the day's midpoint
// rate, the one the app converts at.
func Convert(ctx context.Context, rateOn RateOn, cents int64, from, to, date string) (int64, error) {
	if from == to {
		return cents, nil
	}
	if rateOn == nil {
		return 0, errors.New("no rates to convert with")
	}
	buy, sell, err := rateOn(ctx, date)
	if err != nil {
		return 0, err
	}
	mid := (buy + sell) / 2
	switch {
	case from == "DOP" && to == "USD":
		return int64(math.Round(float64(cents) / mid)), nil
	case from == "USD" && to == "DOP":
		return int64(math.Round(float64(cents) * mid)), nil
	}
	return 0, fmt.Errorf("can't convert %s to %s", from, to)
}

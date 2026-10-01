package books

import (
	"context"
	"log"
	"math"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
)

// valued is a movement in pesos and in dollars, in cents: its own amount,
// and the other currency at the BCRD rate of its date, the way the bank
// would change it that day. What comes to you (income, a transfer in) is
// worth what the bank pays for dollars, the buy rate (the lower one); what
// you pay (an expense or its refund, a transfer out) costs what the bank
// charges for them, the sell rate. Pesos turn into dollars the other way
// around. Nil without a usable rate.
func valued(amount int64, currency string, flow ledger.Flow, buy, sell float64) map[string]int64 {
	if buy <= 0 || sell <= 0 {
		return nil
	}
	in := flow == ledger.Income || flow == ledger.Transfer && amount > 0
	switch currency {
	case "USD":
		rate := sell
		if in {
			rate = buy
		}
		return map[string]int64{"USD": amount, "DOP": int64(math.Round(float64(amount) * rate))}
	case "DOP":
		rate := buy
		if in {
			rate = sell
		}
		return map[string]int64{"DOP": amount, "USD": int64(math.Round(float64(amount) / rate))}
	}
	return nil
}

// dayRates looks each day's BCRD rate up once per request.
type dayRates struct {
	rateOn assets.RateOn
	seen   map[string][2]float64
	failed bool
}

// value is valued at the rate of the movement's date; nil when the rate
// isn't known, and the app converts at today's instead.
func (d *dayRates) value(ctx context.Context, m ledger.Movement, flow ledger.Flow) map[string]int64 {
	if d.rateOn == nil {
		return nil
	}
	rate, ok := d.seen[m.Date]
	if !ok {
		buy, sell, err := d.rateOn(ctx, m.Date)
		if err != nil && !d.failed {
			log.Printf("tasa del %s: %v", m.Date, err)
			d.failed = true
		}
		rate = [2]float64{buy, sell}
		d.seen[m.Date] = rate
	}
	return valued(m.Amount, m.Currency, flow, rate[0], rate[1])
}

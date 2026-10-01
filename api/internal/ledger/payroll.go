package ledger

import (
	"slices"
	"strings"
	"time"
)

// Payroll says how to tell the salary among the payroll credits.
type Payroll struct {
	// AccountID is the payroll account; empty looks in every account.
	AccountID string
	// Keyword marks payroll credits in the description: "nomina" also
	// matches "NÓMINA".
	Keyword string
	// Days of the month the salary is paid, like 15 and 30. A day past the
	// end of a month means its last day: 30 is February 28 or 29.
	Days []int
	// DaysBefore and DaysAfter widen each payday: a salary paid early
	// because the day falls on a weekend or holiday, or posted late, still
	// counts.
	DaysBefore int
	DaysAfter  int
}

// DefaultPayroll pays on the 15th and the 30th, the usual quincena.
func DefaultPayroll() Payroll {
	return Payroll{Keyword: "nomina", Days: []int{15, 30}, DaysBefore: 3, DaysAfter: 1}
}

// isCredit reports whether m is a payroll credit: money in, in the payroll
// account, with the keyword in its description.
func (p Payroll) isCredit(m Movement) bool {
	keyword := Normalize(p.Keyword)
	if keyword == "" || m.Amount <= 0 || (p.AccountID != "" && m.AccountID != p.AccountID) {
		return false
	}
	return strings.Contains(Normalize(m.Description), keyword)
}

const dateLayout = "2006-01-02"

// salaries picks each payday's salary among the payroll credits, given as
// indexes into movements: the credit nearest the payday within its window,
// and on a tie the one on or before it, then the first listed. onPayday has
// the other credits inside a payday's window, which may be the salary instead.
func (p Payroll) salaries(movements []Movement, credits []int) (salary, onPayday map[int]bool) {
	salary, onPayday = map[int]bool{}, map[int]bool{}
	dates := make(map[int]time.Time, len(credits))
	var first, last time.Time
	for _, i := range credits {
		date, err := time.Parse(dateLayout, movements[i].Date)
		if err != nil {
			continue
		}
		dates[i] = date
		if first.IsZero() || date.Before(first) {
			first = date
		}
		if date.After(last) {
			last = date
		}
	}
	if len(dates) == 0 {
		return salary, onPayday
	}

	// Every payday whose window could reach a credit, in order.
	var paydays []time.Time
	end := last.AddDate(0, 1, 0)
	for month := time.Date(first.Year(), first.Month()-1, 1, 0, 0, 0, 0, time.UTC); !month.After(end); month = month.AddDate(0, 1, 0) {
		for _, day := range p.Days {
			if day >= 1 && day <= 31 {
				paydays = append(paydays, payday(month, day))
			}
		}
	}
	slices.SortFunc(paydays, time.Time.Compare)
	paydays = slices.CompactFunc(paydays, time.Time.Equal)

	for _, day := range paydays {
		from, to := day.AddDate(0, 0, -max(p.DaysBefore, 0)), day.AddDate(0, 0, max(p.DaysAfter, 0))
		best := -1
		for _, i := range credits {
			date, ok := dates[i]
			if !ok || date.Before(from) || date.After(to) {
				continue
			}
			onPayday[i] = true
			if !salary[i] && (best == -1 || nearer(date, dates[best], day)) {
				best = i
			}
		}
		if best != -1 {
			salary[best] = true
		}
	}
	for i := range salary {
		delete(onPayday, i)
	}
	return salary, onPayday
}

// payday is day of month's month, or its last day when the month is shorter.
func payday(month time.Time, day int) time.Time {
	last := time.Date(month.Year(), month.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
	return time.Date(month.Year(), month.Month(), min(day, last), 0, 0, 0, 0, time.UTC)
}

// nearer reports whether a salary on a beats one on b for payday: closer to
// it, or as close but not after it.
func nearer(a, b, payday time.Time) bool {
	da, db := a.Sub(payday).Abs(), b.Sub(payday).Abs()
	if da != db {
		return da < db
	}
	return !a.After(payday) && b.After(payday)
}

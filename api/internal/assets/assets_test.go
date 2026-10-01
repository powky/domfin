package assets

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
)

func TestInstallmentDates(t *testing.T) {
	// The 31st has no match in shorter months: their last day takes it.
	i := Installments{Amount: 100, EveryMonths: 3, First: "2026-01-31", Last: "2027-01-31"}
	want := []string{"2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31", "2027-01-31"}
	if got := i.Dates(); !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestValidate(t *testing.T) {
	home := Asset{Kind: Property, Name: "Casa", Currency: "USD", Property: &Plan{
		Price:        10_000_000,
		Reservation:  &Payment{Amount: 100_000, Date: "2026-05-11"},
		DownPayment:  &Payment{Amount: 900_000, Date: "2026-06-02"},
		Installments: &Installments{Amount: 500_000, EveryMonths: 4, First: "2026-10-01", Last: "2027-10-01"},
		Delivery:     "2028-01-31",
	}}
	if err := home.Validate(); err != nil {
		t.Fatal(err)
	}
	// Recorded before its price is known: worth what was paid.
	if err := (Asset{Kind: Property, Name: "Casa", Currency: "USD", Property: &Plan{}}).Validate(); err != nil {
		t.Errorf("without a price: %v", err)
	}
	for name, change := range map[string]func(a *Asset){
		"no name":        func(a *Asset) { a.Name = " " },
		"plan, no price": func(a *Asset) { a.Property.Price = 0 },
		"negative price": func(a *Asset) { a.Property.Price = -1 },
		"no plan":        func(a *Asset) { a.Property = nil },
		"other currency": func(a *Asset) { a.Currency = "EUR" },
		"over the price": func(a *Asset) { a.Property.Installments.Amount = 5_000_000 },
		"bad date":       func(a *Asset) { a.Property.DownPayment.Date = "2026-13-01" },
		"backwards":      func(a *Asset) { a.Property.Installments.Last = "2026-01-01" },
		"no shares":      func(a *Asset) { a.Kind = Shares },
	} {
		changed := home
		plan := *home.Property
		installments := *plan.Installments
		down := *plan.DownPayment
		plan.Installments, plan.DownPayment = &installments, &down
		changed.Property = &plan
		change(&changed)
		if err := changed.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestSlug(t *testing.T) {
	for name, want := range map[string]string{
		"Torre Las Palmas":           "torre-las-palmas",
		"  Acciones Grupo Popular! ": "acciones-grupo-popular",
		"Torre #2 (Piantini)":        "torre-2-piantini",
	} {
		if got := Slug(name); got != want {
			t.Errorf("Slug(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestValueOn(t *testing.T) {
	paid := []Paid{{Date: "2026-05-11", Value: 100_000}, {Date: "2026-06-02", Value: 1_550_000}}
	home := Asset{Kind: Property}
	if _, ok := home.ValueOn("2026-05-10", paid); ok {
		t.Error("a home is worth nothing before its first payment")
	}
	if v, _ := home.ValueOn("2026-05-31", paid); v != 100_000 {
		t.Errorf("end of May: %d", v)
	}
	if v, _ := home.ValueOn("2026-06-30", paid); v != 1_650_000 {
		t.Errorf("end of June: %d", v)
	}
	shares := Asset{Kind: Shares, Shares: &Holding{Quantity: 500, Price: 60_000}}
	if v, _ := shares.ValueOn("2026-06-30", paid[1:]); v != 30_000_000 {
		t.Errorf("shares at their price: %d", v)
	}
}

func TestConvert(t *testing.T) {
	rate := func(context.Context, string) (float64, float64, error) { return 58, 60, nil }
	if got, _ := Convert(context.Background(), rate, 5_900_000, "DOP", "USD", "2026-06-02"); got != 100_000 {
		t.Errorf("pesos to dollars at the midpoint: %d", got)
	}
	if got, _ := Convert(context.Background(), rate, 100, "USD", "DOP", "2026-06-02"); got != 5_900 {
		t.Errorf("dollars to pesos: %d", got)
	}
	if got, _ := Convert(context.Background(), nil, 100, "USD", "USD", ""); got != 100 {
		t.Errorf("same currency: %d", got)
	}
}

func TestPension(t *testing.T) {
	fund := Asset{Kind: Pension, Name: "AFP de Prueba", Currency: "DOP", Pension: &Fund{Balances: []Balance{
		{Date: "2025-12-31", Amount: 50_000_000},
		{Date: "2026-06-30", Amount: 55_000_000},
		{Date: "2026-08-31", Amount: 57_500_000},
	}}}
	if err := fund.Validate(); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(a *Asset){
		"no balances":    func(a *Asset) { a.Pension = &Fund{} },
		"no fund":        func(a *Asset) { a.Pension = nil },
		"bad date":       func(a *Asset) { a.Pension.Balances[0].Date = "2026-02-30" },
		"negative":       func(a *Asset) { a.Pension.Balances[0].Amount = -1 },
		"same date":      func(a *Asset) { a.Pension.Balances[1].Date = "2025-12-31" },
		"with shares":    func(a *Asset) { a.Shares = &Holding{Quantity: 1} },
		"a debt with it": func(a *Asset) { a.Kind = Debt },
	} {
		changed := fund
		changed.Pension = &Fund{Balances: append([]Balance(nil), fund.Pension.Balances...)}
		change(&changed)
		if err := changed.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}

	// Worth its latest statement by then, whatever was linked to it.
	linked := []Paid{{Date: "2026-01-10", Value: 1_000_000}}
	if _, ok := fund.ValueOn("2025-12-30", linked); ok {
		t.Error("a fund has no value before its first statement")
	}
	for date, want := range map[string]int64{
		"2025-12-31": 50_000_000,
		"2026-03-31": 50_000_000,
		"2026-07-31": 55_000_000,
		"2099-12-31": 57_500_000,
	} {
		if v, ok := fund.ValueOn(date, linked); !ok || v != want {
			t.Errorf("%s: %d, %v", date, v, ok)
		}
	}
	if got := fund.Pension.Latest(); got != "2026-08-31" {
		t.Errorf("latest statement: %s", got)
	}
}

func TestVehicle(t *testing.T) {
	car := Asset{Kind: Vehicle, Name: "Carro de Prueba", Currency: "DOP",
		Vehicle: &Depreciation{Price: 170_000_000, Date: "2025-05-31", Rate: 0.1}}
	if err := car.Validate(); err != nil {
		t.Fatal(err)
	}
	if car.Kind.AccountKind() != ledger.Vehicle {
		t.Errorf("kind: %s", car.Kind.AccountKind())
	}
	if _, ok := car.ValueOn("2025-05-30", nil); ok {
		t.Error("worth something before it was bought")
	}
	if v, _ := car.ValueOn("2025-05-31", nil); v != 170_000_000 {
		t.Errorf("the day it was bought: %d", v)
	}
	// A year later it lost 10%; two years later, 10% of what was left.
	if v, _ := car.ValueOn("2026-05-31", nil); v < 152_900_000 || v > 153_100_000 {
		t.Errorf("a year later: %d", v)
	}
	if v, _ := car.ValueOn("2027-05-31", nil); v < 137_600_000 || v > 137_800_000 {
		t.Errorf("two years later: %d", v)
	}
	for name, change := range map[string]func(a *Asset){
		"no price":      func(a *Asset) { a.Vehicle.Price = 0 },
		"bad date":      func(a *Asset) { a.Vehicle.Date = "2025-13-01" },
		"loses it all":  func(a *Asset) { a.Vehicle.Rate = 1 },
		"no details":    func(a *Asset) { a.Vehicle = nil },
		"on a property": func(a *Asset) { a.Kind = Property; a.Property = &Plan{} },
	} {
		changed := car
		details := *car.Vehicle
		changed.Vehicle = &details
		change(&changed)
		if err := changed.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestSchedule(t *testing.T) {
	// 44 installments left after the end of September 2026, at 6% a year.
	loan := Asset{Kind: Debt, Name: "Préstamo de Prueba", Currency: "DOP", Schedule: &Schedule{
		Balance: 100_000_000, AsOf: "2026-09-30", Rate: 0.06, First: "2025-06-30", Last: "2030-05-31",
	}}
	if err := loan.Validate(); err != nil {
		t.Fatal(err)
	}
	s := loan.Schedule
	if n := s.Remaining("2026-09-30"); n != 44 {
		t.Errorf("remaining: %d", n)
	}
	payment := s.Installment()
	if payment < 2_530_000 || payment > 2_545_000 {
		t.Errorf("installment: %d", payment)
	}
	owed := func(date string) int64 {
		v, ok := loan.ValueOn(date, []Paid{{Date: "2026-01-01", Value: 99}})
		if !ok {
			t.Fatalf("nothing owed on %s", date)
		}
		return v
	}
	if got := owed("2026-09-30"); got != 100_000_000 {
		t.Errorf("as of its balance: %d", got)
	}
	// The next installment pays the month's interest and part of the capital.
	if got, want := owed("2026-10-31"), int64(100_000_000*1.005)-payment; got < want-1 || got > want+1 {
		t.Errorf("a month later: %d, want %d", got, want)
	}
	// Before the balance, what the installments already paid is owed again.
	taken := owed("2025-05-30")
	if taken <= owed("2025-06-30") || owed("2025-06-30") <= owed("2026-09-30") {
		t.Errorf("going back: taken %d, first installment %d", taken, owed("2025-06-30"))
	}
	if _, ok := loan.ValueOn("2025-05-29", nil); ok {
		t.Error("owed before it was taken")
	}
	if owed("2030-05-31") != 0 || owed("2031-01-01") != 0 {
		t.Error("still owed after the last installment")
	}
	for name, change := range map[string]func(s *Schedule){
		"no balance":     func(s *Schedule) { s.Balance = 0 },
		"bad date":       func(s *Schedule) { s.First = "2025-02-30" },
		"backwards":      func(s *Schedule) { s.Last = "2025-01-31" },
		"nothing left":   func(s *Schedule) { s.AsOf = "2030-05-31" },
		"a rate of 100%": func(s *Schedule) { s.Rate = 1 },
	} {
		changed := loan
		details := *loan.Schedule
		changed.Schedule = &details
		change(changed.Schedule)
		if err := changed.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

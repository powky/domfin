// Command demo fills a new Domfin database with made-up statements, so the
// app can be tried (and shown) without anyone's bank data: a payroll account
// and a dollar account, two credit cards, a personal loan, a certificate, a
// home bought off-plan, shares, a pension fund and a car, from January of
// last year to the last month closed (or this one, near its end), and this
// year's pay stubs. It never touches an existing database.
//
//	DOMFIN_DATA_DIR=/tmp/domfin-demo go run ./cmd/demo
//	DOMFIN_DATA_DIR=/tmp/domfin-demo go run ./cmd/api
package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"slices"
	"time"

	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

// The demo's accounts, by their last 4 digits.
const (
	payrollLast4 = "1234" // savings, where the salary comes in (DOP)
	dollarsLast4 = "5678" // savings in dollars
	cardLast4    = "4321" // Popular credit card, pesos and dollars
	qikLast4     = "8765" // Qik credit card
	loanLast4    = "2468" // personal loan
	cdLast4      = "1357" // certificate
)

func main() {
	if err := run(time.Now()); err != nil {
		fmt.Fprintln(os.Stderr, "demo:", err)
		os.Exit(1)
	}
}

func run(now time.Time) error {
	if os.Getenv("DOMFIN_DATA_DIR") == "" {
		return errors.New("pon DOMFIN_DATA_DIR en una carpeta vacía: la demo nunca usa la base de siempre")
	}
	path := store.DefaultPath()
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("ya hay una base en %s: usa una carpeta vacía", path)
	}
	db, err := store.Open(path)
	if err != nil {
		return err
	}
	defer db.Close()
	ctx := context.Background()

	d := newDemo(now)
	d.salary()
	d.bills()
	d.cards()
	d.loan()
	d.dollars()
	d.investments()
	d.interest()

	src := func(name string) store.Source { return store.Source{Name: "demo-" + name + ".pdf"} }
	for _, st := range d.cardStatements {
		if _, err := db.SaveStatement(ctx, st, nil, src(st.Last4+"-"+st.CutDate.Format("2006-01"))); err != nil {
			return err
		}
	}
	for _, st := range d.accountStatements() {
		if _, err := db.SaveAccountStatement(ctx, st, nil, src(st.Last4+"-"+st.Month())); err != nil {
			return err
		}
	}
	for _, slip := range d.payslips() {
		if _, err := db.SavePayslip(ctx, slip, nil, src("volante-"+slip.PaidOn.Format("2006-01-02"))); err != nil {
			return err
		}
	}
	if _, err := db.SaveLoanHistory(ctx, d.loanHistory, nil, src("prestamo")); err != nil {
		return err
	}
	if _, err := db.SaveCertificateHistory(ctx, d.certificate(), nil, src("certificado")); err != nil {
		return err
	}
	if err := d.settings(ctx, db); err != nil {
		return err
	}
	fmt.Printf("Base de demostración lista en %s (%s a %s).\n", path,
		d.months[0].Format("2006-01"), d.months[len(d.months)-1].Format("2006-01"))
	fmt.Println("Arranca la API con el mismo DOMFIN_DATA_DIR para verla en la app.")
	return nil
}

type bankEvent struct {
	date   time.Time
	desc   string
	amount int64 // cents, signed like the ledger
}

type cardEvent struct {
	date   time.Time
	desc   string
	mcc    string
	amount int64 // cents as the card prints them: positive a charge
}

type demo struct {
	rnd *rand.Rand
	// months are the first day of each month, oldest first.
	months         []time.Time
	bank           map[string][]bankEvent
	cardStatements []statements.Statement
	loanHistory    statements.LoanHistory
	loanTaken      time.Time
}

func newDemo(now time.Time) *demo {
	// The month in course counts once it's nearly over, so the app's current
	// month isn't empty.
	last := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if now.Day() < 28 {
		last = last.AddDate(0, -1, 0)
	}
	first := time.Date(now.Year()-1, time.January, 1, 0, 0, 0, 0, time.UTC)
	d := &demo{rnd: rand.New(rand.NewPCG(2026, 1)), bank: map[string][]bankEvent{}}
	for m := first; !m.After(last); m = m.AddDate(0, 1, 0) {
		d.months = append(d.months, m)
	}
	return d
}

// day is a day of the month m, or its last when the month is shorter.
func day(m time.Time, n int) time.Time {
	lastDay := m.AddDate(0, 1, -1).Day()
	return time.Date(m.Year(), m.Month(), min(n, lastDay), 0, 0, 0, 0, time.UTC)
}

// between is an amount in cents from lo to hi pesos (or dollars).
func (d *demo) between(lo, hi float64) int64 {
	return int64(math.Round((lo + d.rnd.Float64()*(hi-lo)) * 100))
}

func (d *demo) add(last4 string, date time.Time, desc string, amount int64) {
	d.bank[last4] = append(d.bank[last4], bankEvent{date, desc, amount})
}

// fromEnd is the month n months before the last one.
func (d *demo) fromEnd(n int) time.Time { return d.months[len(d.months)-1-n] }

// salary pays twice a month, the yearly bonus in March and the Christmas
// salary in December, all into the payroll account.
func (d *demo) salary() {
	for _, m := range d.months {
		d.add(payrollLast4, day(m, 15), "CREDITO NOMINA", 5_850_000)
		d.add(payrollLast4, day(m, 30), "CREDITO NOMINA", 5_850_000)
		switch m.Month() {
		case time.March:
			d.add(payrollLast4, day(m, 20), "CREDITO NOMINA", 18_500_000)
		case time.December:
			d.add(payrollLast4, day(m, 18), "CREDITO NOMINA", 11_700_000)
		}
	}
}

// payslips are this year's pay stubs, laid out like a Dominican payroll's:
// each fortnight's salary with its deductions, and the March bonus with its
// ISR. Their nets are the payroll credits, which are already in the ledger.
func (d *demo) payslips() []statements.Payslip {
	const employer = "EMPRESA DE PRUEBA"
	year := d.months[len(d.months)-1].Year()
	var slips []statements.Payslip
	var salary, isr, afp, sfs, insurance, bonus int64
	fortnight := func(paidOn time.Time) {
		salary, isr, afp, sfs, insurance = salary+7_500_000, isr+1_156_750, afp+215_250, sfs+228_000, insurance+50_000
		slips = append(slips, statements.Payslip{Employer: employer, PaidOn: paidOn, Net: 5_850_000, Lines: []statements.PayslipLine{
			{Concept: "SUELDO", Kind: statements.PaySalary, Amount: 7_500_000, YearToDate: salary},
			{Concept: "LEY 11-92", Kind: statements.DeductionISR, Deduction: true, Amount: 1_156_750, YearToDate: isr},
			{Concept: "APORTES AL PLAN LEY 87-01", Kind: statements.DeductionAFP, Deduction: true, Amount: 215_250, YearToDate: afp},
			{Concept: "APORTES SEG. FAM. SALUD", Kind: statements.DeductionSFS, Deduction: true, Amount: 228_000, YearToDate: sfs},
			{Concept: "SEGURO COMPLEMENTARIO", Kind: statements.DeductionOther, Deduction: true, Amount: 50_000, YearToDate: insurance},
		}})
	}
	for _, m := range d.months {
		if m.Year() != year {
			continue
		}
		fortnight(day(m, 15))
		if m.Month() == time.March {
			bonus, isr = bonus+24_666_667, isr+6_166_667
			slips = append(slips, statements.Payslip{Employer: employer, PaidOn: day(m, 20), Net: 18_500_000, Lines: []statements.PayslipLine{
				{Concept: "BONIFICACION ESPECIAL", Kind: statements.PayBonus, Amount: 24_666_667, YearToDate: bonus},
				{Concept: "LEY 11-92", Kind: statements.DeductionISR, Deduction: true, Amount: 6_166_667, YearToDate: isr},
			}})
		}
		fortnight(day(m, 30))
	}
	return slips
}

// bills are what leaves the payroll account every month on its own.
func (d *demo) bills() {
	for _, m := range d.months {
		d.add(payrollLast4, day(m, 2), "PAG EDESUR 0000123456 000123", -d.between(2_400, 4_300))
		d.add(payrollLast4, day(m, 3), "PAG CLARO 8095550100 000456", -245_000)
		d.add(payrollLast4, day(m, 6), "MB a 0000000123 INMOBILIARIA DEL ESTE", -3_200_000)
		d.add(payrollLast4, day(m, 12), "COD CASH BPD0000 60600000000", -500_000)
		for _, n := range []int{7, 14, 21, 28} {
			taxed := d.between(8_000, 40_000)
			d.add(payrollLast4, day(m, n), fmt.Sprintf("PAGO IMPUESTO 0.15%% DGII 2 TRANS POR $ %s", statements.FormatAmount(taxed)),
				-int64(math.Round(float64(taxed)*0.0015)))
		}
	}
}

type merchant struct {
	name     string
	mcc      string
	lo, hi   float64
	perCycle float64 // purchases per cycle, on average
}

var pesoMerchants = []merchant{
	{"SUPERMERCADO LA COLONIA", "5411", 2_800, 7_500, 3},
	{"MERCADO FRESCO SRL", "5411", 900, 3_200, 2},
	{"RESTAURANTE EL MALECON", "5812", 1_500, 4_200, 1.2},
	{"CAFE DEL CONDE", "5812", 450, 1_300, 2},
	{"PIZZERIA NAPOLI", "5812", 900, 2_400, 1},
	{"POLLO RICO EXPRESS", "5814", 350, 950, 2},
	{"UBER EATS", "4789", 600, 1_400, 1.5},
	{"ESTACION LA ROTONDA", "5541", 2_000, 3_600, 3},
	{"UBER RIDES", "4789", 180, 650, 5},
	{"FARMACIA LOS PRADOS", "5912", 450, 2_400, 1.3},
	{"GIMNASIO POWER FIT", "7997", 2_800, 2_800, 1},
	{"INSTITUTO DE IDIOMAS", "8299", 4_500, 4_500, 1},
	{"SALON DE BELLEZA ANA", "7230", 1_200, 3_000, 0.8},
	{"CINE PALACIO", "7832", 600, 1_400, 0.7},
	{"FERRETERIA EL MARTILLO", "5251", 1_200, 6_000, 0.4},
	{"TIENDA LA MODA", "5651", 2_500, 8_000, 0.4},
	{"PET SHOP HUELLITAS", "5995", 1_500, 3_000, 0.5},
	{"TECNOLOGIA PLAZA", "5732", 12_000, 35_000, 0.12},
}

var dollarMerchants = []merchant{
	{"NETFLIX.COM", "4899", 15.49, 15.49, 1},
	{"SPOTIFY", "5815", 10.99, 10.99, 1},
	{"APPLE.COM/BILL", "5818", 2.99, 2.99, 1},
	{"AMAZON MKTPLACE", "5942", 30, 120, 0.6},
}

var cities = map[string]string{
	"NETFLIX.COM": "LOS GATOS", "SPOTIFY": "STOCKHOLM", "APPLE.COM/BILL": "CUPERTINO", "AMAZON MKTPLACE": "SEATTLE",
}

// purchases are a cycle's purchases at merchants, between two dates.
func (d *demo) purchases(merchants []merchant, from, to time.Time) []cardEvent {
	days := int(to.Sub(from).Hours()/24) + 1
	var out []cardEvent
	for _, m := range merchants {
		n := int(m.perCycle)
		if d.rnd.Float64() < m.perCycle-float64(n) {
			n++
		}
		city := cities[m.name]
		if city == "" {
			city = "SANTO DOMINGO"
		}
		for range n {
			date := from.AddDate(0, 0, d.rnd.IntN(days))
			out = append(out, cardEvent{date, m.name + "  " + city, m.mcc, d.between(m.lo, m.hi)})
		}
	}
	return out
}

// cards are the Popular card (cut on the 28th) and Qik's (cut on the 20th),
// each paid in full from the payroll account (dollars, from the dollar
// account) the month after.
func (d *demo) cards() {
	popular := cardCycles{last4: cardLast4, cutDay: 28, payDay: 10,
		balances: map[string]int64{"DOP": 1_850_000, "USD": 3_100}}
	qik := cardCycles{last4: qikLast4, cutDay: 20, payDay: 5, qik: true, balances: map[string]int64{"DOP": 640_000}}
	for i, m := range d.months {
		// A trip each July, paid in dollars.
		var trip []cardEvent
		if m.Month() == time.July {
			trip = []cardEvent{
				{day(m, 9), "AEROLINEA DEL CARIBE  MIAMI", "4511", d.between(380, 460)},
				{day(m, 18), "HOTEL PLAYA DORADA  PUERTO PLATA", "7011", d.between(520, 640)},
			}
		}
		from := day(m.AddDate(0, -1, 0), 29)
		if i == 0 {
			from = day(m, 1)
		}
		cut := day(m, 28)
		d.cardStatements = append(d.cardStatements, popular.statement(d, m, map[string][]cardEvent{
			"DOP": d.purchases(pesoMerchants, from, cut),
			"USD": append(d.purchases(dollarMerchants, from, cut), trip...),
		}))

		qikFrom := day(m.AddDate(0, -1, 0), 21)
		if i == 0 {
			qikFrom = day(m, 1)
		}
		qikCut := day(m, 20)
		d.cardStatements = append(d.cardStatements, qik.statement(d, m, map[string][]cardEvent{
			"DOP": d.purchases([]merchant{
				{"SUPERMERCADO LA COLONIA", "", 1_500, 4_500, 1.5},
				{"CAFE DEL CONDE", "", 350, 900, 1.5},
				{"POLLO RICO EXPRESS", "", 300, 800, 1},
			}, qikFrom, qikCut),
		}))
	}
}

type cardCycles struct {
	last4          string
	cutDay, payDay int
	qik            bool
	balances       map[string]int64
	refs           int
}

// statement closes a cycle: what the previous one owed is paid on payDay,
// from the payroll account (pesos) or the dollar account (dollars).
func (c *cardCycles) statement(d *demo, m time.Time, purchases map[string][]cardEvent) statements.Statement {
	st := statements.Statement{Institution: "popular", Product: "MC PLATINUM", Brand: "Mastercard", Last4: c.last4,
		CutDate: day(m, c.cutDay), DueDate: day(m, c.cutDay).AddDate(0, 0, 25)}
	if c.qik {
		st.Institution, st.Product, st.Brand = "qik", "Qik", "Mastercard"
	}
	for _, currency := range []string{"DOP", "USD"} {
		events, ok := purchases[currency]
		if !ok {
			continue
		}
		previous := c.balances[currency]
		if previous > 0 {
			paid := day(m, c.payDay)
			events = append(events, cardEvent{paid, "Pago Via App", "", -previous})
			if c.qik {
				events[len(events)-1].desc = "Pago A Tarjeta - Cuenta De Ahorro"
			}
			if currency == "DOP" {
				d.add(payrollLast4, paid, "PagoTC Via MB************"+c.last4, -previous)
			} else {
				d.add(dollarsLast4, paid, "Pago via MB a TC ****"+c.last4, -previous)
			}
		}
		slices.SortStableFunc(events, func(a, b cardEvent) int { return a.date.Compare(b.date) })
		section := statements.Section{Currency: currency, PreviousBalance: previous, InterestRate: 60}
		balance := previous
		for _, e := range events {
			c.refs++
			t := statements.Transaction{PostedOn: e.date, TransactedOn: e.date, Description: e.desc, MCC: e.mcc, Amount: e.amount,
				Reference: fmt.Sprintf("%023d", c.refs)}
			if e.mcc != "" {
				t.Authorization = fmt.Sprintf("%06d", c.refs)
			}
			if c.qik {
				t.Type = statements.Purchase
				if e.amount < 0 {
					t.Type = statements.Payment
				}
			}
			section.Transactions = append(section.Transactions, t)
			balance += e.amount
		}
		section.Balance, section.AmountDue = balance, balance
		section.MinimumPayment = balance / 20
		section.CreditLimit = map[string]int64{"DOP": 18_000_000, "USD": 200_000}[currency]
		if c.qik {
			section.CreditLimit = 6_000_000
		}
		section.AvailableCredit = section.CreditLimit - balance
		st.Sections = append(st.Sections, section)
		c.balances[currency] = balance
	}
	return st
}

// loan is a personal loan paid into the payroll account a year and a
// month before the end, paid back in equal installments.
func (d *demo) loan() {
	taken := day(d.fromEnd(13), 5)
	d.loanTaken = taken
	principal, rate, n := int64(35_000_000), 0.16/12, 36.0
	installment := int64(math.Round(float64(principal) * rate / (1 - math.Pow(1+rate, -n))))
	owed := principal
	history := statements.LoanHistory{Institution: "popular", Last4: loanLast4, Currency: "DOP", Product: "Prestamos",
		AsOf: d.months[len(d.months)-1].AddDate(0, 1, -1)}
	ref := 0
	movement := func(date time.Time, desc string, amount, principalMoved int64) {
		ref++
		moved := principalMoved
		history.Movements = append(history.Movements, statements.LoanMovement{PostedOn: date, EffectiveOn: date,
			Reference: fmt.Sprintf("PR%08d", ref), Description: desc, Amount: amount, Balance: owed, Principal: &moved})
	}
	movement(taken, "DESEMBOLSO", principal, principal)
	d.add(payrollLast4, taken, "CREDITO DESEMBOLSO PRESTAMO", principal)
	for m := taken.AddDate(0, 1, 0); !m.After(history.AsOf); m = m.AddDate(0, 1, 0) {
		interest := int64(math.Round(float64(owed) * rate))
		owed -= installment - interest
		movement(m, "PAGO CUOTA", installment, installment-interest)
		d.add(payrollLast4, m, "DEBITO PRESTAMO", -installment)
	}
	d.loanHistory = history
}

// dollars come from clients abroad every other month, and from pesos when
// an installment of the home is due.
func (d *demo) dollars() {
	for i, m := range d.months {
		if i%2 == 1 {
			d.add(dollarsLast4, day(m, 22), "TRNFUSD650.00CLIENTE DEL EXTERIOR LLC1.00USD 10.00 0000000000COM0000000000", 64_000)
		}
	}
}

// investments: a home bought off-plan (reservation, down payment and an
// installment every three months, from the dollar account) and shares.
func (d *demo) investments() {
	d.add(dollarsLast4, day(d.fromEnd(10), 10), "Transf. MB a 0000009876 FIDEICOMISO TORRE", -100_000)
	d.add(dollarsLast4, day(d.fromEnd(8), 15), "Transf. MB a 0000009876 FIDEICOMISO TORRE", -950_000)
	for n := 5; n >= 0; n -= 3 {
		due := day(d.fromEnd(n), 15)
		// Dollars bought from pesos two days before, at 60.50.
		bought := due.AddDate(0, 0, -2)
		d.add(payrollLast4, bought, "Transf. MB a 80000"+dollarsLast4, -12_100_000)
		d.add(dollarsLast4, bought, "Transf. MB desde 80000"+payrollLast4, 200_000)
		d.add(dollarsLast4, due, "Transf. MB a 0000009876 FIDEICOMISO TORRE", -200_000)
	}
	d.add(payrollLast4, day(d.fromEnd(7), 10), "MB a 0000004455 PUESTO DE BOLSA", -9_000_000)
}

// interest is what each account earns at the end of the month, and the
// tax withheld on it.
func (d *demo) interest() {
	for _, last4 := range []string{payrollLast4, dollarsLast4} {
		balance := openingBalance(last4)
		events := d.bank[last4]
		for _, m := range d.months {
			end := m.AddDate(0, 1, -1)
			for _, e := range events {
				if !e.date.Before(m) && !e.date.After(end) {
					balance += e.amount
				}
			}
			earned := int64(math.Round(float64(balance) * 0.01 / 12))
			if earned > 0 {
				withheld := int64(math.Round(float64(earned) * 0.1))
				d.add(last4, end, "PAGO INTERES", earned)
				d.add(last4, end, "WH", -withheld)
				balance += earned - withheld
			}
		}
	}
}

func openingBalance(last4 string) int64 {
	if last4 == dollarsLast4 {
		return 1_280_000
	}
	return 18_500_000
}

// accountStatements cut each account's movements by month, with the balance
// after each one.
func (d *demo) accountStatements() []statements.AccountStatement {
	var out []statements.AccountStatement
	for _, account := range []struct{ last4, product, currency string }{
		{payrollLast4, "CUENTA NOMINA", "DOP"},
		{dollarsLast4, "AHORRO DOLARES", "USD"},
	} {
		events := d.bank[account.last4]
		slices.SortStableFunc(events, func(a, b bankEvent) int { return a.date.Compare(b.date) })
		balance := openingBalance(account.last4)
		for _, m := range d.months {
			end := m.AddDate(0, 1, -1)
			st := statements.AccountStatement{Institution: "popular", Product: account.product, Last4: account.last4,
				Currency: account.currency, CutDate: end, PreviousBalance: balance}
			var credits, debits int64
			var nCredits, nDebits int
			for _, e := range events {
				if e.date.Before(m) || e.date.After(end) {
					continue
				}
				balance += e.amount
				st.Transactions = append(st.Transactions, statements.AccountTransaction{PostedOn: e.date, TransactedOn: e.date,
					Description: e.desc, Amount: e.amount, Balance: balance})
				if e.amount > 0 {
					credits, nCredits = credits+e.amount, nCredits+1
				} else {
					debits, nDebits = debits+e.amount, nDebits+1
				}
			}
			st.Balance = balance
			st.Summary = []statements.SummaryLine{
				{Label: "+ DEPOSITOS Y OTROS CREDITOS", Count: nCredits, Amount: credits},
				{Label: "- CHEQUES Y OTROS DEBITOS", Count: nDebits, Amount: debits},
			}
			out = append(out, st)
		}
	}
	return out
}

// certificate is a RD$200,000 certificate at 9% opened the first month,
// with its interest added every month and the tax withheld on it.
func (d *demo) certificate() statements.CertificateHistory {
	opened := day(d.months[0], 10)
	h := statements.CertificateHistory{Institution: "popular", Last4: cdLast4, Currency: "DOP",
		AsOf: d.months[len(d.months)-1].AddDate(0, 1, -1), Rate: 9, Matures: opened.AddDate(2, 0, 0)}
	balance := int64(20_000_000)
	h.Movements = append(h.Movements, statements.CertificateMovement{EffectiveOn: opened, PostedOn: opened, Code: "87",
		Description: "DEPOSITO", Amount: balance, Rate: 9, Balance: balance})
	for m := opened.AddDate(0, 1, 0); !m.After(h.AsOf); m = m.AddDate(0, 1, 0) {
		interest := int64(math.Round(float64(balance) * 0.09 / 12))
		balance += interest
		h.Movements = append(h.Movements, statements.CertificateMovement{EffectiveOn: m, PostedOn: m, Code: "20",
			Description: "INTERES AGREGADO", Amount: interest, Rate: 9, Balance: balance})
		withheld := int64(math.Round(float64(interest) * 0.1))
		balance -= withheld
		h.Movements = append(h.Movements, statements.CertificateMovement{EffectiveOn: m, PostedOn: m, Code: "06",
			Description: "RETENCION DGII", Amount: -withheld, Rate: 9, Balance: balance})
	}
	return h
}

// settings: payroll on the 15th and 30th, rules for the rent and the
// bonuses, and the assets no statement shows.
func (d *demo) settings(ctx context.Context, db *store.Store) error {
	payroll := ledger.Payroll{AccountID: "popular:savings:" + payrollLast4 + ":DOP", Keyword: "nomina", Days: []int{15, 30},
		DaysBefore: 2, DaysAfter: 2}
	if err := db.SetPayroll(ctx, payroll); err != nil {
		return err
	}
	if err := db.SetRules(ctx, []ledger.Rule{
		{Name: "Alquiler", Contains: []string{"inmobiliaria del este"}, Direction: ledger.Out, CategoryID: "rent"},
		{Name: "Bonificación", Contains: []string{"nomina"}, Months: []int{3}, MinAmount: 10_000_000, Direction: ledger.In,
			CategoryID: "profit-sharing"},
		{Name: "Regalía", Contains: []string{"nomina"}, Months: []int{12}, MinAmount: 9_000_000, Direction: ledger.In,
			CategoryID: "bonus"},
	}); err != nil {
		return err
	}

	last := d.months[len(d.months)-1].AddDate(0, 1, -1)
	var balances []assets.Balance
	amount := int64(31_000_000)
	for m := d.months[0].AddDate(0, -1, 0); !m.After(d.months[len(d.months)-1]); m = m.AddDate(0, 1, 0) {
		balances = append(balances, assets.Balance{Date: m.AddDate(0, 1, -1).Format(time.DateOnly), Amount: amount})
		amount += d.between(6_800, 8_200)
	}
	reservation := day(d.fromEnd(10), 10)
	down := day(d.fromEnd(8), 15)
	first := day(d.fromEnd(5), 15)
	for _, a := range []assets.Asset{
		{Kind: assets.Property, Name: "Torre Las Palmas", Currency: "USD", Match: []string{"fideicomiso torre"},
			Property: &assets.Plan{Price: 9_500_000,
				Reservation:  &assets.Payment{Amount: 100_000, Date: reservation.Format(time.DateOnly)},
				DownPayment:  &assets.Payment{Amount: 950_000, Date: down.Format(time.DateOnly)},
				Installments: &assets.Installments{Amount: 200_000, EveryMonths: 3, First: first.Format(time.DateOnly), Last: first.AddDate(1, 6, 0).Format(time.DateOnly)},
				Delivery:     first.AddDate(2, 0, 0).Format(time.DateOnly)}},
		{Kind: assets.Shares, Name: "Acciones locales", Currency: "DOP", Match: []string{"puesto de bolsa"},
			Shares: &assets.Holding{Quantity: 300, Price: 34_500, PriceDate: last.Format(time.DateOnly)}},
		{Kind: assets.Pension, Name: "Fondo de pensiones", Currency: "DOP", Pension: &assets.Fund{Balances: balances}},
		{Kind: assets.Vehicle, Name: "Vehículo familiar", Currency: "DOP",
			Vehicle: &assets.Depreciation{Price: 165_000_000, Date: d.months[0].AddDate(0, -7, 14).Format(time.DateOnly), Rate: 0.12}},
	} {
		if _, err := db.SaveAsset(ctx, a, convert); err != nil {
			return fmt.Errorf("%s: %w", a.Name, err)
		}
	}
	return db.SyncAssetLinks(ctx, convert)
}

// convert changes money at 60.50 pesos per dollar: the demo needs no rates.
func convert(_ context.Context, cents int64, from, to, _ string) (int64, error) {
	switch {
	case from == to:
		return cents, nil
	case from == "USD":
		return int64(math.Round(float64(cents) * 60.5)), nil
	default:
		return int64(math.Round(float64(cents) / 60.5)), nil
	}
}

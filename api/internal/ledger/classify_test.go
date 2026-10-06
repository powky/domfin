package ledger

import "testing"

var (
	payrollAccount = Account{ID: "popular:checking:1111:DOP", Institution: "popular", Kind: Checking, Name: "Cuenta nómina", Last4: "1111", Currency: "DOP"}
	dollarAccount  = Account{ID: "popular:savings:2222:USD", Institution: "popular", Kind: Savings, Name: "Cuenta dólares", Last4: "2222", Currency: "USD"}
	card           = Account{ID: "popular:credit_card:5678:DOP", Institution: "popular", Kind: CreditCard, Name: "Contigo", Last4: "5678", Currency: "DOP"}
	loan           = Account{ID: "popular:loan:9876:DOP", Institution: "popular", Kind: Loan, Name: "Extracrédito", Last4: "9876", Currency: "DOP"}
	certificate    = Account{ID: "popular:certificate:5555:DOP", Institution: "popular", Kind: Certificate, Name: "Certificado", Last4: "5555", Currency: "DOP"}
	digitalAccount = Account{ID: "popular:savings:3333:DOP", Institution: "popular", Kind: Savings, Name: "Cuenta digital", Last4: "3333", Currency: "DOP"}
)

// move builds a movement; its ID is the account and the date.
func move(account Account, date, description string, amount int64) Movement {
	return Movement{ID: account.ID + ":" + date + ":" + description, AccountID: account.ID, Date: date,
		Description: description, Amount: amount, Currency: account.Currency}
}

func cardMove(date string, kind Kind, mcc string, amount int64) Movement {
	m := move(card, date, string(kind)+" "+mcc, amount)
	m.Kind, m.MCC = kind, mcc
	return m
}

func withKind(m Movement, kind Kind) Movement {
	m.Kind = kind
	return m
}

func classifier() Classifier {
	payroll := DefaultPayroll()
	payroll.AccountID = payrollAccount.ID
	return Classifier{
		Accounts:   []Account{payrollAccount, dollarAccount, card, loan, certificate, digitalAccount},
		Categories: DefaultCategories,
		Payroll:    payroll,
	}
}

type want struct {
	flow     Flow
	category string
	by       Source
	review   bool
}

func check(t *testing.T, c Classifier, movements []Movement, wants []want) []Classification {
	t.Helper()
	got := c.Classify(movements)
	for i, w := range wants {
		g := got[i]
		if g.Flow != w.flow || g.CategoryID != w.category || g.By != w.by || g.Review != w.review {
			t.Errorf("%s: got %s/%q by %s review=%v, want %s/%q by %s review=%v", movements[i].ID,
				g.Flow, g.CategoryID, g.By, g.Review, w.flow, w.category, w.by, w.review)
		}
	}
	return got
}

func TestPayroll(t *testing.T) {
	movements := []Movement{
		move(payrollAccount, "2026-01-15", "CREDITO NOMINA EMPRESA", 5_000_000),
		move(payrollAccount, "2026-01-30", "CREDITO NOMINA EMPRESA", 5_000_000),
		// February 2026 ends on the 28th: that's the 30th's payday.
		move(payrollAccount, "2026-02-27", "CREDITO NOMINA EMPRESA", 5_000_000),
		// Off the paydays: extra income.
		move(payrollAccount, "2026-03-22", "CREDITO NÓMINA EMPRESA", 1_200_000),
		// Two credits on one payday: the second may be the salary instead.
		move(payrollAccount, "2026-04-15", "CREDITO NOMINA EMPRESA", 5_000_000),
		move(payrollAccount, "2026-04-15", "CREDITO NOMINA INCENTIVO", 800_000),
		// Inside the window, the credit closest to the payday is the salary.
		move(payrollAccount, "2026-05-12", "CREDITO NOMINA BONO", 900_000),
		move(payrollAccount, "2026-05-14", "CREDITO NOMINA EMPRESA", 5_000_000),
		// Only the payroll account's credits count.
		move(dollarAccount, "2026-05-15", "CREDITO NOMINA", 30_000),
		// Money out is never payroll.
		move(payrollAccount, "2026-06-15", "REVERSO NOMINA", -5_000_000),
	}
	check(t, classifier(), movements, []want{
		{Income, CategorySalary, ByPayroll, false},
		{Income, CategorySalary, ByPayroll, false},
		{Income, CategorySalary, ByPayroll, false},
		{Income, CategoryExtraIncome, ByPayroll, false},
		{Income, CategorySalary, ByPayroll, false},
		{Income, CategoryExtraIncome, ByPayroll, true},
		{Income, CategoryExtraIncome, ByPayroll, true},
		{Income, CategorySalary, ByPayroll, false},
		{Income, "", ByDefault, true},
		{Expense, "", ByDefault, true},
	})
}

func TestPayrollWithoutDays(t *testing.T) {
	c := classifier()
	c.Payroll.Days = nil
	check(t, c, []Movement{move(payrollAccount, "2026-01-15", "NOMINA", 5_000_000)}, []want{
		{Income, CategoryExtraIncome, ByPayroll, false},
	})
}

func TestRulesComeBeforePayroll(t *testing.T) {
	c := classifier()
	c.Rules = []Rule{
		// The December bonus comes as payroll too: tell it by its size.
		{ID: "1", Contains: []string{"nomina"}, Months: []int{12}, MinAmount: 8_000_000, CategoryID: "bonus"},
		{ID: "2", Accounts: []string{dollarAccount.ID}, Direction: In, CategoryID: CategoryExtraIncome},
		{ID: "3", Contains: []string{"transferencia de juan"}, CategoryID: "one-off", Review: true},
		{ID: "4", CategoryID: "other-income"}, // no conditions: never matches
	}
	movements := []Movement{
		move(payrollAccount, "2026-12-15", "CREDITO NOMINA", 5_000_000),
		move(payrollAccount, "2026-12-18", "CREDITO NOMINA", 10_000_000),
		move(dollarAccount, "2026-07-03", "TRANSFERENCIA RECIBIDA", 150_000),
		move(dollarAccount, "2026-07-09", "TRANSFERENCIA ENVIADA", -500),
		move(payrollAccount, "2026-07-20", "Transferencia de Juan Pérez", 250_000),
	}
	got := check(t, c, movements, []want{
		{Income, CategorySalary, ByPayroll, false},
		{Income, "bonus", ByRule, false},
		{Income, CategoryExtraIncome, ByRule, false},
		{Expense, "", ByDefault, true},
		{Income, "one-off", ByRule, true},
	})
	if got[1].RuleID != "1" || got[2].RuleID != "2" {
		t.Errorf("rule IDs: %q, %q", got[1].RuleID, got[2].RuleID)
	}
}

func TestOverridesWin(t *testing.T) {
	c := classifier()
	salary := move(payrollAccount, "2026-01-15", "CREDITO NOMINA", 5_000_000)
	c.Overrides = map[string]string{salary.ID: "bonus", "missing": "bonus"}
	c.Rules = []Rule{{ID: "1", Contains: []string{"nomina"}, CategoryID: "other-income"}}
	check(t, c, []Movement{salary}, []want{{Income, "bonus", ByManual, false}})
}

func TestCards(t *testing.T) {
	movements := []Movement{
		cardMove("2026-03-02", Purchase, "5411", -350_000),
		cardMove("2026-03-03", Refund, "5411", 20_000),
		cardMove("2026-03-04", Purchase, "3005", -2_500_000), // an airline's own code
		cardMove("2026-03-05", Purchase, "1234", -10_000),
		cardMove("2026-03-06", Cashback, "", 5_000),
		cardMove("2026-03-07", Fee, "", -30_000),
		cardMove("2026-03-08", Interest, "", -120_000),
		cardMove("2026-03-09", CashAdvance, "6011", -500_000),
		cardMove("2026-03-10", Payment, "", 4_000_000),
		move(payrollAccount, "2026-03-09", "PAGO TARJETA", -4_000_000),
		// No debit pays this one: still a transfer.
		cardMove("2026-03-20", Payment, "", 1_000_000),
	}
	got := check(t, classifier(), movements, []want{
		{Expense, "groceries", ByBank, false},
		{Expense, "groceries", ByBank, false},
		{Expense, "flights", ByBank, false},
		{Expense, "", ByDefault, true},
		{Income, CategoryCashback, ByBank, false},
		{Expense, CategoryBankFees, ByBank, false},
		{Expense, CategoryInterestCharged, ByBank, false},
		{Transfer, CategoryCashWithdrawal, ByBank, false},
		{Transfer, CategoryCardPayment, ByTransfer, false},
		{Transfer, CategoryCardPayment, ByTransfer, false},
		{Transfer, CategoryCardPayment, ByBank, false},
	})
	if got[8].PairID != movements[9].ID || got[9].PairID != movements[8].ID || got[10].PairID != "" {
		t.Errorf("pairs: %q %q %q", got[8].PairID, got[9].PairID, got[10].PairID)
	}
}

func TestFastFood(t *testing.T) {
	purchase := func(date, merchant, mcc string) Movement {
		m := withKind(move(card, date, merchant+"  SANTO DOMINGO", -50_000), Purchase)
		m.Merchant, m.MCC = merchant, mcc
		return m
	}
	check(t, classifier(), []Movement{
		purchase("2026-03-01", "UBER RIDES-*UBER RIDES", "4111"),
		// Uber Eats charges with Uber's transport codes.
		purchase("2026-03-02", "UBER EATS-W*UBER EATS-", "4111"),
		purchase("2026-03-03", "UBER*EATS", "4789"),
		purchase("2026-03-04", "TACOS DE PRUEBA", "5814"),
		purchase("2026-03-05", "RESTAURANTE DE PRUEBA", "5812"),
	}, []want{
		{Expense, "rides", ByBank, false},
		{Expense, CategoryFastFood, ByBank, false},
		{Expense, CategoryFastFood, ByBank, false},
		{Expense, CategoryFastFood, ByBank, false},
		{Expense, "restaurants", ByBank, false},
	})
}

func TestLoans(t *testing.T) {
	movements := []Movement{
		withKind(move(loan, "2026-02-01", "DESEMBOLSO", -10_000_000), Disbursement),
		move(payrollAccount, "2026-02-01", "CREDITO DESEMBOLSO", 10_000_000),
		withKind(move(loan, "2026-03-05", "PAGO CUOTA", 950_000), Payment),
		move(payrollAccount, "2026-03-04", "DEBITO PRESTAMO", -950_000),
		// Paid from an account Domfin doesn't see: the installment is the expense.
		withKind(move(loan, "2026-04-05", "PAGO CUOTA", 950_000), Payment),
	}
	check(t, classifier(), movements, []want{
		{Transfer, CategoryDisbursement, ByTransfer, false},
		{Transfer, CategoryDisbursement, ByTransfer, false},
		{Transfer, CategoryLoanPayment, ByTransfer, false},
		{Expense, CategoryLoanPayments, ByTransfer, false},
		{Expense, CategoryLoanPayments, ByBank, false},
	})
}

func TestInvestments(t *testing.T) {
	movements := []Movement{
		withKind(move(certificate, "2026-01-22", "87 DEPOSITO", 50_000_000), Deposit),
		move(payrollAccount, "2026-01-21", "TRANSFERENCIA A CERTIFICADO", -50_000_000),
		withKind(move(certificate, "2026-02-22", "20 INTERES AGREGADO", 312_500), InterestEarned),
		withKind(move(certificate, "2026-02-22", "06 RETENCION DGII", -31_250), Withholding),
		// A different amount isn't the other side.
		withKind(move(certificate, "2026-03-22", "87 DEPOSITO", 1_000_000), Deposit),
		move(payrollAccount, "2026-03-22", "TRANSFERENCIA", -1_000_001),
	}
	check(t, classifier(), movements, []want{
		{Transfer, CategoryInvestmentIn, ByTransfer, false},
		{Transfer, CategoryInvestmentIn, ByTransfer, false},
		{Income, CategoryInterestIncome, ByBank, false},
		{Expense, CategoryWithholding, ByBank, false},
		{Transfer, CategoryInvestmentIn, ByBank, false},
		{Expense, "", ByDefault, true},
	})
}

func TestOwnTransfers(t *testing.T) {
	movements := []Movement{
		// Each side names the other account by a number ending in its last 4.
		move(payrollAccount, "2026-05-10", "Transf. via MB a 700123333", -500_000),
		move(digitalAccount, "2026-05-10", "Transf. MB desde 700121111", 500_000),
		// One side is enough.
		move(digitalAccount, "2026-05-12", "Transf. via MB a 700121111", -120_000),
		move(payrollAccount, "2026-05-13", "CREDITO", 120_000),
		// Without the other account, the same amount can be a coincidence.
		move(payrollAccount, "2026-06-01", "TRANSFERENCIA ENVIADA", -80_000),
		move(digitalAccount, "2026-06-01", "TRANSFERENCIA RECIBIDA", 80_000),
		// Too far apart.
		move(payrollAccount, "2026-06-10", "Transf. via MB a 700123333", -90_000),
		move(digitalAccount, "2026-06-20", "Transf. MB desde 700121111", 90_000),
		// Not between two accounts: the bank sending it back.
		move(payrollAccount, "2026-07-01", "Transf. via MB a 700121111", -10_000),
		move(payrollAccount, "2026-07-01", "REVERSO", 10_000),
	}
	got := check(t, classifier(), movements, []want{
		{Transfer, CategoryOwnTransfer, ByTransfer, false},
		{Transfer, CategoryOwnTransfer, ByTransfer, false},
		{Transfer, CategoryOwnTransfer, ByTransfer, false},
		{Transfer, CategoryOwnTransfer, ByTransfer, false},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
	})
	if got[0].PairID != movements[1].ID || got[3].PairID != movements[2].ID {
		t.Errorf("pairs: %q, %q", got[0].PairID, got[3].PairID)
	}
}

func TestPopularDescriptions(t *testing.T) {
	movements := []Movement{
		move(payrollAccount, "2026-03-27", "PAGO IMPUESTO 0.15% DGII 2 TRANS POR $ 18,000.00 Del 20/03/2026 Al 26/03/2026", -2_700),
		move(payrollAccount, "2026-03-04", "COD CASH BPD0958 60630013629", -400_000),
		// Long descriptions wrap at any letter.
		move(digitalAccount, "2026-03-09", "BANCO POPULAR OF. NUNEZ D SANT O DOMINGO 1234 5678 RET D E CHK BPD0001", -400_000),
		move(payrollAccount, "2026-03-10", "PAG CLARO 8095551234 000123", -250_000),
		move(payrollAccount, "2026-03-31", "PAGO INTERES", 294),
		move(payrollAccount, "2026-03-31", "WH", -29),
		move(payrollAccount, "2026-03-31", "EXI COMISIONES LBTR LBTR NUM E000001 RD$ 60,000.00 CAS0000000001", -10_000),
		move(dollarAccount, "2026-04-02", "TRNFUSD100.00GOOGLE LLC0.00USD 100.00 0001COM0001", 10_000),
		// An insurer paying back part of a bill; other companies depend on who they are.
		move(payrollAccount, "2026-04-03", "PAGOS A TERCEROS ARS HUMANO RD$ .00", 250_000),
		move(payrollAccount, "2026-04-03", "PAGOS A TERCEROS EMPRESA PRUEBA SRL RD$ .00", 1_000_000),
		// A payment to one of your cards whose statement doesn't show it,
		// and to one whose statements aren't imported yet.
		move(payrollAccount, "2026-04-30", "PagoTC Via MB************5678", -1_000_000),
		move(dollarAccount, "2026-04-06", "Pago via MB a TC ****9999", -25_213),
		// Transfers to people depend on who they are.
		move(payrollAccount, "2026-04-07", "MB a 0000000001 Ana P", -500_000),
		// Patterns only know the direction the bank prints them in.
		move(payrollAccount, "2026-04-08", "WH", 29),
		// A card's own fee, printed as a purchase without a merchant code.
		withKind(move(card, "2026-08-15", "Fee Consulta ATM", -1_500), Purchase),
	}
	check(t, classifier(), movements, []want{
		{Expense, "taxes", ByBank, false},
		{Transfer, CategoryCashWithdrawal, ByBank, false},
		{Transfer, CategoryCashWithdrawal, ByBank, false},
		{Expense, "telecom", ByBank, false},
		{Income, CategoryInterestIncome, ByBank, false},
		{Expense, CategoryWithholding, ByBank, false},
		{Expense, CategoryBankFees, ByBank, false},
		{Income, CategoryExtraIncome, ByBank, false},
		{Income, CategoryInsuranceReimbursement, ByBank, false},
		{Income, "", ByDefault, true},
		{Transfer, CategoryCardPayment, ByBank, false},
		{Transfer, CategoryCardPayment, ByBank, false},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
		{Expense, CategoryBankFees, ByBank, false},
	})
}

func TestMerchantsWithoutACode(t *testing.T) {
	qik := Account{ID: "qik:credit_card:4321:DOP", Institution: "qik", Kind: CreditCard, Name: "Qik", Last4: "4321", Currency: "DOP"}
	c := classifier()
	c.Accounts = append(c.Accounts, qik)
	purchase := func(account Account, date, merchant, mcc string, amount int64) Movement {
		m := withKind(move(account, date, merchant, amount), Purchase)
		m.Merchant, m.MCC = merchant, mcc
		return m
	}
	movements := []Movement{
		purchase(card, "2026-03-01", "HELADERIA PRUEBA", "5812", -80_000),
		purchase(card, "2026-03-02", "HELADERIA PRUEBA", "5812", -60_000),
		// The Qik prints no merchant code: the other card knows the place.
		purchase(qik, "2026-03-09", "Heladería Prueba", "", -180_000),
		purchase(qik, "2026-03-10", "Lugar Nuevo", "", -50_000),
	}
	check(t, c, movements, []want{
		{Expense, "restaurants", ByBank, false},
		{Expense, "restaurants", ByBank, false},
		{Expense, "restaurants", ByMerchant, false},
		{Expense, "", ByDefault, true},
	})
}

func TestReversals(t *testing.T) {
	movements := []Movement{
		// An LBTR that failed, its fee, and the bank sending the money back:
		// what comes back is the transfer, not the fee.
		move(digitalAccount, "2026-05-15", "EXI COMISIONES LBTR LBTR NUM E000001 RD$ 100.00", -10_000),
		move(digitalAccount, "2026-05-15", "LBTR/IB/ VIA LBTR 30000000001 PERSONA DE PRUEBA", -10_000),
		move(digitalAccount, "2026-05-15", "DEV LBTR BE01/ID BENEF. INCORR E000001.ADEV0001", 10_000),
		// A failed ACH payment, returned three days later.
		move(payrollAccount, "2026-09-17", "Pago ACH MB a 9600000001", -150_000),
		move(payrollAccount, "2026-09-20", "Desde SCONTAINER a 800121111 RD$ .00", 150_000),
		// A correction that takes back money received by mistake.
		move(dollarAccount, "2026-06-15", "Transf. MB desde 700123333", 6_019),
		move(dollarAccount, "2026-06-18", "CORREC IB D/F 15.06.2026", -6_019),
		// A return whose movement is older than the statements: still a return.
		move(payrollAccount, "2026-01-02", "DEV LBTR BE01/ID BENEF. INCORR E000002.ADEV0002", 5_000),
	}
	got := check(t, classifier(), movements, []want{
		{Expense, CategoryBankFees, ByBank, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByTransfer, false},
		{Transfer, CategoryReversal, ByBank, false},
	})
	if got[2].PairID != movements[1].ID {
		t.Errorf("returned %q, want the transfer", got[2].PairID)
	}
}

func TestCashDeposits(t *testing.T) {
	movements := []Movement{
		move(payrollAccount, "2026-08-17", "OF_NUNEZ_DE_CAC_AUT Z DS ANTO DOMI 600000000001 170826 DEP AHORRO BPD0", 1_500_000),
		move(digitalAccount, "2026-06-11", "DEPOSITO", 500_000),
		move(dollarAccount, "2026-05-18", "DEPOSITO DE AHORROS", 4_600),
	}
	check(t, classifier(), movements, []want{
		{Transfer, CategoryCashDeposit, ByBank, false},
		{Transfer, CategoryCashDeposit, ByBank, false},
		{Transfer, CategoryCashDeposit, ByBank, false},
	})
}

func TestDollarsSoldToSomeone(t *testing.T) {
	movements := []Movement{
		// US$200 to a person, who pays RD$11,900 into another account: both
		// name them (the bank cuts the name short).
		move(dollarAccount, "2026-06-10", "MB a 0123456789 PERSONA DE PRUEBA", -20_000),
		move(digitalAccount, "2026-06-10", "MB desde 987654321 PERSONA DE", 1_190_000),
		// Different people aren't the same money.
		move(dollarAccount, "2026-06-12", "MB a 0123456789 PERSONA UNO", -20_000),
		move(digitalAccount, "2026-06-12", "MB desde 987654321 OTRA PERSONA", 1_190_000),
	}
	check(t, classifier(), movements, []want{
		{Transfer, CategoryExchange, ByTransfer, false},
		{Transfer, CategoryExchange, ByTransfer, false},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
	})
}

func TestCashAdvanceIntoAnAccount(t *testing.T) {
	movements := []Movement{
		cardMove("2026-07-01", CashAdvance, "", -500_000),
		// The same amount coming in isn't the advance unless the bank says so.
		move(payrollAccount, "2026-07-01", "TRANSFERENCIA RECIBIDA", 500_000),
		move(payrollAccount, "2026-07-01", "AVANCE DE EFECTIVO VIA APP POP", 500_000),
		// Out of an ATM: cash taken out.
		cardMove("2026-07-05", CashAdvance, "6011", -300_000),
	}
	got := check(t, classifier(), movements, []want{
		{Transfer, CategoryCashAdvance, ByTransfer, false},
		{Income, "", ByDefault, true},
		{Transfer, CategoryCashAdvance, ByTransfer, false},
		{Transfer, CategoryCashWithdrawal, ByBank, false},
	})
	if got[0].PairID != movements[2].ID {
		t.Errorf("pair: %q", got[0].PairID)
	}
}

func TestCurrencyExchange(t *testing.T) {
	movements := []Movement{
		// US$200.00 into RD$11,360.00, 56.80 pesos per dollar; each side
		// names the other account.
		move(dollarAccount, "2026-07-08", "Transf. via MB a 700121111", -20_000),
		move(payrollAccount, "2026-07-08", "Transf. MB desde 700122222", 1_136_000),
		// No bank changes money at 1 to 1.
		move(dollarAccount, "2026-07-10", "Transf. via MB a 700121111", -10_000),
		move(payrollAccount, "2026-07-10", "Transf. MB desde 700122222", 10_000),
		// Neither side names the other.
		move(dollarAccount, "2026-07-20", "TRANSFERENCIA ENVIADA", -10_000),
		move(payrollAccount, "2026-07-20", "TRANSFERENCIA RECIBIDA", 590_000),
	}
	got := check(t, classifier(), movements, []want{
		{Transfer, CategoryExchange, ByTransfer, false},
		{Transfer, CategoryExchange, ByTransfer, false},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
		{Expense, "", ByDefault, true},
		{Income, "", ByDefault, true},
	})
	if got[0].PairID != movements[1].ID {
		t.Errorf("pair: %q", got[0].PairID)
	}
}

func TestTransfersPairOutsideTheirWindow(t *testing.T) {
	movements := []Movement{
		cardMove("2026-03-20", Payment, "", 4_000_000),
		move(payrollAccount, "2026-03-09", "PAGO TARJETA", -4_000_000), // 11 days apart
		move(payrollAccount, "2026-03-18", "PAGO TARJETA", -4_000_000), // the nearest
	}
	got := classifier().Classify(movements)
	if got[0].PairID != movements[2].ID || got[1].By != ByDefault {
		t.Errorf("got %+v", got)
	}
}

func TestRuleMatches(t *testing.T) {
	m := Movement{AccountID: "a", Date: "2026-12-15", Description: "Crédito  Nómina", Amount: -5_000, Currency: "DOP", MCC: "5411"}
	for _, tc := range []struct {
		rule Rule
		want bool
	}{
		{Rule{Contains: []string{"CREDITO NOMINA"}}, true},
		{Rule{Contains: []string{"bono", "nómina"}}, true},
		{Rule{Contains: []string{""}}, false},
		{Rule{Direction: Out, Currency: "DOP"}, true},
		{Rule{Direction: In}, false},
		{Rule{MinAmount: 5_000, MaxAmount: 5_000}, true},
		{Rule{MinAmount: 5_001}, false},
		{Rule{Months: []int{12}, MCCs: []string{"5411"}}, true},
		{Rule{Months: []int{11}}, false},
		{Rule{Accounts: []string{"b"}}, false},
		{Rule{}, false},
	} {
		if got := tc.rule.Matches(m); got != tc.want {
			t.Errorf("%+v: got %v", tc.rule, got)
		}
	}
}

func TestAddedByHand(t *testing.T) {
	byHand := func(m Movement, missing bool) Movement {
		m.ID = "manual:" + m.Date
		m.Manual, m.Missing = true, missing
		return m
	}
	movements := []Movement{
		// The bank's own debit pays the card, though the one typed by hand
		// for the same amount is nearer.
		move(payrollAccount, "2026-03-09", "PAGO TARJETA", -4_000_000),
		byHand(move(payrollAccount, "2026-03-10", "Abono", -4_000_000), false),
		cardMove("2026-03-10", Payment, "", 4_000_000),
		// Cash spent that no statement shows, and one its statement came
		// without: only that one asks for a look.
		byHand(move(card, "2026-03-12", "Colmado", -50_000), false),
		byHand(move(card, "2026-03-14", "Propina", -20_000), true),
	}
	got := check(t, classifier(), movements, []want{
		{Transfer, CategoryCardPayment, ByTransfer, false},
		{Expense, "", ByDefault, false},
		{Transfer, CategoryCardPayment, ByTransfer, false},
		{Expense, "", ByDefault, false},
		{Expense, "", ByDefault, true},
	})
	if got[2].PairID != movements[0].ID || got[1].PairID != "" {
		t.Errorf("pairs: %q, %q", got[2].PairID, got[1].PairID)
	}
}

package ledger

import "strings"

// described says where a movement goes by what its description says. The
// Popular prints checking and savings movements without a kind or an MCC,
// only the description (and cards, a few of the bank's own charges), and it
// wraps long descriptions over several lines at any letter ("RET D E CHK"),
// so patterns are matched with the spaces taken out.
type described struct {
	// contains must all appear in the description.
	contains []string
	// prefix, when set, must start it; whole, when set, must be all of it.
	prefix, whole string
	// sign is 1 for money coming in, -1 for money going out, 0 for either.
	sign int
	// names, when set, is a kind of account the description must name (by
	// its last 4 digits) among yours; otherwise the movement is left for
	// review.
	names      AccountKind
	categoryID string
}

// popularDescriptions are the movements the Popular prints the same way
// every time, in the order they're tried.
var popularDescriptions = []described{
	// The DGII's 0.15% on transfers and checks, charged once a week.
	{contains: []string{"pagoimpuesto", "dgii"}, sign: -1, categoryID: "taxes"},
	// Cash out of an ATM, or with a code for one (it comes back if unused).
	{contains: []string{"codcash"}, categoryID: CategoryCashWithdrawal},
	{contains: []string{"retdechk"}, sign: -1, categoryID: CategoryCashWithdrawal},
	// Cash put back into the account, at a branch or an ATM.
	{contains: []string{"depahorro"}, sign: 1, categoryID: CategoryCashDeposit},
	{prefix: "depositodeahorro", sign: 1, categoryID: CategoryCashDeposit},
	{whole: "deposito", sign: 1, categoryID: CategoryCashDeposit},
	// Money a card lends in cash, into this account.
	{contains: []string{"avancedeefectivo"}, sign: 1, categoryID: CategoryCashAdvance},
	// A payment to a card, one of yours even when Domfin doesn't have its
	// statements yet (its spending shows once they're imported).
	{contains: []string{"pagotcviamb"}, sign: -1, categoryID: CategoryCardPayment},
	{contains: []string{"pagoviambatc"}, sign: -1, categoryID: CategoryCardPayment},
	// The bank giving back what it didn't send or took by mistake, when the
	// movement it undoes isn't in the statements.
	{prefix: "devlbtr", sign: 1, categoryID: CategoryReversal},
	{contains: []string{"scontainer"}, sign: 1, categoryID: CategoryReversal},
	{prefix: "correcib", categoryID: CategoryReversal},
	// Bills paid through the bank, "PAG CLARO …".
	{prefix: "pagclaro", sign: -1, categoryID: "telecom"},
	{prefix: "pagaltice", sign: -1, categoryID: "telecom"},
	{prefix: "pagviva", sign: -1, categoryID: "telecom"},
	{prefix: "pagedesur", sign: -1, categoryID: "utilities"},
	{prefix: "pagedenorte", sign: -1, categoryID: "utilities"},
	{prefix: "pagedeeste", sign: -1, categoryID: "utilities"},
	{prefix: "pagcaasd", sign: -1, categoryID: "utilities"},
	// What the account earns, and the DGII's withholding on it ("WH").
	{prefix: "pagointeres", sign: 1, categoryID: CategoryInterestIncome},
	{whole: "wh", sign: -1, categoryID: CategoryWithholding},
	{contains: []string{"comision"}, sign: -1, categoryID: CategoryBankFees},
	// Cards print some of the bank's fees as purchases without a merchant code.
	{prefix: "feeconsulta", sign: -1, categoryID: CategoryBankFees},
	{contains: []string{"cashback"}, sign: 1, categoryID: CategoryCashback},
	// A loan paid into this account.
	{contains: []string{"desembolsoprestamo"}, sign: 1, categoryID: CategoryDisbursement},
	// Dollars wired from abroad ("TRNFUSD … GOOGLE LLC") and remittances:
	// what clients and app stores pay, on top of the salary.
	{prefix: "trnfusd", sign: 1, categoryID: CategoryExtraIncome},
	{contains: []string{"remesa"}, sign: 1, categoryID: CategoryExtraIncome},
	// A health insurer (an ARS) paying back part of a bill you paid:
	// "PAGOS A TERCEROS ARS UNIVERSAL". Other companies pay through
	// "PAGOS A TERCEROS" too, and those depend on who they are.
	{prefix: "pagosatercerosars", sign: 1, categoryID: CategoryInsuranceReimbursement},
}

// describedCategory is where a movement goes by its description, or "" when
// no pattern knows it.
func describedCategory(m Movement, accounts map[string]Account) string {
	text := strings.ReplaceAll(Normalize(m.Description), " ", "")
	for _, d := range popularDescriptions {
		if d.sign > 0 && m.Amount <= 0 || d.sign < 0 && m.Amount >= 0 {
			continue
		}
		if d.prefix != "" && !strings.HasPrefix(text, d.prefix) || d.whole != "" && text != d.whole {
			continue
		}
		if !containsAll(text, d.contains) {
			continue
		}
		if d.names != "" && !namesAccountOf(m.Description, accounts, d.names) {
			return ""
		}
		return d.categoryID
	}
	return ""
}

func containsAll(text string, words []string) bool {
	for _, w := range words {
		if !strings.Contains(text, w) {
			return false
		}
	}
	return true
}

// namesAccountOf reports whether the description names one of your
// accounts of that kind.
func namesAccountOf(description string, accounts map[string]Account, kind AccountKind) bool {
	for _, a := range accounts {
		if a.Kind == kind && names(description, a) {
			return true
		}
	}
	return false
}

// Package merchants names who the money of a movement went to or came
// from: a known merchant by its name (see Directory), the person or account
// on the other side of a transfer, the bank's own operations in plain
// words, and anything else as the bank printed it, cleaned up. The user can
// rename any of them. docs/modelo-de-datos.md explains it.
package merchants

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/powky/domfin/api/internal/ledger"
)

// Merchant is a business, as banks print it.
type Merchant struct {
	ID   string
	Name string
	// Words are the ways banks print it, found anywhere in the text.
	Words []string
	// First are names too common to look for anywhere: only at the start of
	// the text ("bravo" in "BRAVO LOS PROCERES").
	First []string
}

// Name is who a movement is with, as screens show it.
type Name struct {
	// Name is in Spanish; Operation and Ref say what it is when the bank
	// made it, for screens in other languages.
	Name string
	// Key ties together what the user renames at once: a merchant with all
	// the ways banks print it, a card or an account, a person, a name.
	// Empty for what can't be renamed (cash nobody detailed).
	Key string
	// MerchantID is a known merchant's (see Directory).
	MerchantID string
	// Operation is one of the bank's own (see operations), and Ref the last
	// digits of the card or account it names.
	Operation, Ref string
	// Person is the other side of a transfer, named by it.
	Person bool
}

// Of names a movement's other side; renames are the user's names, by Key.
func Of(m ledger.Movement, renames map[string]string) Name {
	n := of(m)
	if name := renames[n.Key]; name != "" && n.Key != "" {
		return Name{Name: name, Key: n.Key, MerchantID: n.MerchantID, Person: n.Person}
	}
	return n
}

func of(m ledger.Movement) Name {
	switch {
	case m.Kind == ledger.UndetailedCash:
		return Name{Name: m.Description}
	case m.Manual:
		// What the user typed stays as it is, unless it's a known merchant.
		if merchant, ok := find(m.Description); ok {
			return named(merchant)
		}
		return Name{Name: strings.TrimSpace(m.Description), Key: nameKey(m.Description)}
	}
	text := m.Merchant
	if text == "" {
		text = m.Description
	}
	if n, ok := operation(text); ok {
		return n
	}
	return byName(text)
}

// byName names a merchant or a person by what the bank printed of them.
func byName(text string) Name {
	if merchant, ok := find(text); ok {
		return named(merchant)
	}
	name := clean(text)
	return Name{Name: name, Key: nameKey(name)}
}

func named(m Merchant) Name {
	return Name{Name: m.Name, Key: "merchant:" + m.ID, MerchantID: m.ID}
}

// person names who a transfer went to or came from, unless it's a known
// merchant.
func person(text string) Name {
	n := byName(text)
	n.Person = n.MerchantID == ""
	return n
}

// nameKey ties together names that read the same: "SUPERMERCADO UNO" and
// "Supermercado Uno".
func nameKey(name string) string {
	if words := wordsOf(name); words != "" {
		return "name:" + words
	}
	return ""
}

// find looks for a known merchant in what the bank printed.
func find(text string) (Merchant, bool) {
	words := " " + wordsOf(text) + " "
	for _, m := range Directory {
		for _, w := range m.Words {
			if strings.Contains(words, " "+w+" ") {
				return m, true
			}
		}
		for _, w := range m.First {
			if strings.HasPrefix(words, " "+w+" ") {
				return m, true
			}
		}
	}
	return Merchant{}, false
}

// wordsOf is text as lowercase words without accents or punctuation, with
// letters and numbers apart: "UBER EATS-W*UBER EATS-" is "uber eats w uber
// eats", and "PRESTAMO000002468" is "prestamo 000002468".
func wordsOf(text string) string {
	var b strings.Builder
	var previous rune
	for _, r := range ledger.Normalize(text) {
		letter, digit := unicode.IsLetter(r), unicode.IsDigit(r)
		switch {
		case !letter && !digit:
			r = ' '
		case b.Len() > 0 && previous != ' ' && unicode.IsDigit(previous) != digit:
			b.WriteRune(' ')
		}
		b.WriteRune(r)
		previous = r
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// The bank's own operations, by what they are.
const (
	OpPayroll       = "payroll"        // Nómina
	OpInterest      = "interest"       // the interest an account earns
	OpWithholding   = "withholding"    // the tax withheld from it
	OpATM           = "atm"            // cash out of an ATM
	OpCashAdvance   = "cash-advance"   // cash a card lent into the account
	OpLoan          = "loan"           // paying a loan or receiving it
	OpInstallment   = "installment"    // a loan's installment, in its history
	OpPayment       = "payment"        // a payment to a card, in its statement
	OpDeposit       = "deposit"        // cash put into the account
	OpWithdrawal    = "withdrawal"     // money taken out at a branch
	OpCashback      = "cashback"       // cashback on bills paid
	OpCorrection    = "correction"     // the bank fixing a mistake
	OpReturned      = "returned"       // a transfer or payment sent back
	OpDollarsIn     = "dollars-in"     // dollars wired from abroad
	OpCard          = "card"           // a card, by its last digits (Ref)
	OpAccount       = "account"        // an account, by its last digits (Ref)
	opPaidThrough   = "paid-through"   // a bill paid through the bank: named by what it pays
	opTransferredTo = "transferred-to" // a transfer that names its person
)

// Spanish names of the bank's operations.
var operationNames = map[string]string{
	OpPayroll:     "Nómina",
	OpInterest:    "Intereses",
	OpWithholding: "Retención de impuestos",
	OpATM:         "Cajero automático",
	OpCashAdvance: "Avance de efectivo",
	OpLoan:        "Préstamo",
	OpInstallment: "Cuota",
	OpPayment:     "Pago",
	OpDeposit:     "Depósito",
	OpWithdrawal:  "Retiro",
	OpCashback:    "Cashback",
	OpCorrection:  "Corrección del banco",
	OpReturned:    "Devolución",
	OpDollarsIn:   "Transferencia en dólares",
	OpCard:        "Tarjeta",
	OpAccount:     "Cuenta",
}

// operationPatterns are how the Popular prints its operations, tried in
// order on the text's words; the first group, when there is one, is the
// number of an account or card, or the name of a person or merchant.
var operationPatterns = []struct {
	pattern *regexp.Regexp
	op      string
}{
	{regexp.MustCompile(`^credito nomina\b`), OpPayroll},
	{regexp.MustCompile(`^pago interes\b|^interes(?:es)? agregados?\b`), OpInterest},
	{regexp.MustCompile(`^wh$`), OpWithholding},
	{regexp.MustCompile(`^cod cash\b|^retdechk\b|^ret de chk\b`), OpATM},
	{regexp.MustCompile(`^avance de efectivo\b`), OpCashAdvance},
	{regexp.MustCompile(`^desembolso prestamo\b|^pago via mb (?:a )?prestamo\b|^debito prestamo\b`), OpLoan},
	{regexp.MustCompile(`^pago cuota\b`), OpInstallment},
	{regexp.MustCompile(`^dep ahorro\b|^deposito de ahorro\b|^deposito$`), OpDeposit},
	{regexp.MustCompile(`^retiro (?:cta|ahorro)\b`), OpWithdrawal},
	{regexp.MustCompile(`^cashback\b`), OpCashback},
	{regexp.MustCompile(`^correc ib\b`), OpCorrection},
	{regexp.MustCompile(`^desde scontainer\b|^dev lbtr\b`), OpReturned},
	{regexp.MustCompile(`^pagotc via mb\b.*?(\d{4})\b|^pago via mb a tc\b.*?(\d{4})\b`), OpCard},
	{regexp.MustCompile(`^pago via app\b|^pago a tarjeta\b`), OpPayment},
	// Money to or from an account by its number, naming the person or not.
	{regexp.MustCompile(`^(?:transf )?(?:via )?mb (?:a|desde) \d*(\d{4}) ([a-z].*)$`), opTransferredTo},
	{regexp.MustCompile(`^(?:transf |pago ach )?(?:via )?mb (?:a|desde) \d*(\d{4})$|^app interb a \d*(\d{4})$`), OpAccount},
	{regexp.MustCompile(`^pagos a terceros (.+?)(?: rd \d+)?$`), opPaidThrough},
	{regexp.MustCompile(`^pag (.+)$`), opPaidThrough},
}

// dollarsIn finds who wired dollars from abroad: "TRNFUSD48.92ACME
// SERVICES LLC1.00USD10.00 …" was ACME SERVICES LLC.
var dollarsIn = regexp.MustCompile(`(?i)^trnfusd[\d,]+\.\d{2}(.*?)\d+\.\d{2}\s*usd`)

// toke is a transfer by Toke, the Popular's payments between people: "TOKE
// A JUAN PEREZ AB12CD3" went to JUAN PEREZ, "TOKE DE …" came from them; the
// code at the end is the transfer's.
var toke = regexp.MustCompile(`(?i)^toke\*?\s+(?:a|de)\s+(.+?)\s+[a-z0-9]{7}$`)

// operation names the bank's own operations and transfers.
func operation(text string) (Name, bool) {
	if match := dollarsIn.FindStringSubmatch(strings.TrimSpace(text)); match != nil {
		if strings.TrimSpace(match[1]) == "" {
			return opName(OpDollarsIn, ""), true
		}
		return person(match[1]), true
	}
	if match := toke.FindStringSubmatch(strings.TrimSpace(text)); match != nil {
		return person(match[1]), true
	}
	words := wordsOf(text)
	for _, p := range operationPatterns {
		match := p.pattern.FindStringSubmatch(words)
		if match == nil {
			continue
		}
		var groups []string
		for _, g := range match[1:] {
			if g != "" {
				groups = append(groups, g)
			}
		}
		switch p.op {
		case opTransferredTo:
			// The name the bank printed, from the original text.
			return person(tail(text, groups[len(groups)-1])), true
		case opPaidThrough:
			return byName(tail(text, groups[0])), true
		case OpCard, OpAccount:
			return opName(p.op, groups[0]), true
		}
		return opName(p.op, ""), true
	}
	return Name{}, false
}

func opName(op, ref string) Name {
	n := Name{Name: operationNames[op], Key: "op:" + op, Operation: op, Ref: ref}
	if ref != "" {
		n.Name += " ****" + ref
		n.Key += ":" + ref
	}
	return n
}

// tail is the part of text that reads as words, the bank's own letters
// kept: tail("MB a 0123456789 JUAN PEREZ", "juan perez") is "JUAN PEREZ".
func tail(text, words string) string {
	fields := strings.Fields(text)
	for start := range fields {
		if wordsOf(strings.Join(fields[start:], " ")) == words {
			return strings.Join(fields[start:], " ")
		}
	}
	return words
}

// processor is a payment processor's mark before the merchant's name:
// "PAYPAL *ACME", "SQ *ACME".
var processor = regexp.MustCompile(`(?i)^(?:paypal|pp|sq|sp|dlo|dlocal|payu|2co|mp|merpago|mercadopago)\s?\*\s*`)

// legalForms are the companies' legal forms, left out at the end of a name.
var legalForms = map[string]bool{
	"srl": true, "sa": true, "sas": true, "eirl": true, "inc": true, "llc": true, "ltd": true, "corp": true, "co": true,
}

// dangling are the small words a name cut short ends with: "ANA PEREZ DE
// LA" is Ana Perez.
var dangling = map[string]bool{
	"de": true, "del": true, "la": true, "las": true, "los": true, "el": true, "y": true, "e": true, "a": true,
}

// lowercase are the small words that stay small inside a name.
var lowercase = map[string]bool{
	"de": true, "del": true, "y": true, "e": true, "o": true, "u": true, "en": true, "a": true, "al": true,
	"con": true, "por": true, "para": true, "and": true, "of": true, "the": true,
}

// acronyms stay in capitals.
var acronyms = map[string]bool{
	"ars": true, "atm": true, "bhd": true, "bpd": true, "ccn": true, "dgii": true, "gbc": true, "rd": true,
	"tv": true, "uce": true, "usa": true, "unibe": true, "intec": true, "pucmm": true, "tgi": true,
	"aaa": true, "ii": true, "iii": true, "iv": true,
}

// clean makes a name of what a bank printed: without a processor before it
// ("PAYPAL *"), the numbers and codes after it or its legal form (SRL,
// INC…), in title case. "SUPERMERCADO UNO SRL" is "Supermercado Uno".
func clean(text string) string {
	text = processor.ReplaceAllString(strings.TrimSpace(text), "")
	fields := strings.Fields(text)
	for n := len(fields); n > 0; n = len(fields) {
		// "C. POR A.", the old legal form.
		if n >= 3 && wordsOf(strings.Join(fields[n-3:], " ")) == "c por a" {
			fields = fields[:n-3]
			continue
		}
		last := strings.Trim(fields[n-1], ".,;:-*#/")
		bare := wordsOf(last)
		if last == "" || strings.ContainsAny(last, "0123456789$") || len([]rune(last)) == 1 ||
			legalForms[strings.ReplaceAll(bare, " ", "")] || dangling[bare] && n > 1 {
			fields = fields[:n-1]
			continue
		}
		break
	}
	if len(fields) == 0 {
		return strings.TrimSpace(text)
	}
	for i, field := range fields {
		fields[i] = titleWord(strings.Trim(field, ",;:*"), i == 0)
	}
	return strings.Join(fields, " ")
}

// titleWord writes a word of a name in title case: small words small
// (unless first), acronyms and words without vowels in capitals, and web
// addresses as they read ("Netflix.com").
func titleWord(word string, first bool) string {
	lower := strings.ToLower(word)
	bare := wordsOf(lower)
	switch {
	case lowercase[bare] && !first:
		return lower
	case acronyms[bare], len([]rune(bare)) <= 4 && bare != "" && !strings.ContainsAny(bare, "aeiouy"):
		return strings.ToUpper(word)
	}
	runes := []rune(lower)
	start := true
	for i, r := range runes {
		if start && unicode.IsLetter(r) {
			runes[i] = unicode.ToUpper(r)
		}
		// A new part starts after a hyphen or a slash, not after a dot or
		// an apostrophe: "Coca-Cola", "Netflix.com", "Wendy's".
		start = r == '-' || r == '/'
	}
	return string(runes)
}

package merchants

import (
	"strings"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
)

// card is a card purchase: its merchant, and the description with the city.
func card(merchant string) ledger.Movement {
	return ledger.Movement{Merchant: merchant, Description: merchant + "  SANTO DOMINGO"}
}

// bank is a bank account's movement, which only has its description.
func bank(description string) ledger.Movement {
	return ledger.Movement{Description: description}
}

func TestNames(t *testing.T) {
	for _, c := range []struct {
		m    ledger.Movement
		want Name
	}{
		// Known merchants, however the bank prints them.
		{card("UBER RIDES-*UBER RIDES"), Name{Name: "Uber", Key: "merchant:uber", MerchantID: "uber"}},
		{card("UBER*RIDES"), Name{Name: "Uber", Key: "merchant:uber", MerchantID: "uber"}},
		{card("UBER *TRIP HELP.UBER.C"), Name{Name: "Uber", Key: "merchant:uber", MerchantID: "uber"}},
		{card("UBER EATS-W*UBER EATS-"), Name{Name: "Uber Eats", Key: "merchant:uber-eats", MerchantID: "uber-eats"}},
		{card("APPLE.COM/BILL"), Name{Name: "Apple", Key: "merchant:apple", MerchantID: "apple"}},
		{card("SM NACIONAL METRO PLZA"), Name{Name: "Nacional", Key: "merchant:nacional", MerchantID: "nacional"}},
		{card("CCN MERCA JUMBO KENNED"), Name{Name: "Jumbo", Key: "merchant:jumbo", MerchantID: "jumbo"}},
		{card("BRAVO LOS PROCERES"), Name{Name: "Bravo", Key: "merchant:bravo", MerchantID: "bravo"}},
		{card("PAYPAL *NETFLIX"), Name{Name: "Netflix", Key: "merchant:netflix", MerchantID: "netflix"}},
		{card("WENDYS 27 DE FEBRERO"), Name{Name: "Wendy's", Key: "merchant:wendys", MerchantID: "wendys"}},
		// Names that only look like one.
		{card("CAFE BRAVO"), Name{Name: "Cafe Bravo", Key: "name:cafe bravo"}},
		{card("APPLESEED CAFE"), Name{Name: "Appleseed Cafe", Key: "name:appleseed cafe"}},
		{card("APPLEBEES WINSTON"), Name{Name: "Applebee's", Key: "merchant:applebees", MerchantID: "applebees"}},
		{card("PLAZA LAS AMERICAS II"), Name{Name: "Plaza Las Americas II", Key: "name:plaza las americas ii"}},
		// Anything else, cleaned up.
		{card("SUPERMERCADO UNO SRL"), Name{Name: "Supermercado Uno", Key: "name:supermercado uno"}},
		{card("FERRETERIA EL MARTILLO 12"), Name{Name: "Ferreteria El Martillo", Key: "name:ferreteria el martillo"}},
		{card("SQ *CAFE DEL PARQUE"), Name{Name: "Cafe del Parque", Key: "name:cafe del parque"}},
		{card("ACME SERVICES, INC."), Name{Name: "Acme Services", Key: "name:acme services"}},
		{card("BBQ HOUSE"), Name{Name: "BBQ House", Key: "name:bbq house"}},
		{card("TIENDA LA MODA C. POR A."), Name{Name: "Tienda La Moda", Key: "name:tienda la moda"}},
		{card("MERCADO FRESCO G"), Name{Name: "Mercado Fresco", Key: "name:mercado fresco"}},
		// The bank's own operations.
		{bank("CREDITO NOMINA"), Name{Name: "Nómina", Key: "op:payroll", Operation: OpPayroll}},
		{bank("PAGO INTERES"), Name{Name: "Intereses", Key: "op:interest", Operation: OpInterest}},
		{bank("WH"), Name{Name: "Retención de impuestos", Key: "op:withholding", Operation: OpWithholding}},
		{bank("COD CASH BPD0000 60600000000"), Name{Name: "Cajero automático", Key: "op:atm", Operation: OpATM}},
		{bank("AVANCE DE EFECTIVO VIA APP POP"), Name{Name: "Avance de efectivo", Key: "op:cash-advance", Operation: OpCashAdvance}},
		{bank("PAGOTC VIA MB************1234"), Name{Name: "Tarjeta ****1234", Key: "op:card:1234", Operation: OpCard, Ref: "1234"}},
		{bank("PAGO VIA MB A TC ****5678"), Name{Name: "Tarjeta ****5678", Key: "op:card:5678", Operation: OpCard, Ref: "5678"}},
		{bank("PAGO VIA MB PRESTAMO000002468 RD$ .00"), Name{Name: "Préstamo", Key: "op:loan", Operation: OpLoan}},
		{bank("DESEMBOLSO PRESTAMO 1000002468"), Name{Name: "Préstamo", Key: "op:loan", Operation: OpLoan}},
		{bank("DEP AHORRO"), Name{Name: "Depósito", Key: "op:deposit", Operation: OpDeposit}},
		{bank("DEBITO PRESTAMO"), Name{Name: "Préstamo", Key: "op:loan", Operation: OpLoan}},
		{bank("PAGO CUOTA"), Name{Name: "Cuota", Key: "op:installment", Operation: OpInstallment}},
		{bank("INTERES AGREGADO"), Name{Name: "Intereses", Key: "op:interest", Operation: OpInterest}},
		{card("Pago Via App"), Name{Name: "Pago", Key: "op:payment", Operation: OpPayment}},
		{card("Pago A Tarjeta - Cuenta De Ahorro"), Name{Name: "Pago", Key: "op:payment", Operation: OpPayment}},
		{bank("RETIRO AHORRO S/LBRT"), Name{Name: "Retiro", Key: "op:withdrawal", Operation: OpWithdrawal}},
		{bank("CORREC IB D/F 15.06.2026"), Name{Name: "Corrección del banco", Key: "op:correction", Operation: OpCorrection}},
		{bank("DESDE SCONTAINER A 800000000 RD$ .00"), Name{Name: "Devolución", Key: "op:returned", Operation: OpReturned}},
		{bank("CASHBACK DE PAGO DE SERVICIOS RD$ .00"), Name{Name: "Cashback", Key: "op:cashback", Operation: OpCashback}},
		// Dollars wired from abroad, by who sent them.
		{bank("TRNFUSD250.00JUAN PEREZ GOMEZ1.00USD12.00 1234567890ES COM2600000000"), Name{Name: "Juan Perez Gomez", Key: "name:juan perez gomez", Person: true}},
		{bank("TRNFUSD48.92ACME SERVICES LAT AM LLC1.00USD10.00 15PR260000000000COM2600000000"), Name{Name: "Acme Services Lat Am", Key: "name:acme services lat am", Person: true}},
		{bank("TRNFUSD109.14GOOGLE LLC1.00USD 12.00 2026062200600000COM2600000000"), Name{Name: "Google", Key: "merchant:google", MerchantID: "google"}},
		{bank("TRNFUSD2,240.471.00USD12.00 2026042100600000COM2600000000"), Name{Name: "Transferencia en dólares", Key: "op:dollars-in", Operation: OpDollarsIn}},
		// Transfers, by the person or the account.
		{bank("MB a 0123456789 ANA PEREZ DE LA"), Name{Name: "Ana Perez", Key: "name:ana perez", Person: true}},
		{bank("MB desde 987654321 JUAN GOMEZ"), Name{Name: "Juan Gomez", Key: "name:juan gomez", Person: true}},
		{bank("Transf. via MB a 700123333"), Name{Name: "Cuenta ****3333", Key: "op:account:3333", Operation: OpAccount, Ref: "3333"}},
		{bank("TRANSF. MB DESDE 700124444"), Name{Name: "Cuenta ****4444", Key: "op:account:4444", Operation: OpAccount, Ref: "4444"}},
		{bank("PAGO ACH MB A 0000005555"), Name{Name: "Cuenta ****5555", Key: "op:account:5555", Operation: OpAccount, Ref: "5555"}},
		{bank("APP INTERB A 0000006666"), Name{Name: "Cuenta ****6666", Key: "op:account:6666", Operation: OpAccount, Ref: "6666"}},
		{bank("TOKE A JUAN PEREZ AB12CD3"), Name{Name: "Juan Perez", Key: "name:juan perez", Person: true}},
		{bank("TOKE* DE ANA GOMEZ XYZWVUT"), Name{Name: "Ana Gomez", Key: "name:ana gomez", Person: true}},
		// Bills paid through the bank, by what they pay.
		{bank("PAG CLARO 8095550100 000456"), Name{Name: "Claro", Key: "merchant:claro", MerchantID: "claro"}},
		{bank("PAG EDESUR 0000123456 000123"), Name{Name: "Edesur", Key: "merchant:edesur", MerchantID: "edesur"}},
		{bank("PAG ACME TELECOM 0000123"), Name{Name: "Acme Telecom", Key: "name:acme telecom"}},
		{bank("PAGOS A TERCEROS ARS UNIVERSAL RD$ .00"), Name{Name: "ARS Universal", Key: "merchant:ars-universal", MerchantID: "ars-universal"}},
		{bank("PAGO IMPUESTO 0.15% DGII 2 TRANS POR $ 9,000.00"), Name{Name: "DGII", Key: "merchant:dgii", MerchantID: "dgii"}},
	} {
		if got := Of(c.m, nil); got != c.want {
			text := c.m.Merchant
			if text == "" {
				text = c.m.Description
			}
			t.Errorf("%q:\n got %+v\nwant %+v", text, got, c.want)
		}
	}
}

func TestRenamesAndWhatTheUserTyped(t *testing.T) {
	renames := map[string]string{
		"merchant:uber":         "Uber (trabajo)",
		"op:card:1234":          "Mi tarjeta",
		"name:supermercado uno": "El súper",
	}
	for _, c := range []struct {
		m    ledger.Movement
		want Name
	}{
		{card("UBER*RIDES"), Name{Name: "Uber (trabajo)", Key: "merchant:uber", MerchantID: "uber"}},
		{bank("PAGOTC VIA MB****1234"), Name{Name: "Mi tarjeta", Key: "op:card:1234"}},
		{card("SUPERMERCADO UNO"), Name{Name: "El súper", Key: "name:supermercado uno"}},
		// What the user typed stays as it is, unless it's a known merchant.
		{ledger.Movement{Manual: true, Description: " colmado de la esquina "}, Name{Name: "colmado de la esquina", Key: "name:colmado de la esquina"}},
		{ledger.Movement{Manual: true, Description: "uber"}, Name{Name: "Uber (trabajo)", Key: "merchant:uber", MerchantID: "uber"}},
		// Cash nobody detailed isn't anyone's to rename.
		{ledger.Movement{Kind: ledger.UndetailedCash, Description: "Efectivo sin detallar"}, Name{Name: "Efectivo sin detallar"}},
	} {
		if got := Of(c.m, renames); got != c.want {
			t.Errorf("%q:\n got %+v\nwant %+v", c.m.Description, got, c.want)
		}
	}
}

func TestDirectory(t *testing.T) {
	seen := map[string]bool{}
	for _, m := range Directory {
		if m.ID == "" || m.Name == "" || len(m.Words)+len(m.First) == 0 || seen[m.ID] {
			t.Errorf("merchant %+v: needs a unique ID, a name and words", m)
		}
		seen[m.ID] = true
		for _, w := range append(append([]string{}, m.Words...), m.First...) {
			if w != wordsOf(w) || strings.TrimSpace(w) == "" {
				t.Errorf("%s: %q isn't lowercase words without accents or punctuation", m.ID, w)
			}
			// Each finds its own merchant, unless one before it takes it.
			if found, ok := find(w); !ok {
				t.Errorf("%s: %q finds nothing", m.ID, w)
			} else if found.ID != m.ID && !slicesContainsID(Directory, found.ID, m.ID) {
				t.Errorf("%s: %q finds %s", m.ID, w, found.ID)
			}
		}
	}
}

// slicesContainsID reports whether merchant a comes before merchant b.
func slicesContainsID(directory []Merchant, a, b string) bool {
	for _, m := range directory {
		switch m.ID {
		case a:
			return true
		case b:
			return false
		}
	}
	return false
}

package store

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/ledger"
	"github.com/powky/domfin/api/internal/statements"
)

const cardInPesos = "popular:credit_card:1234:DOP"

// card is a made-up statement of the card in pesos, cut on a day, with
// these purchases.
func card(cut string, purchases ...statements.Transaction) statements.Statement {
	cutDate := day(cut)
	return statements.Statement{
		Institution: "popular", Product: "MC PRUEBA", Brand: "Mastercard", Last4: "1234",
		CutDate: cutDate, DueDate: cutDate.AddDate(0, 0, 25),
		Sections: []statements.Section{{Currency: "DOP", CreditLimit: 5_000_000, Transactions: purchases}},
	}
}

// purchase is a card purchase posted on a day, in cents.
func purchase(date, reference, description string, amount int64) statements.Transaction {
	return statements.Transaction{PostedOn: day(date), TransactedOn: day(date), Reference: reference,
		Description: description, MCC: "5411", Amount: amount}
}

func ptr[T any](v T) *T { return &v }

// manualTest is a store with a card's statements to add movements to.
type manualTest struct {
	*testing.T
	s   *Store
	ctx context.Context
}

func newManualTest(t *testing.T) manualTest {
	return manualTest{T: t, s: openTest(t), ctx: context.Background()}
}

func (m manualTest) save(st statements.Statement) {
	m.Helper()
	if _, err := m.s.SaveStatement(m.ctx, st, nil, Source{Name: st.CutDate.Format(dateLayout) + ".pdf"}); err != nil {
		m.Fatal(err)
	}
}

func (m manualTest) add(manual Manual) string {
	m.Helper()
	if manual.AccountID == "" {
		manual.AccountID = cardInPesos
	}
	id, err := m.s.AddManual(m.ctx, manual)
	if err != nil {
		m.Fatal(err)
	}
	return id
}

// movements lists the movements of a range as "ID amount" plus what the
// user added or wrote.
func (m manualTest) movements(from, to string) []string {
	m.Helper()
	movements, err := m.s.Movements(m.ctx, from, to)
	if err != nil {
		m.Fatal(err)
	}
	var out []string
	for _, mv := range movements {
		line := mv.ID + " " + mv.Date
		if mv.Manual {
			line += " a mano"
		}
		if mv.Missing {
			line += " faltante"
		}
		if mv.Notes != "" {
			line += " «" + mv.Notes + "»"
		}
		out = append(out, line)
	}
	return out
}

func (m manualTest) expect(from, to string, want ...string) {
	m.Helper()
	if got := m.movements(from, to); !slices.Equal(got, want) {
		m.Errorf("movements:\n%q\nwant\n%q", got, want)
	}
}

func TestManualWaitsForItsStatement(t *testing.T) {
	m := newManualTest(t)
	m.save(card("2026-01-28"))
	// Bought on the 10th, before February's statement arrived.
	id := m.add(Manual{Date: "2026-02-10", Description: " Colmado ", Amount: -50_000, CategoryID: "groceries", Notes: "pan y leche"})
	if id != "manual:1" {
		t.Errorf("id = %q", id)
	}
	if err := m.s.SetMarks(m.ctx, []string{id}, ptr(true), nil); err != nil {
		t.Fatal(err)
	}
	movements, err := m.s.Movements(m.ctx, "2026-02-01", "2026-02-28")
	if err != nil {
		t.Fatal(err)
	}
	want := ledger.Movement{ID: id, AccountID: cardInPesos, Date: "2026-02-10", Description: "Colmado", Amount: -50_000,
		Currency: "DOP", Manual: true, Notes: "pan y leche"}
	if len(movements) != 1 || movements[0] != want {
		t.Fatalf("before its statement: %+v", movements)
	}

	// February's statement brings it two days later, beside another of the
	// same amount further away.
	m.save(card("2026-02-28",
		purchase("2026-02-12", "20000000000000000000003", "COLMADO LA ESQUINA  SANTO DOMINGO", 50_000),
		purchase("2026-02-25", "20000000000000000000004", "COLMADO LA ESQUINA  SANTO DOMINGO", 50_000)))
	brought := cardInPesos + ":20000000000000000000003"
	m.expect("2026-02-01", "2026-02-28",
		brought+" 2026-02-12 «pan y leche»",
		cardInPesos+":20000000000000000000004 2026-02-25")

	// It took what the user gave the one added by hand.
	overrides, err := m.s.Overrides(m.ctx)
	if err != nil {
		t.Fatal(err)
	}
	marks, err := m.s.Marks(m.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if overrides[brought] != "groceries" || overrides[id] != "" || !marks[brought].Reviewed || marks[id] != (Mark{}) {
		t.Errorf("overrides %v, marks %v", overrides, marks)
	}
}

func TestManualMissingFromItsStatement(t *testing.T) {
	m := newManualTest(t)
	m.save(card("2026-01-28"))
	tip := m.add(Manual{Date: "2026-02-10", Description: "Propina", Amount: -20_000})
	late := m.add(Manual{Date: "2026-02-25", Description: "Farmacia", Amount: -35_000})
	m.save(card("2026-02-28", purchase("2026-02-12", "20000000000000000000005", "RESTAURANTE", 120_000)))
	// The statement covers a week past the tip without it; the pharmacy may
	// still post in March.
	m.expect("2026-02-01", "2026-02-28",
		tip+" 2026-02-10 a mano faltante",
		cardInPesos+":20000000000000000000005 2026-02-12",
		late+" 2026-02-25 a mano")

	movements, err := m.s.Movements(m.ctx, "2026-02-01", "2026-02-28")
	if err != nil {
		t.Fatal(err)
	}
	c, err := m.s.Classifier(m.ctx)
	if err != nil {
		t.Fatal(err)
	}
	var review []bool
	for _, class := range c.Classify(movements) {
		review = append(review, class.Review)
	}
	if !slices.Equal(review, []bool{true, false, false}) {
		t.Errorf("review = %v: only the one missing asks for a look", review)
	}

	m.save(card("2026-03-28"))
	m.expect("2026-02-25", "2026-02-25", late+" 2026-02-25 a mano faltante")
}

func TestManualForDaysAlreadyCovered(t *testing.T) {
	m := newManualTest(t)
	m.save(card("2026-01-28", purchase("2026-01-26", "10000000000000000000001", "SUPERMERCADO UNO", 300_000)))
	// The statement covers a week past the 21st: what's added for it is
	// what the statement doesn't show, even for the same amount.
	kept := m.add(Manual{Date: "2026-01-21", Description: "Efectivo en el súper", Amount: -300_000})
	// The 25th isn't covered that far: the statement's purchase of the
	// next day takes its place right away.
	m.add(Manual{Date: "2026-01-25", Description: "Súper", Amount: -300_000, Notes: "compra del mes"})
	m.save(card("2026-02-28"))
	m.expect("2026-01-01", "2026-01-31",
		kept+" 2026-01-21 a mano",
		cardInPesos+":10000000000000000000001 2026-01-26 «compra del mes»")
}

func TestManualInABankAccount(t *testing.T) {
	m := newManualTest(t)
	if _, err := m.s.SaveAccountStatement(m.ctx, accountStatement("2026-01-27", 100_000), nil, Source{Name: "enero.pdf"}); err != nil {
		t.Fatal(err)
	}
	// The salary, seen in the bank's app before the statement.
	salary := m.add(Manual{AccountID: "popular:savings:1234:DOP", Date: "2026-02-15", Description: "Nómina", Amount: 5_000_000})
	if _, err := m.s.SaveAccountStatement(m.ctx, accountStatement("2026-02-27", 4_100_000), nil, Source{Name: "febrero.pdf"}); err != nil {
		t.Fatal(err)
	}
	// The statement's credit took its place.
	m.expect("2026-02-01", "2026-02-28",
		"popular:savings:1234:DOP:2026-02-27#1 2026-02-17",
		"popular:savings:1234:DOP:2026-02-27#2 2026-02-18")
	taken, err := matchedIDs(m.ctx, m.s.db)
	if err != nil || !taken["popular:savings:1234:DOP:2026-02-27#1"] {
		t.Errorf("%s matched %v, %v", salary, taken, err)
	}
}

func TestMarks(t *testing.T) {
	m := newManualTest(t)
	if err := m.s.SetMarks(m.ctx, []string{"a", "b"}, ptr(true), nil); err != nil {
		t.Fatal(err)
	}
	if err := m.s.SetMarks(m.ctx, []string{"b", "c"}, nil, ptr(true)); err != nil {
		t.Fatal(err)
	}
	if err := m.s.SetMarks(m.ctx, []string{"a"}, ptr(false), nil); err != nil {
		t.Fatal(err)
	}
	marks, err := m.s.Marks(m.ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]Mark{"b": {Reviewed: true, Hidden: true}, "c": {Hidden: true}}
	if len(marks) != len(want) || marks["b"] != want["b"] || marks["c"] != want["c"] {
		t.Errorf("marks = %v, want %v", marks, want)
	}
	if err := m.s.SetMarks(m.ctx, []string{""}, nil, ptr(true)); !errors.Is(err, ErrInvalid) {
		t.Errorf("a movement without an ID: %v", err)
	}
}

func TestDeleteManual(t *testing.T) {
	m := newManualTest(t)
	m.save(card("2026-01-28", purchase("2026-01-26", "10000000000000000000001", "SUPERMERCADO UNO", 300_000)))
	id := m.add(Manual{Date: "2026-02-03", Description: "Gasolina", Amount: -150_000, CategoryID: "fuel"})
	if err := m.s.SetMarks(m.ctx, []string{id}, nil, ptr(true)); err != nil {
		t.Fatal(err)
	}
	if err := m.s.DeleteManual(m.ctx, id); err != nil {
		t.Fatal(err)
	}
	m.expect("2026-02-01", "2026-02-28")
	overrides, _ := m.s.Overrides(m.ctx)
	marks, _ := m.s.Marks(m.ctx)
	if len(overrides) != 0 || len(marks) != 0 {
		t.Errorf("left behind: overrides %v, marks %v", overrides, marks)
	}
	for _, other := range []string{id, cardInPesos + ":10000000000000000000001", "manual:x"} {
		if err := m.s.DeleteManual(m.ctx, other); !errors.Is(err, ErrNotFound) {
			t.Errorf("delete %q: %v", other, err)
		}
	}
	// The next one gets an ID of its own.
	if next := m.add(Manual{Date: "2026-02-04", Description: "Peaje", Amount: -10_000}); next == id {
		t.Errorf("the deleted ID came back: %s", next)
	}
}

func TestAddManualChecksWhatItGets(t *testing.T) {
	m := newManualTest(t)
	m.save(card("2026-01-28"))
	for _, manual := range []Manual{
		{AccountID: cardInPesos, Date: "2026-02-30", Description: "Día que no existe", Amount: -100},
		{AccountID: cardInPesos, Date: "2026-02-10", Description: "  ", Amount: -100},
		{AccountID: cardInPesos, Date: "2026-02-10", Description: "Sin monto"},
		{AccountID: "popular:credit_card:9999:DOP", Date: "2026-02-10", Description: "Otra tarjeta", Amount: -100},
		{AccountID: cardInPesos, Date: "2026-02-10", Description: "Categoría que no existe", Amount: -100, CategoryID: "nope"},
	} {
		if _, err := m.s.AddManual(m.ctx, manual); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", manual.Description, err)
		}
	}
	m.expect("2026-01-01", "2026-12-31")
}

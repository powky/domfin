package books

import "testing"

func TestLoans(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)

	if w := do(t, h, "GET", "/ledger/loans", "", nil); w.Code != 200 || w.Body.String() != "{\"plans\":{}}\n" {
		t.Fatalf("before saving: %d %s", w.Code, w.Body)
	}

	var saved loansJSON
	w := do(t, h, "PUT", "/ledger/loans", `{"plans": {
		" popular:loan:1234:DOP ": {"rate": 0.125, "installment": 1520000},
		"asset:prestamo-carro": {"rate": 0.09, "installment": 2200000, "subsidy": 2200000},
		"asset:prestamo-suegro": {"rate": 0, "installment": 500000}
	}}`, &saved)
	if w.Code != 200 {
		t.Fatalf("saving: %d %s", w.Code, w.Body)
	}
	if len(saved.Plans) != 3 {
		t.Fatalf("plans: %+v", saved.Plans)
	}
	if plan := saved.Plans["popular:loan:1234:DOP"]; plan.Rate != 0.125 || plan.Installment != 1520000 || plan.Subsidy != 0 {
		t.Errorf("bank loan, its ID trimmed: %+v", saved.Plans)
	}
	if plan := saved.Plans["asset:prestamo-carro"]; plan.Subsidy != plan.Installment {
		t.Errorf("paid by someone else: %+v", plan)
	}

	var read loansJSON
	do(t, h, "GET", "/ledger/loans", "", &read)
	if len(read.Plans) != 3 || read.Plans["asset:prestamo-suegro"].Installment != 500000 {
		t.Errorf("read back: %+v", read.Plans)
	}

	// Taking a loan's plan out is sending the others.
	var fewer loansJSON
	do(t, h, "PUT", "/ledger/loans", `{"plans": {"popular:loan:1234:DOP": {"rate": 0.125, "installment": 1520000}}}`, &fewer)
	if len(fewer.Plans) != 1 {
		t.Errorf("after removing two: %+v", fewer.Plans)
	}
}

func TestLoansRejects(t *testing.T) {
	h := Handler(openStore(t), testConvert, nil)
	for name, body := range map[string]string{
		"no id":           `{"plans": {" ": {"rate": 0.1, "installment": 100}}}`,
		"negative rate":   `{"plans": {"a": {"rate": -0.01, "installment": 100}}}`,
		"rate as percent": `{"plans": {"a": {"rate": 12.5, "installment": 100}}}`,
		"no installment":  `{"plans": {"a": {"rate": 0.1, "installment": 0}}}`,
		"subsidy too big": `{"plans": {"a": {"rate": 0.1, "installment": 100, "subsidy": 101}}}`,
		"unknown field":   `{"plans": {}, "extra": true}`,
	} {
		if w := do(t, h, "PUT", "/ledger/loans", body, nil); w.Code != 400 {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
	var read loansJSON
	if do(t, h, "GET", "/ledger/loans", "", &read); len(read.Plans) != 0 {
		t.Errorf("rejected plans were saved: %+v", read.Plans)
	}
}

package statements

import (
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/pdftext"
	"github.com/powky/domfin/api/internal/testpdf"
)

func certificatePages(t *testing.T) []pdftext.Page {
	t.Helper()
	pages, err := pdftext.Read(testpdf.PopularCertificate(t), "")
	if err != nil {
		t.Fatal(err)
	}
	return pages
}

func TestParsePopularCertificate(t *testing.T) {
	h, issues, err := ParsePopularCertificate(certificatePages(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) > 0 {
		t.Errorf("unexpected issues: %q", issues)
	}
	if h.Institution != "popular" || h.Last4 != "1234" || h.Currency != "DOP" || !h.AsOf.Equal(date("2026-09-30")) ||
		h.Rate != 9.5 || !h.Matures.Equal(date("2026-10-22")) {
		t.Errorf("history = %+v", h)
	}
	var got []string
	for _, m := range h.Movements {
		got = append(got, fmt.Sprintf("%s %s %s %s %s %s %.2f", m.EffectiveOn.Format("2006-01-02"), m.PostedOn.Format("2006-01-02"),
			m.Code, m.Kind(), FormatAmount(m.Amount), FormatAmount(m.Balance), m.Rate))
	}
	// Renewals move no money and aren't movements.
	want := []string{
		"2026-07-22 2026-07-22 87 deposit 100,000.00 100,000.00 10.00",
		"2026-08-22 2026-08-21 20 interest_earned 833.33 100,833.33 10.00",
		"2026-08-22 2026-08-21 06 withholding -83.33 100,750.00 0.00",
		"2026-09-22 2026-09-22 20 interest_earned 797.60 101,547.60 9.50",
		"2026-09-22 2026-09-22 06 withholding -79.76 101,467.84 0.00",
	}
	if !slices.Equal(got, want) {
		t.Errorf("movements:\n got %q\nwant %q", got, want)
	}
	if d := h.Movements[1].Description; d != "INTERES AGREGAD 833.33" {
		t.Errorf("wrapped description = %q", d)
	}
}

func TestParsePopularCertificateReportsProblems(t *testing.T) {
	pages := certificatePages(t)
	// The September interest shows a capital that doesn't follow.
	for i, line := range pages[0].Lines {
		for j, cell := range line.Cells {
			if cell.Text == "RD$101,547.6" {
				pages[0].Lines[i].Cells[j].Text = "RD$101,547.7"
			}
		}
	}
	_, issues, err := ParsePopularCertificate(pages)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"el capital después de INTERES AGREGAD 797.60 del 22/09/2026 (101,547.70) no sale del anterior (100,750.00) con 797.60",
		"el capital después de RETENCION DGII 79.76 del 22/09/2026 (101,467.84) no sale del anterior (101,547.70) con -79.76",
	}
	if !slices.Equal(issues, want) {
		t.Errorf("issues:\n got %q\nwant %q", issues, want)
	}
}

func TestParsePopularCertificateRejectsOtherDocuments(t *testing.T) {
	if _, _, err := ParsePopularCertificate(loanHistoryPages()); !errors.Is(err, ErrNotPopularCertificate) {
		t.Errorf("loan history: err = %v", err)
	}
	if _, _, err := ParsePopularLoan(certificatePages(t)); !errors.Is(err, ErrNotPopularLoan) {
		t.Errorf("certificate as a loan: err = %v", err)
	}
}

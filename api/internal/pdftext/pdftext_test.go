package pdftext

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/ledongthuc/pdf"

	"github.com/powky/domfin/api/internal/testpdf"
)

func sample(t *testing.T, password string) []byte {
	t.Helper()
	return testpdf.Build(t, password,
		[]testpdf.Text{
			{X: 25, Y: 90, S: "MC PRUEBA DOP"},
			{X: 29, Y: 180, S: "05/01"},
			{X: 60, Y: 180, S: "04/01"},
			{X: 100, Y: 180, S: "10000000000000000000005"},
			{X: 220, Y: 180, S: "TIENDA   *WEB  AYUDA.EJEMPLO.COM"},
			{X: 540, Y: 180, S: "-1,234.56"},
		},
		[]testpdf.Text{{X: 500, Y: 736, S: "Página: 2 / 2"}},
	)
}

func TestReadEncryptedPDF(t *testing.T) {
	pages, err := Read(sample(t, "clave de prueba"), "clave de prueba")
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 2 {
		t.Fatalf("got %d pages, want 2", len(pages))
	}
	var got []string
	for _, line := range pages[0].Lines {
		got = append(got, line.String())
	}
	want := []string{
		"MC PRUEBA DOP",
		"05/01 | 04/01 | 10000000000000000000005 | TIENDA   *WEB  AYUDA.EJEMPLO.COM | -1,234.56",
	}
	if !slices.Equal(got, want) {
		t.Errorf("page 1 lines:\n got %q\nwant %q", got, want)
	}
	if pages[0].Lines[0].Y <= pages[0].Lines[1].Y {
		t.Error("lines should go top to bottom")
	}
	if got := pages[1].Lines[0].String(); got != "Página: 2 / 2" {
		t.Errorf("page 2 = %q", got)
	}
}

func TestReadNeedsTheRightPassword(t *testing.T) {
	data := sample(t, "clave de prueba")
	for _, password := range []string{"", "otra clave"} {
		if _, err := Read(data, password); !errors.Is(err, ErrPassword) {
			t.Errorf("password %q: err = %v, want ErrPassword", password, err)
		}
	}
}

func TestReadIgnoresThePasswordWithoutEncryption(t *testing.T) {
	pages, err := Read(sample(t, ""), "clave de prueba")
	if err != nil {
		t.Fatal(err)
	}
	if got := pages[0].Lines[0].String(); got != "MC PRUEBA DOP" {
		t.Errorf("first line = %q", got)
	}
}

func TestCellsSplitAtWideGaps(t *testing.T) {
	// 8 pt glyphs 4.8 pt wide: a missing space between words (as some PDFs
	// position words instead of drawing spaces) and a column gap.
	var glyphs []pdf.Text
	x := 10.0
	for _, run := range []struct {
		text string
		gap  float64
	}{{"PAGO", 0}, {"VIA", 4.8}, {"APP", 4.8}, {"-91.54", 40}} {
		x += run.gap
		for _, r := range run.text {
			glyphs = append(glyphs, pdf.Text{X: x, W: 4.8, FontSize: 8, S: string(r)})
			x += 4.8
		}
	}
	got := cells(glyphs)
	want := []Cell{{X: 10, Text: "PAGO VIA APP"}, {X: 10 + 4.8*12 + 40, Text: "-91.54"}}
	if len(got) != len(want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i].Text != want[i].Text || got[i].X-want[i].X > 0.01 || want[i].X-got[i].X > 0.01 {
			t.Errorf("cell %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// type3PDF is a one-page PDF like the ones Chrome prints: its text in a
// Type3 font whose encoding names every code with a made-up glyph name,
// and a ToUnicode map with the real characters.
func type3PDF() []byte {
	toUnicode := "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n" +
		"1 begincodespacerange <00> <ff> endcodespacerange\n" +
		"3 beginbfchar <01> <0048> <02> <006F> <03> <006C> endbfchar\n" +
		"1 beginbfchar <04> <0061> endbfchar\n" +
		"endcmap CMapName currentdict /CMap defineresource pop end end\n"
	content := "BT /F1 12 Tf 72 700 Td <01020304> Tj ET\n"
	glyph := "0 0 d0\n"
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(content), content),
		"<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0]" +
			" /CharProcs << /g1 6 0 R /g2 6 0 R /g3 6 0 R /g4 6 0 R >>" +
			" /Encoding << /Type /Encoding /Differences [1 /g1 /g2 /g3 /g4] >>" +
			" /FirstChar 1 /LastChar 4 /Widths [600 600 600 600] /ToUnicode 7 0 R /Resources << >> >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(glyph), glyph),
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(toUnicode), toUnicode),
	}
	var b strings.Builder
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects))
	for i, object := range objects {
		offsets[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return []byte(b.String())
}

func TestReadType3FontsThroughToUnicode(t *testing.T) {
	pages, err := Read(type3PDF(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 1 || len(pages[0].Lines) != 1 || pages[0].Lines[0].String() != "Hola" {
		t.Errorf("pages = %+v", pages)
	}
}

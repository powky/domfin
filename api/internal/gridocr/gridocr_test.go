package gridocr_test

import (
	"errors"
	"image"
	"image/color"
	"slices"
	"strings"
	"testing"

	"golang.org/x/image/draw"

	"github.com/powky/domfin/api/internal/gridocr"
	"github.com/powky/domfin/api/internal/testpdf"
)

func TestReadsTheGrid(t *testing.T) {
	lines := []string{
		"       SR NOMBRE DE PRUEBA                                     PAG    1",
		"       28 JUL  28 JUL                    1,234.00-         56,789.10",
		"                               PagoTC Via MB************1234",
		"",
		"                               Del 01/07/2026 Al 07/07/2026 $ 12,345.67",
		"       abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789",
	}
	page, err := gridocr.ReadImage(testpdf.ScannedPage(lines), gridocr.PopularAtlas())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, line := range page.Lines {
		got = append(got, line.Text)
	}
	want := slices.DeleteFunc(slices.Clone(lines), func(s string) bool { return s == "" })
	// The atlas has no glyph for the letters these statements never print.
	want[len(want)-1] = strings.Map(func(r rune) rune {
		if strings.ContainsRune("wxyz", r) && !hasGlyph(r) {
			return ' '
		}
		return r
	}, want[len(want)-1])
	if !slices.Equal(got, want) {
		t.Errorf("lines:\n got %q\nwant %q", got, want)
	}
}

// A page printed at a lower resolution than the scans reads the same once
// enlarged. (Statements printed to PDF come at 100 dpi, a third of the
// scans; this page is drawn from the atlas' own samples, which a third
// would blur away, so it's printed at half.)
func TestReadsAPagePrintedAtALowerResolution(t *testing.T) {
	lines := []string{
		"       27 MAR  27 MAR          CREDITO NOMINA                30,000.00         110,000.00",
		"       30 MAR  28 MAR                                         1,500.00-        108,500.00",
		"                               PagoTC Via MB************4321",
	}
	scanned := testpdf.ScannedPage(lines)
	b := scanned.Bounds()
	printed := image.NewGray(image.Rect(0, 0, b.Dx()/2, b.Dy()/2))
	draw.CatmullRom.Scale(printed, printed.Bounds(), scanned, b, draw.Src, nil)

	page, err := gridocr.ReadImage(printed, gridocr.PopularAtlas())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, line := range page.Lines {
		got = append(got, line.Text)
	}
	// Where column 0 falls can shift the whole page by a column; the
	// statements are read by fields, so only the lines' layout matters.
	if got, want := dedent(got), dedent(lines); !slices.Equal(got, want) {
		t.Errorf("lines:\n got %q\nwant %q", got, want)
	}
}

// dedent removes the indentation all the lines share.
func dedent(lines []string) []string {
	common := -1
	for _, line := range lines {
		if n := len(line) - len(strings.TrimLeft(line, " ")); common == -1 || n < common {
			common = n
		}
	}
	out := make([]string, len(lines))
	for i, line := range lines {
		out[i] = line[common:]
	}
	return out
}

func hasGlyph(r rune) bool {
	for _, g := range gridocr.PopularAtlas().Glyphs {
		if g.Char == r {
			return true
		}
	}
	return false
}

func TestBlankPageHasNoGrid(t *testing.T) {
	img := image.NewGray(image.Rect(0, 0, 600, 800))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	img.SetGray(10, 10, color.Gray{})
	if _, err := gridocr.ReadImage(img, gridocr.PopularAtlas()); !errors.Is(err, gridocr.ErrNoGrid) {
		t.Errorf("err = %v, want ErrNoGrid", err)
	}
}

func TestAtlasFile(t *testing.T) {
	var cell gridocr.Cell
	for i := range cell {
		cell[i] = float64(i%16) / 15
	}
	var b strings.Builder
	if err := gridocr.WriteGlyph(&b, 'ñ', &cell); err != nil {
		t.Fatal(err)
	}
	atlas, err := gridocr.ReadAtlas(strings.NewReader("# comment\n\n" + b.String()))
	if err != nil {
		t.Fatal(err)
	}
	if len(atlas.Glyphs) != 1 || atlas.Glyphs[0].Char != 'ñ' || atlas.Glyphs[0].Cell != cell {
		t.Errorf("atlas = %+v", atlas.Glyphs)
	}
	if m := atlas.Classify(&cell); m.Char != 'ñ' || m.Distance != 0 {
		t.Errorf("classify = %+v", m)
	}

	for name, text := range map[string]string{
		"no label":     "glyph\n",
		"short row":    "glyph a\n00\n",
		"not hex":      "glyph a\n" + strings.Repeat("0000000000zz\n", 20),
		"ends early":   "glyph a\n" + strings.Repeat("000000000000\n", 5),
		"two runes":    "glyph ab\n",
		"stray line":   "hello\n",
		"row too long": "glyph a\n0000000000000\n",
	} {
		if _, err := gridocr.ReadAtlas(strings.NewReader(text)); err == nil {
			t.Errorf("%s: ReadAtlas should fail", name)
		}
	}
}

func TestPopularAtlasCoversTheStatements(t *testing.T) {
	for _, r := range "0123456789,.-$%*/:+ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv" {
		if !hasGlyph(r) {
			t.Errorf("no glyph for %q", r)
		}
	}
}

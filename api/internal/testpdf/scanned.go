package testpdf

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"math"
	"testing"

	"github.com/go-pdf/fpdf"

	"github.com/powky/domfin/api/internal/gridocr"
)

// Scanned statement pages are 2550 × 3300 pixels (Letter at 300 dpi) with
// the monospaced font on a grid of cells this size.
const (
	scanWidth, scanHeight = 2550, 3300
	scanPitch             = 24.02
	scanLineHeight        = 39
	scanCenter            = 23.6
	scanFirstLine         = 481
)

// ScannedPage draws lines of text the way Banco Popular's account
// statements print them, with the glyphs of gridocr.PopularAtlas on its
// grid. Characters the atlas lacks are left blank.
func ScannedPage(lines []string) *image.Gray {
	glyphs := map[rune]*gridocr.Cell{}
	for i := range gridocr.PopularAtlas().Glyphs {
		g := &gridocr.PopularAtlas().Glyphs[i]
		if glyphs[g.Char] == nil {
			glyphs[g.Char] = &g.Cell
		}
	}
	img := image.NewGray(image.Rect(0, 0, scanWidth, scanHeight))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	width := int(math.Ceil(scanPitch))
	for li, line := range lines {
		top := scanFirstLine + li*scanLineHeight
		for k, char := range []rune(line) {
			cell := glyphs[char]
			if cell == nil {
				continue
			}
			x0 := int(math.Round(scanCenter + (float64(k)-0.5)*scanPitch))
			for y := 0; y < scanLineHeight; y++ {
				for x := 0; x < width; x++ {
					cx := min(int(float64(x)*12/scanPitch), 11)
					cy := min(y*20/scanLineHeight, 19)
					v := cell[cy*12+cx]
					px, py := x0+x, top-3+y
					if px < 0 || py < 0 || px >= scanWidth || py >= scanHeight {
						continue
					}
					if gray := uint8(255 * (1 - v)); gray < img.GrayAt(px, py).Y {
						img.SetGray(px, py, color.Gray{Y: gray})
					}
				}
			}
		}
	}
	return img
}

// BuildScanned writes a PDF with one page image per slice of lines and no
// text layer, like the account statements.
func BuildScanned(t testing.TB, pages ...[]string) []byte {
	t.Helper()
	doc := fpdf.New("P", "pt", "Letter", "")
	for i, lines := range pages {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, ScannedPage(lines), &jpeg.Options{Quality: 90}); err != nil {
			t.Fatal(err)
		}
		name := "page" + string(rune('a'+i))
		doc.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: "JPG"}, &buf)
		doc.AddPage()
		doc.ImageOptions(name, 0, 0, 612, 792, false, fpdf.ImageOptions{ImageType: "JPG"}, 0, "")
	}
	var out bytes.Buffer
	if err := doc.Output(&out); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

// PopularAccount is a made-up Banco Popular savings account statement laid
// out like the real ones: account ****1234 in pesos, cut on 2026-08-20,
// four movements over two pages.
func PopularAccount(t testing.TB) []byte {
	t.Helper()
	header := []string{
		"       SR NOMBRE DE PRUEBA                                                        PAG    1",
		"       CALLE DE PRUEBA 1",
		"       CIUDAD DE PRUEBA                                                       20 AGO 2026",
		"",
		"                                      ESTADO DE CUENTA",
		"",
		"       AHORRO EMPLEADO            800001234   RD$   NOMBRE DE PRUEBA",
	}
	first := append(append([]string{}, header...),
		"                                                    CANTIDAD           MONTO",
		"              BALANCE ANTERIOR                                           5,000.00",
		"              + DEPOSITOS Y OTROS CREDITOS              1                50,000.00",
		"              - CHEQUES Y OTROS DEBITOS                 2                 3,250.50",
		"              + INTERES PAGADO                                                1.25",
		"              BALANCE AL CORTE                                          51,750.75",
		"",
		"       FECHA    FECHA           DESCRIPCION                      MONTO           BALANCE",
		"       POSTEO   VALOR",
		"       27 JUL  BALANCE ANTERIOR                                                  5,000.00",
		"       28 JUL  28 JUL                                         3,000.00-          2,000.00",
		"                               PagoTC Via MB************1234",
	)
	second := append(append([]string{}, header...),
		"       FECHA    FECHA   NUM DE  DESCRIPCION                      MONTO           BALANCE",
		"       ENTRADA  TRANS   CHEQUE",
		"       31 JUL  31 JUL          PAGO INTERES                        1.25           2,001.25",
		"       12 AGO  12 AGO          CREDITO NOMINA                 50,000.00          52,001.25",
		"       14 AGO  14 AGO                                           250.50-          51,750.75",
		"                               PAGO IMPUESTO 0.15% DGII",
		"                               Del 07/08/2026 Al 13/08/2026",
		"       20 AGO  BALANCE AL CORTE                                                 51,750.75",
	)
	second[0] = "       SR NOMBRE DE PRUEBA                                                        PAG    2"
	return BuildScanned(t, first, second)
}

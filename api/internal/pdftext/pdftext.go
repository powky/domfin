// Package pdftext reads the text of a PDF page by page, as lines of cells,
// opening it with its password when it has one.
//
// A cell is a run of text without wide gaps, so on a statement laid out in
// columns each cell is one column's value.
package pdftext

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"

	"github.com/ledongthuc/pdf"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// ErrPassword means the PDF is encrypted and the password doesn't open it
// (or no password was given).
var ErrPassword = errors.New("wrong or missing PDF password")

const (
	// Glyphs whose baselines are this close (in points) share a line.
	lineTolerance = 2.0
	// A gap wider than this share of the font size separates two words...
	wordGap = 0.25
	// ...and one wider than this separates two cells.
	cellGap = 1.5
)

// Page is the text of one page, top to bottom.
type Page struct {
	Number int
	Lines  []Line
}

// Line is the text on one baseline, left to right.
type Line struct {
	// Y is the baseline, in points from the bottom of the page.
	Y     float64
	Cells []Cell
}

// Cell is a run of text on a line.
type Cell struct {
	// X is where the text starts, in points from the left of the page.
	X    float64
	Text string
}

// String joins the line's cells with " | ", for messages and debugging.
func (l Line) String() string {
	texts := make([]string, len(l.Cells))
	for i, cell := range l.Cells {
		texts[i] = cell.Text
	}
	return strings.Join(texts, " | ")
}

// ReadFile reads the PDF at path; see Read.
func ReadFile(path, password string) ([]Page, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Read(data, password)
}

// Read extracts the text of every page of a PDF. The password is only used
// when the PDF is encrypted.
func Read(data []byte, password string) ([]Page, error) {
	plain, err := decrypt(data, password)
	if err != nil {
		return nil, err
	}
	if plain, err = decodeType3WithToUnicode(plain); err != nil {
		return nil, err
	}
	reader, err := pdf.NewReader(bytes.NewReader(plain), int64(len(plain)))
	if err != nil {
		return nil, fmt.Errorf("open PDF: %w", err)
	}
	pages := make([]Page, 0, reader.NumPage())
	for n := 1; n <= reader.NumPage(); n++ {
		lines, err := pageLines(reader.Page(n))
		if err != nil {
			return nil, fmt.Errorf("page %d: %w", n, err)
		}
		pages = append(pages, Page{Number: n, Lines: lines})
	}
	return pages, nil
}

// decrypt returns the PDF without its encryption, or as is when it has none.
// pdfcpu removes it because ledongthuc/pdf, which reads the text, derives
// 40-bit RC4 object keys at the full MD5 length and garbles files like the
// Banco Popular statements.
func decrypt(data []byte, password string) ([]byte, error) {
	conf := model.NewStatelessConfiguration()
	conf.UserPW = password
	var out bytes.Buffer
	err := api.Decrypt(context.Background(), bytes.NewReader(data), &out, conf)
	switch {
	case err == nil:
		return out.Bytes(), nil
	case errors.Is(err, pdfcpu.ErrNotEncrypted):
		return data, nil
	case errors.Is(err, pdfcpu.ErrWrongPassword):
		return nil, ErrPassword
	default:
		return nil, fmt.Errorf("decrypt PDF: %w", err)
	}
}

// decodeType3WithToUnicode makes ledongthuc/pdf read the Type3 fonts that
// Chrome prints PDFs with (the Qik statements) through their ToUnicode map.
// Their encoding renames every code to a made-up glyph ("/g1D"), and the
// library decodes such fonts by their encoding when they have one, which
// garbles every letter; without it, it falls back to ToUnicode.
func decodeType3WithToUnicode(data []byte) ([]byte, error) {
	conf := model.NewStatelessConfiguration()
	ctx, err := api.ReadContext(context.Background(), bytes.NewReader(data), conf)
	if err != nil {
		return nil, fmt.Errorf("read PDF: %w", err)
	}
	changed := false
	for _, entry := range ctx.XRefTable.Table {
		if entry == nil || entry.Free {
			continue
		}
		font, ok := entry.Object.(types.Dict)
		if !ok || font.Type() == nil || *font.Type() != "Font" || font.Subtype() == nil || *font.Subtype() != "Type3" {
			continue
		}
		if _, ok := font.Find("ToUnicode"); !ok {
			continue
		}
		if _, ok := font.Find("Encoding"); ok {
			font.Delete("Encoding")
			changed = true
		}
	}
	if !changed {
		return data, nil
	}
	var out bytes.Buffer
	if err := api.WriteContext(context.Background(), ctx, &out); err != nil {
		return nil, fmt.Errorf("write PDF: %w", err)
	}
	return out.Bytes(), nil
}

// pageLines groups the page's glyphs into lines and cells.
func pageLines(page pdf.Page) (lines []Line, err error) {
	// ledongthuc/pdf panics on content it can't interpret.
	defer func() {
		if x := recover(); x != nil {
			lines, err = nil, fmt.Errorf("unreadable content: %v", x)
		}
	}()

	type row struct {
		y      float64
		glyphs []pdf.Text
	}
	var rows []*row
	for _, glyph := range page.Content().Text {
		if glyph.S == "" || glyph.S == "\n" {
			continue
		}
		var target *row
		for _, r := range rows {
			if math.Abs(r.y-glyph.Y) <= lineTolerance {
				target = r
				break
			}
		}
		if target == nil {
			target = &row{y: glyph.Y}
			rows = append(rows, target)
		}
		target.glyphs = append(target.glyphs, glyph)
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].y > rows[j].y })

	for _, r := range rows {
		// Stable, so glyphs drawn at one spot (fonts without widths) keep
		// the order they were written in.
		sort.SliceStable(r.glyphs, func(i, j int) bool { return r.glyphs[i].X < r.glyphs[j].X })
		line := Line{Y: r.y, Cells: cells(r.glyphs)}
		if len(line.Cells) > 0 {
			lines = append(lines, line)
		}
	}
	return lines, nil
}

// cells splits a line's glyphs, sorted left to right, at the wide gaps.
func cells(glyphs []pdf.Text) []Cell {
	var out []Cell
	var text strings.Builder
	start, end := 0.0, 0.0
	flush := func() {
		if trimmed := strings.TrimSpace(text.String()); trimmed != "" {
			out = append(out, Cell{X: start, Text: trimmed})
		}
		text.Reset()
	}
	for i, glyph := range glyphs {
		if i > 0 {
			gap := glyph.X - end
			switch size := math.Max(glyph.FontSize, 1); {
			case gap > cellGap*size:
				flush()
			case gap > wordGap*size && !strings.HasSuffix(text.String(), " ") && glyph.S != " ":
				text.WriteByte(' ')
			}
		}
		if strings.TrimSpace(text.String()) == "" {
			start = glyph.X
		}
		text.WriteString(glyph.S)
		end = glyph.X + glyph.W
	}
	flush()
	return out
}

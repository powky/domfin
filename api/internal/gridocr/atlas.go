package gridocr

import (
	"bufio"
	"fmt"
	"io"
	"math"
	"strings"
	"unicode/utf8"
)

// Atlas is the set of glyphs a font's cells are compared with. A character
// can have several glyphs (the same letter at slightly different offsets).
type Atlas struct {
	Glyphs []Glyph
}

// Glyph is a character's look in a cell.
type Glyph struct {
	Char rune
	Cell Cell
}

// A glyph farther than this from every one in the atlas is unknown; closer
// than this to two different characters, doubtful.
const (
	maxDistance = 6.0
	minMargin   = 0.4
)

// Match is what a cell was read as.
type Match struct {
	Char rune
	// Distance to the closest glyph, and how much farther the closest glyph
	// of another character is.
	Distance, Margin float64
}

// Sure reports whether the cell looks like its character and like no other.
func (m Match) Sure() bool {
	return m.Char != 0 && m.Distance <= maxDistance && m.Margin >= minMargin
}

// Classify finds the atlas glyph closest to the cell, letting each glyph
// shift a sample in any direction to absorb where the cell was cut.
func (a *Atlas) Classify(c *Cell) Match {
	best := Match{Distance: math.Inf(1), Margin: math.Inf(1)}
	second := math.Inf(1)
	for i := range a.Glyphs {
		g := &a.Glyphs[i]
		d := distance(c, &g.Cell)
		switch {
		case d < best.Distance:
			if g.Char != best.Char {
				second = best.Distance
			}
			best.Char, best.Distance = g.Char, d
		case g.Char != best.Char && d < second:
			second = d
		}
	}
	best.Margin = second - best.Distance
	return best
}

// distance is the smallest sum of squared differences between the cells
// with b shifted by up to one sample.
func distance(a, b *Cell) float64 {
	best := math.Inf(1)
	for dy := -1; dy <= 1; dy++ {
		for dx := -1; dx <= 1; dx++ {
			var d float64
			for y := 0; y < cellRows; y++ {
				by := y + dy
				for x := 0; x < cellColumns; x++ {
					bx := x + dx
					var bv float64
					if bx >= 0 && by >= 0 && bx < cellColumns && by < cellRows {
						bv = b[by*cellColumns+bx]
					}
					diff := a[y*cellColumns+x] - bv
					d += diff * diff
				}
				if d >= best {
					break
				}
			}
			if d < best {
				best = d
			}
		}
	}
	return best
}

// The atlas file lists glyphs as "glyph <char>" followed by cellRows rows
// of cellColumns hex digits, the cell's darkness from 0 to f. Blank lines
// and lines starting with # are ignored.

// ReadAtlas parses an atlas file.
func ReadAtlas(r io.Reader) (*Atlas, error) {
	atlas := &Atlas{}
	scanner := bufio.NewScanner(r)
	line := 0
	var current *Glyph
	row := 0
	for scanner.Scan() {
		line++
		text := scanner.Text()
		if current == nil {
			trimmed := strings.TrimSpace(text)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			label, ok := strings.CutPrefix(text, "glyph ")
			if !ok || utf8.RuneCountInString(label) != 1 {
				return nil, fmt.Errorf("atlas line %d: expected \"glyph <char>\", got %q", line, text)
			}
			char, _ := utf8.DecodeRuneInString(label)
			atlas.Glyphs = append(atlas.Glyphs, Glyph{Char: char})
			current, row = &atlas.Glyphs[len(atlas.Glyphs)-1], 0
			continue
		}
		if len(text) != cellColumns {
			return nil, fmt.Errorf("atlas line %d: expected %d hex digits, got %q", line, cellColumns, text)
		}
		for x, digit := range text {
			value := strings.IndexRune("0123456789abcdef", digit)
			if value < 0 {
				return nil, fmt.Errorf("atlas line %d: %q isn't a hex digit", line, digit)
			}
			current.Cell[row*cellColumns+x] = float64(value) / 15
		}
		row++
		if row == cellRows {
			current = nil
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if current != nil {
		return nil, fmt.Errorf("atlas: glyph %q ends early", current.Char)
	}
	return atlas, nil
}

// WriteGlyph writes a glyph in the atlas file format.
func WriteGlyph(w io.Writer, char rune, c *Cell) error {
	var b strings.Builder
	fmt.Fprintf(&b, "glyph %c\n", char)
	for y := 0; y < cellRows; y++ {
		for x := 0; x < cellColumns; x++ {
			v := int(math.Round(c[y*cellColumns+x] * 15))
			b.WriteByte("0123456789abcdef"[min(max(v, 0), 15)])
		}
		b.WriteByte('\n')
	}
	_, err := io.WriteString(w, b.String())
	return err
}

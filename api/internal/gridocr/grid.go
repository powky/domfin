// Package gridocr reads text from scanned pages printed in a monospaced
// font on a fixed grid, like the Banco Popular account statements, which
// come as page images without a text layer.
//
// Every character sits in a cell of the same width and every line at the
// same distance from the next, so instead of a general OCR it finds the
// grid, cuts each cell out and compares it with the glyphs of an atlas
// learned from real pages. The text comes back with its columns intact.
package gridocr

import (
	"image"
	"math"
	"slices"
)

const (
	// Glyphs are compared downsampled to this many columns and rows.
	cellColumns, cellRows = 12, 20
	cellSize              = cellColumns * cellRows
	// Pixels darker than this are ink.
	inkLevel = 128
	// A line band this short or tall isn't a line of the grid's font
	// (rules, the logo, the footer).
	minLineHeight, maxLineHeight = 22, 40
	// Monospaced text keeps its ink away from the cell boundaries: under
	// 20% of it falls near one, against about 30% for other text.
	maxBoundaryShare = 0.24
)

// Cell is a glyph cut from the grid, as darkness from 0 (white) to 1
// (black) over cellColumns × cellRows.
type Cell [cellSize]float64

// grid is where the characters sit on a page.
type grid struct {
	// pitch is the width of a cell and center the middle of the first one
	// (column 0); lineHeight is the distance between lines.
	pitch, center float64
	lineHeight    int
	// lines are the tops of the text lines, top to bottom.
	lines []int
}

// grayImage is a page as 8-bit luminance.
type grayImage struct {
	width, height int
	pix           []uint8
}

func toGray(img image.Image) grayImage {
	b := img.Bounds()
	g := grayImage{width: b.Dx(), height: b.Dy(), pix: make([]uint8, b.Dx()*b.Dy())}
	switch src := img.(type) {
	case *image.YCbCr:
		for y := 0; y < g.height; y++ {
			copy(g.pix[y*g.width:(y+1)*g.width], src.Y[y*src.YStride:y*src.YStride+g.width])
		}
	case *image.Gray:
		for y := 0; y < g.height; y++ {
			copy(g.pix[y*g.width:(y+1)*g.width], src.Pix[y*src.Stride:y*src.Stride+g.width])
		}
	default:
		for y := 0; y < g.height; y++ {
			for x := 0; x < g.width; x++ {
				r, gr, bl, _ := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
				g.pix[y*g.width+x] = uint8((299*r + 587*gr + 114*bl) / 1000 >> 8)
			}
		}
	}
	return g
}

func (g grayImage) dark(x, y int) bool { return g.pix[y*g.width+x] < inkLevel }

type band struct{ top, bottom int }

// bands finds the runs of rows with ink.
func (g grayImage) bands() []band {
	var out []band
	start := -1
	for y := 0; y < g.height; y++ {
		ink := 0
		for x := 0; x < g.width; x++ {
			if g.dark(x, y) {
				ink++
			}
		}
		switch {
		case ink > 2 && start < 0:
			start = y
		case ink <= 2 && start >= 0:
			out = append(out, band{start, y})
			start = -1
		}
	}
	return out
}

// findGrid locates the text lines and measures the cell width. Lines are
// the bands that share the most common spacing and phase; the cell width
// is the period of the ink across them, found as the strongest frequency
// of its column histogram.
func findGrid(g grayImage) (grid, bool) {
	all := g.bands()
	var lines []band
	for _, b := range all {
		if h := b.bottom - b.top; h >= minLineHeight && h <= maxLineHeight {
			lines = append(lines, b)
		}
	}
	if len(lines) < 3 {
		return grid{}, false
	}

	// Line spacing: the most common gap between consecutive line tops,
	// then the most common phase of the tops at that spacing.
	gaps := map[int]int{}
	for i := 1; i < len(lines); i++ {
		gaps[lines[i].top-lines[i-1].top]++
	}
	lineHeight := mostCommon(gaps)
	if lineHeight < minLineHeight {
		return grid{}, false
	}
	phases := map[int]int{}
	for _, b := range lines {
		phases[b.top%lineHeight]++
	}
	phase := mostCommon(phases)

	gr := grid{lineHeight: lineHeight}
	histogram := make([]float64, g.width)
	for _, b := range lines {
		// Tops a couple of pixels off the grid belong to it (a line of
		// lowercase letters starts lower); the rest (the footer) don't.
		off := ((b.top-phase)%lineHeight + lineHeight) % lineHeight
		switch {
		case off <= 2:
			gr.lines = append(gr.lines, b.top-off)
		case off >= lineHeight-2:
			gr.lines = append(gr.lines, b.top+lineHeight-off)
		default:
			continue
		}
		for y := b.top; y < b.bottom; y++ {
			for x := 0; x < g.width; x++ {
				if g.dark(x, y) {
					histogram[x]++
				}
			}
		}
	}

	gr.pitch = strongestPeriod(histogram, 12, 48)
	// Glyphs with two stems (0, H, N) make half the cell width ring too;
	// when twice the period is also strong, that's the cell.
	strength, _ := fourier(histogram, gr.pitch)
	for gr.pitch*2 <= 64 {
		double, _ := fourier(histogram, gr.pitch*2)
		if double < 0.3*strength {
			break
		}
		gr.pitch *= 2
		strength = double
	}
	_, angle := fourier(histogram, gr.pitch)
	if angle < 0 {
		angle += 2 * math.Pi
	}
	gr.center = angle / (2 * math.Pi) * gr.pitch

	// Lines that happen to sit on the grid but aren't in its font (the
	// footer) have ink all across the cells.
	gr.lines = slices.DeleteFunc(gr.lines, func(top int) bool {
		return boundaryShare(g, gr, top) > maxBoundaryShare
	})
	return gr, len(gr.lines) > 0
}

// strongestPeriod searches [from, to] coarsely, then around the best one.
func strongestPeriod(histogram []float64, from, to float64) float64 {
	best, period := 0.0, from
	for p := from; p <= to; p += 0.02 {
		if s, _ := fourier(histogram, p); s > best {
			best, period = s, p
		}
	}
	coarse := period
	for p := coarse - 0.03; p <= coarse+0.03; p += 0.0005 {
		if s, _ := fourier(histogram, p); s > best {
			best, period = s, p
		}
	}
	return period
}

// fourier measures how periodic the histogram is at period p, and where
// in the period its mass sits.
func fourier(histogram []float64, p float64) (strength, angle float64) {
	var re, im float64
	for x, v := range histogram {
		if v == 0 {
			continue
		}
		a := 2 * math.Pi * float64(x) / p
		re += v * math.Cos(a)
		im += v * math.Sin(a)
	}
	return math.Hypot(re, im), math.Atan2(im, re)
}

func mostCommon(counts map[int]int) int {
	best, n := 0, -1
	for k, v := range counts {
		if v > n || v == n && k < best {
			best, n = k, v
		}
	}
	return best
}

// columns is how many cells fit across the page.
func (gr grid) columns(width int) int {
	return int((float64(width)-gr.center)/gr.pitch) + 1
}

// cell cuts out the glyph at column k of the line starting at top. The
// window spans the cell's width and the line's height, starting a little
// above the tallest letters so accents and commas fit.
func (g grayImage) cell(gr grid, top, k int) Cell {
	x0 := gr.center + (float64(k)-0.5)*gr.pitch
	y0 := float64(top) - float64(gr.lineHeight)/13
	w, h := gr.pitch/cellColumns, float64(gr.lineHeight)/cellRows
	var c Cell
	for cy := 0; cy < cellRows; cy++ {
		for cx := 0; cx < cellColumns; cx++ {
			sx0, sy0 := x0+float64(cx)*w, y0+float64(cy)*h
			var sum, n float64
			for y := int(sy0); y < int(math.Ceil(sy0+h)); y++ {
				for x := int(sx0); x < int(math.Ceil(sx0+w)); x++ {
					if x < 0 || y < 0 || x >= g.width || y >= g.height {
						continue
					}
					if d := 1 - float64(g.pix[y*g.width+x])/255; d > 0.25 {
						sum += d
					}
					n++
				}
			}
			if n > 0 {
				c[cy*cellColumns+cx] = sum / n
			}
		}
	}
	return c
}

// blank reports whether a cell holds no glyph: ink only at its sides is
// the serif of a neighbor spilling over.
func (c *Cell) blank() bool {
	var core float64
	for y := 0; y < cellRows; y++ {
		for x := 2; x < cellColumns-2; x++ {
			core += c[y*cellColumns+x]
		}
	}
	return core < 0.8
}

// boundaryShare is the share of a line's ink within 15% of a cell's width
// from the boundary between cells: low for text on the grid, around 30%
// for text that isn't (a proportional font).
func boundaryShare(g grayImage, gr grid, top int) float64 {
	var near, total float64
	for y := top; y < min(top+gr.lineHeight-6, g.height); y++ {
		for x := 0; x < g.width; x++ {
			if !g.dark(x, y) {
				continue
			}
			phase := math.Mod((float64(x)-gr.center)/gr.pitch+0.5, 1)
			if phase < 0 {
				phase++
			}
			total++
			if phase < 0.15 || phase > 0.85 {
				near++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return near / total
}

package gridocr

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // page images of scanned statements are JPEG
	"io"
	"math"
	"slices"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"golang.org/x/image/draw"
)

// ErrNoGrid means a page has no lines of monospaced text to read.
var ErrNoGrid = errors.New("no text grid on the page")

// Page is the text read from a page image, top to bottom.
type Page struct {
	Lines []Line
}

// Line is one line of the grid. Text has one character per cell, with a
// space for each empty one, so columns line up across lines.
type Line struct {
	// Top is where the line starts on the image, in pixels.
	Top  int
	Text string
	// Doubtful are the columns whose glyph looked unlike any in the atlas,
	// or too much like two; they read as the closest one anyway.
	Doubtful []int
}

// Cells is the grid of a page cut into glyphs, before reading them: the
// cells of each line (nil where empty).
type Cells struct {
	Lines [][]*Cell
	Tops  []int
	// Pitch is the width of a cell and Center the middle of column 0, in
	// pixels.
	Pitch, Center float64
}

// atlasWidth is how wide the pages the atlas learned from are: letter paper
// scanned at 300 dpi.
const atlasWidth = 2550

// atAtlasScale enlarges a page printed at a lower resolution, like a
// statement printed to PDF at 100 dpi (850 pixels wide), to the atlas'
// scale, so its lines and cells have the size the grid and the glyphs
// expect. Pages scanned at 200 dpi or more are left as they are.
func atAtlasScale(img image.Image) image.Image {
	b := img.Bounds()
	if b.Dx() >= atlasWidth*2/3 {
		return img
	}
	scale := float64(atlasWidth) / float64(b.Dx())
	out := image.NewGray(image.Rect(0, 0, atlasWidth, int(math.Round(float64(b.Dy())*scale))))
	draw.CatmullRom.Scale(out, out.Bounds(), img, b, draw.Src, nil)
	return out
}

// CutImage finds the grid on a page image and cuts out its glyphs.
func CutImage(img image.Image) (Cells, error) {
	g := toGray(atAtlasScale(img))
	gr, ok := findGrid(g)
	if !ok {
		return Cells{}, ErrNoGrid
	}
	columns := gr.columns(g.width)
	out := Cells{Pitch: gr.pitch, Center: gr.center}
	for _, top := range gr.lines {
		line := make([]*Cell, columns)
		for k := range line {
			c := g.cell(gr, top, k)
			if !c.blank() {
				line[k] = &c
			}
		}
		out.Lines = append(out.Lines, line)
		out.Tops = append(out.Tops, top)
	}
	return out, nil
}

// Read reads the cells with the atlas.
func (c Cells) Read(atlas *Atlas) Page {
	var page Page
	for i, cells := range c.Lines {
		line := Line{Top: c.Tops[i]}
		text := make([]rune, len(cells))
		for k, cell := range cells {
			if cell == nil {
				text[k] = ' '
				continue
			}
			match := atlas.Classify(cell)
			text[k] = match.Char
			if !match.Sure() {
				line.Doubtful = append(line.Doubtful, k)
			}
		}
		line.Text = strings.TrimRight(string(text), " ")
		line.Doubtful = slices.DeleteFunc(line.Doubtful, func(k int) bool { return k >= len([]rune(line.Text)) })
		if line.Text != "" {
			page.Lines = append(page.Lines, line)
		}
	}
	return page
}

// ReadImage reads a page image with the atlas.
func ReadImage(img image.Image, atlas *Atlas) (Page, error) {
	cells, err := CutImage(img)
	if err != nil {
		return Page{}, err
	}
	return cells.Read(atlas), nil
}

// PageImages returns the image of each page of a scanned PDF (the largest
// one when a page has several), decoded. Pages without images are nil.
func PageImages(data []byte) ([]image.Image, error) {
	pages, err := api.ExtractImagesRaw(context.Background(), bytes.NewReader(data), nil, model.NewStatelessConfiguration())
	if err != nil {
		return nil, fmt.Errorf("extract images: %w", err)
	}
	out := make([]image.Image, len(pages))
	for i, images := range pages {
		var best image.Image
		area := 0
		for _, embedded := range images {
			raw, err := io.ReadAll(embedded)
			if err != nil {
				return nil, fmt.Errorf("page %d image: %w", i+1, err)
			}
			img, _, err := image.Decode(bytes.NewReader(raw))
			if err != nil {
				continue // a format the standard library can't decode
			}
			if b := img.Bounds(); b.Dx()*b.Dy() > area {
				best, area = img, b.Dx()*b.Dy()
			}
		}
		out[i] = best
	}
	return out, nil
}

// ReadPDF reads every page image of a scanned PDF with the atlas.
func ReadPDF(data []byte, atlas *Atlas) ([]Page, error) {
	images, err := PageImages(data)
	if err != nil {
		return nil, err
	}
	pages := make([]Page, 0, len(images))
	for i, img := range images {
		if img == nil {
			pages = append(pages, Page{})
			continue
		}
		page, err := ReadImage(img, atlas)
		if err != nil && !errors.Is(err, ErrNoGrid) {
			return nil, fmt.Errorf("page %d: %w", i+1, err)
		}
		pages = append(pages, page)
	}
	return pages, nil
}

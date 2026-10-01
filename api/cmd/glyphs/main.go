// Command glyphs finds the characters of scanned statements that the atlas
// doesn't know well, so they can be labeled and added to it.
//
//	go run ./cmd/glyphs <pdf>... >> internal/gridocr/popular.atlas
//
// It reads every page with the atlas and writes, for each distinct doubtful
// glyph, a comment with a line where it appears and the glyph in the atlas
// format, labeled "?": replace the ? with the right character (or delete
// the glyph) before using the atlas.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/powky/domfin/api/internal/gridocr"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "uso: go run ./cmd/glyphs <pdf>...")
		os.Exit(2)
	}
	atlas := gridocr.PopularAtlas()
	var doubtful []glyphAt
	for _, path := range os.Args[1:] {
		data, err := os.ReadFile(path)
		if err != nil {
			fail(err)
		}
		images, err := gridocr.PageImages(data)
		if err != nil {
			fail(err)
		}
		for pageIndex, img := range images {
			if img == nil {
				continue
			}
			cells, err := gridocr.CutImage(img)
			if err != nil {
				continue
			}
			page := cells.Read(atlas)
			for li, line := range cells.Lines {
				for k, cell := range line {
					if cell == nil || atlas.Classify(cell).Sure() || seen(doubtful, cell) {
						continue
					}
					doubtful = append(doubtful, glyphAt{cell, fmt.Sprintf("%s p%d: %s", filepath.Base(path), pageIndex+1,
						marked(page, cells.Tops[li], k))})
				}
			}
		}
	}
	fmt.Fprintf(os.Stderr, "%d glyph(s) dudosos\n", len(doubtful))
	for _, f := range doubtful {
		fmt.Printf("\n# %s\n", f.where)
		if err := gridocr.WriteGlyph(os.Stdout, '?', f.cell); err != nil {
			fail(err)
		}
	}
}

// glyphAt is a doubtful glyph and a line where it appears.
type glyphAt struct {
	cell  *gridocr.Cell
	where string
}

// seen reports whether a glyph like this one was already listed.
func seen(list []glyphAt, cell *gridocr.Cell) bool {
	for _, f := range list {
		a := gridocr.Atlas{Glyphs: []gridocr.Glyph{{Char: '?', Cell: *f.cell}}}
		if a.Classify(cell).Distance < 2 {
			return true
		}
	}
	return false
}

// marked is the line that holds column k, with the column in brackets.
func marked(page gridocr.Page, top, k int) string {
	for _, line := range page.Lines {
		if line.Top != top {
			continue
		}
		runes := []rune(line.Text)
		if k >= len(runes) {
			return strings.TrimSpace(line.Text)
		}
		return strings.TrimSpace(string(runes[:k]) + "[" + string(runes[k]) + "]" + string(runes[k+1:]))
	}
	return ""
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

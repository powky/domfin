package gridocr

import (
	_ "embed"
	"strings"
	"sync"
)

//go:embed popular.atlas
var popularAtlas string

// PopularAtlas is the atlas of the font in Banco Popular's account
// statements.
var PopularAtlas = sync.OnceValue(func() *Atlas {
	atlas, err := ReadAtlas(strings.NewReader(popularAtlas))
	if err != nil {
		panic("gridocr: popular.atlas: " + err.Error())
	}
	return atlas
})

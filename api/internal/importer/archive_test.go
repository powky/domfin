package importer

import (
	"archive/zip"
	"bytes"
	"context"
	"path/filepath"
	"slices"
	"testing"

	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/testpdf"
)

// entry is a file in a made-up zip.
type entry struct {
	name      string
	data      []byte
	encrypted bool
}

// zipOf writes the entries into a zip, in order.
func zipOf(t *testing.T, entries ...entry) []byte {
	t.Helper()
	var out bytes.Buffer
	w := zip.NewWriter(&out)
	for _, e := range entries {
		header := &zip.FileHeader{Name: e.name, Method: zip.Deflate}
		if e.encrypted {
			header.Flags |= 0x1
		}
		f, err := w.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write(e.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func newTestImporter(t *testing.T) *Importer {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &Importer{Store: db, Password: testPassword}
}

func TestImportAllReadsTheFoldersOfAZip(t *testing.T) {
	stub := testpdf.PopularPayslip(t, "28/01/2026", []testpdf.PayslipRow{
		{"SUELDO", "90,000.00", "45,000.00", ""},
	}, "45,000.00", "", "45,000.00")
	older := zipOf(t, entry{name: "cd.pdf", data: testpdf.PopularCertificate(t)})
	archive := zipOf(t,
		entry{name: "tarjeta/"},
		entry{name: "tarjeta/estado.pdf", data: testpdf.PopularCard(t, testPassword)},
		entry{name: "prestamo/HISTORIAL.PDF", data: testpdf.PopularLoan(t)},
		entry{name: "volantes/enero.pdf", data: stub},
		entry{name: "notas.txt", data: []byte("nada que ver")},
		entry{name: "__MACOSX/tarjeta/._estado.pdf", data: []byte("copia de macOS")},
		entry{name: "tarjeta/.DS_Store", data: []byte("macOS")},
		entry{name: "viejos.zip", data: older},
	)

	results := newTestImporter(t).ImportAll(context.Background(), []File{
		{Name: "estados.zip", Data: archive},
		{Name: "suelto.pdf", Data: testpdf.PopularAccount(t)},
	})
	var got []string
	for _, r := range results {
		got = append(got, r.File+" "+string(r.Status))
	}
	// Account by account, as when they come one by one; nothing for what isn't a PDF.
	want := []string{
		"suelto.pdf added",
		"estados.zip/tarjeta/estado.pdf added",
		"estados.zip/prestamo/HISTORIAL.PDF added",
		"estados.zip/volantes/enero.pdf added",
		"estados.zip/viejos.zip/cd.pdf added",
	}
	if !slices.Equal(got, want) {
		t.Errorf("results:\n got %q\nwant %q", got, want)
	}
}

func TestImportAllSaysWhatAZipLacks(t *testing.T) {
	results := newTestImporter(t).ImportAll(context.Background(), []File{
		{Name: "fotos.zip", Data: zipOf(t, entry{name: "foto.jpg", data: []byte("una foto")})},
		{Name: "roto.zip", Data: append([]byte("PK\x03\x04"), "no es un zip"...)},
		{Name: "con-clave.zip", Data: zipOf(t, entry{name: "estado.pdf", data: []byte("cifrado"), encrypted: true})},
	})
	byFile := map[string]Result{}
	for _, r := range results {
		byFile[r.File] = r
	}
	if r := byFile["fotos.zip"]; r.Status != Skipped || r.Reason != ReasonEmptyArchive {
		t.Errorf("a zip without PDFs: %+v", r)
	}
	if r := byFile["roto.zip"]; r.Status != Failed || r.Reason != ReasonUnreadable || r.Detail == "" {
		t.Errorf("a broken zip: %+v", r)
	}
	if r := byFile["con-clave.zip"]; r.Status != Failed || r.Reason != ReasonEncryptedArchive {
		t.Errorf("a zip with a password: %+v", r)
	}
	if len(results) != 3 {
		t.Errorf("%d results, want one a zip: %+v", len(results), results)
	}
}

func TestExpandStopsAtTheDepthLimit(t *testing.T) {
	pdf := testpdf.PopularLoan(t)
	inner := zipOf(t, entry{name: "historial.pdf", data: pdf})
	for range maxZipDepth {
		inner = zipOf(t, entry{name: "dentro.zip", data: inner})
	}
	files, results := expand([]File{{Name: "hondo.zip", Data: inner}})
	if len(files) != 0 || len(results) != 1 || results[0].Reason != ReasonEmptyArchive {
		t.Errorf("zips more than %d deep are left out: files %d, results %+v", maxZipDepth, len(files), results)
	}
}

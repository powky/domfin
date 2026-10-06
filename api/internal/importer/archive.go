package importer

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

// Limits of what a zip may expand to, so a broken or malicious one can't
// fill the memory: Domfin reads uploads in memory, never in a temporary file.
const (
	maxZipEntries = 10_000
	maxZipFile    = 64 << 20  // one PDF
	maxZipTotal   = 512 << 20 // all of a zip's
	maxZipDepth   = 3         // zips within zips
)

// Reasons a zip gives nothing to import.
const (
	ReasonEmptyArchive     = "empty_archive"     // no PDF inside
	ReasonEncryptedArchive = "encrypted_archive" // the zip has a password
)

var errEncrypted = errors.New("the zip has a password")

// isZip reports whether data is a zip archive, by its signature.
func isZip(data []byte) bool {
	return bytes.HasPrefix(data, []byte("PK\x03\x04")) || bytes.HasPrefix(data, []byte("PK\x05\x06"))
}

// expand replaces each zip among the files with the PDFs inside it, in its
// folders and in the zips within it, each named after where it was
// ("estados.zip/tarjeta/enero.pdf"). Everything else inside is left out,
// like the copies macOS adds in __MACOSX. A zip that can't be read, has a
// password or holds no PDF gets a result of its own instead.
func expand(files []File) ([]File, []Result) {
	var out []File
	var results []Result
	for _, file := range files {
		if !isZip(file.Data) {
			out = append(out, file)
			continue
		}
		var total int64
		pdfs, err := unzip(file.Name, file.Data, 1, &total)
		switch {
		case errors.Is(err, errEncrypted):
			results = append(results, Result{File: file.Name, Status: Failed, Reason: ReasonEncryptedArchive})
		case err != nil:
			results = append(results, Result{File: file.Name, Status: Failed, Reason: ReasonUnreadable, Detail: err.Error()})
		case len(pdfs) == 0:
			results = append(results, Result{File: file.Name, Status: Skipped, Reason: ReasonEmptyArchive})
		default:
			out = append(out, pdfs...)
		}
	}
	return out, results
}

// unzip reads the PDFs of a zip and of the zips within it, depth levels in;
// total counts what they all take uncompressed.
func unzip(name string, data []byte, depth int, total *int64) ([]File, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("no se pudo abrir el .zip: %w", err)
	}
	if len(archive.File) > maxZipEntries {
		return nil, fmt.Errorf("el .zip trae más de %d archivos", maxZipEntries)
	}
	var pdfs []File
	for _, entry := range archive.File {
		base := path.Base(entry.Name)
		ext := strings.ToLower(path.Ext(base))
		switch {
		case entry.FileInfo().IsDir(), strings.HasPrefix(entry.Name, "__MACOSX/"), strings.HasPrefix(base, "."):
			continue
		case ext != ".pdf" && (ext != ".zip" || depth >= maxZipDepth):
			continue
		case entry.Flags&0x1 != 0:
			return nil, errEncrypted
		}
		content, err := read(entry)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", entry.Name, err)
		}
		if *total += int64(len(content)); *total > maxZipTotal {
			return nil, fmt.Errorf("el .zip pasa de %d MB descomprimido", maxZipTotal>>20)
		}
		inner := name + "/" + entry.Name
		if ext == ".zip" {
			nested, err := unzip(inner, content, depth+1, total)
			if err != nil {
				return nil, err
			}
			pdfs = append(pdfs, nested...)
			continue
		}
		pdfs = append(pdfs, File{Name: inner, Data: content})
	}
	return pdfs, nil
}

// read decompresses a zip's file, up to maxZipFile.
func read(entry *zip.File) ([]byte, error) {
	if entry.UncompressedSize64 > maxZipFile {
		return nil, fmt.Errorf("pasa de %d MB", maxZipFile>>20)
	}
	r, err := entry.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, maxZipFile+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxZipFile {
		return nil, fmt.Errorf("pasa de %d MB", maxZipFile>>20)
	}
	return data, nil
}

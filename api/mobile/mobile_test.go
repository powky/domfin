package mobile

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/powky/domfin/api/internal/testpdf"
)

// samples are made-up Popular statements: a card, a scanned savings account
// (it goes through the OCR), a loan and a certificate.
func samples(t *testing.T) map[string][]byte {
	return map[string][]byte{
		"tarjeta.pdf":     testpdf.PopularCard(t, ""),
		"cuenta.pdf":      testpdf.PopularAccount(t),
		"prestamo.pdf":    testpdf.PopularLoan(t),
		"certificado.pdf": testpdf.PopularCertificate(t),
	}
}

func TestStartServesTheAPIAndImports(t *testing.T) {
	dir := t.TempDir()
	began := time.Now()
	port, err := Start(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("arrancó en %s", time.Since(began))
	if again, err := Start(dir); err != nil || again != port {
		t.Fatalf("Start again = %d, %v; want %d", again, err, port)
	}
	base := "http://127.0.0.1:" + strconv.Itoa(port)

	res, err := http.Get(base + "/health")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if string(body) != "ok" {
		t.Fatalf("/health = %q", body)
	}

	var form bytes.Buffer
	writer := multipart.NewWriter(&form)
	for name, data := range samples(t) {
		part, err := writer.CreateFormFile("files", name)
		if err != nil {
			t.Fatal(err)
		}
		part.Write(data)
	}
	writer.Close()
	began = time.Now()
	res, err = http.Post(base+"/statements/import", writer.FormDataContentType(), &form)
	if err != nil {
		t.Fatal(err)
	}
	var imported struct {
		Results []struct {
			File   string `json:"file"`
			Status string `json:"status"`
		} `json:"results"`
	}
	json.NewDecoder(res.Body).Decode(&imported)
	res.Body.Close()
	t.Logf("importó %d estados en %s", len(imported.Results), time.Since(began))
	if res.StatusCode != http.StatusOK || len(imported.Results) != 4 {
		t.Fatalf("import: status %d, results %+v", res.StatusCode, imported.Results)
	}
	for _, result := range imported.Results {
		if result.Status != "added" {
			t.Errorf("%s: %s", result.File, result.Status)
		}
	}

	res, err = http.Get(base + "/accounts")
	if err != nil {
		t.Fatal(err)
	}
	var accounts struct {
		Accounts []json.RawMessage `json:"accounts"`
	}
	json.NewDecoder(res.Body).Decode(&accounts)
	res.Body.Close()
	if len(accounts.Accounts) == 0 {
		t.Fatal("no accounts after importing")
	}
	if _, err := os.Stat(filepath.Join(dir, "domfin.db")); err != nil {
		t.Fatal(err)
	}
}

// With DOMFIN_SAMPLES set to a folder, this writes the sample statements
// there, to import them in the app.
func TestWriteSamples(t *testing.T) {
	dir := os.Getenv("DOMFIN_SAMPLES")
	if dir == "" {
		t.Skip("DOMFIN_SAMPLES no está puesto")
	}
	for name, data := range samples(t) {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

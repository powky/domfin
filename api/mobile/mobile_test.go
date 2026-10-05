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

// call makes a request to the engine with its token, as the app does.
func call(t *testing.T, method, url, contentType string, body io.Reader) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+Token())
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
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

	res := call(t, "GET", base+"/health", "", nil)
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
	res = call(t, "POST", base+"/statements/import", writer.FormDataContentType(), &form)
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

	res = call(t, "GET", base+"/accounts", "", nil)
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

// Other apps on the phone reach 127.0.0.1 too: without the token, or with
// another one, the engine doesn't answer.
func TestStartTurnsAwayRequestsWithoutTheToken(t *testing.T) {
	port, err := Start(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(Token()) < 26 {
		t.Fatalf("token %q is too short", Token())
	}
	base := "http://127.0.0.1:" + strconv.Itoa(port)
	for _, path := range []string{"/health", "/accounts", "/ledger/movements", "/statements/password"} {
		for _, auth := range []string{"", "Bearer ", "Bearer otro", Token(), "bearer " + Token()} {
			req, _ := http.NewRequest("GET", base+path, nil)
			if auth != "" {
				req.Header.Set("Authorization", auth)
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			if res.StatusCode != http.StatusUnauthorized {
				t.Errorf("GET %s with %q: %d, want 401", path, auth, res.StatusCode)
			}
		}
	}
	if res := call(t, "GET", base+"/accounts", "", nil); res.StatusCode != http.StatusOK {
		t.Errorf("GET /accounts with the token: %d", res.StatusCode)
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

package importer

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/testpdf"
)

func TestPasswordInSettings(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	// No password in the environment: only the one saved in Settings.
	handler := Handler(&Importer{Store: db})
	call := func(method, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/statements/password", strings.NewReader(body))
		req.RemoteAddr = "127.0.0.1:52000"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	importCard := func() resultJSON {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, upload(t, map[string][]byte{"estado.pdf": testpdf.PopularCard(t, testPassword)}))
		return decode[importResponse](t, rec).Results[0]
	}

	if got := decode[map[string]bool](t, call("GET", "")); got["saved"] || got["environment"] {
		t.Errorf("before saving: %v", got)
	}
	if r := importCard(); r.Reason != ReasonMissingPassword {
		t.Errorf("without a password: %+v", r)
	}
	if rec := call("PUT", `{"password": "`+testPassword+`"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	rec := call("GET", "")
	if got := decode[map[string]bool](t, rec); !got["saved"] || strings.Contains(rec.Body.String(), testPassword) {
		t.Errorf("after saving: %s", rec.Body)
	}
	if r := importCard(); r.Status != Added {
		t.Errorf("with the saved password: %+v", r)
	}
	if rec := call("PUT", `{"password": ""}`); rec.Code != http.StatusBadRequest {
		t.Errorf("an empty password: %d", rec.Code)
	}
	if rec := call("DELETE", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("forget: %d", rec.Code)
	}
	if got := decode[map[string]bool](t, call("GET", "")); got["saved"] {
		t.Errorf("after forgetting it: %v", got)
	}
}

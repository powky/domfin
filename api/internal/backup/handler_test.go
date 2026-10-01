package backup

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandler(t *testing.T) {
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	s.Places = func() []Place {
		return []Place{{Service: "icloud", Root: filepath.Dir(folder), Folder: folder}}
	}
	handler := Handler(s)
	call := func(method, path, body string) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.RemoteAddr = "127.0.0.1:50000"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		var answer map[string]any
		if w.Body.Len() > 0 {
			if err := json.Unmarshal(w.Body.Bytes(), &answer); err != nil {
				t.Fatalf("%s %s: %v: %s", method, path, err, w.Body)
			}
		}
		return w.Code, answer
	}
	body := func(v any) string {
		data, _ := json.Marshal(v)
		return string(data)
	}

	if code, status := call("GET", "/backup", ""); code != 200 || status["configured"] != false {
		t.Errorf("before setup: %d %v", code, status)
	}
	if code, answer := call("GET", "/backup/places", ""); code != 200 || len(answer["places"].([]any)) != 1 {
		t.Errorf("places: %d %v", code, answer)
	}
	if code, answer := call("POST", "/backup/setup", body(map[string]string{"folder": folder, "password": "corta"})); code != 400 || answer["error"] != "short_password" {
		t.Errorf("short password: %d %v", code, answer)
	}
	code, answer := call("POST", "/backup/setup", body(map[string]string{"folder": folder, "password": password}))
	if code != 200 || !strings.HasPrefix(answer["recoveryKey"].(string), "AGE-SECRET-KEY-PQ-1") {
		t.Fatalf("setup: %d %v", code, answer)
	}
	code, answer = call("POST", "/backup/run", "")
	if code != 200 {
		t.Fatalf("run: %d %v", code, answer)
	}
	file := answer["backup"].(map[string]any)["file"].(string)

	code, status := call("GET", "/backup", "")
	place, _ := status["place"].(map[string]any)
	if code != 200 || status["configured"] != true || status["folder"] != folder || place["service"] != "icloud" ||
		len(status["backups"].([]any)) != 1 {
		t.Errorf("status: %d %v", code, status)
	}
	code, answer = call("GET", "/backup/files?folder="+url.QueryEscape(folder), "")
	if code != 200 || answer["hasKey"] != true || len(answer["backups"].([]any)) != 1 {
		t.Errorf("files: %d %v", code, answer)
	}

	restore := map[string]string{"folder": folder, "file": file, "password": "otra frase cualquiera"}
	if code, answer := call("POST", "/backup/restore", body(restore)); code != 400 || answer["error"] != "wrong_password" {
		t.Errorf("restore with a wrong password: %d %v", code, answer)
	}
	restore["password"] = password
	if code, answer := call("POST", "/backup/restore", body(restore)); code != 200 || answer["safetyCopy"] == "" {
		t.Errorf("restore: %d %v", code, answer)
	}

	change := map[string]string{"password": password, "newPassword": "la nueva frase de respaldo"}
	if code, answer := call("PUT", "/backup/password", body(change)); code != 204 {
		t.Errorf("change password: %d %v", code, answer)
	}
	if code, status := call("PUT", "/backup", `{"automatic": false}`); code != 200 || status["automatic"] != false {
		t.Errorf("turn off automatic backups: %d %v", code, status)
	}
	if code, _ := call("DELETE", "/backup", ""); code != 204 {
		t.Errorf("disable: %d", code)
	}
	if code, answer := call("POST", "/backup/run", ""); code != 409 || answer["error"] != "not_configured" {
		t.Errorf("run when disabled: %d %v", code, answer)
	}

	// Only this computer.
	r := httptest.NewRequest("GET", "/backup", nil)
	r.RemoteAddr = "192.168.1.20:50000"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("from the network: %d", w.Code)
	}
}

func TestHandlerWithoutStore(t *testing.T) {
	r := httptest.NewRequest("GET", "/backup", nil)
	r.RemoteAddr = "127.0.0.1:50000"
	w := httptest.NewRecorder()
	Handler(New(nil, "")).ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("without a database: %d %s", w.Code, w.Body)
	}
}

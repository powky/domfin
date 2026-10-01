package localonly

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandler(t *testing.T) {
	ok := Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	for _, c := range []struct {
		name, method, remote, origin string
		want                         int
	}{
		{"this computer", "GET", "127.0.0.1:5000", "", http.StatusTeapot},
		{"the web app", "GET", "[::1]:5000", "http://localhost:8081", http.StatusTeapot},
		{"another device", "GET", "192.168.1.20:5000", "", http.StatusForbidden},
		{"another site", "GET", "127.0.0.1:5000", "https://example.com", http.StatusForbidden},
		{"preflight", "OPTIONS", "127.0.0.1:5000", "http://localhost:8081", http.StatusNoContent},
	} {
		r := httptest.NewRequest(c.method, "/accounts", nil)
		r.RemoteAddr = c.remote
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		w := httptest.NewRecorder()
		ok.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s: %d, want %d", c.name, w.Code, c.want)
		}
		// The web app deletes too (an asset, the PDF password, backups).
		if c.method == "OPTIONS" && !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
			t.Errorf("%s: DELETE not allowed: %q", c.name, w.Header().Get("Access-Control-Allow-Methods"))
		}
	}
}

package updates

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestUpdates(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/repos/prueba/domfin/releases/latest" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(`{"tag_name": "v0.2.0", "html_url": "https://github.com/prueba/domfin/releases/tag/v0.2.0"}`))
	}))
	t.Cleanup(server.Close)
	c := NewChecker(server.Client(), "prueba/domfin")
	c.BaseURL = server.URL
	clock := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	c.now = func() time.Time { return clock }

	rec := httptest.NewRecorder()
	Handler(c, "0.1.0").ServeHTTP(rec, httptest.NewRequest("GET", "/updates", nil))
	var body updatesJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Version != "0.1.0" || body.Latest != "0.2.0" || !body.Available || body.URL == "" {
		t.Errorf("updates: %+v", body)
	}

	// GitHub is asked again only after a while.
	c.Latest(context.Background())
	if calls != 1 {
		t.Errorf("asked GitHub %d times, want 1", calls)
	}
	clock = clock.Add(13 * time.Hour)
	c.Latest(context.Background())
	if calls != 2 {
		t.Errorf("after 13 hours: %d calls", calls)
	}

	// A repository without releases has nothing newer.
	none := NewChecker(server.Client(), "prueba/otro")
	none.BaseURL = server.URL
	if release, err := none.Latest(context.Background()); release != nil || err != nil {
		t.Errorf("without releases: %v, %v", release, err)
	}
}

func TestUpdatesTurnedOff(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler(nil, "0.1.0").ServeHTTP(rec, httptest.NewRequest("GET", "/updates", nil))
	if got := rec.Body.String(); got != `{"version":"0.1.0"}`+"\n" {
		t.Errorf("without checking: %s", got)
	}
}

func TestNewer(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{
		{"0.2.0", "0.1.0", true},
		{"v1.0.0", "0.9.9", true},
		{"0.10.0", "0.9.0", true},
		{"0.1.0", "0.1.0", false},
		{"0.1.0", "0.2.0", false},
		{"1.0.0-beta", "1.0.0", false},
	} {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

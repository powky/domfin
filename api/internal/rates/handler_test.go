package rates

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerServesTheRate(t *testing.T) {
	now := &clock{}
	now.set("2026-09-29 09:00")
	service := newTestService(t, &fakeSource{download: Download{Rate: monday}}, "", now)

	recorder := httptest.NewRecorder()
	Handler(service)(recorder, httptest.NewRequest(http.MethodGet, "/rates/usd-dop", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"base": "USD", "quote": "DOP", "date": "2026-09-28", "buy": 59.2669, "sell": 59.5577,
		"source": SourceName, "sourceUrl": SeriesURL, "fetchedAt": "2026-09-29T13:00:00Z", "stale": false,
	}
	for key, value := range want {
		if body[key] != value {
			t.Errorf("%s = %v, want %v", key, body[key], value)
		}
	}
}

func TestHandlerAnswers503WithoutARate(t *testing.T) {
	now := &clock{}
	now.set("2026-09-29 09:00")
	service := newTestService(t, &fakeSource{err: errors.New("offline")}, "", now)

	recorder := httptest.NewRecorder()
	Handler(service)(recorder, httptest.NewRequest(http.MethodGet, "/rates/usd-dop", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
}

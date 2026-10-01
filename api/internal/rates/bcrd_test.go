package rates

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

func TestParseSeriesReturnsEveryDayOldestFirst(t *testing.T) {
	rows := append(seriesHeader,
		[]string{"1991", "Ene", "2", "11.2", "11.5"},
		[]string{"2026", "Aug", "31", "59.1044", "59.4501"},
		[]string{"2026", "Sep", "25", "59.277000000000001", "59.645000000000003"},
		// Year and month left blank continue the rows above them.
		[]string{"", "", "28", "59.2669", "59.557699999999997"},
		// February 30th and notes are not rates.
		[]string{"2026", "Feb", "30", "70", "71"},
		[]string{"**Hasta el 23 de enero de 1985 existía la paridad RD$ 1.00 = US$ 1.00"},
		[]string{"2026", "Jul ", "15", "58.9", "59.2"},
	)
	history, err := parseSeries(buildSeries(t, rows))
	if err != nil {
		t.Fatal(err)
	}
	want := []Rate{
		{Date: "1991-01-02", Buy: 11.2, Sell: 11.5},
		{Date: "2026-07-15", Buy: 58.9, Sell: 59.2},
		{Date: "2026-08-31", Buy: 59.1044, Sell: 59.4501},
		{Date: "2026-09-25", Buy: 59.277, Sell: 59.645},
		{Date: "2026-09-28", Buy: 59.2669, Sell: 59.5577},
	}
	if !slices.Equal(history, want) {
		t.Fatalf("got %+v, want %+v", history, want)
	}
}

func TestParseSeriesNeedsTheHeader(t *testing.T) {
	rows := [][]string{{"2026", "Sep", "28", "59.2669", "59.5577"}}
	if _, err := parseSeries(buildSeries(t, rows)); err == nil {
		t.Fatal("expected an error without the Compra/Venta header")
	}
}

func TestParseSeriesRejectsOtherFiles(t *testing.T) {
	if _, err := parseSeries([]byte("<html>Mantenimiento</html>")); err == nil {
		t.Fatal("expected an error for a file that is not an xlsx")
	}
}

func TestParseMonth(t *testing.T) {
	for text, want := range map[string]int{"Ene": 1, "Ene ": 1, "abr": 4, "Ago": 8, "Aug": 8, "Septiembre": 9, "12": 12} {
		if got, ok := parseMonth(text); !ok || got != want {
			t.Errorf("parseMonth(%q) = %d, %v; want %d", text, got, ok, want)
		}
	}
	for _, text := range []string{"", "Trimestre", "13"} {
		if _, ok := parseMonth(text); ok {
			t.Errorf("parseMonth(%q) should fail", text)
		}
	}
}

func TestSourceFetchUsesConditionalRequests(t *testing.T) {
	series := buildSeries(t, append(seriesHeader, []string{"2026", "Sep", "28", "59.2669", "59.5577"}))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("v") == "" {
			t.Errorf("request %s has no cache-busting version", r.URL)
		}
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Last-Modified", "Mon, 28 Sep 2026 21:34:17 GMT")
		w.Write(series)
	}))
	defer server.Close()
	source := &Source{URL: server.URL, Client: server.Client()}

	first, err := source.Fetch(context.Background(), "", "")
	if err != nil {
		t.Fatal(err)
	}
	if first.NotModified || first.Rate.Date != "2026-09-28" || first.ETag != `"v1"` || first.LastModified == "" {
		t.Fatalf("unexpected first download %+v", first)
	}
	second, err := source.Fetch(context.Background(), first.ETag, first.LastModified)
	if err != nil {
		t.Fatal(err)
	}
	if !second.NotModified {
		t.Fatalf("expected not modified, got %+v", second)
	}
}

func TestSourceFetchFailsOnServerErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer server.Close()
	source := &Source{URL: server.URL, Client: server.Client()}
	if _, err := source.Fetch(context.Background(), "", ""); err == nil {
		t.Fatal("expected an error for a 502")
	}
}

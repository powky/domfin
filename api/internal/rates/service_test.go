package rates

import (
	"context"
	"errors"
	"io"
	"log"
	"path/filepath"
	"testing"
	"time"
)

type fakeSource struct {
	calls    int
	download Download
	err      error
	lastETag string
}

func (f *fakeSource) Fetch(_ context.Context, etag, _ string) (Download, error) {
	f.calls++
	f.lastETag = etag
	return f.download, f.err
}

// at is a time in Santo Domingo.
func at(value string) time.Time {
	parsed, err := time.ParseInLocation("2006-01-02 15:04", value, santoDomingo)
	if err != nil {
		panic(err)
	}
	return parsed
}

type clock struct{ now time.Time }

func (c *clock) set(value string) { c.now = at(value) }

func newTestService(t *testing.T, source fetcher, path string, now *clock) *Service {
	t.Helper()
	service := NewService(source, path, log.New(io.Discard, "", 0))
	service.now = func() time.Time { return now.now }
	return service
}

var (
	monday  = Rate{Date: "2026-09-28", Buy: 59.2669, Sell: 59.5577}
	tuesday = Rate{Date: "2026-09-29", Buy: 59.3011, Sell: 59.6012}
)

func current(t *testing.T, service *Service) Quote {
	t.Helper()
	quote, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return quote
}

func TestServiceDownloadsOncePerPublication(t *testing.T) {
	source := &fakeSource{download: Download{Rate: monday, ETag: `"a"`}}
	now := &clock{}
	service := newTestService(t, source, "", now)

	now.set("2026-09-29 09:00")
	if quote := current(t, service); quote.Rate != monday || quote.Stale {
		t.Fatalf("unexpected quote %+v", quote)
	}
	now.set("2026-09-29 18:29")
	current(t, service)
	if source.calls != 1 {
		t.Fatalf("downloaded %d times before the 6:30 p.m. publication, want 1", source.calls)
	}

	source.download = Download{Rate: tuesday, ETag: `"b"`}
	now.set("2026-09-29 18:31")
	if quote := current(t, service); quote.Rate != tuesday {
		t.Fatalf("got %+v after the publication, want Tuesday's rate", quote)
	}
	if source.calls != 2 || source.lastETag != `"a"` {
		t.Fatalf("calls = %d, etag = %s; want a second conditional download", source.calls, source.lastETag)
	}
	now.set("2026-09-30 18:00")
	current(t, service)
	if source.calls != 2 {
		t.Fatalf("downloaded again before the next publication (%d calls)", source.calls)
	}
}

func TestServiceChecksHourlyWhileTodaysRateIsMissing(t *testing.T) {
	source := &fakeSource{download: Download{Rate: monday}}
	now := &clock{}
	service := newTestService(t, source, "", now)

	now.set("2026-09-29 18:35")
	current(t, service)
	now.set("2026-09-29 19:00")
	current(t, service)
	if source.calls != 1 {
		t.Fatalf("calls = %d within the hour, want 1", source.calls)
	}
	source.download = Download{Rate: tuesday}
	now.set("2026-09-29 19:40")
	if quote := current(t, service); quote.Rate != tuesday || source.calls != 2 {
		t.Fatalf("got %+v after %d calls, want Tuesday's rate on the second", quote, source.calls)
	}
}

func TestServiceFallsBackToTheCachedRate(t *testing.T) {
	source := &fakeSource{download: Download{Rate: monday}}
	now := &clock{}
	service := newTestService(t, source, "", now)
	now.set("2026-09-29 09:00")
	current(t, service)

	source.err = errors.New("no route to host")
	now.set("2026-09-29 19:00")
	if quote := current(t, service); quote.Rate != monday || !quote.Stale {
		t.Fatalf("got %+v, want Monday's rate marked stale", quote)
	}
	now.set("2026-09-29 19:03")
	current(t, service)
	if source.calls != 2 {
		t.Fatalf("calls = %d, want no retry within %s of a failure", source.calls, retryAfterFailure)
	}

	source.err = nil
	source.download = Download{Rate: tuesday}
	now.set("2026-09-29 19:06")
	if quote := current(t, service); quote.Rate != tuesday || quote.Stale {
		t.Fatalf("got %+v, want Tuesday's fresh rate once the BCRD is back", quote)
	}
}

func TestServiceIsUnavailableWithoutAnyRate(t *testing.T) {
	source := &fakeSource{err: errors.New("timeout")}
	now := &clock{}
	service := newTestService(t, source, "", now)
	now.set("2026-09-29 09:00")
	if _, err := service.Current(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}

func TestServiceKeepsTheRateWhenNotModified(t *testing.T) {
	source := &fakeSource{download: Download{Rate: monday, ETag: `"a"`}}
	now := &clock{}
	service := newTestService(t, source, "", now)
	now.set("2026-09-29 09:00")
	current(t, service)

	source.download = Download{NotModified: true, ETag: `"a"`}
	now.set("2026-09-29 18:40")
	quote := current(t, service)
	if quote.Rate != monday || !quote.FetchedAt.Equal(at("2026-09-29 18:40")) {
		t.Fatalf("got %+v, want Monday's rate confirmed at 18:40", quote)
	}
}

func TestServiceIgnoresAnOlderCopyOfTheSeries(t *testing.T) {
	source := &fakeSource{download: Download{Rate: tuesday}}
	now := &clock{}
	service := newTestService(t, source, "", now)
	now.set("2026-09-29 18:40")
	current(t, service)

	source.download = Download{Rate: monday}
	now.set("2026-09-30 18:40")
	if quote := current(t, service); quote.Rate != tuesday {
		t.Fatalf("got %+v, want Tuesday's rate kept over an older copy", quote)
	}
}

func TestServiceRemembersTheRateAcrossRestarts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usd-dop.json")
	now := &clock{}
	now.set("2026-09-29 09:00")
	current(t, newTestService(t, &fakeSource{download: Download{Rate: monday}}, path, now))

	offline := &fakeSource{err: errors.New("offline")}
	restarted := newTestService(t, offline, path, now)
	now.set("2026-09-29 12:00")
	if quote := current(t, restarted); quote.Rate != monday || quote.Stale || offline.calls != 0 {
		t.Fatalf("got %+v after %d downloads, want the saved rate without downloading", quote, offline.calls)
	}
	now.set("2026-09-30 09:00")
	if quote := current(t, restarted); quote.Rate != monday || !quote.Stale {
		t.Fatalf("got %+v, want the saved rate marked stale while offline", quote)
	}
}

func TestOnFindsTheRateOfADay(t *testing.T) {
	friday := Rate{Date: "2026-09-25", Buy: 59.277, Sell: 59.645}
	now := &clock{}
	now.set("2026-09-29 20:00")
	source := &fakeSource{download: Download{Rate: tuesday, History: []Rate{friday, monday, tuesday}, ETag: `"a"`}}
	service := newTestService(t, source, "", now)

	for _, tc := range []struct {
		date string
		want Rate
	}{
		{"2026-09-25", friday},
		// A weekend has the rate of the Friday before.
		{"2026-09-27", friday},
		{"2026-09-28", monday},
		{"2026-10-01", tuesday},
	} {
		got, err := service.On(context.Background(), tc.date)
		if err != nil || got != tc.want {
			t.Errorf("On(%s) = %+v, %v; want %+v", tc.date, got, err, tc.want)
		}
	}
	if _, err := service.On(context.Background(), "2026-01-01"); err == nil {
		t.Error("On a date before the series should fail")
	}
	if source.calls != 1 {
		t.Errorf("downloaded %d times, want once", source.calls)
	}
}

func TestOnDownloadsTheWholeSeriesForAnOldCache(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usd-dop.json")
	now := &clock{}
	now.set("2026-09-28 20:00")
	// A cache written before the service kept the series.
	current(t, newTestService(t, &fakeSource{download: Download{Rate: monday, ETag: `"a"`}}, path, now))

	source := &fakeSource{download: Download{Rate: monday, History: []Rate{monday}, ETag: `"a"`}}
	service := newTestService(t, source, path, now)
	if got, err := service.On(context.Background(), "2026-09-28"); err != nil || got != monday {
		t.Fatalf("On = %+v, %v", got, err)
	}
	if source.calls != 1 || source.lastETag != "" {
		t.Errorf("calls %d with ETag %q, want one full download", source.calls, source.lastETag)
	}
}

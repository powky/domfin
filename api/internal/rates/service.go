package rates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// The Dominican Republic keeps UTC−4 all year, without daylight saving.
var santoDomingo = time.FixedZone("AST", -4*60*60)

const (
	// The BCRD publishes each business day's rate before 6:30 p.m.
	publishHour, publishMinute = 18, 30
	// After a failed download, keep serving the cached rate this long before
	// asking the BCRD again, so a slow or broken source doesn't slow every request.
	retryAfterFailure = 5 * time.Minute
	fetchTimeout      = 20 * time.Second
)

// ErrUnavailable means there is no rate to serve: the BCRD could not be
// reached and nothing was cached yet.
var ErrUnavailable = errors.New("USD/DOP rate unavailable")

// Quote is the rate the service answers with.
type Quote struct {
	Rate
	// When the rate was last downloaded or confirmed unchanged.
	FetchedAt time.Time
	// Stale is set when the BCRD could not be reached and this is the last cached rate.
	Stale bool
}

type fetcher interface {
	Fetch(ctx context.Context, etag, lastModified string) (Download, error)
}

// cached is what the service keeps in memory and on disk.
type cached struct {
	Rate         Rate      `json:"rate"`
	FetchedAt    time.Time `json:"fetchedAt"`
	ETag         string    `json:"etag,omitempty"`
	LastModified string    `json:"lastModified,omitempty"`
	// History is every day of the series, oldest first; empty in a cache
	// written before the service kept it.
	History []Rate `json:"history,omitempty"`
}

// Service caches the BCRD rate for a day: it downloads the series once per
// publication (after 6:30 p.m. Santo Domingo time) and falls back to the
// last cached rate, also kept on disk, when the BCRD can't be reached.
type Service struct {
	source fetcher
	// JSON file with the last rate; empty keeps the cache in memory only.
	path string
	now  func() time.Time
	log  *log.Logger

	mu       sync.Mutex
	current  *cached
	failedAt time.Time
	lastErr  error
}

func NewService(source fetcher, path string, logger *log.Logger) *Service {
	s := &Service{source: source, path: path, now: time.Now, log: logger}
	s.load()
	return s
}

// Current returns the latest rate, downloading it when the cached one is due
// for a refresh.
func (s *Service) Current(ctx context.Context) (Quote, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()
	if s.current != nil && now.Before(nextRefresh(*s.current)) {
		return s.quote(false), nil
	}
	if !s.failedAt.IsZero() && now.Sub(s.failedAt) < retryAfterFailure {
		return s.fallback(s.lastErr)
	}

	var etag, lastModified string
	if s.current != nil {
		etag, lastModified = s.current.ETag, s.current.LastModified
	}
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	download, err := s.source.Fetch(ctx, etag, lastModified)
	if err == nil && download.NotModified && s.current == nil {
		err = errors.New("BCRD answered not modified without a cached rate")
	}
	if err != nil {
		s.failedAt, s.lastErr = now, err
		s.log.Printf("no se pudo descargar la tasa del BCRD: %v", err)
		return s.fallback(err)
	}

	s.failedAt, s.lastErr = time.Time{}, nil
	s.keep(download, now)
	return s.quote(false), nil
}

// keep caches a download: an old copy of the series never replaces a newer
// rate, and an unchanged one keeps the history it had.
func (s *Service) keep(download Download, now time.Time) {
	next := cached{Rate: download.Rate, History: download.History, FetchedAt: now.UTC(), ETag: download.ETag,
		LastModified: download.LastModified}
	if s.current != nil && (download.NotModified || download.Rate.Date < s.current.Rate.Date) {
		next.Rate, next.History = s.current.Rate, s.current.History
	}
	s.current = &next
	s.save()
}

// On returns the rate of a day ("YYYY-MM-DD"), or of the last business day
// before it: a weekend or a holiday has the rate of the day before. It reads
// the cached series, downloading it whole when the cache doesn't have it.
func (s *Service) On(ctx context.Context, date string) (Rate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil || len(s.current.History) == 0 {
		now := s.now()
		if !s.failedAt.IsZero() && now.Sub(s.failedAt) < retryAfterFailure {
			return Rate{}, fmt.Errorf("%w: %v", ErrUnavailable, s.lastErr)
		}
		ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
		defer cancel()
		// Without ETag, so an unchanged series still comes whole.
		download, err := s.source.Fetch(ctx, "", "")
		if err != nil {
			s.failedAt, s.lastErr = now, err
			return Rate{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
		}
		s.failedAt, s.lastErr = time.Time{}, nil
		s.keep(download, now)
	}
	history := s.current.History
	i := sort.Search(len(history), func(i int) bool { return history[i].Date > date })
	if i == 0 {
		return Rate{}, fmt.Errorf("no BCRD rate on or before %s", date)
	}
	return history[i-1], nil
}

func (s *Service) quote(stale bool) Quote {
	return Quote{Rate: s.current.Rate, FetchedAt: s.current.FetchedAt, Stale: stale}
}

func (s *Service) fallback(err error) (Quote, error) {
	if s.current == nil {
		return Quote{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	return s.quote(true), nil
}

// nextRefresh is when a cached rate is due to be downloaded again: at the
// next publication time, or within the hour when it was downloaded after
// today's publication time but today's rate wasn't out yet (published late,
// or a weekend or holiday).
func nextRefresh(c cached) time.Time {
	fetched := c.FetchedAt.In(santoDomingo)
	year, month, day := fetched.Date()
	published := time.Date(year, month, day, publishHour, publishMinute, 0, 0, santoDomingo)
	if fetched.Before(published) {
		return published
	}
	if c.Rate.Date < fetched.Format(time.DateOnly) {
		return fetched.Add(time.Hour)
	}
	return published.AddDate(0, 0, 1)
}

func (s *Service) load() {
	if s.path == "" {
		return
	}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return
	}
	var saved cached
	if err == nil {
		err = json.Unmarshal(data, &saved)
	}
	if err != nil || saved.Rate.Date == "" {
		s.log.Printf("se ignora la tasa guardada en %s: %v", s.path, err)
		return
	}
	s.current = &saved
}

// save writes the cache to a temporary file and renames it, so a crash never
// leaves a half-written file behind.
func (s *Service) save() {
	if s.path == "" {
		return
	}
	data, err := json.MarshalIndent(s.current, "", "  ")
	if err == nil {
		err = os.MkdirAll(filepath.Dir(s.path), 0o755)
	}
	if err == nil {
		temporary := s.path + ".tmp"
		if err = os.WriteFile(temporary, data, 0o644); err == nil {
			err = os.Rename(temporary, s.path)
		}
	}
	if err != nil {
		s.log.Printf("no se pudo guardar la tasa en %s: %v", s.path, err)
	}
}

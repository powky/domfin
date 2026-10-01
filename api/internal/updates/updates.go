// Package updates asks GitHub for Domfin's latest release, at most twice a
// day, so the app can say an update is out. It sends nothing about you:
// only which repository it asks about.
package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	checkEvery        = 12 * time.Hour
	retryAfterFailure = time.Hour
	fetchTimeout      = 10 * time.Second
)

// Release is the latest published version.
type Release struct {
	// Version without the "v": "0.2.0".
	Version string
	// URL of the release page, with its notes.
	URL string
}

// Checker finds the latest release of Repo, remembering the answer for a
// while.
type Checker struct {
	Client *http.Client
	// BaseURL is GitHub's API, https://api.github.com.
	BaseURL string
	// Repo is "owner/name".
	Repo string

	now       func() time.Time
	mu        sync.Mutex
	release   *Release
	checkedAt time.Time
	failed    bool
}

// NewChecker asks GitHub about repo with client.
func NewChecker(client *http.Client, repo string) *Checker {
	return &Checker{Client: client, BaseURL: "https://api.github.com", Repo: repo}
}

// Latest is the newest release; nil when there's none yet. A failure keeps
// the last answer, and isn't retried for an hour.
func (c *Checker) Latest(ctx context.Context) (*Release, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if c.now != nil {
		now = c.now()
	}
	if !c.checkedAt.IsZero() {
		wait := checkEvery
		if c.failed {
			wait = retryAfterFailure
		}
		if now.Sub(c.checkedAt) < wait {
			return c.release, nil
		}
	}
	release, err := c.fetch(ctx)
	c.checkedAt, c.failed = now, err != nil
	if err != nil {
		return c.release, err
	}
	c.release = release
	return release, nil
}

func (c *Checker) fetch(ctx context.Context) (*Release, error) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/repos/"+c.Repo+"/releases/latest", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "domfin-api")
	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		// No release published yet.
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub answered %s for %s", resp.Status, c.Repo)
	}
	var body struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	if body.TagName == "" {
		return nil, errors.New("a release without a tag")
	}
	return &Release{Version: strings.TrimPrefix(body.TagName, "v"), URL: body.HTMLURL}, nil
}

// Newer reports whether version a ("0.2.0", "v1.0.0") comes after b. Parts
// that aren't numbers count as 0, and what follows a "-" is ignored.
func Newer(a, b string) bool {
	parse := func(v string) [3]int {
		v, _, _ = strings.Cut(strings.TrimPrefix(v, "v"), "-")
		var parts [3]int
		for i, part := range strings.SplitN(v, ".", 3) {
			parts[i], _ = strconv.Atoi(part)
		}
		return parts
	}
	pa, pb := parse(a), parse(b)
	for i := range pa {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}

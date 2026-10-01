package updates

import (
	"encoding/json"
	"log"
	"net/http"
)

type updatesJSON struct {
	// Version is what this API runs; the app compares its own too.
	Version string `json:"version"`
	// Latest is the newest release on GitHub, "" when none is known.
	Latest string `json:"latest,omitempty"`
	URL    string `json:"url,omitempty"`
	// Available says Latest is newer than Version.
	Available bool `json:"available,omitempty"`
}

// Handler serves GET /updates: the version this API runs and Domfin's latest
// release on GitHub. A nil checker (updates turned off) never asks GitHub and
// only gives the version.
func Handler(c *Checker, current string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := updatesJSON{Version: current}
		if c != nil {
			release, err := c.Latest(r.Context())
			if err != nil {
				log.Printf("no se pudo ver si hay una versión nueva: %v", err)
			}
			if release != nil {
				body.Latest, body.URL = release.Version, release.URL
				body.Available = Newer(release.Version, current)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(body)
	})
}

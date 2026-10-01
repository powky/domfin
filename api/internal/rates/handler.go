package rates

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Response is the body of GET /rates/usd-dop.
type Response struct {
	Base  string `json:"base"`
	Quote string `json:"quote"`
	Rate
	Source    string    `json:"source"`
	SourceURL string    `json:"sourceUrl"`
	FetchedAt time.Time `json:"fetchedAt"`
	// Stale is true when the BCRD couldn't be reached and this is the last cached rate.
	Stale bool `json:"stale"`
}

// Handler serves the latest USD/DOP rate as JSON, or 503 when there is none.
func Handler(service *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quote, err := service.Current(r.Context())
		if errors.Is(err, ErrUnavailable) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, Response{
			Base:      "USD",
			Quote:     "DOP",
			Rate:      quote.Rate,
			Source:    SourceName,
			SourceURL: SeriesURL,
			FetchedAt: quote.FetchedAt,
			Stale:     quote.Stale,
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Package localonly guards endpoints that handle bank data: they answer
// this computer (the web app in development, a simulator) and pages served
// from localhost, not other devices on the network nor other sites open in
// the browser.
package localonly

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
)

// Handler turns away requests from other machines and from pages not
// served from localhost, and lets the local ones read the answers.
func Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if ip := net.ParseIP(host); err != nil || ip == nil || !ip.IsLoopback() {
			forbid(w)
			return
		}
		// Browsers send Origin with cross-origin requests; the app itself
		// (native) and curl don't.
		if origin := r.Header.Get("Origin"); origin != "" {
			if !localOrigin(origin) {
				forbid(w)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func localOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

func forbid(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{"error": "local_only"})
}

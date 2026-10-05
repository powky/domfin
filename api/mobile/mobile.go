// Package mobile runs Domfin's engine inside the iOS and Android apps: the
// same API as domfin-api, on a port of 127.0.0.1 that only the phone itself
// reaches, so the app talks to it as it does to domfin-api on a computer.
// Other apps on the phone reach 127.0.0.1 too, so the engine only answers
// requests that carry its token (see Token). gomobile bind builds it
// (app/modules/domfin-engine/build.sh).
package mobile

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/powky/domfin/api/internal/server"
	"github.com/powky/domfin/api/internal/updates"
	"github.com/powky/domfin/api/internal/version"
)

var (
	mu       sync.Mutex
	handler  http.Handler
	port     int
	lastPort int
	token    string
)

// Start opens the database in dataDir, created if missing, and serves the
// API on 127.0.0.1. It returns the port, the same one while it serves.
// Requests need Token.
func Start(dataDir string) (int, error) {
	mu.Lock()
	defer mu.Unlock()
	if port != 0 {
		return port, nil
	}
	began := time.Now()
	if handler == nil {
		token = rand.Text()
		handler = timed(authorized(token, server.New(server.Config{
			DBPath:    filepath.Join(dataDir, "domfin.db"),
			RateCache: filepath.Join(dataDir, "usd-dop.json"),
			Updates:   updates.NewChecker(&http.Client{Timeout: 15 * time.Second}, version.Repo),
		})))
	}
	// Back from the background, iOS may have closed the socket: the same
	// port again keeps the app's address valid.
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", lastPort))
	if err != nil && lastPort != 0 {
		listener, err = net.Listen("tcp", "127.0.0.1:0")
	}
	if err != nil {
		return 0, err
	}
	port = listener.Addr().(*net.TCPAddr).Port
	lastPort = port
	go serve(listener)
	log.Printf("motor de Domfin %s: en 127.0.0.1:%d, listo en %s", version.Version, port, time.Since(began).Round(time.Millisecond))
	return port, nil
}

// Token is the secret each request to the engine carries, as
// "Authorization: Bearer <token>". It's new each time the app starts and
// only the app has it: other apps on the phone can reach 127.0.0.1, and
// without it they get a 401. Empty until Start.
func Token() string {
	mu.Lock()
	defer mu.Unlock()
	return token
}

// authorized turns away requests without the token.
func authorized(token string, next http.Handler) http.Handler {
	want := []byte("Bearer " + token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), want) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"unauthorized"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func serve(listener net.Listener) {
	err := http.Serve(listener, handler)
	log.Printf("motor de Domfin: dejó de escuchar: %v", err)
	mu.Lock()
	port = 0
	mu.Unlock()
}

// timed logs each request with how long it took, to see how the engine
// does on a phone (Xcode's console shows it).
func timed(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		began := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		log.Printf("motor de Domfin: %s %s %d en %s", r.Method, r.URL.Path, recorder.status, time.Since(began).Round(time.Millisecond))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

package main

import (
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/powky/domfin/api/internal/server"
	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/updates"
	"github.com/powky/domfin/api/internal/version"
)

func main() {
	// Settings may come from .env in the folder the API runs from.
	if err := godotenv.Load(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		log.Printf("no se pudo leer .env: %v", err)
	}
	handler := server.New(server.Config{
		DBPath:      store.DefaultPath(),
		RateCache:   rateCachePath(),
		PDFPassword: os.Getenv("STATEMENTS_PDF_PASSWORD"),
		Updates:     updateChecker(),
	})

	addr := ":" + envOr("PORT", "8080")
	log.Printf("domfin-api escuchando en %s", addr)
	log.Fatal(http.ListenAndServe(addr, handler))
}

// updateChecker asks GitHub for Domfin's releases, unless
// DOMFIN_UPDATE_CHECK=off turns it off: then the API never calls GitHub.
func updateChecker() *updates.Checker {
	if strings.EqualFold(os.Getenv("DOMFIN_UPDATE_CHECK"), "off") {
		return nil
	}
	return updates.NewChecker(&http.Client{Timeout: 15 * time.Second}, envOr("DOMFIN_REPO", version.Repo))
}

// rateCachePath is where the last BCRD rate survives restarts:
// $DOMFIN_CACHE_DIR, or the user cache directory (~/Library/Caches on macOS).
func rateCachePath() string {
	dir := os.Getenv("DOMFIN_CACHE_DIR")
	if dir == "" {
		base, err := os.UserCacheDir()
		if err != nil {
			log.Printf("sin carpeta de caché, la tasa solo se guarda en memoria: %v", err)
			return ""
		}
		dir = filepath.Join(base, "domfin-api")
	}
	return filepath.Join(dir, "usd-dop.json")
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

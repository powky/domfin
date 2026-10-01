package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/powky/domfin/api/internal/accounts"
	"github.com/powky/domfin/api/internal/assets"
	"github.com/powky/domfin/api/internal/backup"
	"github.com/powky/domfin/api/internal/books"
	"github.com/powky/domfin/api/internal/importer"
	"github.com/powky/domfin/api/internal/rates"
	"github.com/powky/domfin/api/internal/store"
	"github.com/powky/domfin/api/internal/updates"
	"github.com/powky/domfin/api/internal/version"
)

func main() {
	// Settings may come from .env in the folder the API runs from.
	if err := godotenv.Load(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		log.Printf("no se pudo leer .env: %v", err)
	}
	logger := log.Default()
	rateService := rates.NewService(rates.NewSource(&http.Client{Timeout: 30 * time.Second}), rateCachePath(), logger)

	db, err := store.Open(store.DefaultPath())
	if err != nil {
		log.Printf("sin base local, no se pueden importar estados ni leer el libro: %v", err)
	}
	rateOn := func(ctx context.Context, date string) (float64, float64, error) {
		rate, err := rateService.On(ctx, date)
		return rate.Buy, rate.Sell, err
	}
	convert := func(ctx context.Context, cents int64, from, to, date string) (int64, error) {
		return assets.Convert(ctx, rateOn, cents, from, to, date)
	}
	backups := backup.New(db, version.Version)
	statements := &importer.Importer{Store: db, Password: os.Getenv("STATEMENTS_PDF_PASSWORD")}
	if db != nil {
		statements.AfterSave = func(ctx context.Context) {
			if err := db.SyncAssetLinks(ctx, convert); err != nil {
				log.Printf("activos: %v", err)
			}
			backups.Imported()
		}
		backups.Start(context.Background())
	}

	public := http.NewServeMux()
	public.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	public.Handle("GET /rates/usd-dop", rates.Handler(rateService))
	public.Handle("GET /updates", updates.Handler(updateChecker(), version.Version))

	mux := http.NewServeMux()
	// Bank data: only for this computer, with its own CORS rules.
	mux.Handle("/statements/", importer.Handler(statements))
	mux.Handle("/ledger/", books.Handler(db, convert, rateOn))
	mux.Handle("/accounts", accounts.Handler(db))
	backupHandler := backup.Handler(backups)
	mux.Handle("/backup", backupHandler)
	mux.Handle("/backup/", backupHandler)
	mux.Handle("/", allowCORS(public))

	addr := ":" + envOr("PORT", "8080")
	log.Printf("domfin-api escuchando en %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
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

// allowCORS lets the web app, served from another port, read the public
// endpoints.
func allowCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// Package server puts domfin-api together: the database, the BCRD rate,
// the imports, the ledger, the backups and the HTTP handlers. cmd/api
// serves it on a port of the computer; mobile runs the same inside the app.
package server

import (
	"context"
	"log"
	"net/http"
	"time"

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

// Config says where the data lives and what the API may reach.
type Config struct {
	// DBPath is the SQLite database, created if missing.
	DBPath string
	// RateCache is where the last BCRD rate survives restarts; empty keeps
	// it in memory.
	RateCache string
	// PDFPassword opens the bank's PDFs when none is saved in Settings.
	PDFPassword string
	// Updates asks GitHub for new releases; nil never does.
	Updates *updates.Checker
}

// New opens the database and returns the API. Without a database it still
// answers the rate and the updates, and the rest says so.
func New(cfg Config) http.Handler {
	rateService := rates.NewService(rates.NewSource(&http.Client{Timeout: 30 * time.Second}), cfg.RateCache, log.Default())

	db, err := store.Open(cfg.DBPath)
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
	statements := &importer.Importer{Store: db, Password: cfg.PDFPassword}
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
	public.Handle("GET /updates", updates.Handler(cfg.Updates, version.Version))

	mux := http.NewServeMux()
	// Bank data: only for this computer, with its own CORS rules.
	mux.Handle("/statements/", importer.Handler(statements))
	mux.Handle("/ledger/", books.Handler(db, convert, rateOn))
	mux.Handle("/accounts", accounts.Handler(db))
	backupHandler := backup.Handler(backups)
	mux.Handle("/backup", backupHandler)
	mux.Handle("/backup/", backupHandler)
	mux.Handle("/", allowCORS(public))
	return mux
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

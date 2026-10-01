package backup

import (
	"context"
	"log"
	"time"
)

// Status is how backups are going, for the app.
type Status struct {
	Configured bool   `json:"configured"`
	Folder     string `json:"folder,omitempty"`
	// Place is the cloud folder Folder is in, if any.
	Place     *Place `json:"place,omitempty"`
	Automatic bool   `json:"automatic"`
	// NeedsPassword: the backup key has no password yet (see Config.Key).
	NeedsPassword bool `json:"needsPassword"`
	// Available: Folder is there now.
	Available bool   `json:"available"`
	Last      *Run   `json:"last,omitempty"`
	Backups   []File `json:"backups"`
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	cfg, ok, err := s.config(ctx)
	if err != nil || !ok {
		return Status{Backups: []File{}}, err
	}
	status := Status{
		Configured:    true,
		Folder:        cfg.Folder,
		Automatic:     cfg.Automatic,
		NeedsPassword: cfg.Key == "",
		Last:          cfg.Last,
		Backups:       []File{},
	}
	if files, _, err := List(cfg.Folder); err == nil {
		status.Available = true
		if files != nil {
			status.Backups = files
		}
	}
	for _, place := range s.Places() {
		if place.contains(cfg.Folder) {
			status.Place = &place
			break
		}
	}
	return status, nil
}

// Start makes the automatic backups until ctx ends: when the last good one
// is a day old (checked a minute after starting, then every hour) and a
// minute after an import saved something (see Imported).
func (s *Service) Start(ctx context.Context) {
	go func() {
		check := time.NewTimer(time.Minute)
		defer check.Stop()
		var afterImport <-chan time.Time
		for {
			select {
			case <-ctx.Done():
				return
			case <-s.soon:
				// Imports come in batches: wait for the last one.
				afterImport = time.After(time.Minute)
			case <-afterImport:
				afterImport = nil
				s.auto(ctx, true)
			case <-check.C:
				check.Reset(time.Hour)
				s.auto(ctx, false)
			}
		}
	}()
}

// Imported asks for a backup soon, after an import saved something.
func (s *Service) Imported() {
	select {
	case s.soon <- struct{}{}:
	default:
	}
}

func (s *Service) auto(ctx context.Context, imported bool) {
	cfg, ok, err := s.config(ctx)
	if err != nil || !ok || !s.due(cfg, imported) {
		return
	}
	if _, err := s.Backup(ctx); err != nil {
		log.Printf("respaldo automático: %v", err)
	}
}

// due says whether an automatic backup should run now.
func (s *Service) due(cfg Config, imported bool) bool {
	if !cfg.Automatic {
		return false
	}
	if imported || cfg.Last == nil || cfg.Last.Error != "" {
		return true
	}
	return s.Now().Sub(cfg.Last.At) >= 24*time.Hour
}

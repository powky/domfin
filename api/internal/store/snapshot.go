package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"modernc.org/sqlite"
)

var (
	// ErrDamagedSnapshot is a snapshot SQLite can't read, or one that isn't
	// Domfin's.
	ErrDamagedSnapshot = errors.New("store: damaged snapshot")
	// ErrNewerSnapshot is a snapshot from a Domfin newer than this one: it
	// has migrations this version doesn't know.
	ErrNewerSnapshot = errors.New("store: snapshot from a newer Domfin")
)

// Snapshot writes a consistent copy of the database to path, which mustn't
// exist yet, while it keeps being used: what a backup is made from.
func (s *Store) Snapshot(ctx context.Context, path string) error {
	_, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, path)
	return err
}

// CheckSnapshot says whether the database at path can replace this one: it
// must be intact, be Domfin's and not come from a newer Domfin.
func CheckSnapshot(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", dsn(path, "mode=ro"))
	if err != nil {
		return err
	}
	defer db.Close()
	var integrity string
	if err := db.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrity); err != nil || integrity != "ok" {
		return ErrDamagedSnapshot
	}
	var version, settings int
	if err := db.QueryRowContext(ctx, `PRAGMA user_version`).Scan(&version); err != nil {
		return ErrDamagedSnapshot
	}
	err = db.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'settings'`).Scan(&settings)
	if err != nil || version == 0 || settings == 0 {
		return ErrDamagedSnapshot
	}
	if version > len(migrations) {
		return ErrNewerSnapshot
	}
	return nil
}

// Restore replaces the database's contents with the snapshot at path (one
// CheckSnapshot took) without closing it, so the API keeps answering, and
// brings it up to this version's schema.
func (s *Store) Restore(ctx context.Context, path string) error {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	err = conn.Raw(func(driverConn any) error {
		restorer, ok := driverConn.(interface {
			NewRestore(string) (*sqlite.Backup, error)
		})
		if !ok {
			return errors.New("store: the SQLite driver can't restore")
		}
		backup, err := restorer.NewRestore(path)
		if err != nil {
			return err
		}
		for more := true; more; {
			if more, err = backup.Step(-1); err != nil {
				backup.Finish()
				return err
			}
		}
		return backup.Finish()
	})
	conn.Close()
	if err != nil {
		return fmt.Errorf("restore %s: %w", path, err)
	}
	if err := s.migrate(ctx); err != nil {
		return fmt.Errorf("migrate restored database: %w", err)
	}
	return s.addDefaultCategories(ctx)
}

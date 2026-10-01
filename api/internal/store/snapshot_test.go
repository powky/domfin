package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestSnapshotAndRestore(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	if err := s.SetSetting(ctx, "prueba", "antes"); err != nil {
		t.Fatal(err)
	}
	snapshot := filepath.Join(t.TempDir(), "copia.db")
	if err := s.Snapshot(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	if err := CheckSnapshot(ctx, snapshot); err != nil {
		t.Fatalf("a fresh snapshot: %v", err)
	}

	if err := s.SetSetting(ctx, "prueba", "después"); err != nil {
		t.Fatal(err)
	}
	if err := s.Restore(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	var got string
	if ok, err := s.Setting(ctx, "prueba", &got); err != nil || !ok || got != "antes" {
		t.Errorf("after restoring: %q, %v, %v", got, ok, err)
	}
	// Still the same database, in WAL mode, and still writable.
	var mode string
	if err := s.db.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Errorf("journal mode %q, %v", mode, err)
	}
	if err := s.SetSetting(ctx, "prueba", "de nuevo"); err != nil {
		t.Errorf("writing after restoring: %v", err)
	}
}

func TestRestoreMigratesOlderSnapshots(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	snapshot := filepath.Join(t.TempDir(), "copia.db")
	if err := s.Snapshot(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	// A newer Domfin, with one more migration, restores it.
	saved := migrations
	migrations = append(migrations[:len(migrations):len(migrations)], `CREATE TABLE prueba (id INTEGER)`)
	t.Cleanup(func() { migrations = saved })
	if err := s.migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := CheckSnapshot(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	if err := s.Restore(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	var version, tables int
	if err := s.db.QueryRowContext(ctx, `PRAGMA user_version`).Scan(&version); err != nil || version != len(migrations) {
		t.Errorf("version %d, %v", version, err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_schema WHERE name = 'prueba'`).Scan(&tables); err != nil || tables != 1 {
		t.Errorf("the new migration didn't run on the restored database: %d, %v", tables, err)
	}
}

func TestCheckSnapshotRefuses(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	dir := t.TempDir()

	newer := filepath.Join(dir, "nueva.db")
	if err := s.Snapshot(ctx, newer); err != nil {
		t.Fatal(err)
	}
	setVersion(t, newer, len(migrations)+1)

	notSQLite := filepath.Join(dir, "texto.db")
	if err := os.WriteFile(notSQLite, []byte("no es una base de datos"), 0o600); err != nil {
		t.Fatal(err)
	}

	other := filepath.Join(dir, "otra.db")
	db, err := sql.Open("sqlite", dsn(other, ""))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE cosas (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	db.Close()

	for path, want := range map[string]error{
		newer:     ErrNewerSnapshot,
		notSQLite: ErrDamagedSnapshot,
		other:     ErrDamagedSnapshot,
	} {
		if err := CheckSnapshot(ctx, path); !errors.Is(err, want) {
			t.Errorf("%s: %v, want %v", filepath.Base(path), err, want)
		}
	}
}

func setVersion(t *testing.T, path string, version int) {
	t.Helper()
	db, err := sql.Open("sqlite", dsn(path, ""))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, version)); err != nil {
		t.Fatal(err)
	}
}

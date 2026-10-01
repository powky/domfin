package backup

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"filippo.io/age"

	"github.com/powky/domfin/api/internal/store"
)

const password = "una frase larga de prueba"

// newService is a Service on a new database, with a fast scrypt and a clock
// that moves a second each time it's read.
func newService(t *testing.T) *Service {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "datos", "domfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	s := New(st, "0.0.0-prueba")
	s.WorkFactor = 10
	s.Places = func() []Place { return nil }
	clock := time.Date(2026, 10, 1, 9, 30, 0, 0, time.Local)
	s.Now = func() time.Time {
		clock = clock.Add(time.Second)
		return clock
	}
	return s
}

func pdfPassword(t *testing.T, s *Service) string {
	t.Helper()
	got, err := s.Store.StatementsPassword(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func setPDFPassword(t *testing.T, s *Service, value string) {
	t.Helper()
	if err := s.Store.SetStatementsPassword(context.Background(), value); err != nil {
		t.Fatal(err)
	}
}

func TestBackupAndRestore(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "iCloud Drive", "Domfin")
	setPDFPassword(t, s, "la del banco")

	recoveryKey, err := s.Setup(ctx, folder, password)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(recoveryKey, "AGE-SECRET-KEY-PQ-1") {
		t.Errorf("recovery key %q isn't a post-quantum age key", recoveryKey)
	}
	if _, err := os.Stat(filepath.Join(folder, KeyFile)); err != nil {
		t.Fatalf("no key file: %v", err)
	}

	file, err := s.Backup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !backupName.MatchString(file.Name) || file.Bytes == 0 {
		t.Errorf("backup %+v", file)
	}
	// What leaves the computer is age, and nothing of the database shows.
	data, err := os.ReadFile(filepath.Join(folder, file.Name))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(data, []byte("age-encryption.org/v1\n")) || bytes.Contains(data, []byte("SQLite format")) {
		t.Errorf("the backup isn't an age file: %q", data[:min(len(data), 40)])
	}
	keyData, _ := os.ReadFile(filepath.Join(folder, KeyFile))
	if strings.Contains(string(keyData), "AGE-SECRET-KEY") || !strings.HasPrefix(string(keyData), "-----BEGIN AGE ENCRYPTED FILE-----") {
		t.Errorf("the key file isn't the key encrypted:\n%s", keyData)
	}

	setPDFPassword(t, s, "otra")
	safetyCopy, err := s.Restore(ctx, folder, file.Name, password, "")
	if err != nil {
		t.Fatal(err)
	}
	if got := pdfPassword(t, s); got != "la del banco" {
		t.Errorf("after restoring: %q", got)
	}
	if _, err := os.Stat(safetyCopy); err != nil || filepath.Dir(safetyCopy) != filepath.Dir(s.Store.Path()) {
		t.Errorf("safety copy %q: %v", safetyCopy, err)
	}

	status, err := s.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Configured || !status.Available || status.Folder != folder || len(status.Backups) != 1 ||
		status.Last == nil || status.Last.Error != "" || status.NeedsPassword {
		t.Errorf("status %+v", status)
	}
}

// On a new computer, a new database restores with the recovery key, and
// then keeps backing up to the same folder with the same key.
func TestRestoreOnAnotherComputer(t *testing.T) {
	ctx := context.Background()
	old := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	setPDFPassword(t, old, "la del banco")
	recoveryKey, err := old.Setup(ctx, folder, password)
	if err != nil {
		t.Fatal(err)
	}
	file, err := old.Backup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	oldConfig, _, _ := old.config(ctx)

	for _, way := range []struct{ name, password, recoveryKey string }{
		{"password", password, ""},
		// Pasted from a password manager, with line breaks and in lowercase.
		{"recovery key", "", "\n  " + strings.ToLower(recoveryKey[:30]) + "\n" + recoveryKey[30:] + "  "},
	} {
		t.Run(way.name, func(t *testing.T) {
			s := newService(t)
			if _, err := s.Restore(ctx, folder, file.Name, way.password, way.recoveryKey); err != nil {
				t.Fatal(err)
			}
			if got := pdfPassword(t, s); got != "la del banco" {
				t.Errorf("restored %q", got)
			}
			cfg, ok, err := s.config(ctx)
			if err != nil || !ok || cfg.Folder != folder || cfg.Recipient != oldConfig.Recipient || cfg.Key != oldConfig.Key {
				t.Errorf("config after restoring: %+v, %v", cfg, err)
			}
			if _, err := s.Backup(ctx); err != nil {
				t.Errorf("backing up after restoring: %v", err)
			}
		})
	}
}

func TestRestoreRefuses(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	if _, err := s.Setup(ctx, folder, password); err != nil {
		t.Fatal(err)
	}
	file, err := s.Backup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	other, err := age.GenerateHybridIdentity()
	if err != nil {
		t.Fatal(err)
	}

	tampered := "domfin-2026-10-01-120000.age"
	data, _ := os.ReadFile(filepath.Join(folder, file.Name))
	data[len(data)-20] ^= 1
	if err := os.WriteFile(filepath.Join(folder, tampered), data, 0o600); err != nil {
		t.Fatal(err)
	}
	noKey := t.TempDir()
	original, _ := os.ReadFile(filepath.Join(folder, file.Name))
	os.WriteFile(filepath.Join(noKey, file.Name), original, 0o600)

	for _, c := range []struct {
		name                         string
		folder, file, pass, recovery string
		want                         error
	}{
		{"wrong password", folder, file.Name, "otra frase cualquiera", "", ErrWrongPassword},
		{"another key", folder, file.Name, "", other.String(), ErrWrongKey},
		{"not a key", folder, file.Name, "", "AGE-SECRET-KEY-PQ-1NOSIRVE", ErrBadRecoveryKey},
		{"tampered", folder, tampered, password, "", ErrDamaged},
		{"not a backup's name", folder, "../domfin.db", password, "", ErrBadFile},
		{"no such backup", folder, "domfin-2020-01-01-000000.age", password, "", ErrBadFile},
		{"folder without the key file", noKey, file.Name, password, "", ErrNoKey},
		{"relative folder", "Domfin", file.Name, password, "", ErrBadFolder},
	} {
		if _, err := s.Restore(ctx, c.folder, c.file, c.pass, c.recovery); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, want %v", c.name, err, c.want)
		}
	}
}

func TestRestoreRefusesNewerBackups(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	recoveryKey, err := s.Setup(ctx, folder, password)
	if err != nil {
		t.Fatal(err)
	}
	// A backup from a Domfin with more migrations than this one.
	snapshot := filepath.Join(t.TempDir(), "nueva.db")
	if err := s.Store.Snapshot(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`PRAGMA user_version = 9999`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	id, _ := parseRecoveryKey(recoveryKey)
	name := "domfin-2030-01-01-000000.age"
	out, err := os.Create(filepath.Join(folder, name))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.encrypt(out, snapshot, id.Recipient(), s.Now()); err != nil {
		t.Fatal(err)
	}
	out.Close()

	if _, err := s.Restore(ctx, folder, name, password, ""); !errors.Is(err, ErrNewer) {
		t.Errorf("restoring a newer backup: %v", err)
	}
}

func TestSetup(t *testing.T) {
	ctx := context.Background()
	first := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	if _, err := first.Setup(ctx, folder, password); err != nil {
		t.Fatal(err)
	}
	firstConfig, _, _ := first.config(ctx)

	// A folder that already has backups keeps their key, with their password.
	s := newService(t)
	if _, err := s.Setup(ctx, folder, "otra frase cualquiera"); !errors.Is(err, ErrWrongPassword) {
		t.Errorf("adopting with another password: %v", err)
	}
	recoveryKey, err := s.Setup(ctx, folder, password)
	if err != nil {
		t.Fatal(err)
	}
	cfg, _, _ := s.config(ctx)
	if recoveryKey != "" || cfg.Recipient != firstConfig.Recipient || !cfg.Automatic {
		t.Errorf("adopting: key %q, config %+v", recoveryKey, cfg)
	}

	for _, c := range []struct {
		folder, password string
		want             error
	}{
		{filepath.Join(t.TempDir(), "Domfin"), "corta", ErrShortPassword},
		{"Domfin", password, ErrBadFolder},
	} {
		if _, err := s.Setup(ctx, c.folder, c.password); !errors.Is(err, c.want) {
			t.Errorf("Setup(%q, %q): %v, want %v", c.folder, c.password, err, c.want)
		}
	}
}

func TestChangePassword(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	recoveryKey, err := s.Setup(ctx, folder, password)
	if err != nil {
		t.Fatal(err)
	}
	file, err := s.Backup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	const newPassword = "la nueva frase de respaldo"

	if err := s.ChangePassword(ctx, "no es la actual", "", newPassword); !errors.Is(err, ErrWrongPassword) {
		t.Errorf("with a wrong password: %v", err)
	}
	if err := s.ChangePassword(ctx, password, "", "corta"); !errors.Is(err, ErrShortPassword) {
		t.Errorf("to a short one: %v", err)
	}
	if err := s.ChangePassword(ctx, password, "", newPassword); err != nil {
		t.Fatal(err)
	}
	// The backups stay; the new password opens them and the old one doesn't.
	if _, err := s.Restore(ctx, folder, file.Name, password, ""); !errors.Is(err, ErrWrongPassword) {
		t.Errorf("the old password: %v", err)
	}
	if _, err := s.Restore(ctx, folder, file.Name, newPassword, ""); err != nil {
		t.Errorf("the new password: %v", err)
	}
	// Forgotten password: the recovery key sets another.
	if err := s.ChangePassword(ctx, "", recoveryKey, "una tercera frase larga"); err != nil {
		t.Errorf("with the recovery key: %v", err)
	}
	if _, err := s.Restore(ctx, folder, file.Name, "una tercera frase larga", ""); err != nil {
		t.Errorf("after setting it with the recovery key: %v", err)
	}
}

func TestBackupWithoutFolder(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	if _, err := s.Backup(ctx); !errors.Is(err, ErrNotConfigured) {
		t.Errorf("before setup: %v", err)
	}
	folder := filepath.Join(t.TempDir(), "Domfin")
	if _, err := s.Setup(ctx, folder, password); err != nil {
		t.Fatal(err)
	}
	// Signed out of the cloud service, or a disk unplugged.
	if err := os.RemoveAll(folder); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Backup(ctx); !errors.Is(err, ErrFolderMissing) {
		t.Errorf("without the folder: %v", err)
	}
	if _, err := os.Stat(folder); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the folder came back as a plain one: %v", err)
	}
	status, err := s.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.Available || status.Last == nil || status.Last.Error != "folder_missing" {
		t.Errorf("status %+v, last %+v", status, status.Last)
	}

	// Back, but without the key file: the next backup writes it again.
	if err := os.MkdirAll(folder, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Backup(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(folder, KeyFile)); err != nil {
		t.Errorf("key file not written back: %v", err)
	}
}

func TestUpdateAndDisable(t *testing.T) {
	ctx := context.Background()
	s := newService(t)
	folder := filepath.Join(t.TempDir(), "Domfin")
	if _, err := s.Setup(ctx, folder, password); err != nil {
		t.Fatal(err)
	}
	off := false
	moved := filepath.Join(t.TempDir(), "Dropbox", "Domfin")
	if err := s.Update(ctx, &off, &moved); err != nil {
		t.Fatal(err)
	}
	status, _ := s.Status(ctx)
	if status.Automatic || status.Folder != moved {
		t.Errorf("after updating: %+v", status)
	}
	if _, err := os.Stat(filepath.Join(moved, KeyFile)); err != nil {
		t.Errorf("no key file in the new folder: %v", err)
	}

	// Another folder's backups have their own key.
	other := newService(t)
	otherFolder := filepath.Join(t.TempDir(), "Domfin")
	if _, err := other.Setup(ctx, otherFolder, password); err != nil {
		t.Fatal(err)
	}
	if err := s.Update(ctx, nil, &otherFolder); !errors.Is(err, ErrOtherKey) {
		t.Errorf("moving to a folder with another key: %v", err)
	}

	if err := s.Disable(ctx); err != nil {
		t.Fatal(err)
	}
	if status, _ := s.Status(ctx); status.Configured {
		t.Errorf("still configured: %+v", status)
	}
	if _, err := os.Stat(filepath.Join(moved, KeyFile)); err != nil {
		t.Errorf("disabling removed the key file: %v", err)
	}
}

func TestPrune(t *testing.T) {
	folder := t.TempDir()
	var names []string
	add := func(at time.Time) {
		name := "domfin-" + at.Format(nameLayout) + ".age"
		names = append(names, name)
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	// Two a day from September 1 to 10, and one a month back to July 2025.
	for day := 1; day <= 10; day++ {
		add(time.Date(2026, 9, day, 8, 0, 0, 0, time.Local))
		add(time.Date(2026, 9, day, 20, 0, 0, 0, time.Local))
	}
	for month := 0; month < 14; month++ {
		add(time.Date(2025, time.July+time.Month(month), 15, 12, 0, 0, 0, time.Local))
	}
	os.WriteFile(filepath.Join(folder, "notas.txt"), []byte("mías"), 0o600)

	files, _, err := List(folder)
	if err != nil {
		t.Fatal(err)
	}
	prune(folder, files, time.Date(2026, 9, 10, 21, 0, 0, 0, time.Local))

	want := map[string]bool{"notas.txt": true}
	// All of the last day's.
	want["domfin-"+time.Date(2026, 9, 10, 8, 0, 0, 0, time.Local).Format(nameLayout)+".age"] = true
	for day := 4; day <= 10; day++ { // the newest of the last 7 days
		want["domfin-"+time.Date(2026, 9, day, 20, 0, 0, 0, time.Local).Format(nameLayout)+".age"] = true
	}
	for month := 0; month < 11; month++ { // and of each month, back to October 2025
		want["domfin-"+time.Date(2025, time.October+time.Month(month), 15, 12, 0, 0, 0, time.Local).Format(nameLayout)+".age"] = true
	}
	entries, _ := os.ReadDir(folder)
	got := map[string]bool{}
	for _, entry := range entries {
		got[entry.Name()] = true
	}
	for name := range want {
		if !got[name] {
			t.Errorf("removed %s", name)
		}
	}
	for name := range got {
		if !want[name] {
			t.Errorf("kept %s", name)
		}
	}
}

func TestDue(t *testing.T) {
	s := newService(t)
	now := s.Now()
	s.Now = func() time.Time { return now }
	for _, c := range []struct {
		name     string
		cfg      Config
		imported bool
		want     bool
	}{
		{"off", Config{Automatic: false}, true, false},
		{"never", Config{Automatic: true}, false, true},
		{"after an import", Config{Automatic: true, Last: &Run{At: now.Add(-time.Hour)}}, true, true},
		{"an hour ago", Config{Automatic: true, Last: &Run{At: now.Add(-time.Hour)}}, false, false},
		{"a day ago", Config{Automatic: true, Last: &Run{At: now.Add(-24 * time.Hour)}}, false, true},
		{"failed", Config{Automatic: true, Last: &Run{At: now.Add(-time.Hour), Error: "folder_missing"}}, false, true},
	} {
		if got := s.due(c.cfg, c.imported); got != c.want {
			t.Errorf("%s: %v", c.name, got)
		}
	}
}

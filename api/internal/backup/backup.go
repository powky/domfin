// Package backup keeps encrypted copies of Domfin's database in a folder the
// user picks, usually one their cloud service syncs (iCloud Drive, Google
// Drive, Dropbox, OneDrive), and brings them back.
//
// A backup is a snapshot of the database, gzipped and encrypted with age
// (age-encryption.org) to a post-quantum key (ML-KEM-768 + X25519) Domfin
// makes once. The key's public half stays in the database, so backups run on
// their own without the password. Its private half travels next to the
// backups in KeyFile, encrypted with the backup password (scrypt), and is
// also the recovery key, shown once. Without one of the two no one can read
// the backups, Domfin included; with either, Domfin or the age command line
// tool can.
package backup

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"filippo.io/age"
	"filippo.io/age/armor"

	"github.com/powky/domfin/api/internal/store"
)

// KeyFile holds the backup key's private half, encrypted with the backup
// password, in the folder with the backups it opens.
const KeyFile = "domfin-clave.age"

// MinPassword is the shortest backup password: KeyFile goes to the cloud, and
// the password is all that guards it there.
const MinPassword = 10

// settingsKey is the database setting with the Config.
const settingsKey = "backup"

// nameLayout dates a backup's name: domfin-2026-10-01-093015.age.
const nameLayout = "2006-01-02-150405"

var backupName = regexp.MustCompile(`^domfin-(\d{4}-\d{2}-\d{2}-\d{6})\.age$`)

// Pruning keeps every backup of the last day, to go back to before an
// import; the newest of each of the last keepDays days with backups; and of
// each of the last keepMonths months.
const (
	keepDays   = 7
	keepMonths = 12
)

// safetyCopies is how many copies of the database Restore leaves, the newest.
const safetyCopies = 3

// maxDatabase bounds what a backup unpacks to, against a damaged one filling
// the disk.
const maxDatabase = 4 << 30

var (
	ErrNotConfigured  = errors.New("backup: not configured")
	ErrBadFolder      = errors.New("backup: the folder must be an absolute path")
	ErrFolderMissing  = errors.New("backup: the folder isn't there")
	ErrShortPassword  = errors.New("backup: the password is too short")
	ErrWrongPassword  = errors.New("backup: wrong password")
	ErrWrongKey       = errors.New("backup: the key doesn't open it")
	ErrBadRecoveryKey = errors.New("backup: not a recovery key")
	ErrNoKey          = errors.New("backup: no key file in the folder")
	ErrOtherKey       = errors.New("backup: the folder has another key")
	ErrBadFile        = errors.New("backup: no such backup")
	ErrDamaged        = errors.New("backup: damaged")
	ErrNewer          = errors.New("backup: made by a newer Domfin")
)

// Config is how backups are made, saved in the database.
type Config struct {
	Folder string `json:"folder"`
	// Recipient is the backup key's public half, which backups are
	// encrypted to.
	Recipient string `json:"recipient"`
	// Key is the private half encrypted with the backup password, as
	// KeyFile holds it. It's empty after restoring with the recovery key
	// from a folder without KeyFile, until a password is set.
	Key       string `json:"key"`
	Automatic bool   `json:"automatic"`
	Last      *Run   `json:"last,omitempty"`
}

// Run is how the last backup went.
type Run struct {
	At    time.Time `json:"at"`
	File  string    `json:"file,omitempty"`
	Bytes int64     `json:"bytes,omitempty"`
	// Error is the code of what failed (see codeOf), "" when nothing did.
	Error string `json:"error,omitempty"`
}

// File is a backup in a folder.
type File struct {
	Name  string    `json:"file"`
	At    time.Time `json:"at"`
	Bytes int64     `json:"bytes"`
}

// Service makes and restores the backups of a store.
type Service struct {
	Store *store.Store
	// Version is Domfin's, noted inside each backup.
	Version string
	Now     func() time.Time
	// WorkFactor is scrypt's for KeyFile, as a power of two.
	WorkFactor int
	// Places finds the cloud folders on this computer.
	Places func() []Place

	mu   sync.Mutex // one backup, restore or change at a time
	soon chan struct{}
}

func New(st *store.Store, version string) *Service {
	return &Service{
		Store:      st,
		Version:    version,
		Now:        time.Now,
		WorkFactor: 18,
		Places:     DetectPlaces,
		soon:       make(chan struct{}, 1),
	}
}

func (s *Service) config(ctx context.Context) (Config, bool, error) {
	var cfg Config
	ok, err := s.Store.Setting(ctx, settingsKey, &cfg)
	return cfg, ok && cfg.Folder != "", err
}

func (s *Service) save(ctx context.Context, cfg Config) error {
	return s.Store.SetSetting(ctx, settingsKey, cfg)
}

// Setup starts backing up to folder, creating it. If it already holds
// backups (KeyFile is there), the password must open them and their key is
// kept. Otherwise Domfin makes a new key, writes KeyFile and returns the
// recovery key: the only time it's shown.
func (s *Service) Setup(ctx context.Context, folder, password string) (recoveryKey string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !filepath.IsAbs(folder) {
		return "", ErrBadFolder
	}
	folder = filepath.Clean(folder)
	cfg := Config{Folder: folder, Automatic: true}
	if old, ok, err := s.config(ctx); err != nil {
		return "", err
	} else if ok {
		cfg.Automatic = old.Automatic
	}

	armored, err := os.ReadFile(filepath.Join(folder, KeyFile))
	switch {
	case err == nil:
		id, err := unwrap(string(armored), password)
		if err != nil {
			return "", err
		}
		cfg.Recipient, cfg.Key = id.Recipient().String(), string(armored)
	case errors.Is(err, fs.ErrNotExist):
		if len([]rune(password)) < MinPassword {
			return "", ErrShortPassword
		}
		if err := os.MkdirAll(folder, 0o700); err != nil {
			return "", err
		}
		id, err := age.GenerateHybridIdentity()
		if err != nil {
			return "", err
		}
		key, err := s.wrap(id, password)
		if err != nil {
			return "", err
		}
		if err := writeFile(filepath.Join(folder, KeyFile), []byte(key)); err != nil {
			return "", err
		}
		cfg.Recipient, cfg.Key = id.Recipient().String(), key
		recoveryKey = id.String()
	default:
		return "", err
	}
	return recoveryKey, s.save(ctx, cfg)
}

// Backup makes a backup now and prunes the old ones. Its outcome, good or
// bad, is the Config's Last.
func (s *Service) Backup(ctx context.Context) (File, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, ok, err := s.config(ctx)
	if err != nil {
		return File{}, err
	}
	if !ok {
		return File{}, ErrNotConfigured
	}
	file, err := s.backup(ctx, cfg)
	run := &Run{At: s.Now(), File: file.Name, Bytes: file.Bytes}
	if err != nil {
		_, run.Error = codeOf(err)
	}
	cfg.Last = run
	if saveErr := s.save(ctx, cfg); err == nil {
		err = saveErr
	}
	return file, err
}

func (s *Service) backup(ctx context.Context, cfg Config) (File, error) {
	// Never created here: a folder that's gone (a cloud service signed out,
	// a disk unplugged) would come back as a plain folder nothing syncs.
	if info, err := os.Stat(cfg.Folder); err != nil || !info.IsDir() {
		return File{}, ErrFolderMissing
	}
	recipient, err := age.ParseHybridRecipient(cfg.Recipient)
	if err != nil {
		return File{}, fmt.Errorf("backup key: %w", err)
	}
	// KeyFile travels with the backups: put it back if it went missing.
	keyPath := filepath.Join(cfg.Folder, KeyFile)
	if _, err := os.Stat(keyPath); errors.Is(err, fs.ErrNotExist) && cfg.Key != "" {
		if err := writeFile(keyPath, []byte(cfg.Key)); err != nil {
			return File{}, err
		}
	}

	work, err := os.MkdirTemp("", "domfin-backup-")
	if err != nil {
		return File{}, err
	}
	defer os.RemoveAll(work)
	snapshot := filepath.Join(work, "domfin.db")
	if err := s.Store.Snapshot(ctx, snapshot); err != nil {
		return File{}, err
	}

	at := s.Now().Truncate(time.Second)
	name := "domfin-" + at.Format(nameLayout) + ".age"
	target := filepath.Join(cfg.Folder, name)
	// Written under another name and renamed when complete, so the cloud
	// service never uploads half a backup as a backup.
	partial := filepath.Join(cfg.Folder, "."+name+".part")
	out, err := os.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return File{}, err
	}
	err = s.encrypt(out, snapshot, recipient, at)
	if err == nil {
		err = out.Sync()
	}
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(partial, target)
	}
	if err != nil {
		os.Remove(partial)
		return File{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return File{}, err
	}
	if files, _, err := List(cfg.Folder); err == nil {
		prune(cfg.Folder, files, at)
	}
	return File{Name: name, At: at, Bytes: info.Size()}, nil
}

// encrypt writes the snapshot gzipped and encrypted to the recipient.
func (s *Service) encrypt(dst io.Writer, snapshot string, recipient age.Recipient, at time.Time) error {
	in, err := os.Open(snapshot)
	if err != nil {
		return err
	}
	defer in.Close()
	encrypted, err := age.Encrypt(dst, recipient)
	if err != nil {
		return err
	}
	zipped, err := gzip.NewWriterLevel(encrypted, gzip.BestCompression)
	if err != nil {
		return err
	}
	zipped.Header = gzip.Header{Name: "domfin.db", Comment: "Domfin " + s.Version, ModTime: at}
	if _, err := io.Copy(zipped, in); err != nil {
		return err
	}
	if err := zipped.Close(); err != nil {
		return err
	}
	return encrypted.Close()
}

// Restore replaces the database with the backup name in folder, opened with
// the password (through KeyFile) or the recovery key. A copy of the current
// database is left next to it first; its path is returned.
func (s *Service) Restore(ctx context.Context, folder, name, password, recoveryKey string) (safetyCopy string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !filepath.IsAbs(folder) {
		return "", ErrBadFolder
	}
	folder = filepath.Clean(folder)
	if !backupName.MatchString(name) {
		return "", ErrBadFile
	}
	armored, keyErr := os.ReadFile(filepath.Join(folder, KeyFile))
	var id *age.HybridIdentity
	switch {
	case recoveryKey != "":
		id, err = parseRecoveryKey(recoveryKey)
	case keyErr == nil:
		id, err = unwrap(string(armored), password)
	case errors.Is(keyErr, fs.ErrNotExist):
		err = ErrNoKey
	default:
		err = keyErr
	}
	if err != nil {
		return "", err
	}

	in, err := os.Open(filepath.Join(folder, name))
	if errors.Is(err, fs.ErrNotExist) {
		return "", ErrBadFile
	}
	if err != nil {
		return "", err
	}
	defer in.Close()
	work, err := os.MkdirTemp("", "domfin-restore-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(work)
	plain := filepath.Join(work, "domfin.db")
	if err := decrypt(in, plain, id); err != nil {
		return "", err
	}
	switch err := store.CheckSnapshot(ctx, plain); {
	case errors.Is(err, store.ErrNewerSnapshot):
		return "", ErrNewer
	case errors.Is(err, store.ErrDamagedSnapshot):
		return "", ErrDamaged
	case err != nil:
		return "", err
	}

	cfg, configured, err := s.config(ctx)
	if err != nil {
		return "", err
	}
	dataDir := filepath.Dir(s.Store.Path())
	safetyCopy = filepath.Join(dataDir, "domfin-antes-de-restaurar-"+s.Now().Format(nameLayout)+".db")
	if err := s.Store.Snapshot(ctx, safetyCopy); err != nil {
		return "", err
	}
	if err := s.Store.Restore(ctx, plain); err != nil {
		return "", err
	}
	// The backup brings the settings it was made with, maybe on another
	// computer: the ones that just opened it are the ones to keep using.
	next := Config{Folder: folder, Recipient: id.Recipient().String(), Automatic: true}
	if configured {
		next.Automatic = cfg.Automatic
		if cfg.Folder == folder {
			next.Last = cfg.Last
		}
	}
	if keyErr == nil {
		next.Key = string(armored)
	}
	if err := s.save(ctx, next); err != nil {
		return safetyCopy, err
	}
	pruneSafetyCopies(dataDir)
	return safetyCopy, nil
}

// decrypt writes the database inside a backup to path.
func decrypt(src io.Reader, path string, id age.Identity) error {
	plain, err := age.Decrypt(src, id)
	var noMatch *age.NoIdentityMatchError
	if errors.As(err, &noMatch) {
		return ErrWrongKey
	}
	if err != nil {
		return ErrDamaged
	}
	zipped, err := gzip.NewReader(plain)
	if err != nil {
		return ErrDamaged
	}
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	n, err := io.Copy(out, io.LimitReader(zipped, maxDatabase+1))
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err != nil || n > maxDatabase {
		return ErrDamaged
	}
	return nil
}

// ChangePassword encrypts the backup key with a new password, opening it
// with the current one or the recovery key. The backups stay as they are:
// the new password opens all of them, the old one none.
func (s *Service) ChangePassword(ctx context.Context, current, recoveryKey, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, ok, err := s.config(ctx)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotConfigured
	}
	if len([]rune(password)) < MinPassword {
		return ErrShortPassword
	}
	var id *age.HybridIdentity
	switch {
	case recoveryKey != "":
		id, err = parseRecoveryKey(recoveryKey)
	case cfg.Key == "":
		err = ErrNoKey
	default:
		id, err = unwrap(cfg.Key, current)
	}
	if err != nil {
		return err
	}
	if id.Recipient().String() != cfg.Recipient {
		return ErrWrongKey
	}
	key, err := s.wrap(id, password)
	if err != nil {
		return err
	}
	// A folder that isn't there now gets KeyFile with the next backup.
	if info, err := os.Stat(cfg.Folder); err == nil && info.IsDir() {
		if err := writeFile(filepath.Join(cfg.Folder, KeyFile), []byte(key)); err != nil {
			return err
		}
	}
	cfg.Key = key
	return s.save(ctx, cfg)
}

// Update turns automatic backups on or off and moves them to another folder,
// when given. The new folder gets KeyFile, unless it has another one: then
// it holds other backups, and Setup with their password adopts them.
func (s *Service) Update(ctx context.Context, automatic *bool, folder *string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, ok, err := s.config(ctx)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotConfigured
	}
	if automatic != nil {
		cfg.Automatic = *automatic
	}
	if folder != nil && filepath.Clean(*folder) != cfg.Folder {
		if !filepath.IsAbs(*folder) {
			return ErrBadFolder
		}
		target := filepath.Clean(*folder)
		existing, err := os.ReadFile(filepath.Join(target, KeyFile))
		switch {
		case err == nil && string(existing) != cfg.Key:
			return ErrOtherKey
		case err == nil:
		case errors.Is(err, fs.ErrNotExist):
			if err := os.MkdirAll(target, 0o700); err != nil {
				return err
			}
			if cfg.Key != "" {
				if err := writeFile(filepath.Join(target, KeyFile), []byte(cfg.Key)); err != nil {
					return err
				}
			}
		default:
			return err
		}
		cfg.Folder, cfg.Last = target, nil
	}
	return s.save(ctx, cfg)
}

// Disable stops backing up. The backups and KeyFile stay where they are.
func (s *Service) Disable(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Store.DeleteSetting(ctx, settingsKey)
}

// List is the backups in folder, newest first, and whether KeyFile is there.
func List(folder string) (files []File, hasKey bool, err error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, false, err
	}
	for _, entry := range entries {
		if entry.Name() == KeyFile {
			hasKey = true
			continue
		}
		m := backupName.FindStringSubmatch(entry.Name())
		if m == nil || entry.IsDir() {
			continue
		}
		at, err := time.ParseInLocation(nameLayout, m[1], time.Local)
		if err != nil {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, File{Name: entry.Name(), At: at, Bytes: info.Size()})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].At.After(files[j].At) })
	return files, hasKey, nil
}

// prune removes the backups in folder that the last day, keepDays and
// keepMonths don't keep. files is List's, newest first.
func prune(folder string, files []File, now time.Time) {
	days, months := map[string]bool{}, map[string]bool{}
	for _, file := range files {
		day, month := file.At.Format("2006-01-02"), file.At.Format("2006-01")
		keep := now.Sub(file.At) < 24*time.Hour
		if !days[day] && len(days) < keepDays {
			days[day], keep = true, true
		}
		if !months[month] && len(months) < keepMonths {
			months[month], keep = true, true
		}
		if !keep {
			os.Remove(filepath.Join(folder, file.Name))
		}
	}
}

// pruneSafetyCopies leaves the newest copies Restore made in dir.
func pruneSafetyCopies(dir string) {
	copies, err := filepath.Glob(filepath.Join(dir, "domfin-antes-de-restaurar-*.db"))
	if err != nil || len(copies) <= safetyCopies {
		return
	}
	sort.Strings(copies) // dated names sort by date
	for _, path := range copies[:len(copies)-safetyCopies] {
		os.Remove(path)
	}
}

// wrap encrypts the key with the password, armored, as KeyFile holds it.
func (s *Service) wrap(id *age.HybridIdentity, password string) (string, error) {
	recipient, err := age.NewScryptRecipient(password)
	if err != nil {
		return "", err
	}
	recipient.SetWorkFactor(s.WorkFactor)
	var buf bytes.Buffer
	armored := armor.NewWriter(&buf)
	encrypted, err := age.Encrypt(armored, recipient)
	if err != nil {
		return "", err
	}
	if _, err := io.WriteString(encrypted, id.String()+"\n"); err != nil {
		return "", err
	}
	if err := encrypted.Close(); err != nil {
		return "", err
	}
	if err := armored.Close(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// unwrap opens KeyFile's contents with the password.
func unwrap(armored, password string) (*age.HybridIdentity, error) {
	identity, err := age.NewScryptIdentity(password)
	if err != nil {
		return nil, ErrWrongPassword
	}
	plain, err := age.Decrypt(armor.NewReader(strings.NewReader(armored)), identity)
	var noMatch *age.NoIdentityMatchError
	if errors.As(err, &noMatch) {
		return nil, ErrWrongPassword
	}
	if err != nil {
		return nil, ErrDamaged
	}
	key, err := io.ReadAll(io.LimitReader(plain, 1<<12))
	if err != nil {
		return nil, ErrDamaged
	}
	id, err := parseRecoveryKey(string(key))
	if err != nil {
		return nil, ErrDamaged
	}
	return id, nil
}

// parseRecoveryKey reads a recovery key as people paste it: with spaces or
// line breaks around or inside it, in any case.
func parseRecoveryKey(text string) (*age.HybridIdentity, error) {
	key := strings.ToUpper(strings.Join(strings.Fields(text), ""))
	id, err := age.ParseHybridIdentity(key)
	if err != nil {
		return nil, ErrBadRecoveryKey
	}
	return id, nil
}

// writeFile replaces path's contents all at once, through a file next to it.
func writeFile(path string, data []byte) error {
	partial := filepath.Join(filepath.Dir(path), "."+filepath.Base(path)+".part")
	if err := os.WriteFile(partial, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(partial, path); err != nil {
		os.Remove(partial)
		return err
	}
	return nil
}

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// statementsPasswordKey keeps the password statement PDFs open with.
const statementsPasswordKey = "statements_password"

// StatementsPassword is the password saved for statement PDFs, "" without one.
func (s *Store) StatementsPassword(ctx context.Context) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, statementsPasswordKey).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var password string
	if err := json.Unmarshal([]byte(value), &password); err != nil {
		return "", fmt.Errorf("statements password: %w", err)
	}
	return password, nil
}

// SetStatementsPassword saves the password statement PDFs open with, in the
// local database only its owner can read; "" forgets it.
func (s *Store) SetStatementsPassword(ctx context.Context, password string) error {
	if password == "" {
		_, err := s.db.ExecContext(ctx, `DELETE FROM settings WHERE key = ?`, statementsPasswordKey)
		return err
	}
	value, err := json.Marshal(password)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
		statementsPasswordKey, string(value))
	return err
}

// Setting reads the setting key into v, and says whether there was one.
func (s *Store) Setting(ctx context.Context, key string, v any) (bool, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal([]byte(value), v); err != nil {
		return false, fmt.Errorf("setting %s: %w", key, err)
	}
	return true, nil
}

// SetSetting saves v, as JSON, as the setting key.
func (s *Store) SetSetting(ctx context.Context, key string, v any) error {
	value, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
		key, string(value))
	return err
}

// DeleteSetting forgets the setting key.
func (s *Store) DeleteSetting(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM settings WHERE key = ?`, key)
	return err
}

// namesKey is the setting with the user's names for merchants, people and
// accounts (see internal/merchants).
const namesKey = "names"

// Names are the user's names for merchants, people and accounts, by the key
// the ledger gives each (merchants.Name.Key).
func (s *Store) Names(ctx context.Context) (map[string]string, error) {
	names := map[string]string{}
	if _, err := s.Setting(ctx, namesKey, &names); err != nil {
		return nil, err
	}
	return names, nil
}

// SetName names what a key stands for; an empty name gives it back the one
// Domfin gives it.
func (s *Store) SetName(ctx context.Context, key, name string) error {
	name = strings.TrimSpace(name)
	if strings.TrimSpace(key) == "" || utf8.RuneCountInString(name) > maxDescription {
		return fmt.Errorf("%w: a key and a name of up to %d characters", ErrInvalid, maxDescription)
	}
	names, err := s.Names(ctx)
	if err != nil {
		return err
	}
	if name == "" {
		delete(names, key)
	} else {
		names[key] = name
	}
	return s.SetSetting(ctx, namesKey, names)
}

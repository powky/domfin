package backup

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"path/filepath"

	"github.com/powky/domfin/api/internal/localonly"
)

// Handler serves the backup endpoints:
//
//	GET    /backup           whether backups are on, where, how the last one went and the backups there
//	PUT    /backup           {"automatic"?, "folder"?}
//	DELETE /backup           stops backing up (the backups stay)
//	GET    /backup/places    the cloud folders on this computer
//	GET    /backup/files     ?folder= the backups in a folder, to restore one
//	POST   /backup/setup     {"folder", "password"}: starts backing up; answers {"recoveryKey"} with a new key
//	POST   /backup/run       makes a backup now
//	PUT    /backup/password  {"password" or "recoveryKey", "newPassword"}
//	POST   /backup/restore   {"folder", "file", "password" or "recoveryKey"}
//
// They handle bank data, so they only answer this computer.
func Handler(s *Service) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /backup", s.serveStatus)
	mux.HandleFunc("PUT /backup", s.serveUpdate)
	mux.HandleFunc("DELETE /backup", s.serveDisable)
	mux.HandleFunc("GET /backup/places", s.servePlaces)
	mux.HandleFunc("GET /backup/files", s.serveFiles)
	mux.HandleFunc("POST /backup/setup", s.serveSetup)
	mux.HandleFunc("POST /backup/run", s.serveRun)
	mux.HandleFunc("PUT /backup/password", s.servePassword)
	mux.HandleFunc("POST /backup/restore", s.serveRestore)
	return localonly.Handler(available(s, mux))
}

// available answers 503 when there's no database to back up.
func available(s *Service, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s == nil || s.Store == nil {
			writeError(w, errStoreUnavailable)
			return
		}
		next.ServeHTTP(w, r)
	})
}

var errStoreUnavailable = errors.New("backup: no database")

func (s *Service) serveStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.Status(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Service) serveUpdate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Automatic *bool   `json:"automatic"`
		Folder    *string `json:"folder"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := s.Update(r.Context(), body.Automatic, body.Folder); err != nil {
		writeError(w, err)
		return
	}
	s.serveStatus(w, r)
}

func (s *Service) serveDisable(w http.ResponseWriter, r *http.Request) {
	if err := s.Disable(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) servePlaces(w http.ResponseWriter, r *http.Request) {
	places := s.Places()
	if places == nil {
		places = []Place{}
	}
	writeJSON(w, http.StatusOK, map[string][]Place{"places": places})
}

func (s *Service) serveFiles(w http.ResponseWriter, r *http.Request) {
	folder := r.URL.Query().Get("folder")
	if !filepath.IsAbs(folder) {
		writeError(w, ErrBadFolder)
		return
	}
	files, hasKey, err := List(folder)
	if err != nil {
		writeError(w, ErrFolderMissing)
		return
	}
	if files == nil {
		files = []File{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": files, "hasKey": hasKey})
}

func (s *Service) serveSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Folder   string `json:"folder"`
		Password string `json:"password"`
	}
	if !decode(w, r, &body) {
		return
	}
	recoveryKey, err := s.Setup(r.Context(), body.Folder, body.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"recoveryKey": recoveryKey})
}

func (s *Service) serveRun(w http.ResponseWriter, r *http.Request) {
	file, err := s.Backup(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]File{"backup": file})
}

func (s *Service) servePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password    string `json:"password"`
		RecoveryKey string `json:"recoveryKey"`
		NewPassword string `json:"newPassword"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := s.ChangePassword(r.Context(), body.Password, body.RecoveryKey, body.NewPassword); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) serveRestore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Folder      string `json:"folder"`
		File        string `json:"file"`
		Password    string `json:"password"`
		RecoveryKey string `json:"recoveryKey"`
	}
	if !decode(w, r, &body) {
		return
	}
	safetyCopy, err := s.Restore(r.Context(), body.Folder, body.File, body.Password, body.RecoveryKey)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"safetyCopy": safetyCopy})
}

// codeOf is the status and code an error answers with; Run.Error keeps the
// code too.
func codeOf(err error) (int, string) {
	for _, known := range []struct {
		err    error
		status int
		code   string
	}{
		{errStoreUnavailable, http.StatusServiceUnavailable, "store_unavailable"},
		{ErrNotConfigured, http.StatusConflict, "not_configured"},
		{ErrBadFolder, http.StatusBadRequest, "bad_folder"},
		{ErrFolderMissing, http.StatusNotFound, "folder_missing"},
		{ErrShortPassword, http.StatusBadRequest, "short_password"},
		{ErrWrongPassword, http.StatusBadRequest, "wrong_password"},
		{ErrWrongKey, http.StatusBadRequest, "wrong_key"},
		{ErrBadRecoveryKey, http.StatusBadRequest, "bad_recovery_key"},
		{ErrNoKey, http.StatusNotFound, "no_key"},
		{ErrOtherKey, http.StatusConflict, "other_key"},
		{ErrBadFile, http.StatusNotFound, "bad_file"},
		{ErrDamaged, http.StatusUnprocessableEntity, "damaged"},
		{ErrNewer, http.StatusConflict, "newer_version"},
	} {
		if errors.Is(err, known.err) {
			return known.status, known.code
		}
	}
	return http.StatusInternalServerError, "backup_failed"
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(v); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("responder: %v", err)
	}
}

func writeError(w http.ResponseWriter, err error) {
	status, code := codeOf(err)
	if status == http.StatusInternalServerError {
		log.Printf("respaldo: %v", err)
	}
	writeJSON(w, status, map[string]string{"error": code})
}

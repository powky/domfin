package backup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectPlaces(t *testing.T) {
	mkdir := func(t *testing.T, path string) {
		t.Helper()
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("macOS", func(t *testing.T) {
		home := t.TempDir()
		icloud := filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs")
		cloud := filepath.Join(home, "Library", "CloudStorage")
		drive := filepath.Join(cloud, "GoogleDrive-ana@example.com", "Mi unidad")
		dropbox := filepath.Join(cloud, "Dropbox")
		onedrive := filepath.Join(cloud, "OneDrive-Personal")
		for _, dir := range []string{icloud, drive, dropbox, onedrive, filepath.Join(cloud, "GoogleDrive-sin@example.com")} {
			mkdir(t, dir)
		}
		// Backups already in iCloud Drive.
		mkdir(t, filepath.Join(icloud, "Domfin"))
		os.WriteFile(filepath.Join(icloud, "Domfin", KeyFile), []byte("clave"), 0o600)

		places := detectPlaces(home, "darwin", func(string) string { return "" })
		want := []Place{
			{Service: "icloud", Root: icloud, Folder: filepath.Join(icloud, "Domfin"), HasBackups: true},
			{Service: "dropbox", Root: dropbox, Folder: filepath.Join(dropbox, "Domfin")},
			{Service: "google-drive", Account: "ana@example.com", Root: drive, Folder: filepath.Join(drive, "Domfin")},
			{Service: "onedrive", Account: "Personal", Root: onedrive, Folder: filepath.Join(onedrive, "Domfin")},
		}
		if len(places) != len(want) {
			t.Fatalf("places %+v", places)
		}
		for i := range want {
			if places[i] != want[i] {
				t.Errorf("place %d: %+v, want %+v", i, places[i], want[i])
			}
		}
	})

	t.Run("Windows", func(t *testing.T) {
		home := t.TempDir()
		appData := filepath.Join(home, "AppData", "Roaming")
		dropbox := filepath.Join(home, "Dropbox (Personal)")
		mkdir(t, filepath.Join(home, "iCloudDrive"))
		mkdir(t, filepath.Join(home, "OneDrive"))
		mkdir(t, dropbox)
		mkdir(t, filepath.Join(appData, "Dropbox"))
		info := `{"personal": {"path": "` + filepath.ToSlash(dropbox) + `", "host": 1}}`
		os.WriteFile(filepath.Join(appData, "Dropbox", "info.json"), []byte(info), 0o600)
		env := map[string]string{"OneDrive": filepath.Join(home, "OneDrive"), "APPDATA": appData}

		places := detectPlaces(home, "windows", func(name string) string { return env[name] })
		var services []string
		for _, place := range places {
			services = append(services, place.Service)
		}
		if len(places) != 3 || services[0] != "icloud" || services[1] != "onedrive" || services[2] != "dropbox" ||
			places[2].Root != filepath.Clean(dropbox) {
			t.Errorf("places %+v", places)
		}
	})

	t.Run("nothing", func(t *testing.T) {
		if places := detectPlaces(t.TempDir(), "linux", func(string) string { return "" }); len(places) != 0 {
			t.Errorf("places %+v", places)
		}
	})

	t.Run("contains", func(t *testing.T) {
		place := Place{Root: filepath.Join("/", "Users", "ana", "Dropbox")}
		for folder, want := range map[string]bool{
			filepath.Join(place.Root, "Domfin"):            true,
			place.Root:                                     true,
			filepath.Join("/", "Users", "ana", "Dropbox2"): false,
			filepath.Join("/", "Users", "ana"):             false,
		} {
			if got := place.contains(folder); got != want {
				t.Errorf("contains(%q) = %v", folder, got)
			}
		}
	})
}

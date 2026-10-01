package backup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Place is a folder a cloud service's desktop app keeps in sync: putting
// backups there uploads them, with no account or password in Domfin.
type Place struct {
	// Service is icloud, google-drive, dropbox or onedrive.
	Service string `json:"service"`
	// Account tells two of the same service apart (the Google account, a
	// OneDrive for work), when the folder says it.
	Account string `json:"account,omitempty"`
	// Root is the service's folder, and Folder the one for Domfin in it.
	Root       string `json:"root"`
	Folder     string `json:"folder"`
	HasBackups bool   `json:"hasBackups"`
}

// contains says whether folder is in the place.
func (p Place) contains(folder string) bool {
	rel, err := filepath.Rel(p.Root, folder)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// DetectPlaces finds the cloud folders on this computer.
func DetectPlaces() []Place {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	return detectPlaces(home, runtime.GOOS, os.Getenv)
}

func detectPlaces(home, goos string, getenv func(string) string) []Place {
	var places []Place
	seen := map[string]bool{}
	add := func(service, account, root string) {
		root = filepath.Clean(root)
		if seen[root] || !isDir(root) {
			return
		}
		seen[root] = true
		folder := filepath.Join(root, "Domfin")
		_, err := os.Stat(filepath.Join(folder, KeyFile))
		places = append(places, Place{Service: service, Account: account, Root: root, Folder: folder, HasBackups: err == nil})
	}
	addDropbox := func(infoDirs ...string) {
		// The desktop app says where its folders are.
		for _, dir := range infoDirs {
			data, err := os.ReadFile(filepath.Join(dir, "info.json"))
			if err != nil {
				continue
			}
			var info map[string]struct {
				Path string `json:"path"`
			}
			if json.Unmarshal(data, &info) == nil {
				for _, kind := range []string{"personal", "business"} {
					if path := info[kind].Path; path != "" {
						add("dropbox", "", path)
					}
				}
			}
		}
	}

	switch goos {
	case "darwin":
		add("icloud", "", filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs"))
		// Google Drive, Dropbox and OneDrive live in CloudStorage, one folder
		// per account: GoogleDrive-ana@example.com, Dropbox, OneDrive-Personal.
		cloud := filepath.Join(home, "Library", "CloudStorage")
		entries, _ := os.ReadDir(cloud)
		for _, entry := range entries {
			name := entry.Name()
			switch {
			case strings.HasPrefix(name, "GoogleDrive-"):
				if root := myDrive(filepath.Join(cloud, name)); root != "" {
					add("google-drive", strings.TrimPrefix(name, "GoogleDrive-"), root)
				}
			case name == "Dropbox" || strings.HasPrefix(name, "Dropbox-"):
				add("dropbox", strings.TrimPrefix(strings.TrimPrefix(name, "Dropbox"), "-"), filepath.Join(cloud, name))
			case name == "OneDrive" || strings.HasPrefix(name, "OneDrive-"):
				add("onedrive", strings.TrimPrefix(strings.TrimPrefix(name, "OneDrive"), "-"), filepath.Join(cloud, name))
			}
		}
		addDropbox(filepath.Join(home, ".dropbox"))
		add("dropbox", "", filepath.Join(home, "Dropbox"))
		add("onedrive", "", filepath.Join(home, "OneDrive"))
	case "windows":
		add("icloud", "", filepath.Join(home, "iCloudDrive"))
		for _, name := range []string{"OneDriveConsumer", "OneDriveCommercial", "OneDrive"} {
			if path := getenv(name); path != "" {
				account := ""
				if name == "OneDriveCommercial" {
					account = strings.TrimPrefix(filepath.Base(path), "OneDrive - ")
				}
				add("onedrive", account, path)
			}
		}
		add("onedrive", "", filepath.Join(home, "OneDrive"))
		for _, name := range []string{"APPDATA", "LOCALAPPDATA"} {
			if dir := getenv(name); dir != "" {
				addDropbox(filepath.Join(dir, "Dropbox"))
			}
		}
		add("dropbox", "", filepath.Join(home, "Dropbox"))
		// Google Drive shows up as a drive, G: unless taken.
		for _, letter := range "GHIJKLMNOPQRSTUVWXYZDEF" {
			if root := myDrive(string(letter) + ":\\"); root != "" {
				add("google-drive", "", root)
				break
			}
		}
	default:
		addDropbox(filepath.Join(home, ".dropbox"))
		add("dropbox", "", filepath.Join(home, "Dropbox"))
		add("onedrive", "", filepath.Join(home, "OneDrive"))
	}
	return places
}

// myDrive is the "My Drive" folder in a Google Drive account's, in the
// language Google Drive uses, or "".
func myDrive(account string) string {
	for _, name := range []string{"My Drive", "Mi unidad"} {
		if path := filepath.Join(account, name); isDir(path) {
			return path
		}
	}
	return ""
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

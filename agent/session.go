package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// LocalSession is the on-disk resume state written after each successful chunk upload.
type LocalSession struct {
	SessionID      string          `json:"session_id"`
	SnapshotLabel  string          `json:"snapshot_label"`
	UploadedChunks map[string]bool `json:"uploaded_chunks"` // hash → true
}

func sessionStatePath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramData"), "HomePiNAS", "session.json")
	case "darwin":
		return "/Library/Application Support/HomePiNAS/session.json"
	default:
		return "/etc/homepinas/session.json"
	}
}

func loadLocalSession() (*LocalSession, error) {
	data, err := os.ReadFile(sessionStatePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var s LocalSession
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func saveLocalSession(s *LocalSession) error {
	p := sessionStatePath()
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0600)
}

func clearLocalSession() {
	os.Remove(sessionStatePath())
}

package main

import (
	"io/fs"
	"log/slog"
	"path/filepath"
)

// FileEntry represents a single file to be backed up.
type FileEntry struct {
	AbsPath string
	RelPath string // relative to the backup source root
	Size    int64
	ModTime string // RFC3339
}

// WalkPaths walks all paths in roots and returns a flat list of files.
// Directories, symlinks, and excluded paths are skipped.
func WalkPaths(roots []string) ([]FileEntry, error) {
	var entries []FileEntry

	for _, root := range roots {
		root = filepath.Clean(root)
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				// Log but continue — permission errors on individual files are common
				slog.Warn("walk error", "path", path, "err", err)
				return nil
			}

			if ShouldExclude(path) {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			// Skip directories and symlinks
			if d.IsDir() || d.Type()&fs.ModeSymlink != 0 {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				slog.Warn("stat error", "path", path, "err", err)
				return nil
			}

			rel, err := filepath.Rel(filepath.Dir(root), path)
			if err != nil {
				rel = path
			}

			entries = append(entries, FileEntry{
				AbsPath: path,
				RelPath: filepath.ToSlash(rel),
				Size:    info.Size(),
				ModTime: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
			})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	return entries, nil
}

# Active Backup — Go Agent Refactor (Plan B of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Go agent to perform HTTPS chunked backup (replacing robocopy+SMB) and support session resume after connection loss.

**Architecture:** The single `main.go` is split into focused modules: `walker.go` walks the directory tree applying exclusions, `chunker.go` splits files into 4 MB chunks and computes SHA256, `uploader.go` implements the 3-phase HTTP protocol (session/start → chunks → session/complete), `session.go` persists session state locally for resume after interruption. `main.go` keeps the daemon loop, install/uninstall, and orchestrates the backup flow.

**Tech Stack:** Go 1.22, standard library only (no new dependencies)

**Depends on:** Plan A must be deployed first — the agent calls the upload endpoints created there.

---

## File Map

| File | Action |
|---|---|
| `agent/exclude.go` | Create — exclusion rules for system files/dirs |
| `agent/walker.go` | Create — recursive directory walk, applies exclusions |
| `agent/chunker.go` | Create — split file into 4 MB chunks, compute SHA256 per chunk |
| `agent/session.go` | Create — persist/load local session state for resume |
| `agent/uploader.go` | Create — 3-phase HTTP upload client |
| `agent/main.go` | Modify — replace `runBackupWindows`/`runBackupUnix` with HTTPS backup; keep daemon, install, uninstall |

---

### Task 1: Exclusion rules

**Files:**
- Create: `agent/exclude.go`

Context: The walker needs a fast way to check whether a path should be excluded. Windows system files and temp directories must be skipped. The exclude logic is separated so it can be extended independently.

- [ ] **Step 1.1: Create `agent/exclude.go`**

```go
package main

import (
	"path/filepath"
	"strings"
)

// defaultExcludedNames are directory or file basenames that are always skipped.
var defaultExcludedNames = map[string]bool{
	"pagefile.sys":           true,
	"swapfile.sys":           true,
	"hiberfil.sys":           true,
	"DumpStack.log.tmp":      true,
	"$RECYCLE.BIN":           true,
	"System Volume Information": true,
	"Recovery":               true,
	"Config.Msi":             true,
	".Trash-1000":            true,
	"lost+found":             true,
}

// defaultExcludedPrefixes are path substrings that trigger exclusion.
var defaultExcludedPrefixes = []string{
	`\Windows\Temp\`,
	`\Windows\SoftwareDistribution\`,
	`\AppData\Local\Temp\`,
	`\AppData\Local\Microsoft\Windows\INetCache\`,
	"/proc/",
	"/sys/",
	"/dev/",
	"/run/",
	"/tmp/",
}

// ShouldExclude returns true if the given absolute path should be skipped.
func ShouldExclude(absPath string) bool {
	base := filepath.Base(absPath)
	if defaultExcludedNames[base] {
		return true
	}
	for _, prefix := range defaultExcludedPrefixes {
		if strings.Contains(absPath, prefix) {
			return true
		}
	}
	return false
}
```

- [ ] **Step 1.2: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors.

- [ ] **Step 1.3: Commit**

```bash
git add agent/exclude.go
git commit -m "feat(agent): add file exclusion rules"
```

---

### Task 2: Directory walker

**Files:**
- Create: `agent/walker.go`

Context: Walks one or more source paths recursively, skipping excluded entries, and returns a flat list of `FileEntry` values — one per file. Directories are not included in the list (they are implicitly recreated during restore). Symlinks are skipped to avoid cycles.

- [ ] **Step 2.1: Create `agent/walker.go`**

```go
package main

import (
	"io/fs"
	"os"
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
```

Note: `slog` is already imported in `main.go` as `log/slog`. All files in package `main` share the same package scope, so `slog` is available without re-importing.

- [ ] **Step 2.2: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add agent/walker.go
git commit -m "feat(agent): add directory walker"
```

---

### Task 3: File chunker

**Files:**
- Create: `agent/chunker.go`

Context: Reads a file and splits it into 4 MB chunks. Each chunk gets its SHA256 computed. Returns a `[]ChunkInfo` that the uploader uses to negotiate with the server. Files smaller than 4 MB produce exactly one chunk.

- [ ] **Step 3.1: Create `agent/chunker.go`**

```go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
)

const chunkSize = 4 * 1024 * 1024 // 4 MB

// ChunkInfo holds the hash and byte range of one chunk within a file.
type ChunkInfo struct {
	Hash   string // hex-encoded SHA256
	Offset int64
	Length int64
}

// ChunkFile splits the file at path into 4 MB chunks and returns their SHA256 hashes.
// The file is read sequentially once; no data is held in memory beyond one chunk at a time.
func ChunkFile(path string) ([]ChunkInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var chunks []ChunkInfo
	buf := make([]byte, chunkSize)
	var offset int64

	for {
		n, err := io.ReadFull(f, buf)
		if n > 0 {
			data := buf[:n]
			sum := sha256.Sum256(data)
			chunks = append(chunks, ChunkInfo{
				Hash:   hex.EncodeToString(sum[:]),
				Offset: offset,
				Length: int64(n),
			})
			offset += int64(n)
		}
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read %s at offset %d: %w", path, offset, err)
		}
	}

	// Empty file: return one zero-length chunk with hash of empty string
	if len(chunks) == 0 {
		sum := sha256.Sum256(nil)
		chunks = append(chunks, ChunkInfo{Hash: hex.EncodeToString(sum[:]), Offset: 0, Length: 0})
	}

	return chunks, nil
}

// ReadChunk reads the specific byte range of a file for upload.
func ReadChunk(path string, offset, length int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek %s to %d: %w", path, offset, err)
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(f, data); err != nil {
		return nil, fmt.Errorf("read %s chunk at %d: %w", path, offset, err)
	}
	return data, nil
}
```

- [ ] **Step 3.2: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add agent/chunker.go
git commit -m "feat(agent): add 4 MB file chunker with SHA256"
```

---

### Task 4: Local session state (resume support)

**Files:**
- Create: `agent/session.go`

Context: If the network drops during upload, the agent must be able to resume without re-uploading confirmed chunks. A JSON file in `ProgramData\HomePiNAS\session.json` tracks which chunks have been uploaded. On restart, the agent reads this file and skips already-uploaded chunks when calling the server's `session/start` (which also does dedup on its side).

- [ ] **Step 4.1: Create `agent/session.go`**

```go
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// LocalSession is the on-disk resume state written after each successful chunk upload.
type LocalSession struct {
	SessionID      string            `json:"session_id"`
	SnapshotLabel  string            `json:"snapshot_label"`
	UploadedChunks map[string]bool   `json:"uploaded_chunks"` // hash → true
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
```

- [ ] **Step 4.2: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors. `runtime` is already imported in `main.go` and is in scope for the whole package.

- [ ] **Step 4.3: Commit**

```bash
git add agent/session.go
git commit -m "feat(agent): add local session state for resume support"
```

---

### Task 5: HTTP uploader

**Files:**
- Create: `agent/uploader.go`

Context: Implements the 3-phase upload protocol against Plan A's API. `Upload` is the top-level function called from the backup flow. It handles session/start negotiation (dedup), uploads only the `needed` chunks with up to 4 concurrent goroutines, then calls session/complete. Each successful chunk upload is persisted to the local session file for resume.

- [ ] **Step 5.1: Create `agent/uploader.go`**

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

// UploadFileManifest is the JSON representation of one file sent to session/start.
type UploadFileManifest struct {
	Path   string   `json:"path"`
	Size   int64    `json:"size"`
	Mtime  string   `json:"mtime"`
	Attrs  uint32   `json:"attrs"`
	Chunks []string `json:"chunks"` // SHA256 hashes in order
}

// SessionStartResponse is the response from POST /upload/session/start.
type SessionStartResponse struct {
	SessionID string   `json:"session_id"`
	Needed    []string `json:"needed"`
}

// SessionCompleteResponse is the response from POST /upload/session/complete.
type SessionCompleteResponse struct {
	SnapshotID string      `json:"snapshot_id"`
	Stats      interface{} `json:"stats"`
}

const uploadConcurrency = 4 // max parallel chunk uploads

// UploadResult summarises the outcome of a full backup upload.
type UploadResult struct {
	SnapshotID     string
	FilesTotal     int
	BytesTotal     int64
	ChunksNew      int
	ChunksDeduped  int
}

// Upload performs the complete 3-phase upload for the given entries.
// It resumes a prior session if a matching local session file exists.
func Upload(cfg *Config, entries []FileEntry, chunkMap map[string][]ChunkInfo, snapshotLabel string) (*UploadResult, error) {
	// Build file manifests
	manifests := make([]UploadFileManifest, 0, len(entries))
	var totalBytes int64
	for _, e := range entries {
		chunks := chunkMap[e.AbsPath]
		hashes := make([]string, len(chunks))
		for i, c := range chunks {
			hashes[i] = c.Hash
		}
		manifests = append(manifests, UploadFileManifest{
			Path:   e.RelPath,
			Size:   e.Size,
			Mtime:  e.ModTime,
			Attrs:  0,
			Chunks: hashes,
		})
		totalBytes += e.Size
	}

	// ── Phase 1: session/start ────────────────────────────────────────────────

	startBody, _ := json.Marshal(map[string]interface{}{
		"snapshot_label": snapshotLabel,
		"files":          manifests,
	})

	var startResp SessionStartResponse
	if err := apiPost(
		cfg.NasURL+"/api/active-backup/upload/session/start",
		cfg.AuthToken,
		json.RawMessage(startBody),
		&startResp,
	); err != nil {
		return nil, fmt.Errorf("session/start: %w", err)
	}

	sessionID := startResp.SessionID
	needed := startResp.Needed
	slog.Info("session started", "session_id", sessionID, "needed", len(needed))

	// Load prior session state for resume — skip already-confirmed chunks
	local, _ := loadLocalSession()
	if local != nil && local.SessionID != sessionID {
		// Different session — discard stale state
		local = nil
	}
	if local == nil {
		local = &LocalSession{
			SessionID:     sessionID,
			SnapshotLabel: snapshotLabel,
			UploadedChunks: make(map[string]bool),
		}
	}

	// Filter out chunks already confirmed in the local session file
	toUpload := make([]string, 0, len(needed))
	for _, h := range needed {
		if !local.UploadedChunks[h] {
			toUpload = append(toUpload, h)
		}
	}
	slog.Info("chunks to upload", "total_needed", len(needed), "already_done", len(needed)-len(toUpload), "to_upload", len(toUpload))

	// Build a lookup: hash → (file path, chunk offset, chunk length)
	type chunkLoc struct {
		path   string
		offset int64
		length int64
	}
	hashLoc := make(map[string]chunkLoc)
	for _, e := range entries {
		for _, c := range chunkMap[e.AbsPath] {
			hashLoc[c.Hash] = chunkLoc{path: e.AbsPath, offset: c.Offset, length: c.Length}
		}
	}

	// ── Phase 2: upload chunks ────────────────────────────────────────────────

	sem := make(chan struct{}, uploadConcurrency)
	var mu sync.Mutex
	var uploadErr error

	for _, hash := range toUpload {
		if func() bool { mu.Lock(); defer mu.Unlock(); return uploadErr != nil }() {
			break
		}

		loc, ok := hashLoc[hash]
		if !ok {
			slog.Warn("chunk hash not found in local files — skipping", "hash", hash)
			continue
		}

		sem <- struct{}{}
		go func(h string, l chunkLoc) {
			defer func() { <-sem }()

			data, err := ReadChunk(l.path, l.offset, l.length)
			if err != nil {
				mu.Lock()
				uploadErr = fmt.Errorf("read chunk %s: %w", h, err)
				mu.Unlock()
				return
			}

			if err := uploadChunk(cfg, sessionID, h, data); err != nil {
				mu.Lock()
				uploadErr = fmt.Errorf("upload chunk %s: %w", h, err)
				mu.Unlock()
				return
			}

			mu.Lock()
			local.UploadedChunks[h] = true
			mu.Unlock()

			// Persist after every successful chunk for resume support
			if saveErr := saveLocalSession(local); saveErr != nil {
				slog.Warn("failed to save local session", "err", saveErr)
			}
		}(hash, loc)
	}

	// Drain semaphore (wait for all goroutines)
	for i := 0; i < uploadConcurrency; i++ {
		sem <- struct{}{}
	}

	if uploadErr != nil {
		return nil, uploadErr
	}

	// ── Phase 3: session/complete ─────────────────────────────────────────────

	var completeResp SessionCompleteResponse
	if err := apiPost(
		cfg.NasURL+"/api/active-backup/upload/session/complete",
		cfg.AuthToken,
		map[string]string{"session_id": sessionID},
		&completeResp,
	); err != nil {
		return nil, fmt.Errorf("session/complete: %w", err)
	}

	clearLocalSession()

	return &UploadResult{
		SnapshotID:    completeResp.SnapshotID,
		FilesTotal:    len(entries),
		BytesTotal:    totalBytes,
		ChunksNew:     len(toUpload),
		ChunksDeduped: len(needed) - len(toUpload),
	}, nil
}

// uploadChunk sends one raw chunk to the server.
func uploadChunk(cfg *Config, sessionID, hash string, data []byte) error {
	url := fmt.Sprintf("%s/api/active-backup/upload/chunk/%s", cfg.NasURL, hash)
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Authorization", "Bearer "+cfg.AuthToken)
	req.Header.Set("X-Session-Id", sessionID)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
	}
	return nil
}
```

- [ ] **Step 5.2: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors. `apiPost`, `httpClient`, `slog`, `runtime` are in scope from `main.go`.

- [ ] **Step 5.3: Commit**

```bash
git add agent/uploader.go
git commit -m "feat(agent): add HTTPS upload client with resume support"
```

---

### Task 6: Wire HTTPS backup into main.go

**Files:**
- Modify: `agent/main.go`

Context: Replace `runBackup` (which calls `runBackupWindows`/`runBackupUnix` via SMB+robocopy) with a new `runBackupHTTPS` function. The daemon loop already calls `runBackup` — change that single call. The old SMB functions stay in the file for now (they can be removed in a later cleanup PR once HTTPS is validated in production). Add a `--restore` flag stub so the flag is registered (Plan C implements the body).

- [ ] **Step 6.1: Add `runBackupHTTPS` to `main.go`**

Add this function before the `runBackup` function in `main.go`:

```go
// runBackupHTTPS walks the configured backup paths, chunks every file,
// and uploads them via the 3-phase HTTPS protocol to the NAS.
func runBackupHTTPS(cfg *Config, dc *DeviceConfig) (int64, error) {
	if len(dc.BackupPaths) == 0 {
		return 0, fmt.Errorf("no backup paths configured")
	}

	snapshotLabel := time.Now().UTC().Format("2006-01-02_15-04-05")
	slog.Info("starting HTTPS backup", "snapshot", snapshotLabel, "paths", dc.BackupPaths)

	reportProgress(cfg, 5, "Escaneando archivos...", "")

	// Step 1: walk all source paths
	entries, err := WalkPaths(dc.BackupPaths)
	if err != nil {
		return 0, fmt.Errorf("walk: %w", err)
	}
	slog.Info("walk complete", "files", len(entries))
	reportProgress(cfg, 10, fmt.Sprintf("Calculando %d archivos...", len(entries)), "")

	// Step 2: chunk every file and collect chunk info
	chunkMap := make(map[string][]ChunkInfo, len(entries))
	for i, e := range entries {
		chunks, err := ChunkFile(e.AbsPath)
		if err != nil {
			slog.Warn("chunk error, skipping file", "path", e.AbsPath, "err", err)
			continue
		}
		chunkMap[e.AbsPath] = chunks
		if i%500 == 0 {
			pct := 10 + (i*20)/len(entries)
			reportProgress(cfg, pct, fmt.Sprintf("Procesando %d/%d...", i, len(entries)), "")
		}
	}

	reportProgress(cfg, 30, "Negociando con el servidor...", "")

	// Step 3: upload via 3-phase protocol
	result, err := Upload(cfg, entries, chunkMap, snapshotLabel)
	if err != nil {
		return 0, fmt.Errorf("upload: %w", err)
	}

	slog.Info("HTTPS backup complete",
		"snapshot", result.SnapshotID,
		"files", result.FilesTotal,
		"bytes", result.BytesTotal,
		"chunksNew", result.ChunksNew,
		"chunksDeduped", result.ChunksDeduped,
	)
	reportProgress(cfg, 100, "Completado", "")
	return result.BytesTotal, nil
}
```

- [ ] **Step 6.2: Replace `runBackup` to call `runBackupHTTPS`**

Find the existing `runBackup` function:

```go
func runBackup(cfg *Config, dc *DeviceConfig) (int64, error) {
	slog.Info("starting backup", "type", dc.BackupType, "dest", dc.BackupDest, "paths", dc.BackupPaths)

	if len(dc.BackupPaths) == 0 {
		return 0, fmt.Errorf("no backup paths configured")
	}

	reportProgress(cfg, 0, "Iniciando backup...", "")

	switch runtime.GOOS {
	case "windows":
		return runBackupWindows(cfg, dc)
	default:
		return runBackupUnix(cfg, dc)
	}
}
```

Replace with:

```go
func runBackup(cfg *Config, dc *DeviceConfig) (int64, error) {
	return runBackupHTTPS(cfg, dc)
}
```

- [ ] **Step 6.3: Add `--restore` flag stub to `main()`**

In the `main()` function, find the flag declarations:

```go
installCmd := flag.Bool("install", false, "Install agent as system service (requires admin/root)")
uninstallCmd := flag.Bool("uninstall", false, "Uninstall agent and remove service")
runCmd := flag.Bool("run", false, "Run agent daemon (called by service manager)")
nasURL := flag.String("nas", "", "NAS base URL, e.g. https://192.168.1.100")
token := flag.String("token", "", "Activation token from dashboard")
backupType := flag.String("backup-type", "folders", "Backup type: full | incremental | folders")
flag.Parse()
```

Replace with:

```go
installCmd := flag.Bool("install", false, "Install agent as system service (requires admin/root)")
uninstallCmd := flag.Bool("uninstall", false, "Uninstall agent and remove service")
runCmd := flag.Bool("run", false, "Run agent daemon (called by service manager)")
restoreCmd := flag.Bool("restore", false, "Restore mode: download files from NAS snapshot")
nasURL := flag.String("nas", "", "NAS base URL, e.g. https://192.168.1.100")
token := flag.String("token", "", "Activation token from dashboard")
backupType := flag.String("backup-type", "folders", "Backup type: full | incremental | folders")
snapshotID := flag.String("snapshot", "", "Snapshot ID to restore (used with --restore)")
targetDir := flag.String("target", "", "Target directory for restore (used with --restore)")
flag.Parse()
```

Add a `case *restoreCmd:` branch in the switch:

```go
case *restoreCmd:
	if *nasURL == "" || *token == "" {
		fmt.Fprintln(os.Stderr, "usage: agent --restore --nas https://NAS_IP --token TOKEN [--snapshot ID] [--target DIR]")
		os.Exit(1)
	}
	fmt.Printf("Restore mode: NAS=%s snapshot=%s target=%s\n", *nasURL, *snapshotID, *targetDir)
	fmt.Println("Restore not yet implemented — see Plan C.")
	os.Exit(0)
```

Add this case before the `case *runCmd:` case. Also suppress unused-variable warnings for `snapshotID` and `targetDir` by referencing them in the stub print statement (already done above).

- [ ] **Step 6.4: Verify it compiles**

```bash
cd agent
go build ./...
```

Expected: no errors.

- [ ] **Step 6.5: Cross-compile Windows binary**

```bash
cd agent
GOOS=windows GOARCH=amd64 go build -o dist/agent-windows-amd64.exe .
```

Expected: `dist/agent-windows-amd64.exe` created with no errors.

- [ ] **Step 6.6: Commit**

```bash
git add agent/main.go agent/
git commit -m "feat(agent): replace SMB/robocopy with HTTPS chunked upload"
```

---

## Final verification checklist

- [ ] `go build ./...` compiles with 0 errors
- [ ] `GOOS=windows GOARCH=amd64 go build -o dist/agent-windows-amd64.exe .` succeeds
- [ ] `WalkPaths([]string{"/tmp"})` returns a non-empty list of files
- [ ] `ChunkFile("/tmp/testfile")` returns correct SHA256 for a known file
  - Create test: `echo "hello world" > /tmp/testfile && sha256sum /tmp/testfile`
  - Run chunker on same file, compare hash
- [ ] `--restore` flag is registered and prints the stub message without crashing
- [ ] Daemon loop still starts up correctly (`agent --run` connects to NAS without panic)

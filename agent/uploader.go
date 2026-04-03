package main

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
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
	SnapshotID    string
	FilesTotal    int
	BytesTotal    int64
	ChunksNew     int
	ChunksDeduped int
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

	startPayload := map[string]interface{}{
		"snapshot_label": snapshotLabel,
		"files":          manifests,
	}

	var startResp SessionStartResponse
	if err := apiPost(
		cfg.NasURL+"/api/active-backup/upload/session/start",
		cfg.AuthToken,
		startPayload,
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
			SessionID:      sessionID,
			SnapshotLabel:  snapshotLabel,
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
	slog.Info("chunks to upload",
		"total_needed", len(needed),
		"already_done", len(needed)-len(toUpload),
		"to_upload", len(toUpload),
	)

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
		// Stop spawning goroutines if a prior one failed
		mu.Lock()
		err := uploadErr
		mu.Unlock()
		if err != nil {
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
			saveErr := saveLocalSession(local) // called under mu to prevent concurrent map read by JSON encoder
			mu.Unlock()

			if saveErr != nil {
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

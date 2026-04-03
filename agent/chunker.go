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

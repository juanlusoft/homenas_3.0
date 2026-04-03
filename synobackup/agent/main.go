package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"encoding/binary"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/bits"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode/utf16"
)

type Config struct {
	NasURL    string `json:"nasURL"`
	Token     string `json:"token"`
	DeviceID  string `json:"deviceID,omitempty"`
	AuthToken string `json:"authToken,omitempty"`
}

type JobResponse struct {
	Approved   bool   `json:"approved"`
	PendingJob bool   `json:"pendingJob"`
	Mode       string `json:"mode"`
	Volume     string `json:"volume"`
}

type StartSessionResponse struct {
	SessionID  string `json:"sessionId"`
	UploadBase string `json:"uploadBase"`
	Resumed    bool   `json:"resumed"`
}

type SnapshotResult struct {
	DeviceObject string `json:"deviceObject"`
	ShadowID     string `json:"shadowID"`
}

type InventoryEntry struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type ChunkProbeResponse struct {
	Exists        bool     `json:"exists"`
	MissingChunks []string `json:"missingChunks"`
	KnownChunks   int      `json:"knownChunks"`
}

type ChunkPart struct {
	Hash  string
	Start int
	End   int
	Size  int
}

type BackupStats struct {
	Files  int
	Bytes  int64
	Reused int
}

type ProgressState struct {
	DeviceID        string `json:"deviceId"`
	SessionID       string `json:"sessionId"`
	Volume          string `json:"volume"`
	Status          string `json:"status"`
	LastPath        string `json:"lastPath"`
	UploadedFiles   int    `json:"uploadedFiles"`
	UploadedBytes   int64  `json:"uploadedBytes"`
	ReusedFiles     int    `json:"reusedFiles"`
	KnownRemoteSize int    `json:"knownRemoteSize"`
	UpdatedAt       string `json:"updatedAt"`
}

type ProgressReporter struct {
	LastSent time.Time
}

type TCPUploadRequest struct {
	Op        string `json:"op"`
	DeviceID  string `json:"deviceId"`
	SessionID string `json:"sessionId"`
	AuthToken string `json:"authToken"`
	Path      string `json:"path"`
	Modified  string `json:"modifiedAt"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
}

type TCPUploadResponse struct {
	OK      bool   `json:"ok"`
	Counted bool   `json:"counted"`
	Error   string `json:"error"`
}

var httpClient = &http.Client{
	Timeout: 60 * time.Second,
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	},
}

const (
	progressSyncInterval   = 5 * time.Second
	uploadRetryCount       = 4
	cdcMinChunkSize        = 128 * 1024
	cdcAvgChunkSize        = 512 * 1024
	cdcMaxChunkSize        = 2 * 1024 * 1024
	cdcPreMask             = (1 << 19) - 1
	cdcPostMask            = (1 << 17) - 1
	cdcWindowSize          = 48
)

var gearTable = [256]uint32{
	0x2d358dcc, 0xaa6c78a1, 0xa5a0b0f5, 0x62db15d0, 0x0993d58f, 0x4eab86a7, 0x7af7562c, 0x1f4f6d92,
	0x30f98ea9, 0x56f48c5b, 0x91f5a3d4, 0x4bd2779e, 0x6e8b3af1, 0xdde2c6a0, 0x15f2c9d7, 0xe95f7911,
	0x5f7ab942, 0x6c2f4188, 0x8637d721, 0x0cc53da5, 0x2c1f6789, 0x8d7ee132, 0xbb4fa8c3, 0x4a32bd17,
	0x17eac55d, 0xc6248814, 0x35c7fa91, 0xf11ab83e, 0x7423c6d9, 0x28e67a4c, 0x93ad2157, 0x07df3eb0,
	0x1acb57d2, 0x6f45b08c, 0xb6723da1, 0x3f8135fa, 0x8a26d471, 0xcf59b62d, 0x542dd18e, 0x127af4c3,
	0xf69b1d28, 0x2eb1c047, 0x7d8865b4, 0x90d3bf51, 0x48567ea0, 0x649c9327, 0xac1ed56f, 0x3ba4e889,
	0xda803f1c, 0x230b7a6e, 0x0f6dd29a, 0x9c3275d8, 0x72be44a1, 0x58d12f36, 0xe3f48b27, 0x1d99c6b0,
	0xc3a75ef4, 0x443efaa2, 0x7bf31c69, 0x89d7a54f, 0x24f1b8e3, 0xd4c88a10, 0x6af03bd7, 0x315d6cc4,
	0x8f41d2ea, 0x0ab8c759, 0x53de14bc, 0xf3a6e285, 0x2f976d31, 0x7c0ad5e4, 0x9961bf20, 0x40c29e73,
	0x14de6ba8, 0xe1a34f95, 0x67cb1d42, 0x3ce81a7f, 0xb28f64d9, 0x5a1793c1, 0x841d2eb6, 0x1bccf570,
	0xfd7192aa, 0x2738c641, 0x6b5e3f19, 0x92a4dd57, 0x4f1bb2c8, 0x188d74f3, 0xc9e25a1d, 0x73f6c08e,
	0x36b4af29, 0xae982751, 0x0d4f6eb2, 0xe57ad913, 0x62a1c5dc, 0x54cb31f0, 0x9a7f4b86, 0x21d36e45,
	0x77c912ba, 0x4c6fe7d0, 0x13a5b98e, 0xd8e42361, 0x68db7fa5, 0x055e34f2, 0xbcf09847, 0x2ac71d93,
	0xe84f1c2b, 0x5d9a7ee1, 0x816b43d4, 0x39f8cd60, 0x9741a6b7, 0x6d35f09a, 0x20ce8741, 0xf5481bde,
	0x47a26fd5, 0x1ebcf430, 0xc16d82a9, 0x7034bde2, 0x8c51e7fa, 0x33f0a69d, 0x0e2d5c74, 0xdb8a1746,
	0x5b4e29c1, 0x65d7143a, 0x99c0ef57, 0x24a3b801, 0xe7fb4d2c, 0x16d95a8f, 0x7ec430b5, 0x41af72d8,
	0x93274e18, 0x2b6ec4f1, 0xd0f935a4, 0x5ef4872d, 0x18c1db76, 0xa47d6ae3, 0x6a08b519, 0x37f29ce0,
	0x8e5ad341, 0x03d4ff6a, 0xf8261b9d, 0x4d78a25c, 0x1503ce87, 0xc66fb918, 0x71a4e3d2, 0x2c89d740,
	0xe2b314fd, 0x5c4d7aa6, 0x97f26130, 0x0b8d49c5, 0x74dc83ef, 0x3abfdc12, 0xb5e67029, 0x66491ea4,
	0x1c7358db, 0xcf18a245, 0x823ed769, 0x49e5b10c, 0xf0ab3471, 0x263f8ec2, 0x7ab9d51e, 0x54c60fa8,
	0x0ddf7213, 0xea45bc98, 0x616e53d7, 0x309bd8af, 0x8b2641c0, 0x57f3ae24, 0xc85d197b, 0x12ca64e1,
	0x946f30bd, 0x2dc5f783, 0x7f1a4b56, 0x48b82ed0, 0x1fa3dc69, 0xd5c79014, 0x6834a2ff, 0x34de57c1,
	0xa9f1723b, 0x0c4e8db1, 0xe61d4395, 0x53ba60f8, 0x95c4872a, 0x27df19ce, 0x7db63f40, 0x4068a1d7,
	0x18fdc452, 0xcb7e2a91, 0x6245bf1d, 0x3d92e70c, 0xb18c54a6, 0x59f31ad8, 0x84d76c23, 0x13b8f905,
	0xf72a4ec1, 0x2e5d17b4, 0x69cb83da, 0x907f2a18, 0x4b14d6e7, 0x1649af30, 0xc2d53b5f, 0x7a3681a4,
	0x31cf5ad9, 0x8d7b20e6, 0x0af4315c, 0xe4c8bd73, 0x56d29708, 0x9be167c1, 0x25fc4e3d, 0x6f0ab892,
	0x1a95d743, 0xd67ce12f, 0x72b3a564, 0x4ed826b8, 0xf45ac09d, 0x208f1be7, 0x883761da, 0x37c42915,
	0x5dc8fe31, 0xa61b74c0, 0x0f529ae8, 0xe9af35d1, 0x631e48b4, 0x14c7df52, 0xcda34b79, 0x7bb58106,
	0x42e06a9c, 0x99d4f215, 0x2af73dc8, 0x70c18b43, 0x1d6ae950, 0xf38b2761, 0x84f1cda7, 0x36be5429,
	0x5f2d89b6, 0xc41a73ec, 0x0867de15, 0xeb549230, 0x65a83bc7, 0x3274f0d9, 0x9d1ec54a, 0x2cfa68b1,
	0x7e430fd2, 0x49bd71a8, 0x11f4ce36, 0xd3a85b7c, 0x6cb1270e, 0x257d94e1, 0x8f3ae645, 0x54d8bc12,
	0xe1c73d9a, 0x18be5204, 0xca64f871, 0x73d1093f, 0x3b8f6d25, 0xa4e153c8, 0x0e79ba54, 0xf61cd027,
}

func configPath() string {
	return filepath.Join(os.Getenv("ProgramData"), "SynoBackup", "agent.json")
}

func progressPath() string {
	return filepath.Join(os.Getenv("ProgramData"), "SynoBackup", "progress.json")
}

func saveConfig(cfg *Config) error {
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, body, 0600)
}

func loadConfig() (*Config, error) {
	body, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	body = bytes.TrimPrefix(body, []byte{0xEF, 0xBB, 0xBF})
	var cfg Config
	return &cfg, json.Unmarshal(body, &cfg)
}

func saveProgress(progress *ProgressState) error {
	path := progressPath()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(progress, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, body, 0600)
}

func clearProgress() {
	_ = os.Remove(progressPath())
}

func apiJSON(method, url, auth string, body interface{}, out interface{}) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if auth != "" {
		req.Header.Set("Authorization", "Bearer "+auth)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func outboundIP(nasURL string) string {
	host := strings.TrimPrefix(strings.TrimPrefix(nasURL, "https://"), "http://")
	if strings.Contains(host, "/") {
		host = strings.SplitN(host, "/", 2)[0]
	}
	if !strings.Contains(host, ":") {
		host += ":80"
	}
	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		return ""
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.TCPAddr).IP.String()
}

func tcpUploadAddress(nasURL string) (string, error) {
	parsed, err := url.Parse(nasURL)
	if err != nil {
		return "", err
	}
	host := parsed.Hostname()
	if host == "" {
		return "", fmt.Errorf("invalid nasURL host")
	}
	port := parsed.Port()
	basePort := 80
	if strings.EqualFold(parsed.Scheme, "https") {
		basePort = 443
	}
	if port != "" {
		var parsedPort int
		if _, err := fmt.Sscanf(port, "%d", &parsedPort); err == nil && parsedPort > 0 {
			basePort = parsedPort
		}
	}
	return net.JoinHostPort(host, fmt.Sprintf("%d", basePort+1)), nil
}

func activate(cfg *Config) error {
	hostname, _ := os.Hostname()
	log.Printf("activate: hostname=%s nas=%s", hostname, cfg.NasURL)
	var out struct {
		DeviceID  string `json:"deviceId"`
		AuthToken string `json:"authToken"`
	}
	err := apiJSON("POST", cfg.NasURL+"/api/synobackup/agent/activate", "", map[string]string{
		"token":    cfg.Token,
		"hostname": hostname,
		"os":       "Windows",
		"ip":       outboundIP(cfg.NasURL),
	}, &out)
	if err != nil {
		return err
	}
	log.Printf("activate: deviceId=%s", out.DeviceID)
	cfg.DeviceID = out.DeviceID
	cfg.AuthToken = out.AuthToken
	return saveConfig(cfg)
}

func encodePowerShell(script string) string {
	runes := utf16.Encode([]rune(script))
	buf := make([]byte, len(runes)*2)
	for i, r := range runes {
		buf[i*2] = byte(r)
		buf[i*2+1] = byte(r >> 8)
	}
	return base64.StdEncoding.EncodeToString(buf)
}

func createSnapshot(volume string) (string, string, error) {
	log.Printf("vss: creating snapshot for %s", volume)
	ps := fmt.Sprintf(`$ProgressPreference = "SilentlyContinue"; $VerbosePreference = "SilentlyContinue"; $InformationPreference = "SilentlyContinue"; $res = ([WMIClass]"root\cimv2:Win32_ShadowCopy").Create("%s","ClientAccessible"); if ($res.ReturnValue -ne 0) { throw "VSS create failed: $($res.ReturnValue)" }; $shadow = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $res.ShadowID }; @{ deviceObject = $shadow.DeviceObject; shadowID = $shadow.ID } | ConvertTo-Json -Compress`, strings.ReplaceAll(volume, `\`, `\\`))
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-OutputFormat", "Text", "-EncodedCommand", encodePowerShell(ps))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("create VSS snapshot: %w: %s", err, strings.TrimSpace(string(out)))
	}
	output := strings.TrimSpace(string(out))
	var snapshot SnapshotResult
	if err := json.Unmarshal([]byte(output), &snapshot); err != nil {
		return "", "", fmt.Errorf("unexpected VSS output: %s", output)
	}
	snapshotRoot := strings.TrimSpace(snapshot.DeviceObject) + `\`
	shadowID := strings.TrimSpace(snapshot.ShadowID)
	log.Printf("vss: snapshot=%s shadowID=%s", snapshotRoot, shadowID)
	return snapshotRoot, shadowID, nil
}

func deleteSnapshot(shadowID string) {
	log.Printf("vss: deleting snapshot %s", shadowID)
	ps := fmt.Sprintf(`Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq "%s" } | ForEach-Object { $_.Delete() | Out-Null }`, shadowID)
	exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(ps)).Run()
}

func isAccessDenied(err error) bool {
	if err == nil {
		return false
	}
	if os.IsPermission(err) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "access is denied") ||
		strings.Contains(lower, "acceso denegado")
}

func isIncorrectFunctionError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "incorrect function") ||
		strings.Contains(lower, "función incorrecta") ||
		strings.Contains(lower, "funcion incorrecta")
}

func isTransientFileAccessError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "the process cannot access the file") ||
		strings.Contains(lower, "being used by another process") ||
		strings.Contains(lower, "the system cannot access the file") ||
		strings.Contains(lower, "insufficient system resources") ||
		strings.Contains(lower, "el proceso no tiene acceso al archivo") ||
		strings.Contains(lower, "está siendo utilizado por otro proceso") ||
		strings.Contains(lower, "esta siendo utilizado por otro proceso") ||
		strings.Contains(lower, "el sistema no tiene acceso al archivo") ||
		strings.Contains(lower, "recursos insuficientes en el sistema")
}

func isSkippableSnapshotError(err error) bool {
	return isAccessDenied(err) || isIncorrectFunctionError(err) || isTransientFileAccessError(err)
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	hash := sha256.New()
	buf := make([]byte, 1024*1024)
	if _, err := io.CopyBuffer(hash, f, buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func isTransientUploadError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "eof") ||
		strings.Contains(text, "connection reset") ||
		strings.Contains(text, "connection aborted") ||
		strings.Contains(text, "broken pipe") ||
		strings.Contains(text, "timeout") ||
		strings.Contains(text, "temporarily unavailable")
}

func retryUpload(label string, fn func() error) error {
	var lastErr error
	for attempt := 1; attempt <= uploadRetryCount; attempt++ {
		if err := fn(); err != nil {
			lastErr = err
			if !isTransientUploadError(err) || attempt == uploadRetryCount {
				return err
			}
			delay := time.Duration(attempt*attempt) * time.Second
			log.Printf("upload: transient error attempt=%d/%d target=%s err=%v retryIn=%s", attempt, uploadRetryCount, label, err, delay)
			time.Sleep(delay)
			continue
		}
		return nil
	}
	return lastErr
}

func loadRemoteInventory(cfg *Config, sessionID string) (map[string]string, error) {
	var out struct {
		Entries []InventoryEntry `json:"entries"`
	}
	err := apiJSON("GET", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/inventory", cfg.NasURL, cfg.DeviceID, sessionID), cfg.AuthToken, nil, &out)
	if err != nil {
		return nil, err
	}
	inventory := make(map[string]string, len(out.Entries))
	for _, entry := range out.Entries {
		inventory[entry.Path] = strings.ToLower(entry.SHA256)
	}
	return inventory, nil
}

func syncProgress(cfg *Config, sessionID string, progress *ProgressState, reporter *ProgressReporter, force bool) {
	if reporter != nil && !force && !reporter.LastSent.IsZero() && time.Since(reporter.LastSent) < progressSyncInterval {
		return
	}
	_ = apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/progress", cfg.NasURL, cfg.DeviceID, sessionID), cfg.AuthToken, progress, nil)
	if reporter != nil {
		reporter.LastSent = time.Now()
	}
}

func uploadProgress(cfg *Config, sessionID string, progress *ProgressState, reporter *ProgressReporter, rel string, stats *BackupStats) {
	progress.LastPath = rel
	progress.UploadedFiles = stats.Files
	progress.UploadedBytes = stats.Bytes
	progress.ReusedFiles = stats.Reused
	progress.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	_ = saveProgress(progress)
	syncProgress(cfg, sessionID, progress, reporter, false)
}

func markReused(cfg *Config, sessionID string, progress *ProgressState, reporter *ProgressReporter, rel string, stats *BackupStats) {
	progress.LastPath = rel
	progress.ReusedFiles = stats.Reused
	progress.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	_ = saveProgress(progress)
	syncProgress(cfg, sessionID, progress, reporter, false)
}

func chunkPlan(body []byte) []ChunkPart {
	if len(body) == 0 {
		return nil
	}
	parts := make([]ChunkPart, 0, (len(body)/cdcAvgChunkSize)+1)
	start := 0
	var hash uint32
	window := make([]byte, cdcWindowSize)
	windowCount := 0
	for i, b := range body {
		if windowCount < cdcWindowSize {
			hash = bits.RotateLeft32(hash, 1) ^ gearTable[b]
			window[windowCount] = b
			windowCount++
		} else {
			slot := i % cdcWindowSize
			out := window[slot]
			window[slot] = b
			hash = bits.RotateLeft32(hash, 1) ^ bits.RotateLeft32(gearTable[out], cdcWindowSize%32) ^ gearTable[b]
		}
		size := i - start + 1
		if size < cdcMinChunkSize {
			continue
		}
		mask := uint32(cdcPostMask)
		if size < cdcAvgChunkSize {
			mask = uint32(cdcPreMask)
		}
		if (hash&mask) == 0 || size >= cdcMaxChunkSize {
			end := i + 1
			part := body[start:end]
			parts = append(parts, ChunkPart{
				Hash:  sha256Hex(part),
				Start: start,
				End:   end,
				Size:  len(part),
			})
			start = end
			hash = 0
			windowCount = 0
		}
	}
	if start < len(body) {
		part := body[start:]
		parts = append(parts, ChunkPart{
			Hash:  sha256Hex(part),
			Start: start,
			End:   len(body),
			Size:  len(part),
		})
	}
	return parts
}

func uploadChunk(cfg *Config, sessionID, chunkHash string, body []byte) error {
	return retryUpload("chunk:"+chunkHash, func() error {
		req, err := http.NewRequest("PUT", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/chunks/%s", cfg.NasURL, cfg.DeviceID, sessionID, chunkHash), bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+cfg.AuthToken)
		resp, err := httpClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			b, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("upload chunk %s: http %d: %s", chunkHash, resp.StatusCode, strings.TrimSpace(string(b)))
		}
		return nil
	})
}

func uploadFileTCP(cfg *Config, sessionID, rel, fullPath, bodyHash string, info os.FileInfo) (bool, error) {
	addr, err := tcpUploadAddress(cfg.NasURL)
	if err != nil {
		return false, err
	}
	conn, err := net.DialTimeout("tcp", addr, 20*time.Second)
	if err != nil {
		return false, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Minute))

	header := TCPUploadRequest{
		Op:        "upload_file_v1",
		DeviceID:  cfg.DeviceID,
		SessionID: sessionID,
		AuthToken: cfg.AuthToken,
		Path:      rel,
		Modified:  info.ModTime().UTC().Format(time.RFC3339),
		SHA256:    bodyHash,
		Size:      info.Size(),
	}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return false, err
	}
	prefix := make([]byte, 4)
	binary.BigEndian.PutUint32(prefix, uint32(len(headerBytes)))
	if _, err := conn.Write(prefix); err != nil {
		return false, err
	}
	if _, err := conn.Write(headerBytes); err != nil {
		return false, err
	}

	file, err := os.Open(fullPath)
	if err != nil {
		return false, err
	}
	defer file.Close()
	if _, err := io.CopyBuffer(conn, file, make([]byte, 1024*1024)); err != nil {
		return false, err
	}

	respPrefix := make([]byte, 4)
	if _, err := io.ReadFull(conn, respPrefix); err != nil {
		return false, err
	}
	respLen := binary.BigEndian.Uint32(respPrefix)
	if respLen == 0 || respLen > 1024*1024 {
		return false, fmt.Errorf("invalid tcp response length")
	}
	respBody := make([]byte, respLen)
	if _, err := io.ReadFull(conn, respBody); err != nil {
		return false, err
	}
	var resp TCPUploadResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		return false, err
	}
	if !resp.OK {
		if resp.Error == "" {
			resp.Error = "tcp upload failed"
		}
		return false, fmt.Errorf("%s", resp.Error)
	}
	return resp.Counted, nil
}

func uploadChunkedFile(cfg *Config, sessionID, rel string, body []byte, info os.FileInfo, stats *BackupStats, remoteInventory map[string]string, progress *ProgressState, reporter *ProgressReporter) error {
	bodyHash := sha256Hex(body)
	if remoteHash, ok := remoteInventory[rel]; ok && remoteHash == bodyHash {
		stats.Reused++
		markReused(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Reused <= 10 || stats.Reused%250 == 0 {
			log.Printf("upload: reused=%d last=%s", stats.Reused, rel)
		}
		return nil
	}

	chunks := chunkPlan(body)
	chunkSha256 := make([]string, 0, len(chunks))
	chunkBytes := make([]int, 0, len(chunks))
	for _, chunk := range chunks {
		chunkSha256 = append(chunkSha256, chunk.Hash)
		chunkBytes = append(chunkBytes, chunk.Size)
	}
	var probe ChunkProbeResponse
	probeBody := map[string]interface{}{
		"path":        rel,
		"size":        len(body),
		"modifiedAt":  info.ModTime().UTC().Format(time.RFC3339),
		"sha256":      bodyHash,
		"chunkSize":   cdcAvgChunkSize,
		"chunkSha256": chunkSha256,
		"chunkBytes":  chunkBytes,
	}
	err := retryUpload("probe:"+rel, func() error {
		var current ChunkProbeResponse
		if err := apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/files/probe", cfg.NasURL, cfg.DeviceID, sessionID), cfg.AuthToken, probeBody, &current); err != nil {
			return err
		}
		probe = current
		return nil
	})
	if err != nil {
		return err
	}
	if probe.Exists {
		remoteInventory[rel] = bodyHash
		stats.Reused++
		markReused(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Reused <= 10 || stats.Reused%250 == 0 {
			log.Printf("upload: reused=%d last=%s", stats.Reused, rel)
		}
		return nil
	}

	missing := make(map[string]struct{}, len(probe.MissingChunks))
	for _, hash := range probe.MissingChunks {
		missing[strings.ToLower(hash)] = struct{}{}
	}
	for index, hash := range chunkSha256 {
		if _, ok := missing[hash]; !ok {
			continue
		}
		if err := uploadChunk(cfg, sessionID, hash, body[chunks[index].Start:chunks[index].End]); err != nil {
			return err
		}
	}

	var commit struct {
		Success bool `json:"success"`
		Counted bool `json:"counted"`
		Reused  bool `json:"reused"`
	}
	commitBody := map[string]interface{}{
		"path":        rel,
		"size":        len(body),
		"modifiedAt":  info.ModTime().UTC().Format(time.RFC3339),
		"sha256":      bodyHash,
		"chunkSize":   cdcAvgChunkSize,
		"chunkSha256": chunkSha256,
		"chunkBytes":  chunkBytes,
	}
	err = retryUpload("commit:"+rel, func() error {
		var current struct {
			Success bool `json:"success"`
			Counted bool `json:"counted"`
			Reused  bool `json:"reused"`
		}
		if err := apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/files/commit", cfg.NasURL, cfg.DeviceID, sessionID), cfg.AuthToken, commitBody, &current); err != nil {
			return err
		}
		commit = current
		return nil
	})
	if err != nil {
		return err
	}
	if !commit.Success {
		return fmt.Errorf("upload %s: chunked commit rejected", rel)
	}
	remoteInventory[rel] = bodyHash
	if !commit.Counted {
		stats.Reused++
		markReused(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Reused <= 10 || stats.Reused%250 == 0 {
			log.Printf("upload: reused=%d last=%s", stats.Reused, rel)
		}
		return nil
	}
	stats.Files++
	stats.Bytes += info.Size()
	uploadProgress(cfg, sessionID, progress, reporter, rel, stats)
	if stats.Files <= 10 || stats.Files%250 == 0 {
		log.Printf("upload: files=%d bytes=%d cdcChunks=%d reusedRemote=%d last=%s", stats.Files, stats.Bytes, len(chunkSha256), probe.KnownChunks, rel)
	}
	return nil
}

func uploadFile(cfg *Config, uploadBase, sessionID, baseRoot, fullPath string, info os.FileInfo, stats *BackupStats, remoteInventory map[string]string, progress *ProgressState, reporter *ProgressReporter) error {
	rel, err := filepath.Rel(baseRoot, fullPath)
	if err != nil {
		return err
	}
	rel = filepath.ToSlash(rel)
	bodyHash, err := sha256File(fullPath)
	if err != nil {
		if isSkippableSnapshotError(err) {
			log.Printf("skip: non-fatal hash/read error file=%s err=%v", rel, err)
			return nil
		}
		return err
	}
	if remoteHash, ok := remoteInventory[rel]; ok && remoteHash == bodyHash {
		stats.Reused++
		markReused(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Reused <= 10 || stats.Reused%250 == 0 {
			log.Printf("upload: reused=%d last=%s", stats.Reused, rel)
		}
		return nil
	}
	tcpCounted, tcpErr := uploadFileTCP(cfg, sessionID, rel, fullPath, bodyHash, info)
	if tcpErr == nil {
		remoteInventory[rel] = bodyHash
		if !tcpCounted {
			stats.Reused++
			markReused(cfg, sessionID, progress, reporter, rel, stats)
			if stats.Reused <= 10 || stats.Reused%250 == 0 {
				log.Printf("upload: reused(tcp)=%d last=%s", stats.Reused, rel)
			}
			return nil
		}
		stats.Files++
		stats.Bytes += info.Size()
		uploadProgress(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Files <= 10 || stats.Files%250 == 0 {
			log.Printf("upload: files=%d bytes=%d last=%s transport=tcp", stats.Files, stats.Bytes, rel)
		}
		return nil
	}
	log.Printf("upload: tcp fallback rel=%s err=%v", rel, tcpErr)
	var uploadResult struct {
		Success bool `json:"success"`
		Counted bool `json:"counted"`
	}
	skipped := false
	err = retryUpload("file:"+rel, func() error {
		f, err := os.Open(fullPath)
		if err != nil {
			if isSkippableSnapshotError(err) {
				log.Printf("skip: non-fatal open error file=%s err=%v", rel, err)
				skipped = true
				return nil
			}
			return err
		}
		defer f.Close()
		req, err := http.NewRequest("PUT", cfg.NasURL+uploadBase+"?path="+url.QueryEscape(rel), f)
		if err != nil {
			return err
		}
		req.ContentLength = info.Size()
		req.Header.Set("Authorization", "Bearer "+cfg.AuthToken)
		req.Header.Set("X-SB-Modified-At", info.ModTime().UTC().Format(time.RFC3339))
		req.Header.Set("X-SB-SHA256", bodyHash)
		resp, err := httpClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			b, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("upload %s: http %d: %s", rel, resp.StatusCode, strings.TrimSpace(string(b)))
		}
		var current struct {
			Success bool `json:"success"`
			Counted bool `json:"counted"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&current); err != nil {
			return err
		}
		uploadResult = current
		return nil
	})
	if err != nil {
		return err
	}
	if skipped {
		return nil
	}
	if !uploadResult.Success {
		return fmt.Errorf("upload %s: server rejected file", rel)
	}
	if !uploadResult.Counted {
		remoteInventory[rel] = bodyHash
		stats.Reused++
		markReused(cfg, sessionID, progress, reporter, rel, stats)
		if stats.Files <= 10 || stats.Files%250 == 0 {
			log.Printf("upload: reused last=%s", rel)
		}
		return nil
	}
	remoteInventory[rel] = bodyHash
	stats.Files++
	stats.Bytes += info.Size()
	uploadProgress(cfg, sessionID, progress, reporter, rel, stats)
	if stats.Files <= 10 || stats.Files%250 == 0 {
		log.Printf("upload: files=%d bytes=%d last=%s", stats.Files, stats.Bytes, rel)
	}
	return nil
}

func shouldSkipDir(baseRoot, fullPath string) bool {
	rel, err := filepath.Rel(baseRoot, fullPath)
	if err != nil {
		return false
	}
	rel = filepath.ToSlash(rel)
	relLower := strings.ToLower(rel)
	if rel == "." || rel == "" {
		return false
	}
	// Skip volatile system caches that frequently fail under VSS and do not add recovery value.
	if strings.Contains(relLower, "/windows/serviceprofiles/networkservice/appdata/local/microsoft/windows/deliveryoptimization/cache") {
		return true
	}
	if strings.Contains(relLower, "/windows/serviceprofiles/localsystem/appdata/local/microsoft/windows/deliveryoptimization/cache") {
		return true
	}
	if strings.Contains(relLower, "/users/default/appdata/local/microsoft/windowsapps") ||
		strings.Contains(relLower, "/users/public/appdata/local/microsoft/windowsapps") {
		return true
	}
	first := strings.ToLower(strings.Split(rel, "/")[0])
	switch first {
	case "$recycle.bin", "system volume information", "recovery", "config.msi", "$windows.~bt", "$windows.~ws", "$sysreset", "windows.old":
		return true
	case "programdata":
		return strings.Contains(relLower, "/package cache") ||
			strings.Contains(relLower, "/microsoft/windows/wer") ||
			strings.Contains(relLower, "/microsoft/search/data") ||
			strings.Contains(relLower, "/microsoft/windows defender/scans/history")
	default:
		return false
	}
}

func shouldSkipFile(path string, name string) bool {
	switch strings.ToLower(name) {
	case "pagefile.sys", "swapfile.sys", "hiberfil.sys", "dumpstack.log.tmp", "memory.dmp":
		return true
	default:
		pathLower := strings.ToLower(filepath.ToSlash(path))
		if strings.Contains(pathLower, "/appdata/local/microsoft/windowsapps/") {
			return true
		}
		if strings.Contains(pathLower, "/windows/serviceprofiles/networkservice/appdata/local/microsoft/windows/deliveryoptimization/cache/") {
			return true
		}
		if strings.Contains(pathLower, "/windows/serviceprofiles/localsystem/appdata/local/microsoft/windows/deliveryoptimization/cache/") {
			return true
		}
		return strings.HasSuffix(pathLower, "/thumbs.db") ||
			strings.HasSuffix(pathLower, "/desktop.ini") ||
			strings.HasSuffix(pathLower, "/ehthumbs.db") ||
			strings.Contains(pathLower, "/temp/") ||
			strings.Contains(pathLower, "/tmp/")
	}
}

func runBackup(cfg *Config, volume string) error {
	log.Printf("backup: start volume=%s", volume)
	snapshotRoot, shadowID, err := createSnapshot(volume)
	if err != nil {
		return err
	}
	defer deleteSnapshot(shadowID)

	var start StartSessionResponse
	err = apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/start", cfg.NasURL, cfg.DeviceID), cfg.AuthToken, map[string]string{
		"volume":       volume,
		"snapshotPath": snapshotRoot,
	}, &start)
	if err != nil {
		return err
	}
	log.Printf("backup: session started sessionID=%s uploadBase=%s", start.SessionID, start.UploadBase)
	remoteInventory := map[string]string{}
	progress := &ProgressState{
		DeviceID:  cfg.DeviceID,
		SessionID: start.SessionID,
		Volume:    volume,
		Status:    "uploading",
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if start.Resumed {
		remoteInventory, err = loadRemoteInventory(cfg, start.SessionID)
		if err != nil {
			return err
		}
		progress.KnownRemoteSize = len(remoteInventory)
		log.Printf("backup: resumed sessionID=%s knownFiles=%d", start.SessionID, len(remoteInventory))
	}
	_ = saveProgress(progress)

	baseRoot := strings.TrimRight(snapshotRoot, `\`)
	stats := &BackupStats{}
	reporter := &ProgressReporter{}
	walkErr := filepath.Walk(snapshotRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			if isSkippableSnapshotError(walkErr) {
				log.Printf("skip: non-fatal walk error path=%s err=%v", path, walkErr)
				if info != nil && info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			return nil
		}
		if info.IsDir() {
			if shouldSkipDir(baseRoot, path) {
				log.Printf("skip: excluded dir=%s", path)
				return filepath.SkipDir
			}
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		if shouldSkipFile(path, info.Name()) {
			return nil
		}
		return uploadFile(cfg, start.UploadBase, start.SessionID, baseRoot, path, info, stats, remoteInventory, progress, reporter)
	})
	if walkErr != nil {
		log.Printf("backup: failed sessionID=%s err=%v", start.SessionID, walkErr)
		progress.Status = "failed"
		progress.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_ = saveProgress(progress)
		_ = apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/fail", cfg.NasURL, cfg.DeviceID, start.SessionID), cfg.AuthToken, map[string]string{
			"error": walkErr.Error(),
		}, nil)
		return walkErr
	}

	log.Printf("backup: completing sessionID=%s files=%d bytes=%d reused=%d", start.SessionID, stats.Files, stats.Bytes, stats.Reused)
	syncProgress(cfg, start.SessionID, progress, reporter, true)
	if err := apiJSON("POST", fmt.Sprintf("%s/api/synobackup/agent/%s/sessions/%s/complete", cfg.NasURL, cfg.DeviceID, start.SessionID), cfg.AuthToken, map[string]bool{
		"success": true,
	}, nil); err != nil {
		progress.Status = "failed"
		progress.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_ = saveProgress(progress)
		return err
	}
	clearProgress()
	return nil
}

func runDaemon() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	log.Printf("daemon: config loaded deviceID=%s nas=%s", cfg.DeviceID, cfg.NasURL)
	if cfg.DeviceID == "" {
		if err := activate(cfg); err != nil {
			return err
		}
	}
	for {
		var job JobResponse
		log.Printf("daemon: polling job deviceID=%s", cfg.DeviceID)
		err := apiJSON("GET", fmt.Sprintf("%s/api/synobackup/agent/%s/job", cfg.NasURL, cfg.DeviceID), cfg.AuthToken, nil, &job)
		if err == nil && job.Approved && job.PendingJob {
			log.Printf("daemon: received job mode=%s volume=%s", job.Mode, job.Volume)
			if err := runBackup(cfg, job.Volume); err != nil {
				log.Printf("daemon: backup error: %v", err)
			}
		} else if err != nil {
			log.Printf("daemon: poll error: %v", err)
		} else {
			log.Printf("daemon: no pending job approved=%t pending=%t", job.Approved, job.PendingJob)
		}
		time.Sleep(30 * time.Second)
	}
}

func install(nasURL, token string) error {
	cfg := &Config{NasURL: nasURL, Token: token}
	return saveConfig(cfg)
}

func main() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic: %v", r)
			os.Exit(1)
		}
	}()

	installCmd := flag.Bool("install", false, "Install config")
	runCmd := flag.Bool("run", false, "Run agent")
	nasURL := flag.String("nas", "", "NAS base URL")
	token := flag.String("token", "", "Activation token")
	flag.Parse()

	if runtime.GOOS != "windows" {
		fmt.Fprintln(os.Stderr, "synobackup-agent prototype is Windows-focused in this phase")
		os.Exit(1)
	}

	switch {
	case *installCmd:
		if *nasURL == "" || *token == "" {
			fmt.Fprintln(os.Stderr, "usage: synobackup-agent --install --nas http://host:3021 --token TOKEN")
			os.Exit(1)
		}
		if err := install(*nasURL, *token); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println("SynoBackup agent configured.")
	case *runCmd:
		if err := runDaemon(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		fmt.Println("SynoBackup agent prototype")
		fmt.Println("  Install: synobackup-agent --install --nas http://host:3021 --token TOKEN")
		fmt.Println("  Run:     synobackup-agent --run")
	}
}

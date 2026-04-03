package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
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
	SessionID string `json:"sessionId"`
	TCPHost   string `json:"tcpHost"`
	TCPPort   int    `json:"tcpPort"`
	Resumed   bool   `json:"resumed"`
}

type SnapshotResult struct {
	DeviceObject string `json:"deviceObject"`
	ShadowID     string `json:"shadowID"`
}

type TCPHello struct {
	Op         string `json:"op"`
	AgentToken string `json:"agentToken"`
	DeviceID   string `json:"deviceId"`
	SessionID  string `json:"sessionId"`
	BackupType string `json:"backupType"`
	TotalFiles int    `json:"totalFiles,omitempty"`
}

type TCPFileHeader struct {
	Op         string `json:"op"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	ModifiedAt string `json:"modifiedAt,omitempty"`
}

type TCPFinish struct {
	Op string `json:"op"`
}

type TCPResponse struct {
	OK      bool   `json:"ok"`
	Counted bool   `json:"counted"`
	Error   string `json:"error"`
}

var httpClient = &http.Client{Timeout: 60 * time.Second}

func configPath() string {
	return filepath.Join(os.Getenv("ProgramData"), "SynoBackupV2", "agent.json")
}

func saveConfig(cfg *Config) error {
	p := configPath()
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, raw, 0600)
}

func loadConfig() (*Config, error) {
	raw, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	raw = bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	var cfg Config
	return &cfg, json.Unmarshal(raw, &cfg)
}

func apiJSON(method, endpoint, auth string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, endpoint, reader)
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

func activate(cfg *Config) error {
	hostname, _ := os.Hostname()
	var out struct {
		DeviceID  string `json:"deviceId"`
		AuthToken string `json:"authToken"`
	}
	err := apiJSON("POST", cfg.NasURL+"/api/v2/agent/activate", "", map[string]string{
		"token":    cfg.Token,
		"hostname": hostname,
		"os":       "Windows",
	}, &out)
	if err != nil {
		return err
	}
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
	ps := fmt.Sprintf(`$ProgressPreference = "SilentlyContinue"; $res = ([WMIClass]"root\cimv2:Win32_ShadowCopy").Create("%s","ClientAccessible"); if ($res.ReturnValue -ne 0) { throw "VSS create failed: $($res.ReturnValue)" }; $shadow = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $res.ShadowID }; @{ deviceObject = $shadow.DeviceObject; shadowID = $shadow.ID } | ConvertTo-Json -Compress`, strings.ReplaceAll(volume, `\`, `\\`))
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(ps))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("create VSS snapshot: %w: %s", err, strings.TrimSpace(string(out)))
	}
	var snap SnapshotResult
	if err := json.Unmarshal(bytes.TrimSpace(out), &snap); err != nil {
		return "", "", fmt.Errorf("unexpected VSS output: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(snap.DeviceObject) + `\`, strings.TrimSpace(snap.ShadowID), nil
}

func deleteSnapshot(shadowID string) {
	ps := fmt.Sprintf(`Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq "%s" } | ForEach-Object { $_.Delete() | Out-Null }`, shadowID)
	_ = exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(ps)).Run()
}

func isAccessDenied(err error) bool {
	if err == nil {
		return false
	}
	if os.IsPermission(err) {
		return true
	}
	l := strings.ToLower(err.Error())
	return strings.Contains(l, "access is denied") || strings.Contains(l, "acceso denegado")
}

func isSkippableSnapshotError(err error) bool {
	if err == nil {
		return false
	}
	l := strings.ToLower(err.Error())
	return isAccessDenied(err) ||
		strings.Contains(l, "incorrect function") ||
		strings.Contains(l, "función incorrecta") ||
		strings.Contains(l, "funcion incorrecta") ||
		strings.Contains(l, "insufficient system resources") ||
		strings.Contains(l, "recursos insuficientes en el sistema") ||
		strings.Contains(l, "the system cannot access the file") ||
		strings.Contains(l, "el sistema no tiene acceso al archivo")
}

func sha256File(target string) (string, error) {
	f, err := os.Open(target)
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
	if strings.Contains(relLower, "/windows/serviceprofiles/networkservice/appdata/local/microsoft/windows/deliveryoptimization/cache") {
		return true
	}
	if strings.Contains(relLower, "/windows/serviceprofiles/localsystem/appdata/local/microsoft/windows/deliveryoptimization/cache") {
		return true
	}
	if strings.Contains(relLower, "/appdata/local/microsoft/windowsapps") {
		return true
	}
	first := strings.ToLower(strings.Split(rel, "/")[0])
	switch first {
	case "$recycle.bin", "system volume information", "recovery", "config.msi", "$windows.~bt", "$windows.~ws", "$sysreset", "windows.old":
		return true
	default:
		return false
	}
}

func shouldSkipFile(pathValue, name string) bool {
	switch strings.ToLower(name) {
	case "pagefile.sys", "swapfile.sys", "hiberfil.sys", "dumpstack.log.tmp", "memory.dmp":
		return true
	default:
		p := strings.ToLower(filepath.ToSlash(pathValue))
		return strings.HasSuffix(p, "/thumbs.db") ||
			strings.HasSuffix(p, "/desktop.ini") ||
			strings.Contains(p, "/temp/") ||
			strings.Contains(p, "/tmp/")
	}
}

func tcpWriteFrame(conn net.Conn, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	prefix := make([]byte, 4)
	binary.BigEndian.PutUint32(prefix, uint32(len(raw)))
	if _, err := conn.Write(prefix); err != nil {
		return err
	}
	_, err = conn.Write(raw)
	return err
}

func tcpReadResponse(conn net.Conn) (*TCPResponse, error) {
	prefix := make([]byte, 4)
	if _, err := io.ReadFull(conn, prefix); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(prefix)
	if n == 0 || n > 1024*1024 {
		return nil, fmt.Errorf("invalid response length")
	}
	body := make([]byte, n)
	if _, err := io.ReadFull(conn, body); err != nil {
		return nil, err
	}
	var resp TCPResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func uploadFileTCP(conn net.Conn, rel, fullPath, hash string, info os.FileInfo) error {
	if err := tcpWriteFrame(conn, TCPFileHeader{
		Op:         "file",
		Path:       rel,
		Size:       info.Size(),
		SHA256:     hash,
		ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
	}); err != nil {
		return err
	}
	if info.Size() > 0 {
		f, err := os.Open(fullPath)
		if err != nil {
			return err
		}
		defer f.Close()
		if _, err := io.CopyBuffer(conn, f, make([]byte, 1024*1024)); err != nil {
			return err
		}
	}
	resp, err := tcpReadResponse(conn)
	if err != nil {
		return err
	}
	if !resp.OK {
		if resp.Error == "" {
			resp.Error = "tcp file upload failed"
		}
		return fmt.Errorf("%s", resp.Error)
	}
	return nil
}

func runBackup(cfg *Config, job JobResponse) error {
	snapshotRoot, shadowID, err := createSnapshot(job.Volume)
	if err != nil {
		return err
	}
	defer deleteSnapshot(shadowID)

	var start StartSessionResponse
	err = apiJSON("POST", fmt.Sprintf("%s/api/v2/agent/%s/sessions/start", cfg.NasURL, cfg.DeviceID), cfg.AuthToken, map[string]string{
		"volume":       job.Volume,
		"snapshotPath": snapshotRoot,
	}, &start)
	if err != nil {
		return err
	}

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(start.TCPHost, fmt.Sprintf("%d", start.TCPPort)), 20*time.Second)
	if err != nil {
		_ = apiJSON("POST", fmt.Sprintf("%s/api/v2/agent/%s/sessions/%s/fail", cfg.NasURL, cfg.DeviceID, start.SessionID), cfg.AuthToken, map[string]string{"error": err.Error()}, nil)
		return err
	}
	defer conn.Close()
	// Do not enforce a fixed full-session deadline (can exceed 2h on first full backups).
	// We rely on TCP errors plus server/agent retries instead of aborting healthy long uploads.
	_ = conn.SetDeadline(time.Time{})

	if err := tcpWriteFrame(conn, TCPHello{
		Op:         "hello",
		AgentToken: cfg.AuthToken,
		DeviceID:   cfg.DeviceID,
		SessionID:  start.SessionID,
		BackupType: "files",
	}); err != nil {
		return err
	}
	helloResp, err := tcpReadResponse(conn)
	if err != nil {
		return err
	}
	if !helloResp.OK {
		return fmt.Errorf("tcp hello failed: %s", helloResp.Error)
	}

	baseRoot := strings.TrimRight(snapshotRoot, `\`)
	walkErr := filepath.Walk(snapshotRoot, func(pathValue string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			if isSkippableSnapshotError(walkErr) {
				if info != nil && info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			return walkErr
		}
		if info.IsDir() {
			if shouldSkipDir(baseRoot, pathValue) {
				return filepath.SkipDir
			}
			return nil
		}
		if shouldSkipFile(pathValue, info.Name()) {
			return nil
		}
		rel, err := filepath.Rel(baseRoot, pathValue)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		hash, err := sha256File(pathValue)
		if err != nil {
			if isSkippableSnapshotError(err) {
				return nil
			}
			return err
		}
		if err := uploadFileTCP(conn, rel, pathValue, hash, info); err != nil {
			if isSkippableSnapshotError(err) {
				return nil
			}
			return err
		}
		return nil
	})

	if walkErr != nil {
		_ = apiJSON("POST", fmt.Sprintf("%s/api/v2/agent/%s/sessions/%s/fail", cfg.NasURL, cfg.DeviceID, start.SessionID), cfg.AuthToken, map[string]string{
			"error": walkErr.Error(),
		}, nil)
		return walkErr
	}

	if err := tcpWriteFrame(conn, TCPFinish{Op: "finish"}); err != nil {
		return err
	}
	finResp, err := tcpReadResponse(conn)
	if err != nil {
		return err
	}
	if !finResp.OK {
		return fmt.Errorf("tcp finish failed: %s", finResp.Error)
	}

	return apiJSON("POST", fmt.Sprintf("%s/api/v2/agent/%s/sessions/%s/complete", cfg.NasURL, cfg.DeviceID, start.SessionID), cfg.AuthToken, map[string]bool{"success": true}, nil)
}

func runDaemon() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if cfg.DeviceID == "" || cfg.AuthToken == "" {
		if err := activate(cfg); err != nil {
			return err
		}
	}
	for {
		var job JobResponse
		err := apiJSON("GET", fmt.Sprintf("%s/api/v2/agent/%s/job", cfg.NasURL, cfg.DeviceID), cfg.AuthToken, nil, &job)
		if err == nil && job.Approved && job.PendingJob {
			if err := runBackup(cfg, job); err != nil {
				log.Printf("backup error: %v", err)
			}
		} else if err != nil {
			log.Printf("poll error: %v", err)
		}
		time.Sleep(20 * time.Second)
	}
}

func install(nasURL, token string) error {
	return saveConfig(&Config{NasURL: nasURL, Token: token})
}

func main() {
	installCmd := flag.Bool("install", false, "Install config")
	runCmd := flag.Bool("run", false, "Run agent")
	nasURL := flag.String("nas", "", "NAS base URL")
	token := flag.String("token", "", "Install token")
	flag.Parse()

	if runtime.GOOS != "windows" {
		fmt.Fprintln(os.Stderr, "Windows only")
		os.Exit(1)
	}

	switch {
	case *installCmd:
		if *nasURL == "" || *token == "" {
			fmt.Fprintln(os.Stderr, "usage: --install --nas http://host:4021 --token TOKEN")
			os.Exit(1)
		}
		if err := install(*nasURL, *token); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println("SynoBackup V2 agent configured.")
	case *runCmd:
		if err := runDaemon(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		fmt.Println("SynoBackup V2 agent")
		fmt.Println("  Install: --install --nas http://host:4021 --token TOKEN")
		fmt.Println("  Run:     --run")
	}
}

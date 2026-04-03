// HomePiNAS Backup Agent
// Silent cross-platform agent: installs as system service, registers with NAS,
// polls for config, runs scheduled backups, reports results.
package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	NasURL     string `json:"nasURL"`
	Token      string `json:"token"`
	DeviceID   string `json:"deviceID,omitempty"`
	AuthToken  string `json:"authToken,omitempty"`
	BackupType string `json:"backupType"`
}

type DeviceConfig struct {
	Approved      bool     `json:"approved"`
	BackupEnabled bool     `json:"backupEnabled"`
	BackupType    string   `json:"backupType"`
	BackupPaths   []string `json:"backupPaths"`
	BackupDest    string   `json:"backupDest"` // rsync dest or SMB UNC
	BackupHost    string   `json:"backupHost"`
	BackupShare   string   `json:"backupShare"`
	BackupUsername string  `json:"backupUsername"`
	BackupPassword string  `json:"backupPassword"`
	BackupHour    int      `json:"backupHour"`
	TriggerBackup bool     `json:"triggerBackup"`
}

type ProgressReport struct {
	Percent     int    `json:"percent"`
	CurrentFile string `json:"currentFile"`
	Speed       string `json:"speed"`
}

type ActivateRequest struct {
	Token    string `json:"token"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	IP       string `json:"ip"` // agent reports its own outbound IP
}

type ActivateResponse struct {
	DeviceID  string `json:"deviceID"`
	AuthToken string `json:"authToken"`
	Message   string `json:"message"`
}

// ── Paths ─────────────────────────────────────────────────────────────────────

func configPath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramData"), "HomePiNAS", "agent.json")
	case "darwin":
		return "/Library/Application Support/HomePiNAS/agent.json"
	default:
		return "/etc/homepinas/agent.json"
	}
}

func installBinPath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramFiles"), "HomePiNAS", "agent.exe")
	case "darwin":
		return "/usr/local/bin/homepinas-agent"
	default:
		return "/usr/local/bin/homepinas-agent"
	}
}

func logPath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramData"), "HomePiNAS", "agent.log")
	case "darwin":
		return "/var/log/homepinas-agent.log"
	default:
		return "/var/log/homepinas-agent.log"
	}
}

func backupLockPath() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramData"), "HomePiNAS", "backup.lock")
	case "darwin":
		return "/var/run/homepinas-agent.lock"
	default:
		return "/var/run/homepinas-agent.lock"
	}
}

// ── Config IO ─────────────────────────────────────────────────────────────────

func loadConfig() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	var cfg Config
	return &cfg, json.Unmarshal(data, &cfg)
}

func saveConfig(cfg *Config) error {
	path := configPath()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // NAS uses self-signed cert
	},
}

func apiGet(url, authToken string, out interface{}) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, body)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func apiPost(url, authToken string, body interface{}, out interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, b)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ── IP detection ──────────────────────────────────────────────────────────────

// getOutboundIP detects the local IP that would be used to connect to the NAS.
// This avoids the server capturing 127.0.0.1 from the nginx proxy.
func getOutboundIP(nasURL string) string {
	u, err := url.Parse(nasURL)
	if err != nil {
		return getLocalIP()
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	// TCP dial to NAS: OS picks the correct outbound interface
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 5*time.Second)
	if err != nil {
		return getLocalIP()
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.TCPAddr).IP.String()
}

// getLocalIP returns the first non-loopback IPv4 address as fallback.
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			return ipnet.IP.String()
		}
	}
	return ""
}

// ── Activation ────────────────────────────────────────────────────────────────

func activate(cfg *Config) error {
	hostname, _ := os.Hostname()
	osName := runtime.GOOS
	switch runtime.GOOS {
	case "windows":
		osName = "Windows"
	case "darwin":
		osName = "macOS"
	case "linux":
		// try to get distro name
		if data, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					osName = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
					break
				}
			}
		} else {
			osName = "Linux"
		}
	}

	myIP := getOutboundIP(cfg.NasURL)
	slog.Info("detected outbound IP", "ip", myIP)

	req := ActivateRequest{
		Token:    cfg.Token,
		Hostname: hostname,
		OS:       osName,
		Arch:     runtime.GOARCH,
		IP:       myIP,
	}

	var resp ActivateResponse
	if err := apiPost(cfg.NasURL+"/api/active-backup/agent/activate", "", req, &resp); err != nil {
		return fmt.Errorf("activate: %w", err)
	}
	if resp.DeviceID == "" {
		return fmt.Errorf("activation rejected: %s", resp.Message)
	}

	cfg.DeviceID = resp.DeviceID
	cfg.AuthToken = resp.AuthToken
	return saveConfig(cfg)
}

// ── Device config poll ────────────────────────────────────────────────────────

func getDeviceConfig(cfg *Config) (*DeviceConfig, error) {
	var dc DeviceConfig
	url := fmt.Sprintf("%s/api/active-backup/agent/%s/config", cfg.NasURL, cfg.DeviceID)
	if err := apiGet(url, cfg.AuthToken, &dc); err != nil {
		return nil, err
	}
	return &dc, nil
}

// ── Backup execution ──────────────────────────────────────────────────────────

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
	chunked := make([]FileEntry, 0, len(entries))
	for i, e := range entries {
		chunks, err := ChunkFile(e.AbsPath)
		if err != nil {
			slog.Warn("chunk error, skipping file", "path", e.AbsPath, "err", err)
			continue
		}
		chunkMap[e.AbsPath] = chunks
		chunked = append(chunked, e)
		if i%500 == 0 {
			pct := 10 + (i*20)/len(entries)
			reportProgress(cfg, pct, fmt.Sprintf("Procesando %d/%d...", i+1, len(entries)), "")
		}
	}

	reportProgress(cfg, 30, "Negociando con el servidor...", "")

	// Step 3: upload via 3-phase protocol (only files that were successfully chunked)
	result, err := Upload(cfg, chunked, chunkMap, snapshotLabel)
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

func runBackup(cfg *Config, dc *DeviceConfig) (int64, error) {
	return runBackupHTTPS(cfg, dc)
}

func backupTargetName(src string) string {
	cleaned := strings.TrimSpace(src)
	if cleaned == "" {
		return "backup"
	}
	if runtime.GOOS == "windows" {
		volume := filepath.VolumeName(cleaned)
		rest := strings.TrimPrefix(cleaned, volume)
		rest = strings.Trim(rest, `\/`)
		if volume != "" && rest == "" {
			return strings.TrimRight(volume, ":")
		}
	}
	if cleaned == "/" {
		return "root"
	}
	trimmed := strings.TrimRight(cleaned, `/\`)
	leaf := filepath.Base(trimmed)
	leaf = strings.Trim(leaf, `\/:`)
	if leaf == "" || leaf == "." {
		return "backup"
	}
	return leaf
}


// ── Report ────────────────────────────────────────────────────────────────────

func dirSize(path string) int64 {
	var size int64
	filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func reportResult(cfg *Config, success bool, message string, size int64) {
	body := map[string]interface{}{
		"success": success,
		"message": message,
		"size":    size,
		"time":    time.Now().UTC().Format(time.RFC3339),
		"os":      runtime.GOOS,
	}
	url := fmt.Sprintf("%s/api/active-backup/agent/%s/report", cfg.NasURL, cfg.DeviceID)
	if err := apiPost(url, cfg.AuthToken, body, nil); err != nil {
		slog.Warn("failed to report result", "err", err)
	}
}

func reportProgress(cfg *Config, percent int, currentFile, speed string) {
	p := ProgressReport{Percent: percent, CurrentFile: currentFile, Speed: speed}
	url := fmt.Sprintf("%s/api/active-backup/agent/%s/progress", cfg.NasURL, cfg.DeviceID)
	if err := apiPost(url, cfg.AuthToken, p, nil); err != nil {
		slog.Warn("failed to report progress", "err", err)
	}
}

func acquireBackupLock() (func(), bool, error) {
	lockPath := backupLockPath()
	if err := os.MkdirAll(filepath.Dir(lockPath), 0755); err != nil {
		return nil, false, fmt.Errorf("create lock dir: %w", err)
	}

	if info, err := os.Stat(lockPath); err == nil {
		if time.Since(info.ModTime()) > 12*time.Hour {
			if removeErr := os.Remove(lockPath); removeErr != nil && !os.IsNotExist(removeErr) {
				return nil, false, fmt.Errorf("remove stale lock: %w", removeErr)
			}
		}
	}

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		if os.IsExist(err) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("create lock file: %w", err)
	}

	_, _ = fmt.Fprintf(f, "pid=%d\nstartedAt=%s\n", os.Getpid(), time.Now().UTC().Format(time.RFC3339))
	_ = f.Close()

	release := func() {
		if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
			slog.Warn("failed to remove backup lock", "path", lockPath, "err", err)
		}
	}
	return release, true, nil
}

// ── Service daemon ────────────────────────────────────────────────────────────

func runDaemon() {
	// Set up logging to file when running as service
	if logFile, err := os.OpenFile(logPath(), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		log.SetOutput(logFile)
	}

	slog.Info("HomePiNAS Agent starting")

	cfg, err := loadConfig()
	if err != nil {
		slog.Error("failed to load config", "err", err)
		os.Exit(1)
	}

	// Activate with NAS if not yet registered
	if cfg.DeviceID == "" {
		slog.Info("activating with NAS", "url", cfg.NasURL)
		for {
			if err := activate(cfg); err != nil {
				slog.Warn("activation failed, retrying in 1m", "err", err)
				time.Sleep(time.Minute)
				continue
			}
			slog.Info("activated", "deviceID", cfg.DeviceID)
			break
		}
	}

	slog.Info("agent running", "deviceID", cfg.DeviceID, "nasURL", cfg.NasURL)

	var lastBackupDate string

	for {
		dc, err := getDeviceConfig(cfg)
		if err != nil {
			errStr := err.Error()
			// If token rejected or device not found, re-activate (NAS may have restarted or data was cleared)
			if strings.Contains(errStr, "401") || strings.Contains(errStr, "404") {
				slog.Warn("token rejected or device missing, re-activating", "err", err)
				cfg.DeviceID = ""
				cfg.AuthToken = ""
				if saveErr := saveConfig(cfg); saveErr != nil {
					slog.Warn("failed to clear config", "err", saveErr)
				}
				if actErr := activate(cfg); actErr != nil {
					slog.Warn("re-activation failed, retrying in 1m", "err", actErr)
					time.Sleep(time.Minute)
				}
				continue
			}
			slog.Warn("config poll failed", "err", err)
			time.Sleep(5 * time.Minute)
			continue
		}

		if !dc.Approved {
			slog.Info("waiting for admin approval")
			time.Sleep(5 * time.Minute)
			continue
		}

		today := time.Now().Format("2006-01-02")
		hour := time.Now().Hour()

		shouldBackup := dc.TriggerBackup ||
			(dc.BackupEnabled && today != lastBackupDate && hour >= dc.BackupHour)

		if shouldBackup {
			reason := "scheduled"
			if dc.TriggerBackup {
				reason = "manual trigger"
			}
			releaseLock, acquired, lockErr := acquireBackupLock()
			if lockErr != nil {
				slog.Error("backup lock failed", "err", lockErr)
				reportResult(cfg, false, "Backup lock failed: "+lockErr.Error(), 0)
				time.Sleep(5 * time.Minute)
				continue
			}
			if !acquired {
				slog.Warn("backup already running, skipping overlapping execution", "reason", reason)
				time.Sleep(5 * time.Minute)
				continue
			}
			slog.Info("running backup", "reason", reason, "type", dc.BackupType, "paths", dc.BackupPaths)
			if size, err := runBackup(cfg, dc); err != nil {
				slog.Error("backup failed", "err", err)
				reportResult(cfg, false, err.Error(), 0)
			} else {
				slog.Info("backup completed successfully", "size", size)
				reportResult(cfg, true, "Backup completed", size)
				lastBackupDate = today
			}
			releaseLock()
		}

		time.Sleep(5 * time.Minute)
	}
}

// ── Service installation ──────────────────────────────────────────────────────

func install(nasURL, token, backupType string) error {
	// 1. Get current binary path
	selfPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	selfPath, _ = filepath.EvalSymlinks(selfPath)

	installPath := installBinPath()
	if err := os.MkdirAll(filepath.Dir(installPath), 0755); err != nil {
		return fmt.Errorf("create install dir: %w", err)
	}

	// 2. Copy binary to install location (only if not already there)
	if selfPath != installPath {
		data, err := os.ReadFile(selfPath)
		if err != nil {
			return fmt.Errorf("read binary: %w", err)
		}
		if err := os.WriteFile(installPath, data, 0755); err != nil {
			return fmt.Errorf("write binary to %s: %w", installPath, err)
		}
	}

	// 3. Write config
	cfg := &Config{
		NasURL:     nasURL,
		Token:      token,
		BackupType: backupType,
	}
	if err := saveConfig(cfg); err != nil {
		return fmt.Errorf("save config: %w", err)
	}

	// 4. Register as OS service
	switch runtime.GOOS {
	case "windows":
		return installWindows(installPath)
	case "darwin":
		return installDarwin(installPath)
	default:
		return installLinux(installPath)
	}
}

func installWindows(binPath string) error {
	taskName := "HomePiNAS Agent"
	// Remove existing task if any
	exec.Command("schtasks", "/Delete", "/TN", taskName, "/F").Run()

	// schtasks stores /TR as a single command line string.
	// If the executable path contains spaces, Windows Task Scheduler running as
	// SYSTEM can fail with 0x80070002 unless the binary path is quoted.
	taskRun := fmt.Sprintf("\"%s\" --run", binPath)

	args := []string{
		"/Create", "/F",
		"/TN", taskName,
		"/TR", taskRun,
		"/SC", "ONSTART",
		"/RU", "SYSTEM",
		"/DELAY", "0001:00",
	}
	out, err := exec.Command("schtasks", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("schtasks create: %w\n%s", err, out)
	}
	// Start immediately
	exec.Command("schtasks", "/Run", "/TN", taskName).Run()
	return nil
}

func installDarwin(binPath string) error {
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.homepinas.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
    <string>--run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>/var/log/homepinas-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/homepinas-agent.log</string>
</dict>
</plist>`, binPath)

	plistPath := "/Library/LaunchDaemons/com.homepinas.agent.plist"
	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("write plist: %w", err)
	}

	// Unload any existing instance, then load
	exec.Command("launchctl", "unload", plistPath).Run()
	out, err := exec.Command("launchctl", "load", "-w", plistPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("launchctl load: %w\n%s", err, out)
	}
	return nil
}

func installLinux(binPath string) error {
	unit := fmt.Sprintf(`[Unit]
Description=HomePiNAS Backup Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%s --run
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`, binPath)

	unitPath := "/etc/systemd/system/homepinas-agent.service"
	if err := os.WriteFile(unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("write unit: %w", err)
	}

	exec.Command("systemctl", "daemon-reload").Run()
	exec.Command("systemctl", "enable", "homepinas-agent").Run()
	out, err := exec.Command("systemctl", "start", "homepinas-agent").CombinedOutput()
	if err != nil {
		return fmt.Errorf("systemctl start: %w\n%s", err, out)
	}
	return nil
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

func uninstall() error {
	switch runtime.GOOS {
	case "windows":
		exec.Command("schtasks", "/Delete", "/TN", "HomePiNAS Agent", "/F").Run()
	case "darwin":
		plist := "/Library/LaunchDaemons/com.homepinas.agent.plist"
		exec.Command("launchctl", "unload", plist).Run()
		os.Remove(plist)
	default:
		exec.Command("systemctl", "stop", "homepinas-agent").Run()
		exec.Command("systemctl", "disable", "homepinas-agent").Run()
		os.Remove("/etc/systemd/system/homepinas-agent.service")
		exec.Command("systemctl", "daemon-reload").Run()
	}

	os.Remove(configPath())
	os.Remove(installBinPath())
	fmt.Println("HomePiNAS Agent uninstalled.")
	return nil
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	installCmd := flag.Bool("install", false, "Install agent as system service (requires admin/root)")
	uninstallCmd := flag.Bool("uninstall", false, "Uninstall agent and remove service")
	runCmd := flag.Bool("run", false, "Run agent daemon (called by service manager)")
	restoreCmd := flag.Bool("restore", false, "Restore mode: download files from NAS snapshot")
	snapshotID := flag.String("snapshot", "", "Snapshot ID to restore (used with --restore)")
	targetDir := flag.String("target", "", "Target directory for restore (used with --restore)")
	nasURL := flag.String("nas", "", "NAS base URL, e.g. https://192.168.1.100")
	token := flag.String("token", "", "Activation token from dashboard")
	backupType := flag.String("backup-type", "folders", "Backup type: full | incremental | folders")
	flag.Parse()

	switch {
	case *uninstallCmd:
		if err := uninstall(); err != nil {
			fmt.Fprintln(os.Stderr, "uninstall error:", err)
			os.Exit(1)
		}

	case *installCmd:
		if *nasURL == "" || *token == "" {
			fmt.Fprintln(os.Stderr, "usage: agent --install --nas https://NAS_IP --token TOKEN [--backup-type full|incremental|folders]")
			os.Exit(1)
		}
		// Normalize NAS URL: strip trailing slash
		*nasURL = strings.TrimRight(*nasURL, "/")
		fmt.Printf("Installing HomePiNAS Agent...\n  NAS: %s\n  Backup type: %s\n", *nasURL, *backupType)
		if err := install(*nasURL, *token, *backupType); err != nil {
			fmt.Fprintln(os.Stderr, "install error:", err)
			os.Exit(1)
		}
		fmt.Println("HomePiNAS Agent installed and started successfully.")
		fmt.Println("Waiting for admin approval in the dashboard...")

	case *restoreCmd:
		if *nasURL == "" || *token == "" {
			fmt.Fprintln(os.Stderr, "usage: agent --restore --nas https://NAS_IP --token TOKEN [--snapshot ID] [--target DIR]")
			os.Exit(1)
		}
		fmt.Printf("Restore mode: NAS=%s snapshot=%s target=%s\n", *nasURL, *snapshotID, *targetDir)
		fmt.Println("Restore not yet implemented — see Plan C.")
		os.Exit(0)

	case *runCmd:
		runDaemon()

	default:
		fmt.Printf(`HomePiNAS Backup Agent

USAGE:
  Install:    agent --install --nas https://NAS_IP --token TOKEN [--backup-type full|incremental|folders]
  Uninstall:  agent --uninstall
  Run daemon: agent --run   (called automatically by service manager)
  Restore:    agent --restore --nas https://NAS_IP --token TOKEN [--snapshot ID] [--target DIR]

BACKUP TYPES:
  full         - Full disk / entire filesystem
  incremental  - Home directory only, skip unchanged files
  folders      - Documents, Desktop, Pictures only
`)
	}
}

// HomePiNAS Backup Agent
// Silent cross-platform agent: installs as system service, registers with NAS,
// polls for config, runs scheduled backups, reports results.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
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
	BackupHour    int      `json:"backupHour"`
}

type ActivateRequest struct {
	Token    string `json:"token"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
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

var httpClient = &http.Client{Timeout: 30 * time.Second}

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

	req := ActivateRequest{
		Token:    cfg.Token,
		Hostname: hostname,
		OS:       osName,
		Arch:     runtime.GOARCH,
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

func runBackup(cfg *Config, dc *DeviceConfig) error {
	slog.Info("starting backup", "type", dc.BackupType, "dest", dc.BackupDest)

	if len(dc.BackupPaths) == 0 {
		return fmt.Errorf("no backup paths configured")
	}

	switch runtime.GOOS {
	case "windows":
		return runBackupWindows(dc)
	default:
		return runBackupUnix(dc)
	}
}

func runBackupUnix(dc *DeviceConfig) error {
	dest := dc.BackupDest
	if dest == "" {
		return fmt.Errorf("backup destination not configured")
	}
	for _, src := range dc.BackupPaths {
		// Ensure trailing slash on src so rsync copies contents, not the dir itself
		if !strings.HasSuffix(src, "/") {
			src += "/"
		}
		args := []string{"-az", "--delete", "--timeout=60", src, dest}
		cmd := exec.Command("rsync", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		slog.Info("rsync", "src", src, "dest", dest)
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("rsync %s: %w", src, err)
		}
	}
	return nil
}

func runBackupWindows(dc *DeviceConfig) error {
	dest := dc.BackupDest
	if dest == "" {
		return fmt.Errorf("backup destination not configured")
	}
	for _, src := range dc.BackupPaths {
		// Robocopy: dest sub-folder named after the last path component
		leaf := filepath.Base(src)
		fullDest := filepath.Join(dest, leaf)
		flags := []string{src, fullDest, "/MIR", "/R:2", "/W:5", "/NP", "/NFL", "/NDL", "/NC", "/NJS", "/NJH"}
		cmd := exec.Command("robocopy", flags...)
		slog.Info("robocopy", "src", src, "dest", fullDest)
		if err := cmd.Run(); err != nil {
			// robocopy exit codes 0-7 are success/warning; >=8 = errors
			if cmd.ProcessState != nil && cmd.ProcessState.ExitCode() <= 7 {
				continue
			}
			return fmt.Errorf("robocopy %s: exit %d", src, cmd.ProcessState.ExitCode())
		}
	}
	return nil
}

// ── Report ────────────────────────────────────────────────────────────────────

func reportResult(cfg *Config, success bool, message string) {
	body := map[string]interface{}{
		"success": success,
		"message": message,
		"time":    time.Now().UTC().Format(time.RFC3339),
		"os":      runtime.GOOS,
	}
	url := fmt.Sprintf("%s/api/active-backup/agent/%s/report", cfg.NasURL, cfg.DeviceID)
	if err := apiPost(url, cfg.AuthToken, body, nil); err != nil {
		slog.Warn("failed to report result", "err", err)
	}
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

		if dc.BackupEnabled && today != lastBackupDate && hour >= dc.BackupHour {
			slog.Info("running scheduled backup", "type", dc.BackupType)
			if err := runBackup(cfg, dc); err != nil {
				slog.Error("backup failed", "err", err)
				reportResult(cfg, false, err.Error())
			} else {
				slog.Info("backup completed successfully")
				reportResult(cfg, true, "Backup completed")
				lastBackupDate = today
			}
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

	args := []string{
		"/Create", "/F",
		"/TN", taskName,
		"/TR", fmt.Sprintf(`"%s" --run`, binPath),
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

	case *runCmd:
		runDaemon()

	default:
		fmt.Printf(`HomePiNAS Backup Agent

USAGE:
  Install:    agent --install --nas https://NAS_IP --token TOKEN [--backup-type full|incremental|folders]
  Uninstall:  agent --uninstall
  Run daemon: agent --run   (called automatically by service manager)

BACKUP TYPES:
  full         - Full disk / entire filesystem
  incremental  - Home directory only, skip unchanged files
  folders      - Documents, Desktop, Pictures only
`)
	}
}

/**
 * Active Backup — Agent registration, polling, and backup management
 * Agents on remote PCs register here, poll for config, and report backup status
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';

export const activeBackupRouter = Router();

// In-memory store (replace with SQLite in production)
interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  token: string;
  backupType: 'full' | 'folders';
  backupPaths: string[];
  schedule: string;
  status: 'online' | 'offline' | 'backing-up';
  lastSeen: string;
  lastBackup: string | null;
  backupSize: number;
  versions: BackupVersion[];
  approved: boolean;
}

interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
}

interface PendingAgent {
  id: string;
  hostname: string;
  os: string;
  ip: string;
  requestedAt: string;
}

const devices = new Map<string, Device>();
const pendingAgents = new Map<string, PendingAgent>();

// No demo data — start clean

/** GET /agent/download — Redirect to latest agent release */
activeBackupRouter.get('/agent/download', requireAuth, (_req, res) => {
  res.redirect('https://github.com/juanlusoft/homenas_3.0/releases/latest/download/homepinas-agent');
});

/** GET /agent/generate/:platform — Generate installer script for platform */
activeBackupRouter.get('/agent/generate/:platform', requireAdmin, (req, res) => {
  const platform = req.params.platform as 'linux' | 'mac' | 'windows';
  const backupType = (req.query.backupType as string) || 'incremental';
  if (!['linux', 'mac', 'windows'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Use: linux, mac, windows' });
  }
  if (!['full', 'incremental', 'folders'].includes(backupType)) {
    return res.status(400).json({ error: 'Invalid backupType. Use: full, incremental, folders' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID().slice(0, 8);
  const nasHost = req.hostname || req.headers.host?.split(':')[0] || 'homepinas.local';
  const nasPort = process.env.PORT || '3001';
  const nasUrl = `http://${nasHost}:${nasPort}`;

  // Pre-register device as pending so admin can approve it
  pendingAgents.set(id, {
    id,
    hostname: `pending-${platform}-${id}`,
    os: platform === 'windows' ? 'Windows' : platform === 'mac' ? 'macOS' : 'Linux',
    ip: 'unknown',
    requestedAt: new Date().toISOString(),
  });

  // Backup source strings per type and platform
  const linuxBackupPaths = backupType === 'full'
    ? '("/")'
    : backupType === 'incremental'
    ? '("$HOME")'
    : '("$HOME/Documents" "$HOME/Desktop" "$HOME/Pictures" "$HOME/Videos")';
  const linuxRsyncFlags = backupType === 'full' ? '-az --delete --one-file-system' : '-az --delete';
  const macBackupPaths = backupType === 'full'
    ? '("/")'
    : backupType === 'incremental'
    ? '("/Users/$USER")'
    : '("$HOME/Documents" "$HOME/Desktop" "$HOME/Pictures" "$HOME/Movies")';
  const winBackupPaths = backupType === 'full'
    ? '@("C:\\\\")'
    : backupType === 'incremental'
    ? '@("$env:USERPROFILE")'
    : '@("$env:USERPROFILE\\\\Documents", "$env:USERPROFILE\\\\Desktop", "$env:USERPROFILE\\\\Pictures")';

  if (platform === 'linux') {
    const script = `#!/bin/bash
# ============================================================
# HomePiNAS Active Backup Agent — Linux Installer
# Generated: ${new Date().toISOString()}
# NAS: ${nasUrl}
# Device ID: ${id}
# Backup type: ${backupType}
# ============================================================
set -e

NAS_URL="${nasUrl}"
DEVICE_ID="${id}"
DEVICE_TOKEN="${token}"
BACKUP_TYPE="${backupType}"
AGENT_DIR="$HOME/.homepinas-agent"
BACKUP_LOG="$AGENT_DIR/backup.log"

echo "[HomePiNAS] Installing Linux backup agent (type: $BACKUP_TYPE)..."
mkdir -p "$AGENT_DIR"

HOSTNAME_VAL=$(hostname)
DISTRO=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Linux")

echo "[HomePiNAS] Registering device with NAS..."
curl -sf -X POST "$NAS_URL/api/active-backup/agent/register" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Token: $DEVICE_TOKEN" \\
  -d "{\\"hostname\\":\\"$HOSTNAME_VAL\\",\\"os\\":\\"$DISTRO\\",\\"id\\":\\"$DEVICE_ID\\"}" || true

cat > "$AGENT_DIR/backup.sh" << 'BACKUPEOF'
#!/bin/bash
NAS_URL="__NAS_URL__"
DEVICE_ID="__DEVICE_ID__"
DEVICE_TOKEN="__DEVICE_TOKEN__"
BACKUP_TYPE="__BACKUP_TYPE__"
BACKUP_PATHS=${linuxBackupPaths}
RSYNC_FLAGS="${linuxRsyncFlags}"
BACKUP_LOG="$HOME/.homepinas-agent/backup.log"
NAS_DEST="/mnt/storage/active-backup/$DEVICE_ID"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_LOG"; }
log "Starting $BACKUP_TYPE backup..."

CONFIG=$(curl -sf "$NAS_URL/api/active-backup/agent/poll/$DEVICE_ID" \\
  -H "Authorization: Bearer $DEVICE_TOKEN" 2>/dev/null || echo '{}')
if ! echo "$CONFIG" | grep -q '"approved":true'; then
  log "Not yet approved by admin. Skipping."; exit 0
fi

TOTAL_SIZE=0
START=$(date +%s)
for P in "${BACKUP_PATHS[@]}"; do
  if [ -e "$P" ]; then
    log "Backing up: $P"
    SIZE=$(du -sb "$P" 2>/dev/null | cut -f1 || echo 0)
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
    rsync $RSYNC_FLAGS "$P" "juanlu@__NAS_HOST__:$NAS_DEST/" 2>>"$BACKUP_LOG" || true
  fi
done
END=$(date +%s)
log "Done in $((END-START))s. Size: $TOTAL_SIZE bytes"

curl -sf -X POST "$NAS_URL/api/active-backup/agent/report/$DEVICE_ID" \\
  -H "Content-Type: application/json" -H "Authorization: Bearer $DEVICE_TOKEN" \\
  -d "{\\"status\\":\\"complete\\",\\"size\\":$TOTAL_SIZE,\\"type\\":\\"$BACKUP_TYPE\\"}" >/dev/null 2>&1 || true
BACKUPEOF

sed -i "s|__NAS_URL__|${nasUrl}|g; s|__DEVICE_ID__|${id}|g; s|__DEVICE_TOKEN__|${token}|g; s|__BACKUP_TYPE__|${backupType}|g; s|__NAS_HOST__|${nasHost}|g" "$AGENT_DIR/backup.sh"
chmod +x "$AGENT_DIR/backup.sh"

(crontab -l 2>/dev/null | grep -v homepinas; echo "0 2 * * * $AGENT_DIR/backup.sh >> $BACKUP_LOG 2>&1") | crontab -

echo ""
echo "=============================================="
echo "  HomePiNAS Agent instalado!"
echo "  Device ID   : $DEVICE_ID"
echo "  NAS URL     : $NAS_URL"
echo "  Backup type : $BACKUP_TYPE"
echo "  Schedule    : Diario a las 02:00 (cron)"
echo "  Logs        : $BACKUP_LOG"
echo ""
echo "  SIGUIENTE PASO: Aprueba este dispositivo"
echo "  en Active Backup del dashboard."
echo "=============================================="
`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="homepinas-agent-linux-${id}.sh"`);
    return res.send(script);
  }

  if (platform === 'mac') {
    const script = `#!/bin/bash
# ============================================================
# HomePiNAS Active Backup Agent — macOS Installer
# Generated: ${new Date().toISOString()}
# NAS: ${nasUrl}  |  Device ID: ${id}  |  Backup: ${backupType}
# ============================================================
set -e

NAS_URL="${nasUrl}"
DEVICE_ID="${id}"
DEVICE_TOKEN="${token}"
BACKUP_TYPE="${backupType}"
AGENT_DIR="$HOME/.homepinas-agent"
PLIST_PATH="$HOME/Library/LaunchAgents/com.homepinas.agent.plist"

echo "[HomePiNAS] Installing macOS backup agent (type: $BACKUP_TYPE)..."
mkdir -p "$AGENT_DIR"

OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "macOS")
HOSTNAME_VAL=$(hostname)

echo "[HomePiNAS] Registering device..."
curl -sf -X POST "$NAS_URL/api/active-backup/agent/register" \\
  -H "Content-Type: application/json" -H "X-Agent-Token: $DEVICE_TOKEN" \\
  -d "{\\"hostname\\":\\"$HOSTNAME_VAL\\",\\"os\\":\\"macOS $OS_VERSION\\",\\"id\\":\\"$DEVICE_ID\\"}" || true

cat > "$AGENT_DIR/backup.sh" << 'BACKUPEOF'
#!/bin/bash
NAS_URL="__NAS_URL__"
DEVICE_ID="__DEVICE_ID__"
DEVICE_TOKEN="__DEVICE_TOKEN__"
BACKUP_TYPE="__BACKUP_TYPE__"
BACKUP_PATHS=${macBackupPaths}
LOG_FILE="$HOME/.homepinas-agent/backup.log"
NAS_DEST="/mnt/storage/active-backup/$DEVICE_ID"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }
log "Starting $BACKUP_TYPE backup..."

CONFIG=$(curl -sf "$NAS_URL/api/active-backup/agent/poll/$DEVICE_ID" \\
  -H "Authorization: Bearer $DEVICE_TOKEN" 2>/dev/null || echo '{}')
if ! echo "$CONFIG" | grep -q '"approved":true'; then
  log "Not yet approved. Skipping."; exit 0
fi

TOTAL_SIZE=0
for P in "${BACKUP_PATHS[@]}"; do
  if [ -e "$P" ]; then
    SIZE=$(du -sk "$P" 2>/dev/null | awk '{print $1*1024}' || echo 0)
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
    rsync -az --delete "$P" "juanlu@__NAS_HOST__:$NAS_DEST/" 2>>"$LOG_FILE" || true
  fi
done

curl -sf -X POST "$NAS_URL/api/active-backup/agent/report/$DEVICE_ID" \\
  -H "Content-Type: application/json" -H "Authorization: Bearer $DEVICE_TOKEN" \\
  -d "{\\"status\\":\\"complete\\",\\"size\\":$TOTAL_SIZE,\\"type\\":\\"$BACKUP_TYPE\\"}" >/dev/null 2>&1 || true
log "Done."
BACKUPEOF

sed -i '' "s|__NAS_URL__|${nasUrl}|g; s|__DEVICE_ID__|${id}|g; s|__DEVICE_TOKEN__|${token}|g; s|__BACKUP_TYPE__|${backupType}|g; s|__NAS_HOST__|${nasHost}|g" "$AGENT_DIR/backup.sh"
chmod +x "$AGENT_DIR/backup.sh"

cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.homepinas.agent</string>
  <key>ProgramArguments</key><array><string>$AGENT_DIR/backup.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$AGENT_DIR/backup.log</string>
  <key>StandardErrorPath</key><string>$AGENT_DIR/backup.log</string>
</dict></plist>
PLIST

launchctl load "$PLIST_PATH" 2>/dev/null || true

echo "=============================================="
echo "  HomePiNAS Agent instalado para macOS!"
echo "  Device ID   : $DEVICE_ID  |  Tipo: $BACKUP_TYPE"
echo "  Diario 02:00 via launchd"
echo "  SIGUIENTE: Aprueba en Active Backup."
echo "=============================================="
`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="homepinas-agent-mac-${id}.sh"`);
    return res.send(script);
  }

  // Windows PowerShell
  const robocopyFlags = backupType === 'full' ? '/MIR /R:1 /W:1' : backupType === 'incremental' ? '/MIR /XO /R:1 /W:1' : '/MIR /R:1 /W:1';
  const script = `# ============================================================
# HomePiNAS Active Backup Agent — Windows Installer
# Generated: ${new Date().toISOString()}
# NAS: ${nasUrl}  |  Device: ${id}  |  Tipo: ${backupType}
# Ejecutar como Administrador en PowerShell
# ============================================================

$NasUrl      = "${nasUrl}"
$NasHost     = "${nasHost}"
$DeviceId    = "${id}"
$DeviceToken = "${token}"
$BackupType  = "${backupType}"
$AgentDir    = "$env:APPDATA\\HomePiNAS"
$BackupLog   = "$AgentDir\\backup.log"
$ScriptPath  = "$AgentDir\\backup.ps1"
$TaskName    = "HomePiNAS Backup"

Write-Host "[HomePiNAS] Instalando agente Windows (tipo: $BackupType)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

$Hostname = $env:COMPUTERNAME
$OS = (Get-CimInstance Win32_OperatingSystem).Caption
Write-Host "[HomePiNAS] Registrando dispositivo: $Hostname"
try {
  $Body = @{ hostname = $Hostname; os = $OS; id = $DeviceId } | ConvertTo-Json
  Invoke-RestMethod -Uri "$NasUrl/api/active-backup/agent/register" \`
    -Method POST -ContentType "application/json" \`
    -Headers @{ "X-Agent-Token" = $DeviceToken } -Body $Body | Out-Null
  Write-Host "[HomePiNAS] Registrado correctamente." -ForegroundColor Green
} catch {
  Write-Host "[HomePiNAS] No se pudo conectar al NAS. Continuando..." -ForegroundColor Yellow
}

@"
\$NasUrl      = "${nasUrl}"
\$NasHost     = "${nasHost}"
\$DeviceId    = "${id}"
\$DeviceToken = "${token}"
\$BackupType  = "${backupType}"
\$BackupLog   = "$AgentDir\\backup.log"
\$BackupPaths = ${winBackupPaths}
\$NasShare    = "\\\\$NasHost\\active-backup\\\$DeviceId"
\$RobocopyFlags = "${robocopyFlags}".Split(" ")

function Write-Log { param(\$msg) Add-Content -Path \$BackupLog -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] \$msg" }

Write-Log "Iniciando backup \$BackupType..."
try {
  \$Config = Invoke-RestMethod -Uri "\$NasUrl/api/active-backup/agent/poll/\$DeviceId" \`
    -Headers @{ Authorization = "Bearer \$DeviceToken" } -TimeoutSec 10
  if (-not \$Config.approved) { Write-Log "No aprobado. Saltando."; exit 0 }
} catch { Write-Log "No se puede conectar al NAS. Saltando."; exit 0 }

\$TotalSize = 0
foreach (\$Path in \$BackupPaths) {
  if (Test-Path \$Path) {
    Write-Log "Backup: \$Path"
    \$Dest = "\$NasShare\\" + (Split-Path \$Path -Leaf)
    New-Item -ItemType Directory -Force -Path \$Dest -ErrorAction SilentlyContinue | Out-Null
    & robocopy \$Path \$Dest @RobocopyFlags /LOG+:\$BackupLog /NP /NDL /NC /NJS | Out-Null
    \$Size = (Get-ChildItem \$Path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    \$TotalSize += \$Size
  }
}

try {
  \$Report = @{ status = "complete"; size = \$TotalSize; type = \$BackupType } | ConvertTo-Json
  Invoke-RestMethod -Uri "\$NasUrl/api/active-backup/agent/report/\$DeviceId" \`
    -Method POST -ContentType "application/json" \`
    -Headers @{ Authorization = "Bearer \$DeviceToken" } -Body \$Report | Out-Null
} catch {}
Write-Log "Backup completo. Total: \$TotalSize bytes"
"@ | Set-Content -Path $ScriptPath -Encoding UTF8

$Action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -WindowStyle Hidden -File \`"$ScriptPath\`""
$Trigger  = New-ScheduledTaskTrigger -Daily -At "02:00"
$Settings = New-ScheduledTaskSettingsSet -RunOnlyIfNetworkAvailable -WakeToRun
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  HomePiNAS Agent instalado para Windows!" -ForegroundColor Green
Write-Host "  Device ID : $DeviceId  |  Tipo: $BackupType"
Write-Host "  Diario 02:00 via Programador de tareas"
Write-Host "  Logs      : $BackupLog"
Write-Host ""
Write-Host "  SIGUIENTE: Aprueba el dispositivo en"
Write-Host "  Active Backup del dashboard."
Write-Host "==============================================" -ForegroundColor Green
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="homepinas-agent-windows-${id}.ps1"`);
  return res.send(script);
});

/** POST /agent/register — Agent self-registration */
activeBackupRouter.post('/agent/register', requireAdmin, (req, res) => {
  const { hostname, os } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname required' });

  const id = crypto.randomUUID().slice(0, 8);
  const ip = req.ip || 'unknown';

  pendingAgents.set(id, {
    id, hostname, os: os || 'unknown', ip,
    requestedAt: new Date().toISOString(),
  });

  res.json({ id, status: 'pending_approval', message: 'Waiting for admin approval' });
});

/** GET /agent/poll/:id — Agent polls for config */
activeBackupRouter.get('/agent/poll/:id', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  device.lastSeen = new Date().toISOString();
  device.status = 'online';

  res.json({
    approved: device.approved,
    backupType: device.backupType,
    backupPaths: device.backupPaths,
    schedule: device.schedule,
  });
});

/** POST /agent/report/:id — Agent reports backup result */
activeBackupRouter.post('/agent/report/:id', requireAdmin, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const { status, size, type } = req.body;
  const version: BackupVersion = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    size: size || 0,
    type: type || 'incremental',
    status: status || 'complete',
  };

  device.versions.unshift(version);
  if (device.versions.length > 50) device.versions.pop();
  device.lastBackup = version.timestamp;
  device.backupSize += version.size;
  device.status = 'online';

  res.json({ success: true });
});

/** GET /devices — List all registered devices */
activeBackupRouter.get('/devices', requireAuth, (_req, res) => {
  res.json(Array.from(devices.values()));
});

/** GET /devices/:id — Single device detail */
activeBackupRouter.get('/devices/:id', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

/** POST /devices — Manually add device */
activeBackupRouter.post('/devices', requireAdmin, (req, res) => {
  const { name, hostname, os, backupType, backupPaths, schedule } = req.body;
  const id = crypto.randomUUID().slice(0, 8);
  const token = crypto.randomBytes(32).toString('hex');

  const device: Device = {
    id, name: name || hostname, hostname, os: os || 'unknown',
    ip: '', token, backupType: backupType || 'folders',
    backupPaths: backupPaths || [], schedule: schedule || '0 2 * * *',
    status: 'offline', lastSeen: '', lastBackup: null,
    backupSize: 0, versions: [], approved: true,
  };

  devices.set(id, device);
  res.json({ id, token });
});

/** DELETE /devices/:id — Remove device */
activeBackupRouter.delete('/devices/:id', requireAdmin, (req, res) => {
  devices.delete(req.params.id);
  res.json({ success: true });
});

/** POST /devices/:id/backup — Trigger manual backup */
activeBackupRouter.post('/devices/:id/backup', requireAdmin, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  device.status = 'backing-up';
  res.json({ success: true, message: 'Backup triggered' });
});

/** GET /devices/:id/versions — List backup versions */
activeBackupRouter.get('/devices/:id/versions', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device.versions);
});

/** GET /pending — List pending agent registrations */
activeBackupRouter.get('/pending', requireAuth, (_req, res) => {
  res.json(Array.from(pendingAgents.values()));
});

/** POST /pending/:id/approve — Approve pending agent */
activeBackupRouter.post('/pending/:id/approve', requireAdmin, (req, res) => {
  const pending = pendingAgents.get(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending agent not found' });

  const token = crypto.randomBytes(32).toString('hex');
  const device: Device = {
    id: pending.id, name: pending.hostname, hostname: pending.hostname,
    os: pending.os, ip: pending.ip, token,
    backupType: 'folders', backupPaths: [], schedule: '0 2 * * *',
    status: 'online', lastSeen: new Date().toISOString(),
    lastBackup: null, backupSize: 0, versions: [], approved: true,
  };

  devices.set(device.id, device);
  pendingAgents.delete(pending.id);
  res.json({ success: true, device });
});

/** POST /pending/:id/reject — Reject pending agent */
activeBackupRouter.post('/pending/:id/reject', requireAdmin, (req, res) => {
  pendingAgents.delete(req.params.id);
  res.json({ success: true });
});

function seedDemoData() {
  const demoDevices: Omit<Device, 'token'>[] = [
    {
      id: 'pc-001', name: 'Juanlu Desktop', hostname: 'DESKTOP-JLU',
      os: 'Windows 11 Pro', ip: '192.168.1.10',
      backupType: 'full', backupPaths: ['C:\\'],
      schedule: '0 2 * * *', status: 'online',
      lastSeen: new Date().toISOString(),
      lastBackup: new Date(Date.now() - 3600000).toISOString(),
      backupSize: 142_000_000_000, versions: [
        { id: 'v1', timestamp: new Date(Date.now() - 3600000).toISOString(), size: 4_200_000_000, type: 'incremental', status: 'complete' },
        { id: 'v2', timestamp: new Date(Date.now() - 90000000).toISOString(), size: 142_000_000_000, type: 'full', status: 'complete' },
      ], approved: true,
    },
    {
      id: 'mac-001', name: 'MacBook Pro', hostname: 'Juanlus-MBP',
      os: 'macOS Sonoma 15.3', ip: '192.168.1.15',
      backupType: 'folders', backupPaths: ['/Users/juanlu/Documents', '/Users/juanlu/Projects'],
      schedule: '0 */6 * * *', status: 'online',
      lastSeen: new Date(Date.now() - 300000).toISOString(),
      lastBackup: new Date(Date.now() - 21600000).toISOString(),
      backupSize: 38_000_000_000, versions: [
        { id: 'v3', timestamp: new Date(Date.now() - 21600000).toISOString(), size: 1_500_000_000, type: 'incremental', status: 'complete' },
        { id: 'v4', timestamp: new Date(Date.now() - 43200000).toISOString(), size: 2_100_000_000, type: 'incremental', status: 'complete' },
        { id: 'v5', timestamp: new Date(Date.now() - 86400000).toISOString(), size: 38_000_000_000, type: 'full', status: 'complete' },
      ], approved: true,
    },
    {
      id: 'srv-001', name: 'Dev Server', hostname: 'devbox',
      os: 'Ubuntu 24.04 LTS', ip: '192.168.1.20',
      backupType: 'folders', backupPaths: ['/home', '/etc', '/opt'],
      schedule: '0 3 * * *', status: 'offline',
      lastSeen: new Date(Date.now() - 86400000 * 2).toISOString(),
      lastBackup: new Date(Date.now() - 86400000 * 2).toISOString(),
      backupSize: 22_000_000_000, versions: [
        { id: 'v6', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), size: 800_000_000, type: 'incremental', status: 'complete' },
      ], approved: true,
    },
  ];

  for (const d of demoDevices) {
    devices.set(d.id, { ...d, token: crypto.randomBytes(16).toString('hex') });
  }

  pendingAgents.set('pend-1', {
    id: 'pend-1', hostname: 'LAPTOP-MARIA', os: 'Windows 10',
    ip: '192.168.1.25', requestedAt: new Date(Date.now() - 1800000).toISOString(),
  });
}

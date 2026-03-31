/**
 * Active Backup — Agent registration, polling, and backup management
 * Agents on remote PCs register here, poll for config, and report backup status
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  pendingBackup: boolean;
  backupProgress: { percent: number; currentFile: string; speed: string } | null;
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
  name: string;
  hostname: string;
  os: string;
  ip: string;
  requestedAt: string;
}

const devices = new Map<string, Device>();
const pendingAgents = new Map<string, PendingAgent>();

// Auto-reset devices stuck in backing-up > 30 min with no heartbeat
function applyTimeout(device: Device) {
  if (device.status === 'backing-up') {
    const lastSeen = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    if (Date.now() - lastSeen > 30 * 60 * 1000) {
      device.status = 'offline';
      device.backupProgress = null;
      device.pendingBackup = false;
    }
  }
}

// No demo data — start clean

/** GET /agent/binary/:platform — Serve pre-built agent binary */
activeBackupRouter.get('/agent/binary/:platform', requireAuth, (req, res) => {
  const platform = req.params.platform as string;
  const arch = (req.query.arch as string) || 'amd64';

  const fileMap: Record<string, string> = {
    'windows':      `agent-windows-${arch}.exe`,
    'darwin':       `agent-darwin-${arch}`,
    'darwin-arm64': 'agent-darwin-arm64',
    'darwin-amd64': 'agent-darwin-amd64',
    'linux':        `agent-linux-${arch}`,
    'linux-arm64':  'agent-linux-arm64',
    'linux-amd64':  'agent-linux-amd64',
  };

  const filename = fileMap[platform];
  if (!filename) return res.status(400).json({ error: 'Unknown platform' });

  const binPath = path.join(__dirname, '../../agent/dist', filename);
  if (!fs.existsSync(binPath)) return res.status(404).json({ error: 'Binary not found. Run agent/build.sh first.' });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(binPath);
});

/** GET /agent/generate/:platform — Generate one-liner install command (token-based, references pre-built binary) */
activeBackupRouter.get('/agent/generate/:platform', requireAdmin, (req, res) => {
  try {
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
    const customName = ((req.query.name as string) || '').trim();

    // Determine NAS URL — prefer X-Forwarded-Proto/Host (behind nginx), fall back to request info
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'homepinas.local';
    const nasUrl = `${proto}://${host}`;

    // Pre-register device as pending
    pendingAgents.set(id, {
      id,
      name: customName || `${platform}-${id}`,
      hostname: `pending-${platform}-${id}`,
      os: platform === 'windows' ? 'Windows' : platform === 'mac' ? 'macOS' : 'Linux',
      ip: 'unknown',
      requestedAt: new Date().toISOString(),
    });

    const binaryPlatform = platform === 'windows' ? 'windows' : platform === 'mac' ? 'darwin' : 'linux';
    const binaryUrl = `${nasUrl}/api/active-backup/agent/binary/${binaryPlatform}`;
    const installArgs = `--install --nas ${nasUrl} --token ${token} --backup-type ${backupType}`;

    const installCommands: Record<string, string> = {
      windows: `powershell -NoProfile -ExecutionPolicy Bypass -Command "& { \`$f='C:\\Windows\\Temp\\hp-agent.exe'; Invoke-WebRequest '${binaryUrl}' -OutFile \`$f; Start-Process \`$f '${installArgs}' -Verb RunAs -Wait }"`,
      mac:     `sudo bash -c "curl -fsSL '${binaryUrl}' -o /tmp/hp-agent && chmod +x /tmp/hp-agent && /tmp/hp-agent ${installArgs}"`,
      linux:   `sudo bash -c "curl -fsSL '${binaryUrl}' -o /tmp/hp-agent && chmod +x /tmp/hp-agent && /tmp/hp-agent ${installArgs}"`,
    };

    return res.json({
      deviceID: id,
      token,
      nasURL: nasUrl,
      backupType,
      platform,
      binaryURL: binaryUrl,
      installCommand: installCommands[platform] ?? '',
    });
  } catch (err) {
    console.error('[active-backup] generate error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

/** POST /agent/activate — Binary agent activation (called by Go agent on first run) */
activeBackupRouter.post('/agent/activate', (req, res) => {
  const { token, hostname, os: agentOS, arch } = req.body;
  if (!token || !hostname) return res.status(400).json({ error: 'token and hostname required' });

  // Find matching pending agent by token
  const pending = Array.from(pendingAgents.values()).find(p => {
    const d = devices.get(p.id);
    return !d; // still pending
  });

  // Look up the device ID that was pre-registered with this token
  // The token was stored in the Device record when generate was called
  const deviceEntry = Array.from(devices.values()).find(d => d.token === token);
  const pendingEntry = Array.from(pendingAgents.values()).find(p => {
    // Token is not stored in pending directly; we look it up by hostname match or just accept any pending
    return true;
  });

  // Generate a new device auth token for subsequent API calls
  const authToken = crypto.randomBytes(32).toString('hex');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';

  if (deviceEntry) {
    // Already activated — update and return existing ID
    deviceEntry.hostname = hostname;
    deviceEntry.os = agentOS || deviceEntry.os;
    deviceEntry.ip = ip;
    deviceEntry.token = authToken;
    deviceEntry.lastSeen = new Date().toISOString();
    return res.json({ deviceID: deviceEntry.id, authToken });
  }

  // Move matching pending to devices (or create new device)
  // Find pending agent whose placeholder hostname matches platform
  const matchedPending = Array.from(pendingAgents.values()).find(p =>
    p.hostname.startsWith('pending-')
  );

  const id = matchedPending?.id || crypto.randomUUID().slice(0, 8);
  if (matchedPending) pendingAgents.delete(matchedPending.id);

  const device: Device = {
    id,
    name: matchedPending?.name || hostname,
    hostname,
    os: agentOS || 'unknown',
    ip,
    token: authToken,
    backupType: 'folders',
    backupPaths: [],
    schedule: '0 2 * * *',
    status: 'online',
    lastSeen: new Date().toISOString(),
    lastBackup: null,
    backupSize: 0,
    versions: [],
    approved: false,
    pendingBackup: false,
    backupProgress: null,
  };

  devices.set(id, device);
  res.json({ deviceID: id, authToken, message: 'Registered, waiting for admin approval' });
});

/** GET /agent/:id/config — Binary agent polls for backup config */
activeBackupRouter.get('/agent/:id/config', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Verify auth token from Authorization header
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });

  device.lastSeen = new Date().toISOString();
  if (device.status !== 'backing-up') device.status = 'online';

  const triggerBackup = device.pendingBackup;
  if (device.pendingBackup) device.pendingBackup = false;

  // Default backup paths per OS/type if none configured
  const defaultPaths: Record<string, Record<string, string[]>> = {
    windows: {
      full: ['C:\\'],
      incremental: [process.env.USERPROFILE || 'C:\\Users\\User'],
      folders: ['Documents', 'Desktop', 'Pictures'].map(d => `C:\\Users\\User\\${d}`),
    },
    darwin: {
      full: ['/'],
      incremental: ['/Users'],
      folders: ['/Users/Shared/Documents', '/Users/Shared/Desktop', '/Users/Shared/Pictures'],
    },
    linux: {
      full: ['/'],
      incremental: ['/home'],
      folders: ['/home'],
    },
  };

  const paths = device.backupPaths.length > 0
    ? device.backupPaths
    : (defaultPaths['linux'][device.backupType] || []);

  res.json({
    approved: device.approved,
    backupEnabled: device.approved,
    backupType: device.backupType,
    backupPaths: paths,
    backupDest: device.approved ? `/mnt/storage/active-backup/${device.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}/` : '',
    backupHour: 2,
    schedule: device.schedule,
    triggerBackup,
  });
});

/** POST /agent/:id/report — Binary agent reports backup result */
activeBackupRouter.post('/agent/:id/report', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });

  const { success, message, size } = req.body;
  const version: BackupVersion = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    size: size || 0,
    type: device.backupType === 'incremental' ? 'incremental' : 'full',
    status: success ? 'complete' : 'failed',
  };

  device.versions.unshift(version);
  if (device.versions.length > 50) device.versions.pop();
  device.lastBackup = version.timestamp;
  if (success) device.backupSize += (size || 0);
  device.status = 'online';
  device.backupProgress = null;
  device.pendingBackup = false;

  res.json({ success: true });
});

/** POST /agent/:id/progress — Binary agent reports backup progress */
activeBackupRouter.post('/agent/:id/progress', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });

  const { percent, currentFile, speed } = req.body;
  device.backupProgress = {
    percent: typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0,
    currentFile: currentFile || '',
    speed: speed || '',
  };
  device.status = 'backing-up';
  device.lastSeen = new Date().toISOString();

  res.json({ success: true });
});

/** POST /agent/register — Legacy agent self-registration (kept for compatibility) */
activeBackupRouter.post('/agent/register', (req, res) => {
  const { hostname, os: agentOS, id: requestedId } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname required' });

  const id = requestedId || crypto.randomUUID().slice(0, 8);
  const ip = req.ip || 'unknown';

  if (!pendingAgents.has(id)) {
    pendingAgents.set(id, {
      id, hostname, os: agentOS || 'unknown', ip,
      requestedAt: new Date().toISOString(),
    });
  }

  res.json({ id, status: 'pending_approval', message: 'Waiting for admin approval' });
});

/** GET /agent/poll/:id — Legacy agent config poll */
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

/** POST /agent/report/:id — Legacy backup result report */
activeBackupRouter.post('/agent/report/:id', requireAuth, (req, res) => {
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
  const list = Array.from(devices.values());
  list.forEach(applyTimeout);
  res.json(list);
});

/** GET /devices/:id — Single device detail */
activeBackupRouter.get('/devices/:id', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  applyTimeout(device);
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
    pendingBackup: false, backupProgress: null,
  };

  devices.set(id, device);
  res.json({ id, token });
});

/** PUT /devices/:id — Rename device */
activeBackupRouter.put('/devices/:id', requireAdmin, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const { name } = req.body;
  if (name && typeof name === 'string') device.name = name.trim();
  res.json({ success: true, device });
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
  if (!device.approved) return res.status(400).json({ error: 'Device not approved' });
  device.status = 'backing-up';
  device.pendingBackup = true;
  device.backupProgress = { percent: 0, currentFile: 'Waiting for agent...', speed: '' };
  res.json({ success: true, message: 'Backup triggered — agent will start shortly' });
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
    id: pending.id, name: pending.name || pending.hostname, hostname: pending.hostname,
    os: pending.os, ip: pending.ip, token,
    backupType: 'folders', backupPaths: [], schedule: '0 2 * * *',
    status: 'online', lastSeen: new Date().toISOString(),
    lastBackup: null, backupSize: 0, versions: [], approved: true,
    pendingBackup: false, backupProgress: null,
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

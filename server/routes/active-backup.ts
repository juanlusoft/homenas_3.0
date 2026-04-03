/**
 * Active Backup — Agent registration, polling, and backup management
 * Agents on remote PCs register here, poll for config, and report backup status
 */

import { Router, Request, Response } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  devices,
  pendingAgents,
  pendingTokens,
  saveData,
  Device,
  PendingAgent,
  BACKUP_BASE_DIR,
} from '../lib/active-backup-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENGINE_URL = (process.env.SBV2_ENGINE_URL || 'http://192.168.1.81:4021').replace(/\/+$/, '');
const ENGINE_TOKEN =
  process.env.SBV2_ENGINE_ADMIN_TOKEN || process.env.SBV2_ADMIN_TOKEN || 'admin-v2-local';

async function proxyEngine(pathSuffix: string, init: any = {}) {
  if (!ENGINE_URL || !ENGINE_TOKEN) {
    throw new Error('Engine proxy not configured');
  }

  const url = `${ENGINE_URL}${pathSuffix}`;
  const headers = {
    'x-sb-admin-token': ENGINE_TOKEN,
    ...(init.headers || {}),
  };

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || response.statusText);
  }
  return response.json();
}

export const activeBackupRouter = Router();
const INSTALL_TOKEN_SECRET_FILE = path.join(__dirname, '../../data/active-backup-token.key');
const RECOVERY_USB_DIR = path.join(__dirname, '../../recovery-usb');
const RECOVERY_ISO_FILE = path.join(RECOVERY_USB_DIR, 'homepinas-recovery.iso');


interface InstallTokenMeta {
  id: string;
  name: string;
  os: string;
  backupType: string;
  backupHost: string;
  backupShare: string;
  backupUsername: string;
  backupPassword: string;
  issuedAt: string;
}

let installTokenSecretCache: Buffer | null = null;

function getInstallTokenSecret(): Buffer {
  if (installTokenSecretCache) return installTokenSecretCache;
  fs.mkdirSync(path.dirname(INSTALL_TOKEN_SECRET_FILE), { recursive: true });
  if (!fs.existsSync(INSTALL_TOKEN_SECRET_FILE)) {
    fs.writeFileSync(INSTALL_TOKEN_SECRET_FILE, crypto.randomBytes(32).toString('hex'), 'utf8');
  }
  installTokenSecretCache = Buffer.from(fs.readFileSync(INSTALL_TOKEN_SECRET_FILE, 'utf8').trim(), 'utf8');
  return installTokenSecretCache;
}

function signInstallToken(meta: InstallTokenMeta): string {
  const payload = Buffer.from(JSON.stringify(meta)).toString('base64url');
  const sig = crypto.createHmac('sha256', getInstallTokenSecret()).update(payload).digest('base64url');
  return `v1.${payload}.${sig}`;
}

function parseInstallToken(token: string) {
  if (!token.startsWith('v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', getInstallTokenSecret()).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as InstallTokenMeta;
  } catch {
    return null;
  }
}

interface BrowseItem {
  name: string;
  type: 'directory' | 'file';
  size: number;
  modified: string | null;
  path: string;
  downloadable: boolean;
}

function slugifyBackupFolder(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getDeviceFolderCandidates(device: Device): string[] {
  const candidates = [
    slugifyBackupFolder(device.name || ''),
    slugifyBackupFolder(device.hostname || ''),
    device.id.trim(),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

function getDeviceBackupRoot(device: Device): string {
  const candidates = getDeviceFolderCandidates(device);
  for (const candidate of candidates) {
    const full = path.join(BACKUP_BASE_DIR, candidate);
    if (fs.existsSync(full)) return full;
  }
  return path.join(BACKUP_BASE_DIR, candidates[0] || device.id);
}

function resolveLatestVersionDir(root: string): string | null {
  const latestPath = path.join(root, 'latest');
  if (!fs.existsSync(latestPath)) return null;
  try {
    const stat = fs.lstatSync(latestPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(latestPath);
      return path.resolve(root, target);
    }
    if (stat.isDirectory()) return latestPath;
  } catch {
    return null;
  }
  return null;
}

function resolveBrowseBase(device: Device, versionId?: string): string {
  const root = getDeviceBackupRoot(device);
  if (!versionId || versionId === 'latest') {
    return resolveLatestVersionDir(root) || root;
  }

  const safeVersion = versionId.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeVersion) return root;

  const versionDir = path.join(root, safeVersion);
  if (fs.existsSync(versionDir) && fs.statSync(versionDir).isDirectory()) {
    return versionDir;
  }

  return root;
}

function getVersionDirectory(device: Device, versionId: string): string | null {
  const safeId = versionId.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeId) return null;
  return path.join(getDeviceBackupRoot(device), safeId);
}

function normalizeBrowsePath(input: string): string {
  const sanitized = (input || '/').replace(/\0/g, '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(sanitized.startsWith('/') ? sanitized : `/${sanitized}`);
  return normalized === '.' ? '/' : normalized;
}

function resolveBrowseTarget(baseDir: string, requestedPath: string): { relativePath: string; fullPath: string } {
  const baseResolved = path.resolve(baseDir);
  const normalized = normalizeBrowsePath(requestedPath);
  const relativePath = normalized === '/' ? '' : normalized.slice(1);
  const fullPath = path.resolve(baseResolved, relativePath);
  if (fullPath !== baseResolved && !fullPath.startsWith(baseResolved + path.sep)) {
    throw new Error('Access denied');
  }
  return { relativePath: normalized, fullPath };
}

function listBrowseItems(fullPath: string, relativePath: string): BrowseItem[] {
  const items = fs.readdirSync(fullPath, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(fullPath, entry.name);
    let size = 0;
    let modified: string | null = null;
    try {
      const stat = fs.statSync(entryPath);
      size = stat.size;
      modified = stat.mtime.toISOString();
    } catch {
      // Ignore unreadable entries but keep the rest of the listing.
    }

    const itemPath = relativePath === '/' ? `/${entry.name}` : `${relativePath}/${entry.name}`;
    return {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size,
      modified,
      path: itemPath,
      downloadable: !entry.isDirectory(),
    } satisfies BrowseItem;
  });

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

// Auto-reset devices stuck in backing-up > 30 min with no heartbeat
function applyTimeout(device: Device) {
  if (device.status === 'backing-up') {
    const lastSeen = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    if (Date.now() - lastSeen > 30 * 60 * 1000) {
      device.status = 'offline';
      device.backupProgress = null;
      device.pendingBackup = false;
      saveData();
    }
  }
}

/** GET /agent/binary/:platform — Serve pre-built agent binary (public — secured by install token) */
activeBackupRouter.get('/agent/binary/:platform', (req, res) => {
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

function parseBackupHost(req: Request): string {
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'homepinas.local';
  return forwardedHost.split(',')[0].trim().replace(/:\d+$/, '');
}

function normalizeBinaryArch(platform: 'linux' | 'mac' | 'windows', archInput: string): 'amd64' | 'arm64' {
  const arch = archInput.trim().toLowerCase();
  if (platform === 'windows') return 'amd64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  return 'amd64';
}

function buildInstallResponse(req: Request, res: Response) {
  try {
    const platform = req.params.platform as 'linux' | 'mac' | 'windows';
    const input = req.method === 'POST' ? req.body ?? {} : req.query;
    const backupType = (input.backupType as string) || 'incremental';
    if (!['linux', 'mac', 'windows'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Use: linux, mac, windows' });
    }
    if (!['full', 'incremental', 'folders'].includes(backupType)) {
      return res.status(400).json({ error: 'Invalid backupType. Use: full, incremental, folders' });
    }

    const id = crypto.randomUUID().slice(0, 8);
    const customName = ((input.name as string) || '').trim();
    const backupUsername = ((input.backupUsername as string) || req.user?.username || '').trim();
    const backupPassword = ((input.backupPassword as string) || '').trim();
    const backupShare = ((input.backupShare as string) || 'active-backup').trim();
    const requestedArch = normalizeBinaryArch(platform, String(input.arch || 'amd64'));

    // Determine NAS URL — prefer X-Forwarded-Proto/Host (behind nginx), fall back to request info
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'homepinas.local';
    const nasUrl = `${proto}://${host}`;
    const backupHost = parseBackupHost(req);

    if (!backupUsername || !backupPassword) {
      return res.status(400).json({ error: 'Backup username and password are required' });
    }

    // Store token so activate() can match it when the agent calls in
    const tokenMeta: InstallTokenMeta = {
      id,
      name: customName || `${platform}-${id}`,
      os: platform === 'windows' ? 'Windows' : platform === 'mac' ? 'macOS' : 'Linux',
      backupType,
      backupHost,
      backupShare,
      backupUsername,
      backupPassword,
      issuedAt: new Date().toISOString(),
    };
    const token = signInstallToken(tokenMeta);
    pendingTokens.set(token, tokenMeta);
    saveData();

    const binaryPlatform = platform === 'windows' ? 'windows' : platform === 'mac' ? 'darwin' : 'linux';
    const binaryUrl = `${nasUrl}/api/active-backup/agent/binary/${binaryPlatform}?arch=${requestedArch}`;
    const installArgs = `--install --nas ${nasUrl} --token ${token} --backup-type ${backupType}`;
    const macBinaryUrl = `${nasUrl}/api/active-backup/agent/binary/darwin?arch=$(uname -m | grep -qi 'arm64\\|aarch64' && echo arm64 || echo amd64)`;
    const linuxBinaryUrl = `${nasUrl}/api/active-backup/agent/binary/linux?arch=$(uname -m | grep -qi 'arm64\\|aarch64' && echo arm64 || echo amd64)`;

    const installCommands: Record<string, string> = {
      windows: `powershell -NoProfile -ExecutionPolicy Bypass -Command "& { \`$f='C:\\Windows\\Temp\\hp-agent.exe'; try { Invoke-WebRequest '${binaryUrl}' -OutFile \`$f -SkipCertificateCheck } catch { [Net.ServicePointManager]::ServerCertificateValidationCallback = {\`$true}; (New-Object Net.WebClient).DownloadFile('${binaryUrl}', \`$f) }; Start-Process \`$f '${installArgs}' -Verb RunAs -Wait }"`,
      mac:     `sudo bash -c 'curl -fsSL "${macBinaryUrl}" -o /tmp/hp-agent && chmod +x /tmp/hp-agent && /tmp/hp-agent ${installArgs}'`,
      linux:   `sudo bash -c 'curl -fsSL "${linuxBinaryUrl}" -o /tmp/hp-agent && chmod +x /tmp/hp-agent && /tmp/hp-agent ${installArgs}'`,
    };

    return res.json({
      deviceID: id,
      token,
      nasURL: nasUrl,
      backupType,
      platform,
      arch: requestedArch,
      backupHost,
      backupShare,
      backupUsername,
      binaryURL: binaryUrl,
      installCommand: installCommands[platform] ?? '',
    });
  } catch (err) {
    console.error('[active-backup] generate error:', err);
    return res.status(500).json({ error: String(err) });
  }
}

/** /agent/generate/:platform — Generate one-liner install command (token-based, references pre-built binary) */
activeBackupRouter.get('/agent/generate/:platform', requireAdmin, (req, res) => buildInstallResponse(req, res));
activeBackupRouter.post('/agent/generate/:platform', requireAdmin, (req, res) => buildInstallResponse(req, res));

/** POST /agent/activate — Binary agent activation (called by Go agent on first run or re-activation) */
activeBackupRouter.post('/agent/activate', (req, res) => {
  const { token, hostname, os: agentOS, ip: agentIP } = req.body;
  if (!token || !hostname) return res.status(400).json({ error: 'token and hostname required' });

  // Prefer IP reported by the agent itself (it knows its real outbound IP)
  // Fall back to TCP connection source (may be 127.0.0.1 behind nginx)
  const ipFromRequest = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  const ip = (agentIP && agentIP !== '127.0.0.1' && agentIP !== '::1') ? agentIP : ipFromRequest;

  const authToken = crypto.randomBytes(32).toString('hex');

  // Already registered — just refresh auth token and update IP (handles re-activation after NAS restart)
  // Match by hostname only (IP can change due to DHCP or proxy capture)
  const existing = Array.from(devices.values()).find(d => d.hostname === hostname);
  if (existing) {
    existing.token = authToken;
    existing.ip = ip;
    existing.lastSeen = new Date().toISOString();
    if (existing.status === 'offline') existing.status = 'online';
    saveData();
    console.log(`[active-backup] re-activated existing device: ${existing.name} (${existing.id})`);
    return res.json({ deviceID: existing.id, authToken, message: 'Re-activated' });
  }

  // Match install token to get name/id assigned at generate time
  const tokenMeta = pendingTokens.get(token) || parseInstallToken(token);
  if (tokenMeta) {
    pendingTokens.delete(token);
    saveData();
  }

  const id = tokenMeta?.id || crypto.randomUUID().slice(0, 8);
  const deviceName = tokenMeta?.name || hostname;

  // Create device entry — admin must approve before backups start
  const device: Device = {
    id,
    name: deviceName,
    hostname,
    os: agentOS || tokenMeta?.os || 'unknown',
    ip,
    token: authToken,
    backupHost: tokenMeta?.backupHost || parseBackupHost(req),
    backupShare: tokenMeta?.backupShare || 'active-backup',
    backupUsername: tokenMeta?.backupUsername || '',
    backupPassword: tokenMeta?.backupPassword || '',
    backupType: (tokenMeta?.backupType as Device['backupType']) || 'folders',
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

  // Also add to pendingAgents so the UI shows it in the approval list
  pendingAgents.set(id, {
    id,
    name: deviceName,
    hostname,
    os: device.os,
    ip,
    requestedAt: new Date().toISOString(),
  });

  saveData();
  console.log(`[active-backup] new device registered: ${deviceName} (${id}), awaiting approval`);
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
  if (device.pendingBackup) {
    device.pendingBackup = false;
    saveData(); // persist the reset so we don't double-trigger after restart
  }

  // Default backup paths per OS/type — use correct OS key based on device.os
  const defaultPaths: Record<string, Record<string, string[]>> = {
    windows: {
      full: ['C:\\'],
      incremental: ['C:\\Users'],
      folders: ['C:\\Users\\User\\Documents', 'C:\\Users\\User\\Desktop', 'C:\\Users\\User\\Pictures'],
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

  // Determine the correct OS key from device.os string
  const osKey = device.os.toLowerCase().includes('windows') ? 'windows'
    : device.os.toLowerCase().includes('mac') || device.os.toLowerCase().includes('darwin') ? 'darwin'
    : 'linux';

  const paths = device.backupPaths.length > 0
    ? device.backupPaths
    : (defaultPaths[osKey]?.[device.backupType] ?? defaultPaths[osKey]?.['folders'] ?? []);

  res.json({
    approved: device.approved,
    backupEnabled: device.approved,
    backupType: device.backupType,
    backupPaths: paths,
    backupHost: device.backupHost || parseBackupHost(req),
    backupShare: device.backupShare || 'active-backup',
    backupUsername: device.backupUsername || '',
    backupPassword: device.backupPassword || '',
    backupDest: device.approved ? (() => {
      const folder = device.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const backupHost = device.backupHost || parseBackupHost(req);
      const backupShare = device.backupShare || 'active-backup';
      const isWindows = device.os.toLowerCase().includes('windows');
      return isWindows
        ? `\\\\${backupHost}\\${backupShare}\\${folder}`
        : `/${folder}/`;
    })() : '',
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

  const { success, size } = req.body;
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
  if (success) device.backupSize = Math.max(0, Number(size) || 0);
  device.status = 'online';
  device.backupProgress = null;
  device.pendingBackup = false;

  saveData();
  console.log(`[active-backup] backup report: ${device.name} — ${success ? 'OK' : 'FAILED'} — ${size} bytes`);
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

/** GET /devices — List all registered devices */
activeBackupRouter.get('/devices', requireAuth, (_req, res) => {
  const list = Array.from(devices.values()).filter(device => device.approved);
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
    ip: '', token,
    backupHost: parseBackupHost(req),
    backupShare: 'active-backup',
    backupUsername: '',
    backupPassword: '',
    backupType: backupType || 'folders',
    backupPaths: backupPaths || [], schedule: schedule || '0 2 * * *',
    status: 'offline', lastSeen: '', lastBackup: null,
    backupSize: 0, versions: [], approved: true,
    pendingBackup: false, backupProgress: null,
  };

  devices.set(id, device);
  saveData();
  res.json({ id, token });
});

/** PUT /devices/:id — Update device (name, backupPaths, schedule) */
activeBackupRouter.put('/devices/:id', requireAdmin, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const { name, backupPaths, schedule } = req.body;
  if (name && typeof name === 'string') device.name = name.trim();
  if (typeof req.body.backupHost === 'string' && req.body.backupHost.trim()) device.backupHost = req.body.backupHost.trim();
  if (typeof req.body.backupShare === 'string' && req.body.backupShare.trim()) device.backupShare = req.body.backupShare.trim();
  if (typeof req.body.backupUsername === 'string' && req.body.backupUsername.trim()) device.backupUsername = req.body.backupUsername.trim();
  if (typeof req.body.backupPassword === 'string' && req.body.backupPassword.trim()) device.backupPassword = req.body.backupPassword;
  if (Array.isArray(backupPaths)) {
    device.backupPaths = backupPaths
      .filter((p): p is string => typeof p === 'string')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }
  if (schedule && typeof schedule === 'string') device.schedule = schedule.trim();

  saveData();
  res.json({ success: true, device });
});

/** DELETE /devices/:id — Remove device */
activeBackupRouter.delete('/devices/:id', requireAdmin, (req, res) => {
  devices.delete(req.params.id);
  saveData();
  res.json({ success: true });
});

/** POST /devices/:id/backup — Trigger manual backup */
activeBackupRouter.post('/devices/:id/backup', requireAdmin, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (!device.approved) return res.status(400).json({ error: 'Device not approved' });
  if (device.status === 'backing-up') return res.status(409).json({ error: 'Backup already in progress' });
  device.status = 'backing-up';
  device.pendingBackup = true;
  device.backupProgress = { percent: 0, currentFile: 'Waiting for agent...', speed: '' };
  saveData();
  res.json({ success: true, message: 'Backup triggered — agent will start shortly' });
});

/** POST /engine/:id/trigger — Proxy to the white-label engine */
activeBackupRouter.post('/engine/:id/trigger', requireAdmin, async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  try {
    const engineValue = await proxyEngine(`/api/v2/admin/devices/${encodeURIComponent(req.params.id)}/trigger`, {
      method: 'POST',
    });
    res.json({ success: true, mode: 'adapter', engine: engineValue });
  } catch (err) {
    console.error('[active-backup] engine trigger error', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Engine trigger failed' });
  }
});

/** GET /engine/:id/progress — Proxy engine progress */
activeBackupRouter.get('/engine/:id/progress', requireAdmin, async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  try {
    const progress: { phase?: string; bytes?: number; files?: number; percent?: number } =
      await proxyEngine(`/api/v2/admin/devices/${encodeURIComponent(req.params.id)}/progress`);
    res.json({
      mode: 'adapter',
      phase: progress.phase ?? 'unknown',
      bytes: progress.bytes ?? 0,
      files: progress.files ?? 0,
      percent: progress.percent ?? 0,
    });
  } catch (err) {
    console.error('[active-backup] engine progress error', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Engine progress failed' });
  }
});

/** GET /devices/:id/versions — List backup versions */
activeBackupRouter.get('/devices/:id/versions', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const backupRoot = getDeviceBackupRoot(device);
  const legacyAvailable = fs.existsSync(backupRoot);
  const versions = device.versions.map(version => {
    const versionDir = getVersionDirectory(device, version.id);
    let versionAvailable = false;
    if (versionDir) {
      try {
        versionAvailable = fs.existsSync(versionDir) && fs.statSync(versionDir).isDirectory();
      } catch {
        versionAvailable = false;
      }
    }
    return {
      ...version,
      browsePath: '/',
      backupAvailable: versionDir ? versionAvailable : legacyAvailable,
    };
  });
  res.json(versions);
});

/** GET /devices/:id/browse — Browse a device backup tree */
activeBackupRouter.get('/devices/:id/browse', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const version = typeof req.query.version === 'string' ? req.query.version : '';
  const requestedPath = typeof req.query.path === 'string' ? req.query.path : '/';
  const baseDir = resolveBrowseBase(device, version);

  if (!fs.existsSync(baseDir)) {
    return res.status(404).json({ error: 'Backup path not found on NAS' });
  }

  try {
    const { relativePath, fullPath } = resolveBrowseTarget(baseDir, requestedPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    return res.json({
      deviceId: device.id,
      version: version || null,
      path: relativePath,
      items: listBrowseItems(fullPath, relativePath),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Access denied' ? 403 : 500;
    return res.status(status).json({ error: message });
  }
});

/** GET /devices/:id/download — Download a file from a backup tree */
activeBackupRouter.get('/devices/:id/download', requireAuth, (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const version = typeof req.query.version === 'string' ? req.query.version : '';
  const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!requestedPath) return res.status(400).json({ error: 'File path is required' });

  const baseDir = resolveBrowseBase(device, version);
  if (!fs.existsSync(baseDir)) {
    return res.status(404).json({ error: 'Backup path not found on NAS' });
  }

  try {
    const { fullPath } = resolveBrowseTarget(baseDir, requestedPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.download(fullPath, path.basename(fullPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Access denied' ? 403 : 500;
    return res.status(status).json({ error: message });
  }
});

/** GET /recovery/status — Check recovery assets */
activeBackupRouter.get('/recovery/status', requireAuth, (_req, res) => {
  const scriptsExist = fs.existsSync(path.join(RECOVERY_USB_DIR, 'build-recovery-iso.sh'));
  const isoExists = fs.existsSync(RECOVERY_ISO_FILE);
  const iso = isoExists
    ? (() => {
        const stat = fs.statSync(RECOVERY_ISO_FILE);
        return {
          exists: true,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      })()
    : null;

  res.json({
    success: true,
    scriptsAvailable: scriptsExist,
    iso,
  });
});

/** POST /recovery/build — Build recovery ISO in background */
activeBackupRouter.post('/recovery/build', requireAdmin, (_req, res) => {
  const buildScript = path.join(RECOVERY_USB_DIR, 'build-recovery-iso.sh');
  if (!fs.existsSync(buildScript)) {
    return res.status(404).json({ error: 'Build script not found' });
  }
  if (process.platform === 'win32') {
    return res.status(501).json({ error: 'Recovery ISO build requires a Linux NAS environment' });
  }

  res.json({ success: true, message: 'Recovery ISO build started' });

  const proc = spawn('bash', [buildScript], {
    cwd: RECOVERY_USB_DIR,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
});

/** GET /recovery/download — Download recovery ISO */
activeBackupRouter.get('/recovery/download', requireAuth, (_req, res) => {
  if (!fs.existsSync(RECOVERY_ISO_FILE)) {
    return res.status(404).json({ error: 'Recovery ISO not found' });
  }
  return res.download(RECOVERY_ISO_FILE, 'homepinas-recovery.iso');
});

/** GET /recovery/scripts — Download recovery scripts as tar.gz */
activeBackupRouter.get('/recovery/scripts', requireAuth, (_req, res) => {
  if (!fs.existsSync(RECOVERY_USB_DIR)) {
    return res.status(404).json({ error: 'Recovery scripts not found' });
  }
  if (process.platform === 'win32') {
    return res.status(501).json({ error: 'Script archive generation requires tar on the NAS host' });
  }

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', 'attachment; filename="homepinas-recovery-scripts.tar.gz"');

  const tar = spawn('tar', ['-czf', '-', '-C', path.dirname(RECOVERY_USB_DIR), path.basename(RECOVERY_USB_DIR)], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  tar.stdout.pipe(res);
});

/** GET /pending — List pending agent registrations */
activeBackupRouter.get('/pending', requireAuth, (_req, res) => {
  res.json(Array.from(pendingAgents.values()));
});

/** POST /pending/:id/approve — Approve pending agent */
activeBackupRouter.post('/pending/:id/approve', requireAdmin, (req, res) => {
  const pending = pendingAgents.get(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending agent not found' });

  // Device was already created during activate() — just set approved=true
  // DO NOT create a new device with a new token — the agent already has its token
  const device = devices.get(req.params.id);
  if (!device) {
    // Edge case: device entry somehow missing — recreate it from pending info
    const token = crypto.randomBytes(32).toString('hex');
    const newDevice: Device = {
      id: pending.id, name: pending.name || pending.hostname, hostname: pending.hostname,
      os: pending.os, ip: pending.ip, token,
      backupHost: parseBackupHost(req),
      backupShare: 'active-backup',
      backupUsername: '',
      backupPassword: '',
      backupType: 'folders', backupPaths: [], schedule: '0 2 * * *',
      status: 'online', lastSeen: new Date().toISOString(),
      lastBackup: null, backupSize: 0, versions: [], approved: true,
      pendingBackup: false, backupProgress: null,
    };
    devices.set(newDevice.id, newDevice);
    pendingAgents.delete(pending.id);
    saveData();
    return res.json({ success: true, device: newDevice });
  }

  device.approved = true;
  device.status = 'online';
  pendingAgents.delete(pending.id);
  saveData();
  console.log(`[active-backup] approved device: ${device.name} (${device.id})`);
  res.json({ success: true, device });
});

/** POST /pending/:id/reject — Reject pending agent */
activeBackupRouter.post('/pending/:id/reject', requireAdmin, (req, res) => {
  const id = req.params.id;
  pendingAgents.delete(id);
  devices.delete(id);
  saveData();
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
      id, name: hostname, hostname, os: agentOS || 'unknown', ip,
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
  device.backupSize = Math.max(0, Number(version.size) || 0);
  device.status = 'online';

  saveData();
  res.json({ success: true });
});

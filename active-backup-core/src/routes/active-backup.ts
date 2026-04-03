import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { devices, parseInstallToken, pendingAgents, pendingTokens, saveState, signInstallToken } from '../state.js';
import type { BackupType, Device, InstallTokenMeta, PendingAgent } from '../types.js';

export const activeBackupRouter = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  if (req.headers['x-ab-admin-token'] !== config.adminToken) {
    res.status(401).json({ error: 'Admin token required' });
    return;
  }
  next();
}

function parseBackupHost(req: Request) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  return host || '127.0.0.1';
}

function normalizeArch(platform: string, arch: string) {
  if (platform === 'windows') return 'amd64';
  return arch === 'arm64' || arch === 'aarch64' ? 'arm64' : 'amd64';
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function deviceBackupRoot(device: Device) {
  const candidates = [slugify(device.name), slugify(device.hostname), device.id].filter(Boolean);
  for (const candidate of candidates) {
    const dir = path.join(config.backupDir, candidate);
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(config.backupDir, candidates[0] || device.id);
}

function normalizeBrowsePath(input: string) {
  const sanitized = (input || '/').replace(/\0/g, '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(sanitized.startsWith('/') ? sanitized : `/${sanitized}`);
  return normalized === '.' ? '/' : normalized;
}

function resolveBrowseTarget(baseDir: string, requestedPath: string) {
  const baseResolved = path.resolve(baseDir);
  const normalized = normalizeBrowsePath(requestedPath);
  const relativePath = normalized === '/' ? '' : normalized.slice(1);
  const fullPath = path.resolve(baseResolved, relativePath);
  if (fullPath !== baseResolved && !fullPath.startsWith(baseResolved + path.sep)) {
    throw new Error('Access denied');
  }
  return { relativePath: normalized, fullPath };
}

function resolveDevicePaths(device: Device) {
  const lowerOs = device.os.toLowerCase();
  if (device.backupPaths.length > 0) return device.backupPaths;
  if (lowerOs.includes('windows')) {
    if (device.backupType === 'full') return ['C:\\'];
    if (device.backupType === 'incremental') return ['C:\\Users'];
    return ['C:\\Users\\User\\Documents', 'C:\\Users\\User\\Desktop', 'C:\\Users\\User\\Pictures'];
  }
  if (lowerOs.includes('mac')) {
    return device.backupType === 'full' ? ['/'] : ['/Users'];
  }
  return device.backupType === 'full' ? ['/'] : ['/home'];
}

activeBackupRouter.get('/agent/binary/:platform', (req, res) => {
  const platform = req.params.platform;
  const arch = normalizeArch(platform, String(req.query.arch || 'amd64'));
  const fileMap: Record<string, string> = {
    windows: `agent-windows-${arch}.exe`,
    darwin: `agent-darwin-${arch}`,
    linux: `agent-linux-${arch}`,
  };
  const filename = fileMap[platform];
  if (!filename) return res.status(400).json({ error: 'Unknown platform' });
  const fullPath = path.join(config.agentBinDir, filename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: `Binary not found: ${filename}` });
  }
  return res.download(fullPath, filename);
});

activeBackupRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    devices: devices.size,
    pendingAgents: pendingAgents.size,
    pendingTokens: pendingTokens.size,
  });
});

activeBackupRouter.post('/agent/generate/:platform', (req, res) => requireAdmin(req, res, () => {
  const platform = req.params.platform;
  const backupType = (req.body?.backupType || 'incremental') as BackupType;
  if (!['windows', 'linux', 'mac'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const backupUsername = String(req.body?.backupUsername || '').trim();
  const backupPassword = String(req.body?.backupPassword || '').trim();
  if (!backupUsername || !backupPassword) {
    return res.status(400).json({ error: 'Backup username and password are required' });
  }

  const id = crypto.randomUUID().slice(0, 8);
  const meta: InstallTokenMeta = {
    id,
    name: String(req.body?.name || `${platform}-${id}`).trim(),
    os: platform === 'windows' ? 'Windows' : platform === 'mac' ? 'macOS' : 'Linux',
    backupType,
    backupHost: parseBackupHost(req),
    backupShare: String(req.body?.backupShare || 'active-backup').trim(),
    backupUsername,
    backupPassword,
    issuedAt: new Date().toISOString(),
  };
  const token = signInstallToken(meta);
  pendingTokens.set(token, meta);
  saveState();

  const arch = normalizeArch(platform, String(req.body?.arch || 'amd64'));
  const binaryPlatform = platform === 'mac' ? 'darwin' : platform;
  const binaryUrl = `${config.publicBaseUrl}/api/active-backup/agent/binary/${binaryPlatform}?arch=${arch}`;
  const installCommand = `hp-agent --install --nas ${config.publicBaseUrl} --token ${token} --backup-type ${backupType}`;

  return res.json({
    deviceID: id,
    token,
    arch,
    binaryUrl,
    installCommand,
  });
}));

activeBackupRouter.post('/agent/activate', (req, res) => {
  const token = String(req.body?.token || '');
  const hostname = String(req.body?.hostname || '').trim();
  if (!token || !hostname) return res.status(400).json({ error: 'token and hostname required' });

  const tokenMeta = pendingTokens.get(token) || parseInstallToken(token);
  if (tokenMeta) {
    pendingTokens.delete(token);
  }

  const existing = Array.from(devices.values()).find((device) => device.hostname === hostname);
  const authToken = crypto.randomBytes(32).toString('hex');
  if (existing) {
    existing.token = authToken;
    existing.lastSeen = new Date().toISOString();
    existing.ip = String(req.body?.ip || req.ip || 'unknown');
    if (existing.status === 'offline') existing.status = 'online';
    saveState();
    return res.json({ deviceID: existing.id, authToken, message: 'Re-activated' });
  }

  const id = tokenMeta?.id || crypto.randomUUID().slice(0, 8);
  const device: Device = {
    id,
    name: tokenMeta?.name || hostname,
    hostname,
    os: String(req.body?.os || tokenMeta?.os || 'unknown'),
    ip: String(req.body?.ip || req.ip || 'unknown'),
    token: authToken,
    backupHost: tokenMeta?.backupHost || parseBackupHost(req),
    backupShare: tokenMeta?.backupShare || 'active-backup',
    backupUsername: tokenMeta?.backupUsername || '',
    backupPassword: tokenMeta?.backupPassword || '',
    backupType: tokenMeta?.backupType || 'folders',
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
  const pending: PendingAgent = {
    id,
    name: device.name,
    hostname,
    os: device.os,
    ip: device.ip,
    requestedAt: new Date().toISOString(),
  };
  devices.set(id, device);
  pendingAgents.set(id, pending);
  saveState();
  return res.json({ deviceID: id, authToken, message: 'Registered, waiting for admin approval' });
});

activeBackupRouter.get('/agent/:id/config', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });

  device.lastSeen = new Date().toISOString();
  if (device.status !== 'backing-up') device.status = 'online';
  const triggerBackup = device.pendingBackup;
  if (triggerBackup) device.pendingBackup = false;
  saveState();

  return res.json({
    approved: device.approved,
    backupEnabled: device.approved,
    backupType: device.backupType,
    backupPaths: resolveDevicePaths(device),
    backupHost: device.backupHost,
    backupShare: device.backupShare,
    backupUsername: device.backupUsername,
    backupPassword: device.backupPassword,
    backupDest: device.approved ? (device.os.toLowerCase().includes('windows')
      ? `\\\\${device.backupHost}\\${device.backupShare}\\${slugify(device.name)}`
      : `/${slugify(device.name)}/`) : '',
    triggerBackup,
    schedule: device.schedule,
  });
});

activeBackupRouter.post('/agent/:id/progress', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });
  device.status = 'backing-up';
  device.backupProgress = {
    percent: Math.max(0, Math.min(100, Number(req.body?.percent || 0))),
    currentFile: String(req.body?.currentFile || ''),
    speed: String(req.body?.speed || ''),
  };
  device.lastSeen = new Date().toISOString();
  saveState();
  res.json({ success: true });
});

activeBackupRouter.post('/agent/:id/report', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) return res.status(401).json({ error: 'Invalid token' });
  const success = Boolean(req.body?.success);
  const size = Math.max(0, Number(req.body?.size || 0));
  const version = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    size,
    type: device.backupType === 'incremental' ? 'incremental' : 'full',
    status: success ? 'complete' : 'failed',
  } as const;
  device.versions.unshift(version);
  device.lastBackup = version.timestamp;
  if (success) device.backupSize = size;
  device.status = 'online';
  device.pendingBackup = false;
  device.backupProgress = null;
  saveState();
  res.json({ success: true });
});

activeBackupRouter.get('/devices', (req, res) => requireAdmin(req, res, () => {
  res.json(Array.from(devices.values()));
}));

activeBackupRouter.get('/pending', (req, res) => requireAdmin(req, res, () => {
  res.json(Array.from(pendingAgents.values()));
}));

activeBackupRouter.post('/pending/:id/approve', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  device.approved = true;
  pendingAgents.delete(req.params.id);
  saveState();
  return res.json({ success: true, device });
}));

activeBackupRouter.post('/pending/:id/reject', (req, res) => requireAdmin(req, res, () => {
  pendingAgents.delete(req.params.id);
  devices.delete(req.params.id);
  saveState();
  return res.json({ success: true });
}));

activeBackupRouter.post('/devices', (req, res) => requireAdmin(req, res, () => {
  const id = crypto.randomUUID().slice(0, 8);
  const token = crypto.randomBytes(32).toString('hex');
  const device: Device = {
    id,
    name: String(req.body?.name || req.body?.hostname || id),
    hostname: String(req.body?.hostname || id),
    os: String(req.body?.os || 'unknown'),
    ip: '',
    token,
    backupHost: parseBackupHost(req),
    backupShare: 'active-backup',
    backupUsername: '',
    backupPassword: '',
    backupType: (req.body?.backupType || 'folders') as BackupType,
    backupPaths: Array.isArray(req.body?.backupPaths) ? req.body.backupPaths : [],
    schedule: String(req.body?.schedule || '0 2 * * *'),
    status: 'offline',
    lastSeen: '',
    lastBackup: null,
    backupSize: 0,
    versions: [],
    approved: true,
    pendingBackup: false,
    backupProgress: null,
  };
  devices.set(id, device);
  saveState();
  return res.json({ id, token });
}));

activeBackupRouter.delete('/devices/:id', (req, res) => requireAdmin(req, res, () => {
  devices.delete(req.params.id);
  pendingAgents.delete(req.params.id);
  saveState();
  return res.json({ success: true });
}));

activeBackupRouter.post('/devices/:id/backup', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (device.status === 'backing-up') return res.status(409).json({ error: 'Backup already in progress' });
  device.status = 'backing-up';
  device.pendingBackup = true;
  device.backupProgress = { percent: 0, currentFile: 'Waiting for agent...', speed: '' };
  saveState();
  return res.json({ success: true });
}));

activeBackupRouter.get('/devices/:id/browse', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const root = deviceBackupRoot(device);
  if (!fs.existsSync(root)) return res.status(404).json({ error: 'Backup path not found' });
  try {
    const { relativePath, fullPath } = resolveBrowseTarget(root, String(req.query.path || '/'));
    const items = fs.readdirSync(fullPath, { withFileTypes: true }).map((entry) => {
      const entryPath = path.join(fullPath, entry.name);
      const stat = fs.statSync(entryPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
        path: relativePath === '/' ? `/${entry.name}` : `${relativePath}/${entry.name}`,
      };
    }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
    return res.json({ path: relativePath, items });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
  }
}));

activeBackupRouter.get('/devices/:id/download', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const root = deviceBackupRoot(device);
  if (!fs.existsSync(root)) return res.status(404).json({ error: 'Backup path not found' });
  try {
    const { fullPath } = resolveBrowseTarget(root, String(req.query.path || ''));
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.download(fullPath, path.basename(fullPath));
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
  }
}));

activeBackupRouter.get('/recovery/status', (req, res) => requireAdmin(req, res, () => {
  const isoPath = path.join(config.recoveryDir, 'homepinas-recovery.iso');
  const iso = fs.existsSync(isoPath)
    ? (() => {
        const stat = fs.statSync(isoPath);
        return { exists: true, size: stat.size, modified: stat.mtime.toISOString() };
      })()
    : null;
  return res.json({
    success: true,
    scriptsAvailable: fs.existsSync(path.join(config.recoveryDir, 'build-recovery-iso.sh')),
    iso,
  });
}));

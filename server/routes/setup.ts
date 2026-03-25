/**
 * Setup Wizard REST endpoint — secured
 */

import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../middleware/auth.js';
import { setupLimiter } from '../middleware/rate-limit.js';
import { audit } from '../middleware/audit.js';

export const setupRouter = Router();
const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SALT_ROUNDS = 12;

// Validation helpers
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/;
const DEVICE_RE = /^\/dev\/(sd[a-z][0-9]*|nvme[0-9]+n[0-9]+(p[0-9]+)?)$/;
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const ALLOWED_FS = ['ext4', 'btrfs', 'xfs'] as const;

function isValidHostname(h: string): boolean {
  return typeof h === 'string' && HOSTNAME_RE.test(h);
}
function isValidDevice(d: string): boolean {
  return typeof d === 'string' && DEVICE_RE.test(d);
}
function isValidIp(ip: string | undefined): boolean {
  return typeof ip === 'string' && IP_RE.test(ip);
}
function isValidFs(f: string): f is (typeof ALLOWED_FS)[number] {
  return (ALLOWED_FS as readonly string[]).includes(f);
}

// User helpers
interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'readonly';
  twoFactor: boolean;
  lastLogin: string;
  status: 'active' | 'locked';
}

function loadUsers(): User[] {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return []; }
}
function saveUsers(users: User[]): void {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadSettings(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

interface StepResult { step: string; status: 'ok' | 'error'; message: string; }

async function runStep(name: string, fn: () => Promise<string>): Promise<StepResult> {
  try {
    const message = await fn();
    return { step: name, status: 'ok', message };
  } catch (err: unknown) {
    return { step: name, status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Write a line to fstab safely using temp file + sudo cp */
async function appendToFstab(line: string): Promise<void> {
  const fstabPath = '/etc/fstab';
  const fstabContent = fs.readFileSync(fstabPath, 'utf-8');
  if (fstabContent.includes(line.split('  ')[0])) return; // Already present (check UUID)
  const newContent = fstabContent.trimEnd() + '\n' + line + '\n';
  const tmpFile = path.join(DATA_DIR, 'fstab.tmp');
  fs.writeFileSync(tmpFile, newContent);
  await execFileAsync('sudo', ['cp', tmpFile, fstabPath], { timeout: 5_000 });
  fs.unlinkSync(tmpFile);
}

interface SetupBody {
  language: string;
  hostname: string;
  username: string;
  password: string;
  networkMode: 'dhcp' | 'static';
  staticIp?: string;
  gateway?: string;
  dns?: string;
  poolMode: 'snapraid' | 'mirror' | 'basic';
  poolFs: 'ext4' | 'btrfs' | 'xfs';
  selectedDisks: string[];
  parityDisks: string[];
  dataDisks: string[];
  cacheDisks: string[];
}

/** GET /api/setup/status — public (needed before login) */
setupRouter.get('/status', (_req: Request, res: Response) => {
  const settings = loadSettings();
  res.json({ setupCompleted: !!settings.setupCompleted });
});

/** POST /api/setup/apply — first-time: public+rate-limited; re-setup: admin only */
setupRouter.post('/apply', setupLimiter, async (req: Request, res: Response) => {
  const settings = loadSettings();

  // If setup already completed, require admin auth
  if (settings.setupCompleted) {
    // Manual auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Setup already completed. Admin authentication required.' });
    }
    try {
      const { verifyToken } = await import('../middleware/auth.js');
      const payload = verifyToken(authHeader.slice(7));
      if (payload.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required for re-setup' });
      }
      req.user = payload;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  const body = req.body as SetupBody;
  const results: StepResult[] = [];

  audit('setup_started', { user: req.user?.username || body.username, ip: req.ip || 'unknown' });

  // Pre-flight validation
  if (!body.username || !body.password || body.password.length < 8) {
    return res.status(400).json({ error: 'Username and password (min 8 chars) required' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(body.username)) {
    return res.status(400).json({ error: 'Username contains invalid characters' });
  }
  if (!isValidHostname(body.hostname)) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }
  if (!isValidFs(body.poolFs)) {
    return res.status(400).json({ error: 'Invalid filesystem type' });
  }

  const allDevices = [...body.selectedDisks, ...body.parityDisks, ...body.dataDisks, ...body.cacheDisks];
  for (const dev of allDevices) {
    if (!isValidDevice(dev)) {
      return res.status(400).json({ error: `Invalid device path: ${dev}` });
    }
  }

  if (body.networkMode === 'static') {
    if (!isValidIp(body.staticIp)) return res.status(400).json({ error: 'Invalid static IP address' });
    if (body.gateway && !isValidIp(body.gateway)) return res.status(400).json({ error: 'Invalid gateway address' });
    if (body.dns && !isValidIp(body.dns)) return res.status(400).json({ error: 'Invalid DNS address' });
  }

  // Step 1: Create admin user (bcrypt)
  results.push(await runStep('create-admin', async () => {
    const users = loadUsers();
    const admin: User = {
      id: Date.now(),
      username: body.username,
      passwordHash: bcrypt.hashSync(body.password, SALT_ROUNDS),
      role: 'admin',
      twoFactor: false,
      lastLogin: '-',
      status: 'active',
    };
    const filtered = users.filter(u => u.username !== body.username);
    filtered.push(admin);
    saveUsers(filtered);
    return `Admin user "${body.username}" created`;
  }));

  // Step 2: Set hostname
  results.push(await runStep('set-hostname', async () => {
    await execFileAsync('sudo', ['hostnamectl', 'set-hostname', body.hostname], { timeout: 15_000 });
    return `Hostname set to "${body.hostname}"`;
  }));

  // Step 3: Configure network
  results.push(await runStep('configure-network', async () => {
    const { stdout: conList } = await execFileAsync('nmcli', [
      '-t', '-f', 'NAME,DEVICE,TYPE', 'connection', 'show', '--active',
    ], { timeout: 10_000 });
    const lines = conList.trim().split('\n').filter(Boolean);
    const ethLine = lines.find(l => l.includes('ethernet')) || lines[0];
    if (!ethLine) throw new Error('No active network connection found');
    const conName = ethLine.split(':')[0];

    if (body.networkMode === 'static') {
      await execFileAsync('sudo', [
        'nmcli', 'connection', 'modify', conName,
        'ipv4.method', 'manual',
        'ipv4.addresses', body.staticIp!,
        ...(body.gateway ? ['ipv4.gateway', body.gateway] : []),
        ...(body.dns ? ['ipv4.dns', body.dns] : []),
      ], { timeout: 15_000 });
      await execFileAsync('sudo', ['nmcli', 'connection', 'up', conName], { timeout: 15_000 });
      return `Static IP ${body.staticIp} applied on "${conName}"`;
    } else {
      await execFileAsync('sudo', [
        'nmcli', 'connection', 'modify', conName,
        'ipv4.method', 'auto', 'ipv4.addresses', '', 'ipv4.gateway', '', 'ipv4.dns', '',
      ], { timeout: 15_000 });
      await execFileAsync('sudo', ['nmcli', 'connection', 'up', conName], { timeout: 15_000 });
      return `DHCP enabled on "${conName}"`;
    }
  }));

  // Step 4: Format and mount disks
  const diskRoles: Record<string, string> = {};
  for (const d of body.dataDisks) diskRoles[d] = 'data';
  for (const d of body.parityDisks) diskRoles[d] = 'parity';
  for (const d of body.cacheDisks) diskRoles[d] = 'cache';
  for (const d of body.selectedDisks) { if (!diskRoles[d]) diskRoles[d] = 'data'; }

  // Format ALL disks in parallel (much faster than sequential)
  const formatPromises = Object.entries(diskRoles).map(([device, role]) =>
    runStep(`format-${device}`, async () => {
      const mkfsCmd = `mkfs.${body.poolFs}`;
      const mkfsArgs = body.poolFs === 'xfs' ? ['-f', device] : [device];
      await execFileAsync('sudo', [mkfsCmd, ...mkfsArgs], { timeout: 600_000 });

      const baseName = device.replace(/^\/dev\//, '').replace(/\//g, '-');
      const mountBase = role === 'cache' ? '/mnt/cache' : role === 'parity' ? '/mnt/parity' : '/mnt/storage';
      const mountPoint = `${mountBase}/${baseName}`;

      await execFileAsync('sudo', ['mkdir', '-p', mountPoint], { timeout: 5_000 });

      const { stdout: blkid } = await execFileAsync('sudo', [
        'blkid', '-s', 'UUID', '-o', 'value', device,
      ], { timeout: 10_000 });
      const uuid = blkid.trim();

      const fstabLine = `UUID=${uuid}  ${mountPoint}  ${body.poolFs}  defaults,nofail  0  2`;
      await appendToFstab(fstabLine);

      await execFileAsync('sudo', ['mount', mountPoint], { timeout: 30_000 });
      return `${device} formatted (${body.poolFs}), mounted at ${mountPoint}`;
    })
  );

  const formatResults = await Promise.all(formatPromises);
  results.push(...formatResults);

  // Step 5: Configure SnapRAID
  if (body.poolMode === 'snapraid' && body.parityDisks.length > 0) {
    results.push(await runStep('configure-snapraid', async () => {
      const confLines: string[] = [];
      body.parityDisks.forEach((dev, i) => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        const label = i === 0 ? 'parity' : `${i + 1}-parity`;
        confLines.push(`${label} /mnt/storage/${baseName}/snapraid.parity`);
      });
      confLines.push('');
      const firstParity = body.parityDisks[0].replace(/^\/dev\//, '').replace(/\//g, '-');
      confLines.push(`content /mnt/storage/${firstParity}/snapraid.content`);
      body.dataDisks.forEach(dev => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        confLines.push(`content /mnt/storage/${baseName}/snapraid.content`);
      });
      confLines.push('');
      body.dataDisks.forEach((dev, i) => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        confLines.push(`data d${i} /mnt/storage/${baseName}/`);
      });
      confLines.push('');
      confLines.push('exclude *.unrecoverable', 'exclude /tmp/', 'exclude /lost+found/');

      const tmpFile = path.join(DATA_DIR, 'snapraid.conf.tmp');
      fs.writeFileSync(tmpFile, confLines.join('\n') + '\n');
      await execFileAsync('sudo', ['cp', tmpFile, '/etc/snapraid.conf'], { timeout: 5_000 });
      fs.unlinkSync(tmpFile);
      return `SnapRAID configured with ${body.parityDisks.length} parity and ${body.dataDisks.length} data disk(s)`;
    }));
  }

  // Step 6: Configure MergerFS
  if (body.dataDisks.length > 1) {
    results.push(await runStep('configure-mergerfs', async () => {
      const branches = body.dataDisks.map(dev => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        return `/mnt/storage/${baseName}`;
      });
      const mergedMount = '/mnt/storage';
      const branchStr = branches.join(':');
      const mergerfsOpts = 'defaults,allow_other,use_ino,category.create=mfs,moveonenospc=true,minfreespace=4G,fsname=mergerfs';

      await execFileAsync('sudo', ['mkdir', '-p', mergedMount], { timeout: 5_000 });

      // Safe fstab write
      const fstabLine = `${branchStr}  ${mergedMount}  fuse.mergerfs  ${mergerfsOpts}  0  0`;
      await appendToFstab(fstabLine);

      await execFileAsync('sudo', ['mergerfs', '-o', mergerfsOpts, branchStr, mergedMount], { timeout: 15_000 });
      return `MergerFS pool created at ${mergedMount} from ${branches.length} disks`;
    }));
  }

  // Step 7: Save settings — ONLY mark completed if critical steps passed
  const criticalSteps = ['create-admin', 'set-hostname'];
  const criticalFailed = results.some(r => criticalSteps.includes(r.step) && r.status === 'error');
  const hasErrors = results.some(r => r.status === 'error');

  results.push(await runStep('save-settings', async () => {
    const currentSettings = loadSettings();
    Object.assign(currentSettings, {
      hostname: body.hostname,
      language: body.language,
      poolMode: body.poolMode,
      poolFs: body.poolFs,
      networkMode: body.networkMode,
      staticIp: body.staticIp || null,
      gateway: body.gateway || null,
      dns: body.dns || null,
      diskRoles,
      selectedDisks: body.selectedDisks,
      parityDisks: body.parityDisks,
      dataDisks: body.dataDisks,
      cacheDisks: body.cacheDisks,
      setupCompleted: !criticalFailed, // Only true if critical steps passed
      setupDate: new Date().toISOString(),
    });
    saveSettings(currentSettings);
    return criticalFailed
      ? 'Settings saved but setup NOT marked as completed due to critical failures'
      : 'Settings saved to data/settings.json';
  }));

  if (criticalFailed) {
    audit('setup_failed', { user: body.username, details: results.filter(r => r.status === 'error').map(r => r.step).join(', ') });
  } else {
    audit('setup_completed', { user: body.username });
  }

  res.status(hasErrors ? 207 : 200).json({ success: !criticalFailed, steps: results });
});

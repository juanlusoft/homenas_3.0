/**
 * Setup Wizard REST endpoint — POST /api/setup/apply
 * Applies initial system configuration: user, hostname, network, disks, RAID, pool.
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const setupRouter = Router();
const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// User helpers (mirrored from users.ts)
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'readonly';
  twoFactor: boolean;
  lastLogin: string;
  status: 'active' | 'locked';
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'homepinas-salt').digest('hex');
}

function loadUsers(): User[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users: User[]): void {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

interface StepResult {
  step: string;
  status: 'ok' | 'error';
  message: string;
}

async function runStep(name: string, fn: () => Promise<string>): Promise<StepResult> {
  try {
    const message = await fn();
    return { step: name, status: 'ok', message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { step: name, status: 'error', message };
  }
}

// ---------------------------------------------------------------------------
// Request body interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /api/setup/apply
// ---------------------------------------------------------------------------

/** GET /api/setup/status — Check if initial setup has been completed */
setupRouter.get('/status', (_req, res) => {
  const settings = loadSettings();
  res.json({ setupCompleted: !!settings.setupCompleted });
});

/** POST /api/setup/apply */
setupRouter.post('/apply', async (req, res) => {
  const body = req.body as SetupBody;
  const results: StepResult[] = [];

  // ── Pre-flight validation ───────────────────────────────────────────
  if (!body.username || !body.password || body.password.length < 6) {
    return res.status(400).json({ error: 'Username and password (min 6 chars) required' });
  }
  if (!isValidHostname(body.hostname)) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }
  if (!isValidFs(body.poolFs)) {
    return res.status(400).json({ error: 'Invalid filesystem type' });
  }

  const allDevices = [
    ...body.selectedDisks,
    ...body.parityDisks,
    ...body.dataDisks,
    ...body.cacheDisks,
  ];
  for (const dev of allDevices) {
    if (!isValidDevice(dev)) {
      return res.status(400).json({ error: `Invalid device path: ${dev}` });
    }
  }

  if (body.networkMode === 'static') {
    if (!isValidIp(body.staticIp)) {
      return res.status(400).json({ error: 'Invalid static IP address' });
    }
    if (body.gateway && !isValidIp(body.gateway)) {
      return res.status(400).json({ error: 'Invalid gateway address' });
    }
    if (body.dns && !isValidIp(body.dns)) {
      return res.status(400).json({ error: 'Invalid DNS address' });
    }
  }

  // ── Step 1: Create admin user ───────────────────────────────────────
  results.push(await runStep('create-admin', async () => {
    const users = loadUsers();
    // Replace existing users list with the new admin
    const admin: User = {
      id: Date.now(),
      username: body.username,
      passwordHash: hashPassword(body.password),
      role: 'admin',
      twoFactor: false,
      lastLogin: '-',
      status: 'active',
    };
    // Keep any other users, but remove prior admins with the same name
    const filtered = users.filter(u => u.username !== body.username);
    filtered.push(admin);
    saveUsers(filtered);
    return `Admin user "${body.username}" created`;
  }));

  // ── Step 2: Set hostname ────────────────────────────────────────────
  results.push(await runStep('set-hostname', async () => {
    await execFileAsync('sudo', ['hostnamectl', 'set-hostname', body.hostname], {
      timeout: 15_000,
    });
    return `Hostname set to "${body.hostname}"`;
  }));

  // ── Step 3: Configure network ───────────────────────────────────────
  results.push(await runStep('configure-network', async () => {
    // Find the primary connection name
    const { stdout: conList } = await execFileAsync('nmcli', [
      '-t', '-f', 'NAME,DEVICE,TYPE', 'connection', 'show', '--active',
    ], { timeout: 10_000 });

    const lines = conList.trim().split('\n').filter(Boolean);
    // Pick first ethernet connection
    const ethLine = lines.find(l => l.includes('ethernet')) || lines[0];
    if (!ethLine) throw new Error('No active network connection found');
    const conName = ethLine.split(':')[0];

    if (body.networkMode === 'static') {
      // Set static IP
      await execFileAsync('sudo', [
        'nmcli', 'connection', 'modify', conName,
        'ipv4.method', 'manual',
        'ipv4.addresses', body.staticIp!,
        ...(body.gateway ? ['ipv4.gateway', body.gateway] : []),
        ...(body.dns ? ['ipv4.dns', body.dns] : []),
      ], { timeout: 15_000 });

      await execFileAsync('sudo', [
        'nmcli', 'connection', 'up', conName,
      ], { timeout: 15_000 });

      return `Static IP ${body.staticIp} applied on "${conName}"`;
    } else {
      // Ensure DHCP
      await execFileAsync('sudo', [
        'nmcli', 'connection', 'modify', conName,
        'ipv4.method', 'auto',
        'ipv4.addresses', '',
        'ipv4.gateway', '',
        'ipv4.dns', '',
      ], { timeout: 15_000 });

      await execFileAsync('sudo', [
        'nmcli', 'connection', 'up', conName,
      ], { timeout: 15_000 });

      return `DHCP enabled on "${conName}"`;
    }
  }));

  // ── Step 4: Format and mount disks ──────────────────────────────────
  const diskRoles: Record<string, string> = {};

  // Classify each disk
  for (const d of body.dataDisks) diskRoles[d] = 'data';
  for (const d of body.parityDisks) diskRoles[d] = 'parity';
  for (const d of body.cacheDisks) diskRoles[d] = 'cache';
  // selectedDisks that aren't already classified default to data
  for (const d of body.selectedDisks) {
    if (!diskRoles[d]) diskRoles[d] = 'data';
  }

  for (const [device, role] of Object.entries(diskRoles)) {
    results.push(await runStep(`format-${device}`, async () => {
      // Format
      const mkfsCmd = `mkfs.${body.poolFs}`;
      const mkfsArgs = body.poolFs === 'xfs' ? ['-f', device] : [device];
      await execFileAsync('sudo', [mkfsCmd, ...mkfsArgs], {
        timeout: 300_000, // 5 min for large disks
      });

      // Determine mount point
      const baseName = device.replace(/^\/dev\//, '').replace(/\//g, '-');
      const mountBase = role === 'cache' ? '/mnt/cache' : '/mnt/storage';
      const mountPoint = `${mountBase}/${baseName}`;

      // Create mount point
      await execFileAsync('sudo', ['mkdir', '-p', mountPoint], { timeout: 5_000 });

      // Get UUID for fstab
      const { stdout: blkid } = await execFileAsync('sudo', [
        'blkid', '-s', 'UUID', '-o', 'value', device,
      ], { timeout: 10_000 });
      const uuid = blkid.trim();

      // Add to fstab (only if not already present)
      const fstabPath = '/etc/fstab';
      const fstabContent = fs.readFileSync(fstabPath, 'utf-8');
      const fstabLine = `UUID=${uuid}  ${mountPoint}  ${body.poolFs}  defaults,nofail  0  2`;
      if (!fstabContent.includes(uuid)) {
        await execFileAsync('sudo', [
          'bash', '-c', `echo '${fstabLine}' >> ${fstabPath}`,
        ], { timeout: 5_000 });
      }

      // Mount
      await execFileAsync('sudo', ['mount', mountPoint], { timeout: 30_000 });

      return `${device} formatted (${body.poolFs}), mounted at ${mountPoint}`;
    }));
  }

  // ── Step 5: Configure SnapRAID ──────────────────────────────────────
  if (body.poolMode === 'snapraid' && body.parityDisks.length > 0) {
    results.push(await runStep('configure-snapraid', async () => {
      const lines: string[] = [];

      // Parity disks
      body.parityDisks.forEach((dev, i) => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        const parityPath = `/mnt/storage/${baseName}/snapraid.parity`;
        const label = i === 0 ? 'parity' : `${i + 1}-parity`;
        lines.push(`${label} ${parityPath}`);
      });

      lines.push('');

      // Content files (one per data disk + one on parity)
      const firstParity = body.parityDisks[0].replace(/^\/dev\//, '').replace(/\//g, '-');
      lines.push(`content /mnt/storage/${firstParity}/snapraid.content`);
      body.dataDisks.forEach(dev => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        lines.push(`content /mnt/storage/${baseName}/snapraid.content`);
      });

      lines.push('');

      // Data disks
      body.dataDisks.forEach((dev, i) => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        lines.push(`data d${i} /mnt/storage/${baseName}/`);
      });

      lines.push('');

      // Exclusions
      lines.push('exclude *.unrecoverable');
      lines.push('exclude /tmp/');
      lines.push('exclude /lost+found/');

      const confContent = lines.join('\n') + '\n';

      // Write config via temp file to avoid shell injection
      const tmpFile = path.join(DATA_DIR, 'snapraid.conf.tmp');
      fs.writeFileSync(tmpFile, confContent);
      await execFileAsync('sudo', ['cp', tmpFile, '/etc/snapraid.conf'], { timeout: 5_000 });
      fs.unlinkSync(tmpFile);

      return `SnapRAID configured with ${body.parityDisks.length} parity and ${body.dataDisks.length} data disk(s)`;
    }));
  }

  // ── Step 6: Configure MergerFS ──────────────────────────────────────
  if (body.dataDisks.length > 1) {
    results.push(await runStep('configure-mergerfs', async () => {
      // Build the branch list from data disk mount points
      const branches = body.dataDisks.map(dev => {
        const baseName = dev.replace(/^\/dev\//, '').replace(/\//g, '-');
        return `/mnt/storage/${baseName}`;
      });

      const mergedMount = '/mnt/storage';
      const branchStr = branches.join(':');
      const mergerfsOpts = 'defaults,allow_other,use_ino,category.create=mfs,moveonenospc=true,minfreespace=4G,fsname=mergerfs';

      // Create the merged mount point
      await execFileAsync('sudo', ['mkdir', '-p', mergedMount], { timeout: 5_000 });

      // Add mergerfs to fstab
      const fstabPath = '/etc/fstab';
      const fstabContent = fs.readFileSync(fstabPath, 'utf-8');
      const fstabLine = `${branchStr}  ${mergedMount}  fuse.mergerfs  ${mergerfsOpts}  0  0`;

      if (!fstabContent.includes('fuse.mergerfs')) {
        await execFileAsync('sudo', [
          'bash', '-c', `echo '${fstabLine}' >> ${fstabPath}`,
        ], { timeout: 5_000 });
      }

      // Mount
      await execFileAsync('sudo', [
        'mergerfs', '-o', mergerfsOpts, branchStr, mergedMount,
      ], { timeout: 15_000 });

      return `MergerFS pool created at ${mergedMount} from ${branches.length} disks`;
    }));
  }

  // ── Step 7: Save settings ───────────────────────────────────────────
  results.push(await runStep('save-settings', async () => {
    const settings = loadSettings();
    Object.assign(settings, {
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
      setupCompleted: true,
      setupDate: new Date().toISOString(),
    });
    saveSettings(settings);
    return 'Settings saved to data/settings.json';
  }));

  // ── Response ────────────────────────────────────────────────────────
  const hasErrors = results.some(r => r.status === 'error');
  res.status(hasErrors ? 207 : 200).json({
    success: !hasErrors,
    steps: results,
  });
});

/**
 * Shares REST endpoints — Samba + NFS management (secured)
 */

import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

export const sharesRouter = Router();
const execFileAsync = promisify(execFile);

const SHARES_FILE = path.join(process.cwd(), 'data', 'shares.json');

// Allowed base paths for shares
const ALLOWED_BASES = ['/mnt/storage', '/mnt/cache', '/srv', '/home'];

// Validation
const SHARE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,62}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

interface Share {
  id: string;
  name: string;
  path: string;
  protocol: 'smb' | 'nfs';
  status: 'active' | 'inactive';
  accessMode: 'read-write' | 'read-only';
  allowedUsers: string[];
  connectedClients: number;
}

function loadShares(): Share[] {
  try { return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf-8')); }
  catch { return []; }
}

function saveShares(shares: Share[]): void {
  fs.mkdirSync(path.dirname(SHARES_FILE), { recursive: true });
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

function isValidSharePath(sharePath: string): boolean {
  // Resolve to catch traversal attempts
  const resolved = path.resolve(sharePath);
  return ALLOWED_BASES.some(base => resolved.startsWith(base));
}

function validateAllowedUsers(users: string[]): boolean {
  return users.every(u => u === 'everyone' || USERNAME_RE.test(u));
}

/** GET /api/shares — List all shares (admin) */
sharesRouter.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json(loadShares());
});

/** POST /api/shares — Create new share (admin) */
sharesRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { name, sharePath, protocol, accessMode, allowedUsers } = req.body;
  if (!name || !sharePath) return res.status(400).json({ error: 'Name and path required' });
  if (!SHARE_NAME_RE.test(name)) return res.status(400).json({ error: 'Invalid share name. Use alphanumeric, dash, underscore only.' });
  if (!isValidSharePath(sharePath)) return res.status(400).json({ error: `Share path must be under: ${ALLOWED_BASES.join(', ')}` });
  if (allowedUsers && !validateAllowedUsers(allowedUsers)) return res.status(400).json({ error: 'Invalid username in allowedUsers' });
  if (protocol && !['smb', 'nfs'].includes(protocol)) return res.status(400).json({ error: 'Protocol must be smb or nfs' });

  const shares = loadShares();
  if (shares.some(s => s.name === name)) return res.status(409).json({ error: 'Share name already exists' });

  const share: Share = {
    id: String(Date.now()),
    name,
    path: path.resolve(sharePath),
    protocol: protocol || 'smb',
    status: 'active',
    accessMode: accessMode === 'read-only' ? 'read-only' : 'read-write',
    allowedUsers: allowedUsers || [],
    connectedClients: 0,
  };

  try { await execFileAsync('sudo', ['mkdir', '-p', share.path], { timeout: 5000 }); } catch {}

  shares.push(share);
  saveShares(shares);

  if (share.protocol === 'smb') {
    await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  }

  audit('share_created', { user: req.user?.username, details: `Share "${name}" at ${share.path}` });
  res.json(share);
});

/** PUT /api/shares/:id — Update share (admin) */
sharesRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const shares = loadShares();
  const idx = shares.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Share not found' });

  if (req.body.name && !SHARE_NAME_RE.test(req.body.name)) return res.status(400).json({ error: 'Invalid share name' });
  if (req.body.sharePath && !isValidSharePath(req.body.sharePath)) return res.status(400).json({ error: 'Invalid share path' });
  if (req.body.allowedUsers && !validateAllowedUsers(req.body.allowedUsers)) return res.status(400).json({ error: 'Invalid username' });

  const allowed = ['name', 'path', 'protocol', 'status', 'accessMode', 'allowedUsers'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) (shares[idx] as Record<string, unknown>)[key] = req.body[key];
  }
  if (req.body.sharePath) shares[idx].path = path.resolve(req.body.sharePath);

  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  audit('share_updated', { user: req.user?.username, details: `Share "${shares[idx].name}"` });
  res.json(shares[idx]);
});

/** POST /api/shares/:id/toggle — Enable/disable share (admin) */
sharesRouter.post('/:id/toggle', requireAdmin, async (req: Request, res: Response) => {
  const shares = loadShares();
  const share = shares.find(s => s.id === req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  share.status = share.status === 'active' ? 'inactive' : 'active';
  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  res.json(share);
});

/** DELETE /api/shares/:id — Remove share (admin) */
sharesRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  let shares = loadShares();
  const target = shares.find(s => s.id === req.params.id);
  shares = shares.filter(s => s.id !== req.params.id);
  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  audit('share_deleted', { user: req.user?.username, details: `Share "${target?.name}"` });
  res.json({ success: true });
});

/** Apply Samba config safely */
async function applySambaConfig(activeShares: Share[]): Promise<void> {
  try {
    const SMB_CONF = '/etc/samba/smb.conf';
    let base = '';
    try {
      const existing = fs.readFileSync(SMB_CONF, 'utf-8');
      const marker = existing.indexOf('\n# HomePiNAS Managed Shares');
      base = marker > 0 ? existing.substring(0, marker) : existing;
    } catch {
      base = `[global]
  workgroup = WORKGROUP
  server string = HomePiNAS
  security = user
  map to guest = Bad User
  server signing = auto
  server min protocol = SMB2
  client ipc signing = auto
  ntlm auth = ntlmv2-only
`;
    }

    const shareConfigs = activeShares.map(s => {
      // Sanitize values for smb.conf
      const safeName = s.name.replace(/[\[\]]/g, '');
      const safePath = s.path.replace(/[;\n\r]/g, '');
      const safeUsers = s.allowedUsers
        .filter(u => u === 'everyone' || USERNAME_RE.test(u))
        .join(' ');

      return `
[${safeName}]
  path = ${safePath}
  ${s.accessMode === 'read-only' ? 'read only = yes' : 'read only = no'}
  browseable = yes
  ${s.allowedUsers.includes('everyone') ? 'guest ok = yes' : `valid users = ${safeUsers}`}
  create mask = 0664
  directory mask = 0775
`;
    }).join('\n');

    const fullConfig = base + '\n# HomePiNAS Managed Shares\n' + shareConfigs;

    // Write via temp file to avoid partial writes
    const tmpFile = path.join(process.cwd(), 'data', 'smb.conf.tmp');
    fs.writeFileSync(tmpFile, fullConfig);
    await execFileAsync('sudo', ['cp', tmpFile, SMB_CONF], { timeout: 5000 });
    fs.unlinkSync(tmpFile);

    await execFileAsync('sudo', ['systemctl', 'reload', 'smbd'], { timeout: 5000 });
  } catch {
    // Samba may not be installed
  }
}

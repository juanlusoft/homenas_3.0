/**
 * Shares REST endpoints — Samba + NFS management
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const sharesRouter = Router();
const execFileAsync = promisify(execFile);

const SHARES_FILE = path.join(process.cwd(), 'data', 'shares.json');

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

/** GET /api/shares — List all shares */
sharesRouter.get('/', (_req, res) => {
  res.json(loadShares());
});

/** POST /api/shares — Create new share */
sharesRouter.post('/', async (req, res) => {
  const { name, sharePath, protocol, accessMode, allowedUsers } = req.body;
  if (!name || !sharePath) return res.status(400).json({ error: 'Name and path required' });

  const shares = loadShares();
  const share: Share = {
    id: String(Date.now()),
    name,
    path: sharePath,
    protocol: protocol || 'smb',
    status: 'active',
    accessMode: accessMode || 'read-write',
    allowedUsers: allowedUsers || [],
    connectedClients: 0,
  };

  // Create directory if it doesn't exist
  try { fs.mkdirSync(sharePath, { recursive: true }); } catch {}

  shares.push(share);
  saveShares(shares);

  // Apply to Samba if SMB
  if (share.protocol === 'smb') {
    await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  }

  res.json(share);
});

/** PUT /api/shares/:id — Update share */
sharesRouter.put('/:id', async (req, res) => {
  const shares = loadShares();
  const idx = shares.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Share not found' });

  shares[idx] = { ...shares[idx], ...req.body, id: shares[idx].id };
  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  res.json(shares[idx]);
});

/** POST /api/shares/:id/toggle — Enable/disable share */
sharesRouter.post('/:id/toggle', async (req, res) => {
  const shares = loadShares();
  const share = shares.find(s => s.id === req.params.id);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  share.status = share.status === 'active' ? 'inactive' : 'active';
  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  res.json(share);
});

/** DELETE /api/shares/:id — Remove share */
sharesRouter.delete('/:id', async (req, res) => {
  let shares = loadShares();
  shares = shares.filter(s => s.id !== req.params.id);
  saveShares(shares);
  await applySambaConfig(shares.filter(s => s.protocol === 'smb' && s.status === 'active'));
  res.json({ success: true });
});

/** Apply Samba configuration */
async function applySambaConfig(activeShares: Share[]): Promise<void> {
  try {
    const SMB_CONF = '/etc/samba/smb.conf';
    // Read base config (everything before [HomePiNAS-*] sections)
    let base = '';
    try {
      const existing = fs.readFileSync(SMB_CONF, 'utf-8');
      const marker = existing.indexOf('\n# HomePiNAS Managed Shares');
      base = marker > 0 ? existing.substring(0, marker) : existing;
    } catch {
      base = '[global]\n  workgroup = WORKGROUP\n  server string = HomePiNAS\n  security = user\n';
    }

    const shareConfigs = activeShares.map(s => `
[${s.name}]
  path = ${s.path}
  ${s.accessMode === 'read-only' ? 'read only = yes' : 'read only = no'}
  browseable = yes
  ${s.allowedUsers.includes('everyone') ? 'guest ok = yes' : `valid users = ${s.allowedUsers.join(' ')}`}
  create mask = 0664
  directory mask = 0775
`).join('\n');

    const fullConfig = base + '\n# HomePiNAS Managed Shares\n' + shareConfigs;
    fs.writeFileSync(SMB_CONF, fullConfig);
    await execFileAsync('sudo', ['systemctl', 'reload', 'smbd'], { timeout: 5000 });
  } catch {
    // Samba may not be installed — silently continue
  }
}

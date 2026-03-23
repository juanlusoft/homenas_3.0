/**
 * Users REST endpoints — CRUD + 2FA
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const usersRouter = Router();

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'readonly';
  twoFactor: boolean;
  totpSecret?: string;
  lastLogin: string;
  status: 'active' | 'locked';
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'homepinas-salt').digest('hex');
}

function loadUsers(): User[] {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch {
    // Default admin user
    const admin: User = {
      id: 1, username: 'admin', passwordHash: hashPassword('admin'),
      role: 'admin', twoFactor: false, lastLogin: '-', status: 'active',
    };
    saveUsers([admin]);
    return [admin];
  }
}

function saveUsers(users: User[]): void {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/** Strip sensitive data for API response */
function sanitize(user: User) {
  return {
    id: user.id, username: user.username, role: user.role,
    twoFactor: user.twoFactor, lastLogin: user.lastLogin, status: user.status,
  };
}

/** GET /api/users — List all users */
usersRouter.get('/', (_req, res) => {
  res.json(loadUsers().map(sanitize));
});

/** POST /api/users — Create user */
usersRouter.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

  const users = loadUsers();
  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const user: User = {
    id: Date.now(), username, passwordHash: hashPassword(password),
    role: role || 'user', twoFactor: false, lastLogin: '-', status: 'active',
  };
  users.push(user);
  saveUsers(users);
  res.json(sanitize(user));
});

/** PUT /api/users/:id — Update user */
usersRouter.put('/:id', (req, res) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.body.role) user.role = req.body.role;
  if (req.body.password) user.passwordHash = hashPassword(req.body.password);
  if (req.body.status) user.status = req.body.status;
  saveUsers(users);
  res.json(sanitize(user));
});

/** DELETE /api/users/:id — Delete user */
usersRouter.delete('/:id', (req, res) => {
  let users = loadUsers();
  const id = parseInt(req.params.id);
  if (users.length <= 1) return res.status(400).json({ error: 'Cannot delete last user' });
  users = users.filter(u => u.id !== id);
  saveUsers(users);
  res.json({ success: true });
});

/** POST /api/users/enforce-2fa — Toggle global 2FA enforcement */
usersRouter.post('/enforce-2fa', (req, res) => {
  const { enforce } = req.body;
  const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')); } catch { /* new file */ }
  settings.enforce2FA = !!enforce;
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  res.json({ success: true, enforce2FA: settings.enforce2FA });
});

/** POST /api/users/:id/2fa/setup — Generate TOTP secret and provisioning URI */
usersRouter.post('/:id/2fa/setup', (req, res) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Generate a 20-byte base32-encoded secret
  const secretBytes = crypto.randomBytes(20);
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < secretBytes.length; i++) {
    secret += base32Chars[secretBytes[i] % 32];
  }

  user.totpSecret = secret;
  user.twoFactor = true;
  saveUsers(users);

  const issuer = 'HomePiNAS';
  const otpauthUrl = `otpauth://totp/${issuer}:${user.username}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;

  res.json({ secret, otpauthUrl });
});

/** POST /api/users/:id/2fa/verify — Verify a TOTP code */
usersRouter.post('/:id/2fa/verify', (req, res) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user || !user.totpSecret) return res.status(400).json({ error: 'No 2FA configured' });

  const { code } = req.body;
  if (!code || typeof code !== 'string' || code.length !== 6) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  // Simple TOTP verification: generate current code and compare
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);

  // Check current and adjacent time steps (±1 for clock drift)
  for (const offset of [-1, 0, 1]) {
    const expected = generateTOTP(user.totpSecret, timeStep + offset);
    if (expected === code) {
      return res.json({ success: true });
    }
  }

  res.status(401).json({ error: 'Invalid code' });
});

/** Generate a 6-digit TOTP code from base32 secret and time step */
function generateTOTP(base32Secret: string, timeStep: number): string {
  // Decode base32
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase()) {
    const val = base32Chars.indexOf(c);
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  const keyBytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }

  // Time step to 8-byte big-endian buffer
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  timeBuffer.writeUInt32BE(timeStep >>> 0, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', keyBytes).update(timeBuffer).digest();

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;

  return code.toString().padStart(6, '0');
}

/** POST /api/users/login — Authenticate */
usersRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username && u.passwordHash === hashPassword(password));
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status === 'locked') return res.status(403).json({ error: 'Account locked' });

  user.lastLogin = new Date().toISOString().slice(0, 16).replace('T', ' ');
  saveUsers(users);
  res.json({ success: true, user: sanitize(user), token: crypto.randomBytes(32).toString('hex') });
});

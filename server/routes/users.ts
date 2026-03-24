/**
 * Users REST endpoints — CRUD + 2FA + Auth
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { signToken, requireAuth, requireAdmin } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rate-limit.js';
import { audit } from '../middleware/audit.js';
import { alerts } from '../utils/notify.js';

export const usersRouter = Router();

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
const SALT_ROUNDS = 12;

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
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

function comparePassword(password: string, hash: string): boolean {
  // Support legacy sha256 hashes for migration
  const legacyHash = crypto.createHash('sha256').update(password + 'homepinas-salt').digest('hex');
  if (hash === legacyHash) return true;
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

function loadUsers(): User[] {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return []; }
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

/** GET /api/users — List all users (admin only) */
usersRouter.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json(loadUsers().map(sanitize));
});

/** POST /api/users — Create user (admin only) */
usersRouter.post('/', requireAdmin, (req: Request, res: Response) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (typeof username !== 'string' || username.length < 2 || username.length > 32) return res.status(400).json({ error: 'Username must be 2-32 characters' });
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return res.status(400).json({ error: 'Username contains invalid characters' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const users = loadUsers();
  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const validRoles = ['admin', 'user', 'readonly'];
  const user: User = {
    id: Date.now(), username, passwordHash: hashPassword(password),
    role: validRoles.includes(role) ? role : 'user', twoFactor: false, lastLogin: '-', status: 'active',
  };
  users.push(user);
  saveUsers(users);
  alerts.userCreated(username);
  audit('user_created', { user: req.user?.username, details: `Created user "${username}" with role "${user.role}"` });
  res.json(sanitize(user));
});

/** PUT /api/users/:id — Update user (admin only) */
usersRouter.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const validRoles = ['admin', 'user', 'readonly'];
  if (req.body.role && validRoles.includes(req.body.role)) user.role = req.body.role;
  if (req.body.password && req.body.password.length >= 8) user.passwordHash = hashPassword(req.body.password);
  if (req.body.status && ['active', 'locked'].includes(req.body.status)) user.status = req.body.status;
  saveUsers(users);
  audit('user_updated', { user: req.user?.username, details: `Updated user "${user.username}"` });
  res.json(sanitize(user));
});

/** DELETE /api/users/:id — Delete user (admin only) */
usersRouter.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  let users = loadUsers();
  const id = parseInt(req.params.id);
  const target = users.find(u => u.id === id);
  if (users.length <= 1) return res.status(400).json({ error: 'Cannot delete last user' });
  users = users.filter(u => u.id !== id);
  saveUsers(users);
  audit('user_deleted', { user: req.user?.username, details: `Deleted user "${target?.username}"` });
  res.json({ success: true });
});

/** POST /api/users/enforce-2fa — Toggle global 2FA enforcement (admin only) */
usersRouter.post('/enforce-2fa', requireAdmin, (req: Request, res: Response) => {
  const { enforce } = req.body;
  const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')); } catch {}
  settings.enforce2FA = !!enforce;
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  audit('settings_changed', { user: req.user?.username, details: `2FA enforcement: ${settings.enforce2FA}` });
  res.json({ success: true, enforce2FA: settings.enforce2FA });
});

/** POST /api/users/:id/2fa/setup — Generate TOTP secret (authenticated) */
usersRouter.post('/:id/2fa/setup', requireAuth, (req: Request, res: Response) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Users can only setup their own 2FA unless admin
  if (req.user?.role !== 'admin' && req.user?.userId !== user.id) {
    return res.status(403).json({ error: 'Cannot modify other users 2FA' });
  }

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

  audit('2fa_setup', { user: req.user?.username, details: `2FA setup for "${user.username}"` });
  res.json({ secret, otpauthUrl });
});

/** POST /api/users/:id/2fa/verify — Verify a TOTP code (authenticated) */
usersRouter.post('/:id/2fa/verify', requireAuth, (req: Request, res: Response) => {
  const users = loadUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user || !user.totpSecret) return res.status(400).json({ error: 'No 2FA configured' });

  const { code } = req.body;
  if (!code || typeof code !== 'string' || code.length !== 6) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);

  for (const offset of [-1, 0, 1]) {
    const expected = generateTOTP(user.totpSecret, timeStep + offset);
    if (expected === code) {
      audit('2fa_verified', { user: req.user?.username });
      return res.json({ success: true });
    }
  }

  res.status(401).json({ error: 'Invalid code' });
});

/** Generate a 6-digit TOTP code from base32 secret and time step */
function generateTOTP(base32Secret: string, timeStep: number): string {
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

  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  timeBuffer.writeUInt32BE(timeStep >>> 0, 4);

  const hmac = crypto.createHmac('sha1', keyBytes).update(timeBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeNum = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;

  return codeNum.toString().padStart(6, '0');
}

/** POST /api/users/login — Authenticate (public, rate limited) */
usersRouter.post('/login', loginLimiter, (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const users = loadUsers();
  if (users.length === 0) {
    return res.status(503).json({ error: 'No users configured. Run setup first.' });
  }

  const user = users.find(u => u.username === username);
  if (!user || !comparePassword(password, user.passwordHash)) {
    alerts.loginFailed(username, req.ip || 'unknown');
    audit('login_failed', { user: username, ip: req.ip || 'unknown' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status === 'locked') {
    audit('login_locked', { user: username, ip: req.ip || 'unknown' });
    return res.status(403).json({ error: 'Account locked' });
  }

  // Migrate legacy sha256 hash to bcrypt on successful login
  const legacyHash = crypto.createHash('sha256').update(password + 'homepinas-salt').digest('hex');
  if (user.passwordHash === legacyHash) {
    user.passwordHash = hashPassword(password);
  }

  user.lastLogin = new Date().toISOString().slice(0, 16).replace('T', ' ');
  saveUsers(users);

  const token = signToken({ userId: user.id, username: user.username, role: user.role });
  audit('login_success', { user: username, ip: req.ip || 'unknown' });
  res.json({ success: true, user: sanitize(user), token });
});

/** GET /api/users/me — Get current user info */
usersRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const users = loadUsers();
  const user = users.find(u => u.id === req.user?.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitize(user));
});

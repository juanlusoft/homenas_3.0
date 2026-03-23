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

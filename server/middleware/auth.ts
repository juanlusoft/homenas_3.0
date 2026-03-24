/**
 * JWT Authentication & Authorization middleware
 * All protected routes must use requireAuth or requireAdmin.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Generate a persistent secret on first run, store in data/jwt-secret.key
const SECRET_FILE = path.join(process.cwd(), 'data', 'jwt-secret.key');

function getJwtSecret(): string {
  try {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } catch {
    const secret = crypto.randomBytes(64).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

export const JWT_SECRET = getJwtSecret();
export const JWT_EXPIRES_IN = '24h';

export interface JwtPayload {
  userId: number;
  username: string;
  role: 'admin' | 'user' | 'readonly';
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Sign a JWT for a user */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Verify and decode a JWT */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/** Middleware: require a valid JWT (any role) */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Middleware: require admin role */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}

/** Middleware: require admin or user role (not readonly) */
export function requireWrite(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role === 'readonly') {
      res.status(403).json({ error: 'Write access required' });
      return;
    }
    next();
  });
}

/** Extract JWT payload from Socket.io handshake */
export function authenticateSocket(handshake: { auth?: { token?: string }; headers?: Record<string, string> }): JwtPayload | null {
  const token = handshake.auth?.token || handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

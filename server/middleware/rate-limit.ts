/**
 * Rate limiting configurations for sensitive endpoints
 */

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/** Normalize IPv6 to IPv4 when possible, always return string */
function getClientIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  // Strip IPv6 prefix for IPv4-mapped addresses (::ffff:192.168.1.10)
  return raw.replace(/^::ffff:/, '');
}

const defaultOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
};

/** Login: 5 attempts per minute per IP */
export const loginLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 1 minute.' },
});

/** Terminal: 30 commands per minute */
export const terminalLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many commands. Slow down.' },
});

/** Setup: 3 attempts per hour */
export const setupLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many setup attempts. Try again later.' },
});

/** General write operations: 60 per minute */
export const writeLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Slow down.' },
});

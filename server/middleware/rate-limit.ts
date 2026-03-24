/**
 * Rate limiting configurations for sensitive endpoints
 */

import rateLimit from 'express-rate-limit';

/** Login: 5 attempts per minute per IP */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

/** Terminal: 30 commands per minute */
export const terminalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many commands. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Setup: 3 attempts per hour */
export const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many setup attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** General write operations: 60 per minute */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

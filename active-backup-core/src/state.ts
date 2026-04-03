import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import type { Device, InstallTokenMeta, PendingAgent, PersistedState } from './types.js';

const DATA_FILE = path.join(config.dataDir, 'active-backup-core.json');
const SECRET_FILE = path.join(config.dataDir, 'install-token.key');

export const devices = new Map<string, Device>();
export const pendingAgents = new Map<string, PendingAgent>();
export const pendingTokens = new Map<string, InstallTokenMeta>();

let cachedSecret: Buffer | null = null;

export function loadState() {
  if (!fs.existsSync(DATA_FILE)) return;
  const payload = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as PersistedState;
  for (const [key, value] of payload.devices || []) devices.set(key, value);
  for (const [key, value] of payload.pendingAgents || []) pendingAgents.set(key, value);
  for (const [key, value] of payload.pendingTokens || []) pendingTokens.set(key, value);
}

export function saveState() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const payload: PersistedState = {
    devices: Array.from(devices.entries()),
    pendingAgents: Array.from(pendingAgents.entries()),
    pendingTokens: Array.from(pendingTokens.entries()),
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function getSecret() {
  if (cachedSecret) return cachedSecret;
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), 'utf8');
  }
  cachedSecret = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'utf8');
  return cachedSecret;
}

export function signInstallToken(meta: InstallTokenMeta) {
  const payload = Buffer.from(JSON.stringify(meta)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `v1.${payload}.${sig}`;
}

export function parseInstallToken(token: string) {
  if (!token.startsWith('v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as InstallTokenMeta;
  } catch {
    return null;
  }
}

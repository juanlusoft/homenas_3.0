import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Device, PersistedState, Session } from './types.js';

export const config = {
  host: process.env.SBV2_HOST || '0.0.0.0',
  httpPort: Number(process.env.SBV2_HTTP_PORT || 4021),
  tcpPort: Number(process.env.SBV2_TCP_PORT || 4567),
  tcpIdleTimeoutMs: Number(process.env.SBV2_TCP_IDLE_TIMEOUT_MS || 300000),
  adminToken: process.env.SBV2_ADMIN_TOKEN || 'synobackup-v2-admin-token',
  dataDir: path.resolve(process.env.SBV2_DATA_DIR || './data'),
  backupDir: path.resolve(process.env.SBV2_BACKUP_DIR || './backups'),
  engineProvider: (process.env.SBV2_ENGINE_PROVIDER || 'urbackup').toLowerCase(),
  enginePublicName: process.env.SBV2_ENGINE_PUBLIC_NAME || 'HomeNAS Backup Engine',
  engineExposeProvider: String(process.env.SBV2_ENGINE_EXPOSE_PROVIDER || 'false').toLowerCase() === 'true',
  urbackupStartCmd: String(process.env.SBV2_URBACKUP_START_CMD || '').trim(),
  urbackupProgressCmd: String(process.env.SBV2_URBACKUP_PROGRESS_CMD || '').trim(),
  engineCommandTimeoutMs: Number(process.env.SBV2_ENGINE_CMD_TIMEOUT_MS || 120000)
};

const statePath = path.join(config.dataDir, 'state.json');

export const devices = new Map<string, Device>();
export const sessions = new Map<string, Session>();
export const installTokens = new Map<string, { id: string; name: string; os: string; issuedAt: string }>();

export function now() {
  return new Date().toISOString();
}

export function randomId(size = 8) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, size);
}

export function saveState() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const payload: PersistedState = {
    devices: Array.from(devices.entries()),
    sessions: Array.from(sessions.entries()),
    installTokens: Array.from(installTokens.entries())
  };
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), 'utf8');
}

export function loadState() {
  if (!fs.existsSync(statePath)) return;
  const payload = JSON.parse(fs.readFileSync(statePath, 'utf8')) as PersistedState;
  for (const [k, v] of payload.devices || []) devices.set(k, v);
  for (const [k, v] of payload.sessions || []) sessions.set(k, v);
  for (const [k, v] of payload.installTokens || []) installTokens.set(k, v);
}

export function stageDir(deviceId: string, sessionId: string) {
  return path.join(config.backupDir, deviceId, 'stage', sessionId);
}

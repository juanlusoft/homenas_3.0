import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKUP_BASE_DIR =
  process.env.BACKUP_BASE_DIR || '/mnt/storage/active-backup';

export const DATA_FILE = path.join(__dirname, '../../data/active-backup.json');

export interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
}

export interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  token: string;
  backupHost: string;
  backupShare: string;
  backupUsername: string;
  backupPassword: string;
  backupType: 'full' | 'incremental' | 'folders';
  backupPaths: string[];
  schedule: string;
  status: 'online' | 'offline' | 'backing-up';
  lastSeen: string;
  lastBackup: string | null;
  backupSize: number;
  versions: BackupVersion[];
  approved: boolean;
  pendingBackup: boolean;
  backupProgress: { percent: number; currentFile: string; speed: string } | null;
}

export interface PendingAgent {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  requestedAt: string;
}

export const devices = new Map<string, Device>();
export const pendingAgents = new Map<string, PendingAgent>();
export const pendingTokens = new Map<
  string,
  {
    id: string;
    name: string;
    os: string;
    backupType: string;
    backupHost: string;
    backupShare: string;
    backupUsername: string;
    backupPassword: string;
  }
>();

export function saveData(): void {
  try {
    const payload = {
      devices: Array.from(devices.entries()),
      pendingAgents: Array.from(pendingAgents.entries()),
      pendingTokens: Array.from(pendingTokens.entries()),
    };
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('[active-backup] saveData error:', e);
  }
}

export function loadData(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const payload = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (payload.devices) {
      for (const [k, v] of payload.devices) devices.set(k, v as Device);
    }
    if (payload.pendingAgents) {
      for (const [k, v] of payload.pendingAgents) pendingAgents.set(k, v as PendingAgent);
    }
    if (payload.pendingTokens) {
      for (const [k, v] of payload.pendingTokens) pendingTokens.set(k, v as never);
    }
    console.log(
      `[active-backup] loaded ${devices.size} devices, ${pendingAgents.size} pending`
    );
  } catch (e) {
    console.error('[active-backup] loadData error:', e);
  }
}

// Load on module init so data is ready when routes import this module
loadData();

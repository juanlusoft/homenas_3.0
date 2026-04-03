export type BackupType = 'full' | 'incremental' | 'folders';
export type DeviceStatus = 'online' | 'offline' | 'backing-up';

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
  backupType: BackupType;
  backupPaths: string[];
  schedule: string;
  status: DeviceStatus;
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

export interface InstallTokenMeta {
  id: string;
  name: string;
  os: string;
  backupType: BackupType;
  backupHost: string;
  backupShare: string;
  backupUsername: string;
  backupPassword: string;
  issuedAt: string;
}

export interface PersistedState {
  devices: Array<[string, Device]>;
  pendingAgents: Array<[string, PendingAgent]>;
  pendingTokens: Array<[string, InstallTokenMeta]>;
}

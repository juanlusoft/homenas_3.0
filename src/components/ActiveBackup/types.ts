export interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
  browsePath?: string;
  backupAvailable?: boolean;
}

export interface BackupDevice {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  backupType: 'full' | 'incremental' | 'folders';
  backupPaths: string[];
  schedule: string;
  status: 'online' | 'offline' | 'backing-up';
  lastSeen: string;
  lastBackup: string | null;
  backupSize: number;
  versions: BackupVersion[];
  approved: boolean;
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

export interface BackupBrowseItem {
  name: string;
  type: 'directory' | 'file';
  size: number;
  modified: string | null;
  path: string;
  downloadable: boolean;
}

export interface BackupBrowseResponse {
  deviceId: string;
  version: string | null;
  path: string;
  items: BackupBrowseItem[];
}

export interface RecoveryStatus {
  success: boolean;
  scriptsAvailable: boolean;
  iso: {
    exists: boolean;
    size: number;
    modified: string;
  } | null;
}

export interface EngineProgress {
  mode: 'adapter';
  phase: 'running' | 'finalizing' | 'idle' | 'unknown';
  bytes: number;
  files: number;
  percent: number;
}

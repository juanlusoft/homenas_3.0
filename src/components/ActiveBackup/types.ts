export interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
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

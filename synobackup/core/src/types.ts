export type BackupMode = 'system-volume';
export type DeviceStatus = 'online' | 'offline' | 'backing-up';
export type SessionStatus = 'uploading' | 'completed' | 'failed';

export interface InstallTokenMeta {
  id: string;
  name: string;
  os: string;
  mode: BackupMode;
  issuedAt: string;
}

export interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  token: string;
  status: DeviceStatus;
  approved: boolean;
  lastSeen: string;
  pendingJob: boolean;
  lastBackup: string | null;
  backupSize: number;
  retentionPolicy?: RetentionPolicy;
}

export interface BackupSession {
  id: string;
  deviceId: string;
  createdAt: string;
  completedAt: string | null;
  snapshotPath: string;
  volume: string;
  status: SessionStatus;
  totalBytes: number;
  fileCount: number;
  error: string | null;
  lastPath?: string | null;
  reusedFiles?: number;
  knownRemoteSize?: number;
  lastActivityAt?: string | null;
  progressSamples?: ProgressSample[];
}

export interface PersistedState {
  devices: Array<[string, Device]>;
  pendingTokens: Array<[string, InstallTokenMeta]>;
  sessions: Array<[string, BackupSession]>;
}

export interface VersionManifest {
  id: string;
  deviceId: string;
  createdAt: string;
  completedAt: string | null;
  snapshotPath: string;
  volume: string;
  status: SessionStatus;
  totalBytes: number;
  fileCount: number;
  error: string | null;
  inventory?: {
    indexedFiles: number;
    indexedBytes: number;
  };
  storage?: {
    blobObjects: number;
    chunkObjects: number;
    uniqueBlobBytes: number;
    uniqueChunkBytes: number;
    estimatedStoredBytes: number;
    logicalBytes: number;
  };
}

export interface InventoryEntry {
  path: string;
  size: number;
  modifiedAt: string;
  sha256: string;
  blobSha256?: string;
  chunkSize?: number;
  chunkCount?: number;
  chunkSha256?: string[];
  chunkBytes?: number[];
  indexedAt: string;
}

export interface ChunkedFileDescriptor {
  path: string;
  size: number;
  modifiedAt: string;
  sha256: string;
  chunkSize: number;
  chunkSha256: string[];
  chunkBytes?: number[];
}

export interface RetentionPolicy {
  keepLast?: number;
  keepDaily?: number;
  keepWeekly?: number;
  keepMonthly?: number;
}

export interface ProgressSample {
  at: string;
  uploadedBytes: number;
  uploadedFiles: number;
  reusedFiles: number;
}

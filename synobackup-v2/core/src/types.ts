export type DeviceStatus = 'online' | 'offline' | 'backing-up';
export type SessionStatus = 'uploading' | 'completed' | 'failed';

export interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  authToken: string;
  status: DeviceStatus;
  approved: boolean;
  pendingJob: boolean;
  lastSeen: string;
}

export interface Session {
  id: string;
  deviceId: string;
  createdAt: string;
  completedAt: string | null;
  status: SessionStatus;
  totalBytes: number;
  fileCount: number;
  error: string | null;
  stageDir: string;
}

export interface PersistedState {
  devices: Array<[string, Device]>;
  sessions: Array<[string, Session]>;
  installTokens: Array<[string, { id: string; name: string; os: string; issuedAt: string }]>;
}

export type EngineProviderKey = 'urbackup' | 'native';

export interface EnginePublicInfo {
  publicName: string;
  mode: 'adapter';
  capabilities: string[];
  provider?: EngineProviderKey;
}

import type { EngineProviderKey } from '../types.js';

export interface EngineAdapter {
  readonly provider: EngineProviderKey;
  startBackup(deviceId: string): Promise<void>;
  getProgress(deviceId: string): Promise<{ phase: string; bytes: number; files: number }>;
}

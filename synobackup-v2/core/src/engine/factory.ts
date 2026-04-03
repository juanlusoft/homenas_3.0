import type { EngineAdapter } from './adapter.js';
import { UrBackupAdapter } from './urbackup.js';
import { config } from '../state.js';

export function createEngineAdapter(): EngineAdapter | null {
  const provider = String(config.engineProvider || 'urbackup').toLowerCase();
  if (provider === 'urbackup') {
    return new UrBackupAdapter();
  }
  return null;
}

import { config } from '../state.js';
import type { EnginePublicInfo, EngineProviderKey } from '../types.js';

const allowedProviders = new Set<EngineProviderKey>(['urbackup', 'native']);

export function getEnginePublicInfo(): EnginePublicInfo {
  const provider = (allowedProviders.has(config.engineProvider as EngineProviderKey)
    ? (config.engineProvider as EngineProviderKey)
    : 'urbackup');

  const info: EnginePublicInfo = {
    publicName: config.enginePublicName,
    mode: 'adapter',
    capabilities: ['resume', 'dedup', 'incremental', 'image-and-files']
  };

  if (config.engineExposeProvider) {
    info.provider = provider;
  }

  return info;
}

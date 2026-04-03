/**
 * Device card — shows backup device status, last backup, actions
 */

import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import { t } from '@/i18n';
import type { BackupDevice, EngineProgress } from './types';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const OS_ICONS: Record<string, string> = {
  Windows: '🪟',
  macOS: '🍎',
  Ubuntu: '🐧',
  Linux: '🐧',
};

function getOsIcon(os: string): string {
  for (const [key, icon] of Object.entries(OS_ICONS)) {
    if (os.includes(key)) return icon;
  }
  return '💻';
}

interface DeviceCardProps {
  device: BackupDevice;
  onBackup: (id: string) => void;
  onSelect: (id: string) => void;
  engineProgress?: EngineProgress;
  onEngineTrigger?: (id: string) => void;
  engineLoading?: boolean;
}

export function DeviceCard({
  device,
  onBackup,
  onSelect,
  engineProgress,
  onEngineTrigger,
  engineLoading,
}: DeviceCardProps) {
  const statusMap = {
    'online': 'healthy' as const,
    'backing-up': 'warning' as const,
    'offline': 'error' as const,
  };

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSelect(device.id)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getOsIcon(device.os)}</span>
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{device.name}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{device.os} · {device.ip}</p>
          </div>
        </div>
        <GlowPill status={statusMap[device.status]} label={device.status === 'backing-up' ? 'Backing up' : device.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('ab.type')}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {device.backupType === 'full' ? '💿 Full Image' : '📁 Folders'}
          </span>
        </div>
        {device.backupType === 'folders' && device.backupPaths.length > 0 && (
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">{t('ab.paths')}</span>
            <span className="font-mono text-xs text-[var(--text-primary)] text-right max-w-[60%] truncate">
              {device.backupPaths.length} folder{device.backupPaths.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('ab.lastBackup')}</span>
          <span className="font-mono text-xs text-teal">{timeAgo(device.lastBackup)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('ab.totalSize')}</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">{formatBytes(device.backupSize)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('ab.versions')}</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">{device.versions.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('ab.schedule')}</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">{device.schedule}</span>
        </div>
      </div>

      {/* Progress bar when backing-up */}
      {device.status === 'backing-up' && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-teal font-medium animate-pulse">⟳ Backing up…</span>
            {device.backupProgress?.speed && (
              <span className="text-[var(--text-secondary)] font-mono">{device.backupProgress.speed}</span>
            )}
            <span className="text-[var(--text-secondary)] font-mono">
              {device.backupProgress?.percent ?? 0}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-void overflow-hidden">
            <div
              className="h-full rounded-full bg-teal transition-all duration-500"
              style={{ width: `${device.backupProgress?.percent ?? 0}%` }}
            />
          </div>
          {device.backupProgress?.currentFile && (
            <p className="text-[10px] text-[var(--text-disabled)] font-mono truncate">
              {device.backupProgress.currentFile}
            </p>
          )}
        </div>
      )}

      {engineProgress && engineProgress.phase !== 'idle' && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-medium text-teal">Engine: {engineProgress.phase}</span>
            <span className="font-mono text-[var(--text-secondary)]">{engineProgress.percent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-void overflow-hidden">
            <div
              className="h-full rounded-full bg-orange transition-all duration-500"
              style={{ width: `${engineProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4" onClick={e => e.stopPropagation()}>
        <StitchButton size="sm" onClick={() => onBackup(device.id)} disabled={device.status === 'backing-up'}>
          {device.status === 'backing-up' ? '⏳ Running...' : '▶ Backup Now'}
        </StitchButton>
        {onEngineTrigger && (
          <StitchButton
            size="sm"
            variant="ghost"
            onClick={() => onEngineTrigger(device.id)}
            disabled={engineLoading || engineProgress?.phase === 'running'}
          >
            {engineLoading ? '⏳ Engine...' : engineProgress?.phase === 'running' ? '⏳ Engine running' : 'Engine job'}
          </StitchButton>
        )}
        <StitchButton size="sm" variant="ghost" onClick={() => onSelect(device.id)}>{t('ab.details')}</StitchButton>
      </div>
    </GlassCard>
  );
}

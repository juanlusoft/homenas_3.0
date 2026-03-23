/**
 * Device detail panel — backup versions, paths, restore actions
 */

import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import type { BackupDevice } from './types';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

interface DeviceDetailProps {
  device: BackupDevice;
  onClose: () => void;
  onBackup: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DeviceDetail({ device, onClose, onBackup, onDelete }: DeviceDetailProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">{device.name}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{device.hostname} · {device.os}</p>
        </div>
        <div className="flex gap-2">
          <StitchButton size="sm" onClick={() => onBackup(device.id)}>▶ Backup Now</StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={onClose}>← Back</StitchButton>
        </div>
      </div>

      {/* Config */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">Configuration</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Backup type</span>
              <span className="font-mono text-[var(--text-primary)]">
                {device.backupType === 'full' ? 'Full image' : 'Selected folders'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Schedule</span>
              <span className="font-mono text-[var(--text-primary)]">{device.schedule}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">IP</span>
              <span className="font-mono text-[var(--text-primary)]">{device.ip}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Total size</span>
              <span className="font-mono text-teal">{formatBytes(device.backupSize)}</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">Backup Paths</h3>
          {device.backupPaths.length > 0 ? (
            <div className="space-y-1">
              {device.backupPaths.map((p, i) => (
                <div key={i} className="font-mono text-xs text-[var(--text-primary)] bg-surface-void rounded px-2 py-1">
                  {p}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-disabled)]">Full image — all drives</p>
          )}
        </GlassCard>
      </div>

      {/* Versions */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Backup Versions ({device.versions.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-secondary)] border-b border-[var(--outline-variant)]">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {device.versions.map(v => (
                <tr key={v.id} className="border-b border-[var(--outline-variant)]">
                  <td className="py-2 pr-4 font-mono text-xs">{new Date(v.timestamp).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                      v.type === 'full' ? 'bg-teal/10 text-teal' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {v.type}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{formatBytes(v.size)}</td>
                  <td className="py-2 pr-4">
                    <GlowPill status={v.status === 'complete' ? 'healthy' : 'error'} label={v.status} />
                  </td>
                  <td className="py-2">
                    <StitchButton size="sm" variant="ghost">Browse</StitchButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Danger zone */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--error)]">Remove Device</h3>
            <p className="text-xs text-[var(--text-secondary)]">This will delete all backup data for this device</p>
          </div>
          <StitchButton size="sm" variant="ghost" onClick={() => onDelete(device.id)}>
            🗑️ Remove
          </StitchButton>
        </div>
      </GlassCard>
    </div>
  );
}

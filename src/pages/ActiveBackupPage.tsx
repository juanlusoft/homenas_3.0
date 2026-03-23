import { useState, useCallback } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';
import { DeviceCard, DeviceDetail } from '@/components/ActiveBackup';
import { useAPI } from '@/hooks/useAPI';
import type { BackupDevice, PendingAgent } from '@/components/ActiveBackup';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

const API = import.meta.env.VITE_API_URL || '/api';

export default function ActiveBackupPage() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const fetchDevices = useCallback(() =>
    fetch(`${API}/active-backup/devices`).then(r => r.json() as Promise<BackupDevice[]>), []);
  const fetchPending = useCallback(() =>
    fetch(`${API}/active-backup/pending`).then(r => r.json() as Promise<PendingAgent[]>), []);

  const { data: devices, loading, refresh } = useAPI<BackupDevice[]>(fetchDevices, 5000);
  const { data: pending, refresh: refreshPending } = useAPI<PendingAgent[]>(fetchPending, 10000);

  const handleBackup = useCallback(async (id: string) => {
    await fetch(`${API}/active-backup/devices/${id}/backup`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`${API}/active-backup/devices/${id}`, { method: 'DELETE' });
    setSelectedDevice(null);
    refresh();
  }, [refresh]);

  const handleApprove = useCallback(async (id: string) => {
    await fetch(`${API}/active-backup/pending/${id}/approve`, { method: 'POST' });
    refresh();
    refreshPending();
  }, [refresh, refreshPending]);

  const handleReject = useCallback(async (id: string) => {
    await fetch(`${API}/active-backup/pending/${id}/reject`, { method: 'POST' });
    refreshPending();
  }, [refreshPending]);

  // Detail view
  const selected = devices?.find(d => d.id === selectedDevice);
  if (selected) {
    return (
      <DeviceDetail
        device={selected}
        onClose={() => setSelectedDevice(null)}
        onBackup={handleBackup}
        onDelete={handleDelete}
      />
    );
  }

  const onlineCount = devices?.filter(d => d.status === 'online').length ?? 0;
  const totalSize = devices?.reduce((acc, d) => acc + d.backupSize, 0) ?? 0;
  const backingUpCount = devices?.filter(d => d.status === 'backing-up').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Devices</p>
          <p className="font-display text-2xl font-bold text-teal">{devices?.length ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{onlineCount} online</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Total Backup</p>
          <p className="font-display text-2xl font-bold text-teal">{formatBytes(totalSize)}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Active</p>
          <p className="font-display text-2xl font-bold text-orange">{backingUpCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">running now</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Agent</p>
          <StitchButton size="sm" className="mt-1">⬇️ Download Agent</StitchButton>
        </GlassCard>
      </div>

      {/* Pending approvals */}
      {pending && pending.length > 0 && (
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-orange mb-3">
            ⏳ Pending Approval ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map(agent => (
              <div key={agent.id} className="flex items-center justify-between py-2 border-b border-[var(--outline-variant)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{agent.hostname}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{agent.os} · {agent.ip}</p>
                </div>
                <div className="flex gap-2">
                  <StitchButton size="sm" onClick={() => handleApprove(agent.id)}>✓ Approve</StitchButton>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleReject(agent.id)}>✕ Reject</StitchButton>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Device grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices?.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onBackup={handleBackup}
              onSelect={setSelectedDevice}
            />
          ))}
        </div>
      )}

      {/* How it works */}
      <GlassCard elevation="low">
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">How Active Backup Works</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-center text-sm">
          <div>
            <p className="text-2xl mb-2">📥</p>
            <p className="font-medium text-[var(--text-primary)]">1. Install Agent</p>
            <p className="text-xs text-[var(--text-secondary)]">Download and install on any PC</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔍</p>
            <p className="font-medium text-[var(--text-primary)]">2. Auto-Discover</p>
            <p className="text-xs text-[var(--text-secondary)]">Agent finds your NAS on the network</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔄</p>
            <p className="font-medium text-[var(--text-primary)]">3. Automatic Backup</p>
            <p className="text-xs text-[var(--text-secondary)]">Incremental backups run on schedule</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

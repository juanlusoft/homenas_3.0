import { t } from '@/i18n';
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
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.devices')}</p>
          <p className="font-display text-2xl font-bold text-teal">{devices?.length ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{onlineCount} {t('ab.online')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.totalBackup')}</p>
          <p className="font-display text-2xl font-bold text-teal">{formatBytes(totalSize)}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.active')}</p>
          <p className="font-display text-2xl font-bold text-orange">{backingUpCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('ab.runningNow')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.agent')}</p>
          <StitchButton size="sm" className="mt-1"onClick={() => window.open('https://github.com/juanlusoft/homenas_3.0/releases/download/v5.0.0/homepinas-backup-agent-v1.2.0.tar.gz', '_blank')}>{t('ab.downloadAgent')}</StitchButton>
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
                  <StitchButton size="sm" onClick={() => handleApprove(agent.id)}>{t('ab.approve')}</StitchButton>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleReject(agent.id)}>{t('ab.reject')}</StitchButton>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Device grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">{t('ab.howItWorks')}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 text-center text-sm">
          <div>
            <p className="text-2xl mb-2">📥</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step1')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step1desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔍</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step2')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step2desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔄</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step3')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step3desc')}</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

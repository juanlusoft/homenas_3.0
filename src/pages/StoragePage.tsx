import { t } from '@/i18n';
import { useCallback, useState } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { api } from '@/api/client';
import type { Disk } from '@/api/client';

const ROLE_BADGE: Record<string, { color: string; label: string }> = {
  cache: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Caché' },
  data: { color: 'bg-teal/10 text-teal border-teal/30', label: 'Datos' },
  parity: { color: 'bg-orange/10 text-orange border-orange/30', label: 'Paridad' },
};

function DiskCard({ disk }: { disk: Disk }) {
  const status = disk.health === 'healthy' ? 'healthy' : disk.health === 'warning' ? 'warning' : 'error';
  const barColor = (disk.usage ?? 0) > 90 ? 'bg-red-500' : (disk.usage ?? 0) > 75 ? 'bg-amber-500' : 'bg-teal';
  const badge = disk.role ? ROLE_BADGE[disk.role] : null;

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{disk.name}</h3>
            {badge && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${badge.color}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-[var(--text-secondary)]">{disk.device} · {disk.type}</p>
        </div>
        <GlowPill status={status} label={disk.smart?.status || 'N/A'} />
      </div>

      {/* Usage bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-[var(--text-secondary)]">Used: {disk.used}</span>
          <span className="text-xs text-[var(--text-secondary)]">Free: {disk.free}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-void">
          <div className={`h-2 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${disk.usage}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-xs text-[var(--text-disabled)]">{disk.size} total</span>
          <span className={`font-mono text-sm font-bold ${(disk.usage ?? 0) > 90 ? 'text-red-400' : 'text-teal'}`}>{disk.usage ?? 0}%</span>
        </div>
      </div>

      {/* SMART details */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">
            {(disk.temperature ?? 0) > 0 ? `${disk.temperature}°C` : 'N/A'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.temp')}</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">
            {(disk.smart?.powerOnHours ?? 0) > 0 ? `${Math.floor((disk.smart?.powerOnHours ?? 0) / 24)}d` : 'N/A'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.powerOn')}</p>
        </div>
        <div>
          <p className={`font-mono text-lg font-bold ${(disk.smart?.badSectors ?? 0) > 0 ? 'text-red-400' : 'text-teal'}`}>
            {disk.smart?.status === 'N/A' ? 'N/A' : disk.smart?.badSectors ?? 0}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.badSectors')}</p>
        </div>
      </div>
    </GlassCard>
  );
}

export default function StoragePage() {
  const fetchDisks = useCallback(() => api.getDisks(), []);
  const { data: disks, loading, refresh } = useAPI<Disk[]>(fetchDisks, 15000);
  const [smartRunning, setSmartRunning] = useState(false);

  const runSmartCheck = useCallback(async () => {
    if (!disks?.length) return;
    setSmartRunning(true);
    const API = import.meta.env.VITE_API_URL || '/api';
    try {
      await Promise.all(
        disks.map(d => {
          const dev = d.device.replace('/dev/', '').replace(/\d+$/, '');
          return fetch(`${API}/storage/smart-test/${dev}`, { method: 'POST' });
        })
      );
      refresh();
    } finally {
      setSmartRunning(false);
    }
  }, [disks, refresh]);

  const totalSize = disks?.reduce((acc, d) => acc + parseFloat(String(d.size)), 0) || 0;
  const totalUsed = disks?.reduce((acc, d) => acc + parseFloat(String(d.used)), 0) || 0;
  const healthyCount = disks?.filter((d) => d.health === 'healthy').length || 0;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.totalStorage')}</p>
          <p className="font-display text-2xl font-bold text-teal">{totalSize.toFixed(1)} GB</p>
          <p className="text-xs text-[var(--text-secondary)]">{totalUsed.toFixed(1)} GB used</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.disks')}</p>
          <p className="font-display text-2xl font-bold text-teal">{disks?.length || 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{healthyCount} {t('storage.healthy')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.actions')}</p>
              <div className="flex gap-2 mt-2">
                <StitchButton size="sm" variant="ghost" onClick={runSmartCheck} disabled={smartRunning}>
                  {smartRunning ? '...' : t('storage.smartCheck')}
                </StitchButton>
                <StitchButton size="sm" variant="ghost" onClick={refresh}>{t('storage.refresh')}</StitchButton>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Disk grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {disks?.map((disk) => <DiskCard key={disk.device} disk={disk} />)}
        </div>
      )}
    </div>
  );
}

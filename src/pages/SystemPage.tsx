import { useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';

interface SystemInfo {
  hostname: string;
  platform: string;
  distro: string;
  release: string;
  kernel: string;
  arch: string;
  cpu: string;
  cores: number;
  model: string;
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="font-mono text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemPage() {
  const fetchInfo = useCallback(() =>
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/system/info`).then(r => r.json() as Promise<SystemInfo>),
  []);
  const { data: info, loading: infoLoading } = useAPI<SystemInfo>(fetchInfo);
  const { metrics, isConnected } = useLiveMetrics();

  return (
    <div className="space-y-8">
      {/* Live status */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">CPU</p>
          <p className={`font-display text-3xl font-bold ${parseFloat(metrics?.cpu || '0') > 80 ? 'text-red-400' : 'text-teal'}`}>
            {metrics?.cpu ?? '—'}%
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Memory</p>
          <p className="font-display text-3xl font-bold text-teal">
            {metrics?.memory.used ?? '—'}%
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {metrics ? `${(metrics.memory.total / 1024).toFixed(1)} GB total` : ''}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Temperature</p>
          <p className={`font-display text-3xl font-bold ${(metrics?.temperature ?? 0) > 70 ? 'text-red-400' : 'text-teal'}`}>
            {metrics?.temperature ?? '—'}°C
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Status</p>
          <div className="flex items-center gap-2 mt-2">
            <GlowPill status={isConnected ? 'healthy' : 'error'} label={isConnected ? 'Online' : 'Offline'} />
          </div>
        </GlassCard>
      </div>

      {/* System info */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlassCard elevation="low">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">System Information</h3>
          {infoLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-6 animate-pulse rounded bg-surface-void" />)}
            </div>
          ) : info ? (
            <div className="divide-y divide-[var(--outline-variant)]">
              <InfoRow label="Hostname" value={info.hostname} />
              <InfoRow label="OS" value={`${info.distro} ${info.release}`} />
              <InfoRow label="Kernel" value={info.kernel} />
              <InfoRow label="Architecture" value={info.arch} />
              <InfoRow label="Model" value={info.model || 'Unknown'} />
            </div>
          ) : null}
        </GlassCard>

        <GlassCard elevation="low">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Hardware</h3>
          {infoLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-6 animate-pulse rounded bg-surface-void" />)}
            </div>
          ) : info ? (
            <div className="divide-y divide-[var(--outline-variant)]">
              <InfoRow label="CPU" value={info.cpu} />
              <InfoRow label="Cores" value={info.cores} />
              <InfoRow label="Uptime" value={metrics ? formatUptime(0) : '—'} />
            </div>
          ) : null}
        </GlassCard>
      </div>

      {/* Actions */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">System Actions</h3>
        <div className="flex flex-wrap gap-3">
          <StitchButton size="sm" variant="ghost">📊 Full Diagnostics</StitchButton>
          <StitchButton size="sm" variant="ghost">🔄 Check Updates</StitchButton>
          <StitchButton size="sm" variant="ghost">📝 View Logs</StitchButton>
          <StitchButton size="sm" variant="ghost">⚙️ Configuration</StitchButton>
        </div>
      </GlassCard>
    </div>
  );
}

import { t } from '@/i18n';
import { useCallback, lazy, Suspense } from 'react';
import { GlassCard, GlowPill } from '@/components/UI';

const MetricsChart = lazy(() => import('@/components/Charts/MetricsChart').then(m => ({ default: m.MetricsChart })));
const NetworkChart = lazy(() => import('@/components/Charts/NetworkChart').then(m => ({ default: m.NetworkChart })));
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';
import { api } from '@/api/client';
import type { Disk } from '@/api/client';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MetricValue({ value, unit, color = 'text-teal' }: { value: string | number; unit: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`font-display text-3xl font-bold ${color}`}>{value}</span>
      <span className="font-mono text-sm text-[var(--text-secondary)]">{unit}</span>
    </div>
  );
}

const ROLE_BORDERS: Record<string, string> = {
  cache: 'border-l-4 border-l-blue-400',
  data: 'border-l-4 border-l-teal',
  parity: 'border-l-4 border-l-orange',
  system: '',
};

function DiskRow({ disk }: { disk: Disk }) {
  const status = disk.health === 'healthy' ? 'healthy' : disk.health === 'warning' ? 'warning' : 'error';
  const barColor = (disk.usage ?? 0) > 90 ? 'bg-red-500' : (disk.usage ?? 0) > 75 ? 'bg-amber-500' : 'bg-teal';
  const roleBorder = ROLE_BORDERS[disk.role || ''] || '';

  return (
    <div className={`flex items-center justify-between py-3 pl-3 ${roleBorder}`}>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="font-mono text-sm text-[var(--text-primary)]">{disk.name}</span>
        <span className="text-xs text-[var(--text-secondary)]">
          {disk.device} · {disk.type}
          {(disk.temperature ?? 0) > 0 ? ` · ${disk.temperature}°C` : ''}
          {(disk.smart?.powerOnHours ?? 0) > 0 ? ` · ${Math.floor((disk.smart?.powerOnHours ?? 0) / 24)}d` : ''}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-28">
          <div className="h-1.5 rounded-full bg-surface-void">
            <div className={`h-1.5 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${disk.usage}%` }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="font-mono text-xs text-[var(--text-secondary)]">{disk.used}</span>
            <span className="font-mono text-xs text-[var(--text-disabled)]">{disk.usage}%</span>
          </div>
        </div>
        <GlowPill status={status} label={disk.smart?.status || 'N/A'} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { metrics: live, isConnected, history } = useLiveMetrics();
  const fetchDisks = useCallback(() => api.getDisks(), []);
  const fetchUptime = useCallback(() =>
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/system/metrics`).then(r => r.json()), []);
  const { data: disks, loading: disksLoading } = useAPI<Disk[]>(fetchDisks, 10000);
  const { data: sysMetrics } = useAPI<{ uptime: number }>(fetchUptime, 5000);

  const cpu = live ? parseFloat(live.cpu) : 0;
  const memUsed = live?.memory.used ?? 0;
  const loading = !live;

  // Main disk usage (first data disk or largest)
  const mainDisk = disks?.find(d => d.role === 'data') ?? disks?.[0];

  return (
    <div className="space-y-8">
      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-disabled)]">
        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-teal animate-pulse' : 'bg-red-500'}`} />
        {isConnected ? t('dash.realtime') : t('dash.connecting')}
      </div>

      {/* Metrics row: CPU, Memory, Uptime, Disk Usage */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('dash.cpuUsage')}</p>
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={cpu.toFixed(1)} unit="%" color={cpu > 80 ? 'text-red-400' : 'text-teal'} />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('dash.memory')}</p>
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={memUsed} unit="%" />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('sys.uptime')}</p>
          {!sysMetrics ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={formatUptime(sysMetrics.uptime)} unit="" />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('dash.diskUsage')}</p>
          {!mainDisk ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue
              value={mainDisk.usage ?? 0}
              unit={`% · ${mainDisk.free}`}
              color={(mainDisk.usage ?? 0) > 90 ? 'text-red-400' : 'text-teal'}
            />
          )}
        </GlassCard>
      </div>

      {/* Real-time charts */}
      {history.length > 5 && (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-surface-void" />}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <GlassCard elevation="low">
              <MetricsChart data={history} dataKey="cpu" label={t('dash.cpuHistory')} />
            </GlassCard>
            <GlassCard elevation="low">
              <MetricsChart data={history} dataKey="memory" label={t('dash.memHistory')} color="#64b5f6" />
            </GlassCard>
            <GlassCard elevation="low">
              <MetricsChart data={history} dataKey="temperature" label={t('dash.tempHistory')} maxY={90} unit="°C" />
            </GlassCard>
            <GlassCard elevation="low">
              <NetworkChart data={history} />
            </GlassCard>
          </div>
        </Suspense>
      )}

      {/* Disk Array */}
      <GlassCard elevation="low">
        <h2 className="mb-5 font-display text-lg font-semibold text-[var(--text-primary)]">
          {t('dash.diskArray')}
        </h2>
        {disksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-surface-void" />)}
          </div>
        ) : disks && disks.length > 0 ? (
          <div className="divide-y divide-[var(--outline-variant)]">
            {disks.map((disk) => <DiskRow key={disk.device} disk={disk} />)}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-disabled)] text-center py-4">{t('pool.noDisks')}</p>
        )}
      </GlassCard>
    </div>
  );
}

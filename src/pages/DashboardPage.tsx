import { useCallback } from 'react';
import { GlassCard, GlowPill } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { api } from '@/api/client';
import type { SystemMetrics, Disk } from '@/api/client';

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function MetricValue({ value, unit, color = 'text-teal' }: { value: string | number; unit: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`font-display text-3xl font-bold ${color}`}>{value}</span>
      <span className="font-mono text-sm text-[var(--text-secondary)]">{unit}</span>
    </div>
  );
}

function DiskRow({ disk }: { disk: Disk }) {
  const status = disk.health === 'healthy' ? 'healthy' : disk.health === 'warning' ? 'warning' : 'error';
  const barColor = disk.usage > 90 ? 'bg-red-500' : disk.usage > 75 ? 'bg-amber-500' : 'bg-teal';

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="font-mono text-sm text-[var(--text-primary)]">{disk.name}</span>
        <span className="text-xs text-[var(--text-secondary)]">{disk.device} · {disk.type} · {disk.size}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-[var(--text-secondary)]">{disk.temperature}°C</span>
        <div className="w-28">
          <div className="h-1.5 rounded-full bg-surface-void">
            <div className={`h-1.5 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${disk.usage}%` }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="font-mono text-xs text-[var(--text-secondary)]">{disk.used}</span>
            <span className="font-mono text-xs text-[var(--text-disabled)]">{disk.usage}%</span>
          </div>
        </div>
        <GlowPill status={status} label={disk.smart.status} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const fetchMetrics = useCallback(() => api.getMetrics(), []);
  const fetchDisks = useCallback(() => api.getDisks(), []);

  const { data: metrics, loading: metricsLoading } = useAPI<SystemMetrics>(fetchMetrics, 3000);
  const { data: disks, loading: disksLoading } = useAPI<Disk[]>(fetchDisks, 10000);

  return (
    <div className="space-y-6">
      {/* Metrics row */}
      <div className="grid grid-cols-1 gap-stitch-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">CPU Usage</p>
          {metricsLoading ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue
              value={parseFloat(metrics?.cpu || '0').toFixed(1)}
              unit="%"
              color={parseFloat(metrics?.cpu || '0') > 80 ? 'text-red-400' : 'text-teal'}
            />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Memory</p>
          {metricsLoading ? (
            <div className="h-9 w-24 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={metrics?.memory.used || 0} unit={`% / ${formatBytes((metrics?.memory.total || 0) * 1024 * 1024)}`} />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Temperature</p>
          {metricsLoading ? (
            <div className="h-9 w-16 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue
              value={metrics?.temperature || 0}
              unit="°C"
              color={(metrics?.temperature || 0) > 70 ? 'text-red-400' : 'text-teal'}
            />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Uptime</p>
          {metricsLoading ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={formatUptime(metrics?.uptime || 0)} unit="" />
          )}
        </GlassCard>
      </div>

      {/* Load average */}
      {metrics && (
        <GlassCard elevation="low">
          <div className="flex items-center gap-6">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Load Average</span>
            {metrics.load.map((l, i) => (
              <span key={i} className="font-mono text-lg text-[var(--text-primary)]">{l}</span>
            ))}
            <span className="ml-auto text-xs text-[var(--text-disabled)]">
              Updated: {new Date(metrics.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </GlassCard>
      )}

      {/* Disk Array */}
      <GlassCard elevation="low">
        <h2 className="mb-stitch-4 font-display text-lg font-semibold text-[var(--text-primary)]">
          Disk Array
        </h2>
        {disksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-surface-void" />)}
          </div>
        ) : (
          <div className="divide-y divide-[var(--outline-variant)]">
            {disks?.map((disk) => <DiskRow key={disk.device} disk={disk} />)}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

import { useCallback } from 'react';
import { GlassCard, GlowPill } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';
import { api } from '@/api/client';
import type { Disk } from '@/api/client';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
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

/** Mini sparkline from metric history */
function Sparkline({ data, color = '#44e5c2' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 24;
  const w = 80;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  const { metrics: live, isConnected, history } = useLiveMetrics();
  const fetchDisks = useCallback(() => api.getDisks(), []);
  const { data: disks, loading: disksLoading } = useAPI<Disk[]>(fetchDisks, 10000);

  // Use live metrics if available, otherwise show loading
  const cpu = live ? parseFloat(live.cpu) : 0;
  const memUsed = live?.memory.used ?? 0;
  const memTotal = live?.memory.total ?? 0;
  const temp = live?.temperature ?? 0;
  const loading = !live;

  const cpuHistory = history.map(h => parseFloat(h.cpu));
  const memHistory = history.map(h => h.memory.used);

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-disabled)]">
        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-teal animate-pulse' : 'bg-red-500'}`} />
        {isConnected ? 'Real-time' : 'Connecting...'}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-1 gap-stitch-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">CPU Usage</p>
            <Sparkline data={cpuHistory} color={cpu > 80 ? '#ff6b6b' : '#44e5c2'} />
          </div>
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={cpu.toFixed(1)} unit="%" color={cpu > 80 ? 'text-red-400' : 'text-teal'} />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Memory</p>
            <Sparkline data={memHistory} />
          </div>
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={memUsed} unit={`% / ${formatBytes(memTotal * 1024 * 1024)}`} />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Temperature</p>
          {loading ? (
            <div className="h-9 w-16 animate-pulse rounded bg-surface-void" />
          ) : (
            <MetricValue value={temp} unit="°C" color={temp > 70 ? 'text-red-400' : 'text-teal'} />
          )}
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Network I/O</p>
          {loading || !live?.network ? (
            <div className="h-9 w-20 animate-pulse rounded bg-surface-void" />
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-sm text-teal">↓ {formatSpeed(live.network.rx)}</span>
              <span className="font-mono text-sm text-orange">↑ {formatSpeed(live.network.tx)}</span>
            </div>
          )}
        </GlassCard>
      </div>

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

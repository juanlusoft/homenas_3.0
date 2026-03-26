/**
 * Network throughput chart — dual area (RX/TX)
 */

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import type { LiveMetrics } from '@/hooks/useLiveMetrics';

interface NetworkChartProps {
  data: LiveMetrics[];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
}

export function NetworkChart({ data }: NetworkChartProps) {
  const chartData = data.map(point => ({
    time: formatTime(point.timestamp),
    rx: point.network ? point.network.rx / 1024 : 0,  // KB/s
    tx: point.network ? point.network.tx / 1024 : 0,
  }));

  const maxVal = Math.max(
    ...chartData.map(d => Math.max(d.rx, d.tx)),
    10 // minimum 10 KB/s scale
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          Network Throughput
        </span>
        {data.length > 0 && data[data.length - 1].network && (
          <div className="flex gap-3">
            <span className="font-mono text-xs text-teal">
              ↓ {formatSpeed(data[data.length - 1].network!.rx)}
            </span>
            <span className="font-mono text-xs text-orange">
              ↑ {formatSpeed(data[data.length - 1].network!.tx)}
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="grad-rx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#44e5c2" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#44e5c2" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-tx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5a623" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f5a623" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(60, 74, 69, 0.15)" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: 'var(--text-disabled)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.2)]}
            tick={{ fontSize: 10, fill: 'var(--text-disabled)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-container-high)',
              border: '1px solid var(--outline-variant)',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
            }}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)} KB/s`,
              name === 'rx' ? '↓ Download' : '↑ Upload',
            ]}
          />
          <Legend
            formatter={(value: string) => value === 'rx' ? '↓ RX' : '↑ TX'}
            wrapperStyle={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}
          />
          <Area type="monotone" dataKey="rx" stroke="#44e5c2" strokeWidth={1.5} fill="url(#grad-rx)" isAnimationActive={false} />
          <Area type="monotone" dataKey="tx" stroke="#f5a623" strokeWidth={1.5} fill="url(#grad-tx)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Real-time metrics chart — Stitch-themed area chart
 * Displays CPU, Memory, or Temperature history from live metrics
 */

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { LiveMetrics } from '@/hooks/useLiveMetrics';

interface MetricsChartProps {
  data: LiveMetrics[];
  dataKey: 'cpu' | 'memory' | 'temperature';
  label: string;
  color?: string;
  maxY?: number;
  unit?: string;
}

const STITCH_COLORS = {
  cpu: '#44e5c2',
  memory: '#64b5f6',
  temperature: '#f5a623',
};

function extractValue(point: LiveMetrics, key: MetricsChartProps['dataKey']): number {
  if (key === 'cpu') return parseFloat(point.cpu);
  if (key === 'memory') return point.memory.used;
  return point.temperature;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
}

export function MetricsChart({
  data,
  dataKey,
  label,
  color,
  maxY = 100,
  unit = '%',
}: MetricsChartProps) {
  const chartColor = color ?? STITCH_COLORS[dataKey];

  const chartData = data.map(point => ({
    time: formatTime(point.timestamp),
    value: extractValue(point, dataKey),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        {chartData.length > 0 && (
          <span className="font-mono text-sm" style={{ color: chartColor }}>
            {chartData[chartData.length - 1].value.toFixed(1)}{unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
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
            domain={[0, maxY]}
            tick={{ fontSize: 10, fill: 'var(--text-disabled)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-container-high)',
              border: '1px solid var(--outline-variant)',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
            }}
            formatter={(value) => [`${Number(value).toFixed(1)}${unit}`, label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={chartColor}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

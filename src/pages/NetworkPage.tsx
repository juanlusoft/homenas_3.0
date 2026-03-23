import { t } from '@/i18n';
import { useCallback, lazy, Suspense } from 'react';
import { GlassCard, GlowPill } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';
import { api } from '@/api/client';
import type { NetworkInterface } from '@/api/client';

const NetworkChart = lazy(() => import('@/components/Charts/NetworkChart').then(m => ({ default: m.NetworkChart })));

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function InterfaceCard({ iface }: { iface: NetworkInterface }) {
  const status = iface.status === 'up' ? 'healthy' : 'error';

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">{iface.name}</h3>
          <p className="font-mono text-sm text-teal">{iface.ip}</p>
        </div>
        <GlowPill status={status} label={iface.status.toUpperCase()} />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">{t('net.speed')}</span>
          <span className="font-mono text-sm text-[var(--text-primary)]">{iface.speed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">{t('net.netmask')}</span>
          <span className="font-mono text-sm text-[var(--text-primary)]">{iface.netmask}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-[var(--text-secondary)]">{t('net.gateway')}</span>
          <span className="font-mono text-sm text-[var(--text-primary)]">{iface.gateway}</span>
        </div>

        <div className="h-px bg-[var(--outline-variant)]" />

        <div className="grid grid-cols-2 gap-5 text-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-1">{t('net.received')}</p>
            <p className="font-mono text-lg font-bold text-teal">{formatBytes(iface.rx_bytes)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-1">{t('net.sent')}</p>
            <p className="font-mono text-lg font-bold text-[var(--text-primary)]">{formatBytes(iface.tx_bytes)}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export default function NetworkPage() {
  const fetchNetwork = useCallback(() => api.getNetwork(), []);
  const { data: interfaces, loading } = useAPI<NetworkInterface[]>(fetchNetwork, 5000);
  const { history } = useLiveMetrics();

  const activeCount = interfaces?.filter((i) => i.status === 'up').length || 0;

  return (
    <div className="space-y-8">
      {/* Real-time throughput chart */}
      {history.length > 5 && (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-surface-void" />}>
          <GlassCard elevation="low">
            <NetworkChart data={history} />
          </GlassCard>
        </Suspense>
      )}

      {/* Summary */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('net.interfaces')}</p>
            <p className="font-display text-2xl font-bold text-teal">{activeCount}/{interfaces?.length || 0} active</p>
          </div>
          <GlowPill status={activeCount > 0 ? 'healthy' : 'error'} label={activeCount > 0 ? 'Connected' : 'No Connection'} />
        </div>
      </GlassCard>

      {/* Interface cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {interfaces?.map((iface) => <InterfaceCard key={iface.name} iface={iface} />)}
        </div>
      )}
    </div>
  );
}

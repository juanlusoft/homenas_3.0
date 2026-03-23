import { t } from '@/i18n';
import { useState, useCallback, lazy, Suspense } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
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

  const [editIface, setEditIface] = useState<string | null>(null);
  const [netForm, setNetForm] = useState({ mode: 'dhcp', ip: '', netmask: '255.255.255.0', gateway: '', dns: '' });

  const handleSaveNetwork = useCallback(async () => {
    if (!editIface) return;
    const API = import.meta.env.VITE_API_URL || '/api';
    await fetch(`${API}/network/interfaces/${editIface}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(netForm),
    });
    setEditIface(null);
  }, [editIface, netForm]);

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

      {/* Edit Interface Modal */}
      <Modal open={!!editIface} onClose={() => setEditIface(null)} title={`${t('net.edit')}: ${editIface}`}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setEditIface(null)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleSaveNetwork}>{t('common.save')}</StitchButton></>}>
        <p className="text-xs text-orange mb-3">{t('net.editWarning')}</p>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['dhcp', 'static'] as const).map(mode => (
              <button key={mode} onClick={() => setNetForm(f => ({ ...f, mode }))}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors border ${netForm.mode === mode ? 'bg-teal/10 text-teal border-teal/30' : 'border-[var(--outline-variant)]'}`}>
                {mode === 'dhcp' ? t('wiz.dhcp') : t('wiz.static')}
              </button>
            ))}
          </div>
          {netForm.mode === 'static' && (<>
            <input value={netForm.ip} onChange={e => setNetForm(f => ({ ...f, ip: e.target.value }))} placeholder={t('net.ip')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            <input value={netForm.gateway} onChange={e => setNetForm(f => ({ ...f, gateway: e.target.value }))} placeholder={t('net.gateway')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            <input value={netForm.dns} onChange={e => setNetForm(f => ({ ...f, dns: e.target.value }))} placeholder={t('net.dns')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
          </>)}
        </div>
      </Modal>
    </div>
  );
}

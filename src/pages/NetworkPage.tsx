import { t, ts } from '@/i18n';
import { useState, useCallback, lazy, Suspense } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';
import { api, fetchAPI } from '@/api/client';
import type { NetworkInterface } from '@/api/client';

const NetworkChart = lazy(() => import('@/components/Charts/NetworkChart').then(m => ({ default: m.NetworkChart })));

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function InterfaceCard({ iface, onConfigure }: { iface: NetworkInterface; onConfigure: (name: string) => void }) {
  const status = iface.status === 'up' ? 'healthy' : 'error';

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{iface.name}</h3>
          <p className="font-mono text-sm text-teal">{iface.ip}</p>
        </div>
        <GlowPill status={status} label={ts(iface.status)} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('net.speed')}</span>
          <span className="font-mono text-[var(--text-primary)]">{iface.speed}</span>
        </div>
        {iface.netmask && (
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">{t('net.netmask')}</span>
            <span className="font-mono text-[var(--text-primary)]">{iface.netmask}</span>
          </div>
        )}
        {iface.gateway && (
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">{t('net.gateway')}</span>
            <span className="font-mono text-[var(--text-primary)]">{iface.gateway}</span>
          </div>
        )}

        <div className="h-px bg-[var(--outline-variant)]" />

        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-1">{t('net.received')}</p>
            <p className="font-mono text-base font-bold text-teal">{formatBytes(iface.rx_bytes ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-1">{t('net.sent')}</p>
            <p className="font-mono text-base font-bold text-[var(--text-primary)]">{formatBytes(iface.tx_bytes ?? 0)}</p>
          </div>
        </div>

        <StitchButton size="sm" variant="ghost" className="w-full mt-2" onClick={() => onConfigure(iface.name)}>
          {t('net.configure')} (DHCP / {t('wiz.static')})
        </StitchButton>
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
  const [vpnOpen, setVpnOpen] = useState(false);
  const [vpnForm, setVpnForm] = useState({ listenPort: '51820', endpoint: '', dns: '1.1.1.1', allowedIps: '0.0.0.0/0' });
  const [vpnSaving, setVpnSaving] = useState(false);
  const [vpnStatus, setVpnStatus] = useState<string | null>(null);

  const handleSaveNetwork = useCallback(async () => {
    if (!editIface) return;
    await fetchAPI(`/network/${editIface}/config`, {
      method: 'PUT',
      body: JSON.stringify(netForm),
    });
    setEditIface(null);
  }, [editIface, netForm]);

  const handleSaveVpn = useCallback(async () => {
    setVpnSaving(true);
    try {
      const res = await fetchAPI<{ success: boolean }>(`/network/vpn/wireguard`, {
        method: 'POST',
        body: JSON.stringify(vpnForm),
      });
      if (res.success) {
        setVpnStatus('WireGuard configured successfully');
        setVpnOpen(false);
      } else {
        setVpnStatus('Failed to configure WireGuard');
      }
    } catch {
      setVpnStatus('Connection error');
    } finally {
      setVpnSaving(false);
      setTimeout(() => setVpnStatus(null), 3000);
    }
  }, [vpnForm]);

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
            <p className="font-display text-2xl font-bold text-teal">{activeCount}/{interfaces?.length || 0} {ts('active')}</p>
          </div>
          <GlowPill status={activeCount > 0 ? 'healthy' : 'error'} label={activeCount > 0 ? t('net.connected') : t('net.noConnection')} />
        </div>
      </GlassCard>

      {/* Interface cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {interfaces?.map((iface) => <InterfaceCard key={iface.name} iface={iface} onConfigure={(name) => {
            setNetForm({ mode: 'dhcp', ip: iface.ip || '', netmask: iface.netmask || '255.255.255.0', gateway: iface.gateway || '', dns: '' });
            setEditIface(name);
          }} />)}
        </div>
      )}

      {/* VPN Section */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">VPN (WireGuard)</h3>
            <p className="text-xs text-[var(--text-secondary)]">Secure remote access to your NAS</p>
          </div>
          <StitchButton size="sm" onClick={() => setVpnOpen(true)}>
            {t('net.configure')} WireGuard
          </StitchButton>
        </div>
        {vpnStatus && <p className="mt-2 text-sm text-teal font-mono">{vpnStatus}</p>}
      </GlassCard>

      {/* WireGuard Config Modal */}
      <Modal open={vpnOpen} onClose={() => setVpnOpen(false)} title="WireGuard VPN"
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setVpnOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleSaveVpn} disabled={vpnSaving}>{vpnSaving ? '...' : t('common.save')}</StitchButton></>}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Listen Port</label>
            <input value={vpnForm.listenPort} onChange={e => setVpnForm(f => ({ ...f, listenPort: e.target.value }))} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Endpoint (public IP or domain)</label>
            <input value={vpnForm.endpoint} onChange={e => setVpnForm(f => ({ ...f, endpoint: e.target.value }))} placeholder="vpn.example.com" className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">DNS</label>
            <input value={vpnForm.dns} onChange={e => setVpnForm(f => ({ ...f, dns: e.target.value }))} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Allowed IPs</label>
            <input value={vpnForm.allowedIps} onChange={e => setVpnForm(f => ({ ...f, allowedIps: e.target.value }))} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
        </div>
      </Modal>

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

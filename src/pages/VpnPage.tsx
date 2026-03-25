import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';

interface VpnPeer { id: string; name: string; publicKey: string; allowedIPs: string; createdAt: string; }
interface VpnConfig { enabled: boolean; listenPort: number; serverAddress: string; publicKey: string; peers: VpnPeer[]; }

const API = import.meta.env.VITE_API_URL || '/api';

export default function VpnPage() {
  const fetchVpn = useCallback(() => authFetch(`${API}/vpn`).then(r => r.json()), []);
  const { data: vpn, refresh } = useAPI<VpnConfig>(fetchVpn, 10000);
  const [addOpen, setAddOpen] = useState(false);
  const [peerName, setPeerName] = useState('');
  const [clientConfig, setClientConfig] = useState('');

  const handleSetup = useCallback(async () => {
    await authFetch(`${API}/vpn/setup`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const handleAddPeer = useCallback(async () => {
    if (!peerName.trim()) return;
    const res = await authFetch(`${API}/vpn/peers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: peerName.trim() }) });
    const data = await res.json();
    if (data.clientConfig) setClientConfig(data.clientConfig);
    setPeerName('');
    setAddOpen(false);
    refresh();
  }, [peerName, refresh]);

  const handleDeletePeer = useCallback(async (id: string) => {
    await authFetch(`${API}/vpn/peers/${id}`, { method: 'DELETE' });
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('vpn.title')}</p>
          <GlowPill status={vpn?.enabled ? 'healthy' : 'error'} label={vpn?.enabled ? t('common.online') : t('common.offline')} />
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('vpn.peers')}</p>
          <p className="font-display text-2xl font-bold text-teal">{vpn?.peers?.length || 0}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('common.actions')}</p>
          <div className="flex gap-2 mt-2">
            {!vpn?.enabled && <StitchButton size="sm" onClick={handleSetup}>{t('vpn.setup')}</StitchButton>}
            {vpn?.enabled && <StitchButton size="sm" onClick={() => setAddOpen(true)}>{t('vpn.addPeer')}</StitchButton>}
          </div>
        </GlassCard>
      </div>

      {vpn?.enabled && (
        <GlassCard elevation="low">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('vpn.peers')}</h3>
          {vpn.peers.length === 0 ? (
            <p className="text-sm text-[var(--text-disabled)] text-center py-4">No hay clientes VPN</p>
          ) : (
            <div className="divide-y divide-[var(--outline-variant)]">
              {vpn.peers.map(peer => (
                <div key={peer.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm text-[var(--text-primary)]">{peer.name}</p>
                    <p className="font-mono text-xs text-[var(--text-secondary)]">{peer.allowedIPs} · {peer.createdAt.slice(0, 10)}</p>
                  </div>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleDeletePeer(peer.id)}>🗑️</StitchButton>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {clientConfig && (
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-teal mb-2">{t('vpn.downloadConfig')}</h3>
          <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] overflow-x-auto">{clientConfig}</pre>
          <StitchButton size="sm" className="mt-3" onClick={() => { navigator.clipboard.writeText(clientConfig); }}>📋 Copiar</StitchButton>
        </GlassCard>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('vpn.addPeer')}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleAddPeer}>{t('common.save')}</StitchButton></>}>
        <input value={peerName} onChange={e => setPeerName(e.target.value)} placeholder={t('vpn.peerName')} autoFocus className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" onKeyDown={e => e.key === 'Enter' && handleAddPeer()} />
      </Modal>
    </div>
  );
}

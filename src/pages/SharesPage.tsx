import { t, ts } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { useAPI } from '@/hooks/useAPI';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';

interface Share {
  id: string;
  name: string;
  path: string;
  protocol: 'smb' | 'nfs';
  status: 'active' | 'inactive';
  accessMode: 'read-write' | 'read-only';
  allowedUsers: string[];
  connectedClients: number;
}

// No mock data — empty state until API responds

const EMPTY_FORM: { name: string; path: string; protocol: 'smb' | 'nfs'; accessMode: 'read-write' | 'read-only'; allowedUsers: string } = { name: '', path: '/mnt/storage/', protocol: 'smb', accessMode: 'read-write', allowedUsers: '' };

export default function SharesPage() {
  const fetchShares = useCallback(() =>
    authFetch('/shares').then(r => r.json()), []);
  const { data: sharesData, refresh } = useAPI<Share[]>(fetchShares, 0);
  const shares = sharesData || [];
  const [addOpen, setAddOpen] = useState(false);
  const [editShare, setEditShare] = useState<Share | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const activeCount = shares.filter(s => s.status === 'active').length;
  const totalClients = shares.reduce((acc, s) => acc + s.connectedClients, 0);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim() || !form.path.trim()) return;
    await authFetch('/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name.trim(), sharePath: form.path.trim(), protocol: form.protocol, accessMode: form.accessMode, allowedUsers: form.allowedUsers.split(',').map((u: string) => u.trim()).filter(Boolean) }) });
    refresh();
    setAddOpen(false); setForm(EMPTY_FORM);
  }, [form]);

  const handleEdit = useCallback(async () => {
    if (!editShare) return;
    await authFetch(`/shares/${editShare.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        sharePath: form.path.trim(),
        protocol: form.protocol,
        accessMode: form.accessMode,
        allowedUsers: form.allowedUsers.split(',').map((u: string) => u.trim()).filter(Boolean),
      }),
    });
    refresh();
    setEditShare(null);
    setForm(EMPTY_FORM);
  }, [editShare, form, refresh]);

  const handleToggle = useCallback(async (id: string) => {
    await authFetch(`/shares/${id}/toggle`, { method: 'POST' });
    refresh();
  }, []);

  const openEdit = (share: Share) => {
    setForm({ name: share.name, path: share.path, protocol: share.protocol, accessMode: share.accessMode, allowedUsers: share.allowedUsers.join(', ') });
    setEditShare(share);
  };

  const protocolBadge = (p: string) => p === 'smb' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400';

  const ShareForm = () => (
    <div className="space-y-3">
      <input value={form.name} onChange={e => {
          const name = e.target.value;
          setForm(f => ({ ...f, name, path: '/mnt/storage/' + name.toLowerCase().replace(/[^a-z0-9_-]/g, '') }));
        }} placeholder={t('files.name')} autoFocus className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Ruta en disco</label>
        <input value={form.path} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} placeholder="/mnt/storage/musica" className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        <p className="text-xs text-[var(--text-disabled)] mt-1">Se creará automáticamente si no existe</p>
      </div>
      <div className="flex gap-2">
        <select value={form.protocol} onChange={e => setForm(f => ({ ...f, protocol: e.target.value as 'smb' | 'nfs' }))} className="stitch-input flex-1 rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]">
          <option value="smb">SMB</option><option value="nfs">NFS</option>
        </select>
        <select value={form.accessMode} onChange={e => setForm(f => ({ ...f, accessMode: e.target.value as Share['accessMode'] }))} className="stitch-input flex-1 rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]">
          <option value="read-write">{t('shares.readWrite')}</option><option value="read-only">{t('shares.readOnly')}</option>
        </select>
      </div>
      <input value={form.allowedUsers} onChange={e => setForm(f => ({ ...f, allowedUsers: e.target.value }))} placeholder={`${t('shares.users')} (comma separated)`} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('shares.shares')}</p>
          <p className="font-display text-2xl font-bold text-teal">{activeCount}/{shares.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('shares.active')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('shares.connected')}</p>
          <p className="font-display text-2xl font-bold text-teal">{totalClients}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('shares.clients')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('shares.protocols')}</p>
          <div className="flex gap-2 mt-1">
            <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">SMB {shares.filter(s => s.protocol === 'smb').length}</span>
            <span className="text-xs font-mono bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">NFS {shares.filter(s => s.protocol === 'nfs').length}</span>
          </div>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('shares.actions')}</p>
          <StitchButton size="sm" className="mt-2" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}>{t('shares.newShare')}</StitchButton>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {shares.map(share => (
          <GlassCard key={share.id} elevation="mid">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{share.name}</h3>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${protocolBadge(share.protocol)}`}>{share.protocol.toUpperCase()}</span>
              </div>
              <GlowPill status={share.status === 'active' ? 'healthy' : 'error'} label={ts(share.status)} />
            </div>
            <p className="font-mono text-xs text-[var(--text-secondary)] mb-3">{share.path}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('shares.access')}</span><span className="font-mono text-teal">{ts(share.accessMode)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('shares.users')}</span><span className="font-mono text-xs">{share.allowedUsers.map(u => ts(u)).join(', ')}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('shares.connected')}</span><span className="font-mono">{share.connectedClients} {t('shares.clients')}</span></div>
            </div>
            <div className="flex gap-2 mt-4">
              <StitchButton size="sm" variant="ghost" onClick={() => openEdit(share)}>{t('shares.edit')}</StitchButton>
              <StitchButton size="sm" variant="ghost" onClick={() => handleToggle(share.id)}>
                {share.status === 'active' ? t('shares.disable') : t('shares.enable')}
              </StitchButton>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('shares.newShare')}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleAdd}>{t('common.save')}</StitchButton></>}>
        <ShareForm />
      </Modal>

      <Modal open={!!editShare} onClose={() => setEditShare(null)} title={`${t('shares.edit')}: ${editShare?.name}`}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setEditShare(null)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleEdit}>{t('common.save')}</StitchButton></>}>
        <ShareForm />
      </Modal>
    </div>
  );
}

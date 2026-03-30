import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useCallback, useState, useEffect, useRef } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { api } from '@/api/client';
import type { Disk } from '@/api/client';

const ROLE_BADGE: Record<string, { color: string; label: string }> = {
  cache: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Caché' },
  data: { color: 'bg-teal/10 text-teal border-teal/30', label: 'Datos' },
  parity: { color: 'bg-orange/10 text-orange border-orange/30', label: 'Paridad' },
};

interface AvailableDisk {
  device: string;
  model: string;
  size: number;
  sizeHuman: string;
  type: string;
  serial: string;
  hasFilesystem: boolean;
  hasMountedPartition: boolean;
  filesystem: string;
  partitions: { name: string; size: number; fstype: string; mountpoint: string }[];
}

type DiskAction = 'pool' | 'standalone' | 'external';

function DiskCard({ disk, onRemoveFromPool }: { disk: Disk; onRemoveFromPool?: (disk: Disk) => void }) {
  const status = disk.health === 'healthy' ? 'healthy' : disk.health === 'warning' ? 'warning' : 'error';
  const barColor = (disk.usage ?? 0) > 90 ? 'bg-red-500' : (disk.usage ?? 0) > 75 ? 'bg-amber-500' : 'bg-teal';
  const badge = disk.role ? ROLE_BADGE[disk.role] : null;
  const isPoolDisk = disk.role === 'data' || disk.role === 'cache';

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{disk.name}</h3>
            {badge && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${badge.color}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-[var(--text-secondary)]">{disk.device} · {disk.type}</p>
        </div>
        <GlowPill status={status} label={disk.smart?.status || 'N/A'} />
      </div>

      {/* Usage bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-[var(--text-secondary)]">Used: {disk.used}</span>
          <span className="text-xs text-[var(--text-secondary)]">Free: {disk.free}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-void">
          <div className={`h-2 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${disk.usage}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-xs text-[var(--text-disabled)]">{disk.size} total</span>
          <span className={`font-mono text-sm font-bold ${(disk.usage ?? 0) > 90 ? 'text-red-400' : 'text-teal'}`}>{disk.usage ?? 0}%</span>
        </div>
      </div>

      {/* SMART details */}
      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">
            {(disk.temperature ?? 0) > 0 ? `${disk.temperature}°C` : 'N/A'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.temp')}</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">
            {(disk.smart?.powerOnHours ?? 0) > 0 ? `${Math.floor((disk.smart?.powerOnHours ?? 0) / 24)}d` : 'N/A'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.powerOn')}</p>
        </div>
        <div>
          <p className={`font-mono text-lg font-bold ${(disk.smart?.badSectors ?? 0) > 0 ? 'text-red-400' : 'text-teal'}`}>
            {disk.smart?.status === 'N/A' ? 'N/A' : disk.smart?.badSectors ?? 0}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{t('storage.badSectors')}</p>
        </div>
      </div>

      {isPoolDisk && onRemoveFromPool && (
        <StitchButton size="sm" variant="ghost" className="w-full text-red-400 hover:text-red-300"
          onClick={() => onRemoveFromPool(disk)}>
          Quitar del pool
        </StitchButton>
      )}
    </GlassCard>
  );
}

interface SnapraidJob {
  output: string[];
  done: boolean;
  exitCode: number | null;
  startedAt: string;
}

function SnapraidSection({ onRefreshDisks }: { onRefreshDisks: () => void }) {
  const fetchStatus = useCallback(() =>
    authFetch('/storage/snapraid/status').then(r => r.json()), []);
  const { data: status, loading: statusLoading, refresh: refreshStatus } = useAPI<{
    available: boolean; synced: boolean; hasError: boolean; output: string;
  }>(fetchStatus);

  const [activeJob, setActiveJob] = useState<{ id: string; type: 'sync' | 'scrub' } | null>(null);
  const [jobData, setJobData] = useState<SnapraidJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startJob = useCallback(async (type: 'sync' | 'scrub') => {
    const res = await authFetch(`/storage/snapraid/${type}`, { method: 'POST' });
    const data = await res.json();
    setActiveJob({ id: data.jobId, type });
    setJobData({ output: [], done: false, exitCode: null, startedAt: new Date().toISOString() });
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    pollRef.current = setInterval(async () => {
      const res = await authFetch(`/storage/snapraid/progress/${activeJob.id}`);
      if (!res.ok) return;
      const data: SnapraidJob = await res.json();
      setJobData(data);
      if (data.done) {
        clearInterval(pollRef.current!);
        refreshStatus();
        onRefreshDisks();
      }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeJob, refreshStatus, onRefreshDisks]);

  const outputRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [jobData?.output.length]);

  if (statusLoading) return <div className="h-24 animate-pulse rounded-xl bg-surface-void" />;
  if (!status?.available) return null;

  const isRunning = activeJob && jobData && !jobData.done;

  return (
    <GlassCard elevation="low">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">SnapRAID</h3>
          <p className="text-xs text-[var(--text-secondary)]">
            {status.synced ? '✅ Pool sincronizado' : status.hasError ? '❌ Errores detectados' : '⚠️ Sincronización pendiente'}
          </p>
        </div>
        <div className="flex gap-2">
          <StitchButton size="sm" variant="ghost" onClick={() => startJob('sync')} disabled={!!isRunning}>
            {isRunning && activeJob?.type === 'sync' ? '⏳ Sincronizando...' : '🔄 Sync'}
          </StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={() => startJob('scrub')} disabled={!!isRunning}>
            {isRunning && activeJob?.type === 'scrub' ? '⏳ Verificando...' : '🔍 Scrub'}
          </StitchButton>
        </div>
      </div>

      {jobData && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              {activeJob?.type === 'sync' ? 'Sincronización' : 'Verificación'} — {jobData.done ? (jobData.exitCode === 0 ? '✅ Completado' : '❌ Error') : '⏳ En curso...'}
            </span>
            {jobData.done && (
              <button className="text-xs text-[var(--text-disabled)] hover:text-[var(--text-secondary)]"
                onClick={() => { setActiveJob(null); setJobData(null); }}>
                Cerrar
              </button>
            )}
          </div>
          <pre ref={outputRef}
            className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] max-h-56 overflow-auto whitespace-pre-wrap">
            {jobData.output.join('\n') || 'Iniciando...'}
          </pre>
        </div>
      )}

      {!jobData && (
        <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-secondary)] max-h-40 overflow-auto whitespace-pre-wrap">
          {status.output}
        </pre>
      )}
    </GlassCard>
  );
}

function AvailableDiskCard({ disk, onAction }: { disk: AvailableDisk; onAction: (disk: AvailableDisk) => void }) {
  const typeIcon = disk.type === 'nvme' ? '⚡' : disk.type === 'ssd' ? '💿' : '🗄️';
  return (
    <GlassCard elevation="mid" className="border border-dashed border-[var(--outline-variant)] hover:border-teal/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{typeIcon}</span>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{disk.model || disk.device}</h3>
          </div>
          <p className="font-mono text-xs text-[var(--text-secondary)] mt-0.5">{disk.device} · {disk.sizeHuman}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          Sin usar
        </span>
      </div>

      {disk.hasFilesystem && (
        <p className="text-xs text-[var(--text-secondary)] mb-3 font-mono">
          FS detectado: <span className="text-teal">{disk.filesystem || disk.partitions.map(p => p.fstype).filter(Boolean).join(', ')}</span>
        </p>
      )}

      {disk.partitions.length > 0 && (
        <div className="mb-3 space-y-1">
          {disk.partitions.map(p => (
            <div key={p.name} className="flex justify-between text-xs font-mono text-[var(--text-disabled)]">
              <span>{p.name}</span>
              <span>{p.fstype || 'sin formato'}</span>
            </div>
          ))}
        </div>
      )}

      <StitchButton size="sm" className="w-full" onClick={() => onAction(disk)}>
        Gestionar disco
      </StitchButton>
    </GlassCard>
  );
}

export default function StoragePage() {
  const fetchDisks = useCallback(() => api.getDisks(), []);
  const { data: disks, loading, refresh } = useAPI<Disk[]>(fetchDisks, 15000);

  const fetchAvailable = useCallback(() =>
    authFetch('/storage/available-disks').then(r => r.json() as Promise<AvailableDisk[]>), []);
  const { data: availableDisks, loading: availLoading, refresh: refreshAvail } = useAPI<AvailableDisk[]>(fetchAvailable, 30000);

  const [smartRunning, setSmartRunning] = useState(false);
  const [removingDisk, setRemovingDisk] = useState<Disk | null>(null);
  const [removeResult, setRemoveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [selectedDisk, setSelectedDisk] = useState<AvailableDisk | null>(null);
  const [action, setAction] = useState<DiskAction>('pool');
  const [standaloneName, setStandaloneName] = useState('');
  const [externalName, setExternalName] = useState('recovery');
  const [externalPartition, setExternalPartition] = useState('');
  const [externalReadonly, setExternalReadonly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleRemoveFromPool = useCallback((disk: Disk) => {
    setRemovingDisk(disk);
    setRemoveResult(null);
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!removingDisk) return;
    if (!confirm(`⚠️ ¿Quitar ${removingDisk.mount} del pool? El disco se desmontará.`)) return;
    setRemoveBusy(true);
    try {
      const res = await authFetch('/storage/remove-from-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountpoint: removingDisk.mount }),
      });
      const data = await res.json();
      setRemoveResult({ ok: !!data.success, msg: data.message || data.error });
      if (data.success) { refresh(); refreshAvail(); }
    } catch {
      setRemoveResult({ ok: false, msg: 'Error de conexión' });
    } finally {
      setRemoveBusy(false);
    }
  }, [removingDisk, refresh, refreshAvail]);

  const openModal = useCallback((disk: AvailableDisk) => {
    setSelectedDisk(disk);
    setAction(disk.hasFilesystem ? 'external' : 'pool');
    setStandaloneName('');
    setExternalName('recovery');
    setExternalPartition(disk.partitions[0]?.name || disk.device);
    setExternalReadonly(true);
    setResult(null);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedDisk(null);
    setResult(null);
    refresh();
    refreshAvail();
  }, [refresh, refreshAvail]);

  const handleAction = useCallback(async () => {
    if (!selectedDisk) return;
    setBusy(true);
    setResult(null);
    try {
      let res: Response;
      if (action === 'pool') {
        if (!confirm(`⚠️ ATENCIÓN: Se borrará TODO el contenido de ${selectedDisk.device} (${selectedDisk.sizeHuman}). ¿Continuar?`)) {
          setBusy(false); return;
        }
        res = await authFetch('/storage/add-to-pool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: selectedDisk.device }),
        });
      } else if (action === 'standalone') {
        if (!standaloneName.trim()) { setResult({ ok: false, msg: 'Escribe un nombre para el volumen' }); setBusy(false); return; }
        if (!confirm(`⚠️ ATENCIÓN: Se borrará TODO el contenido de ${selectedDisk.device}. ¿Continuar?`)) {
          setBusy(false); return;
        }
        res = await authFetch('/storage/mount-standalone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: selectedDisk.device, name: standaloneName }),
        });
      } else {
        res = await authFetch('/storage/mount-external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partition: externalPartition, name: externalName, readonly: externalReadonly }),
        });
      }
      const data = await res.json();
      setResult({ ok: !!data.success, msg: data.message || data.error || 'Error desconocido' });
    } catch {
      setResult({ ok: false, msg: 'Error de conexión con el servidor' });
    } finally {
      setBusy(false);
    }
  }, [selectedDisk, action, standaloneName, externalPartition, externalName, externalReadonly]);

  const runSmartCheck = useCallback(async () => {
    if (!disks?.length) return;
    setSmartRunning(true);
    try {
      await Promise.all(
        disks.map(d => {
          const dev = d.device.replace('/dev/', '').replace(/\d+$/, '');
          return authFetch(`/storage/smart-test/${dev}`, { method: 'POST' });
        })
      );
      refresh();
    } finally {
      setSmartRunning(false);
    }
  }, [disks, refresh]);

  const totalSize = disks?.reduce((acc, d) => acc + parseFloat(String(d.size)), 0) || 0;
  const totalUsed = disks?.reduce((acc, d) => acc + parseFloat(String(d.used)), 0) || 0;
  const healthyCount = disks?.filter((d) => d.health === 'healthy').length || 0;
  const unusedDisks = availableDisks?.filter(d => !d.hasMountedPartition) || [];

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.totalStorage')}</p>
          <p className="font-display text-2xl font-bold text-teal">{totalSize.toFixed(1)} GB</p>
          <p className="text-xs text-[var(--text-secondary)]">{totalUsed.toFixed(1)} GB used</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.disks')}</p>
          <p className="font-display text-2xl font-bold text-teal">{disks?.length || 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{healthyCount} {t('storage.healthy')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('storage.actions')}</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm" variant="ghost" onClick={runSmartCheck} disabled={smartRunning}>
              {smartRunning ? '...' : t('storage.smartCheck')}
            </StitchButton>
            <StitchButton size="sm" variant="ghost" onClick={() => { refresh(); refreshAvail(); }}>{t('storage.refresh')}</StitchButton>
          </div>
        </GlassCard>
      </div>

      {/* Active disks */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {disks?.map((disk) => <DiskCard key={disk.device} disk={disk} onRemoveFromPool={handleRemoveFromPool} />)}
        </div>
      )}

      {/* SnapRAID */}
      <SnapraidSection onRefreshDisks={refresh} />

      {/* Available (unused) disks */}
      {(availLoading || unusedDisks.length > 0) && (
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            🔌 Discos disponibles
            {unusedDisks.length > 0 && (
              <span className="text-sm font-normal text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                {unusedDisks.length} sin usar
              </span>
            )}
          </h2>
          {availLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-void" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {unusedDisks.map(disk => (
                <AvailableDiskCard key={disk.device} disk={disk} onAction={openModal} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Remove from pool modal */}
      <Modal
        open={!!removingDisk}
        onClose={() => { setRemovingDisk(null); setRemoveResult(null); }}
        title={`Quitar del pool: ${removingDisk?.mount}`}
        actions={
          removeResult?.ok ? (
            <StitchButton size="sm" onClick={() => { setRemovingDisk(null); setRemoveResult(null); }}>Cerrar</StitchButton>
          ) : (
            <>
              <StitchButton size="sm" variant="ghost" onClick={() => setRemovingDisk(null)}>{t('common.cancel')}</StitchButton>
              <StitchButton size="sm" onClick={confirmRemove} disabled={removeBusy}>
                {removeBusy ? 'Procesando...' : 'Quitar del pool'}
              </StitchButton>
            </>
          )
        }
      >
        {removingDisk && !removeResult && (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-300">
              ⚠️ El disco <strong>{removingDisk.mount}</strong> será eliminado del pool MergerFS y desmontado. Los datos no se borran, pero el disco quedará inaccesible hasta que lo vuelvas a montar.
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              <p>Dispositivo: <span className="font-mono text-[var(--text-primary)]">{removingDisk.device}</span></p>
              <p>Tamaño: <span className="font-mono text-[var(--text-primary)]">{removingDisk.size}</span></p>
            </div>
          </div>
        )}
        {removeResult && (
          <div className={`rounded-lg p-4 text-sm border ${removeResult.ok ? 'bg-teal/10 border-teal/20 text-teal' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
            {removeResult.ok ? '✅ ' : '❌ '}{removeResult.msg}
          </div>
        )}
      </Modal>

      {/* Disk action modal */}
      <Modal
        open={!!selectedDisk}
        onClose={closeModal}
        title={`Gestionar: ${selectedDisk?.model || selectedDisk?.device} (${selectedDisk?.sizeHuman})`}
        actions={
          result?.ok ? (
            <StitchButton size="sm" onClick={closeModal}>Cerrar</StitchButton>
          ) : (
            <>
              <StitchButton size="sm" variant="ghost" onClick={closeModal}>{t('common.cancel')}</StitchButton>
              <StitchButton size="sm" onClick={handleAction} disabled={busy}>
                {busy ? 'Procesando...' : 'Aplicar'}
              </StitchButton>
            </>
          )
        }
      >
        {selectedDisk && (
          <div className="space-y-4">
            {/* Action selector */}
            {!result && (
              <>
                <div className="flex gap-2">
                  {([
                    ['pool', '🗄️ Añadir al pool'],
                    ['standalone', '💾 Volumen individual'],
                    ['external', '🔌 Montar externo'],
                  ] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setAction(val)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                        action === val ? 'bg-teal/10 text-teal border-teal/30' : 'border-[var(--outline-variant)] text-[var(--text-secondary)]'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                {action === 'pool' && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
                    ⚠️ El disco se formateará en <strong>ext4</strong> y se añadirá al pool MergerFS. <strong>Se perderán todos los datos.</strong>
                  </div>
                )}

                {action === 'standalone' && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
                      ⚠️ El disco se formateará en <strong>ext4</strong>. <strong>Se perderán todos los datos.</strong>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre del volumen</label>
                      <input
                        value={standaloneName}
                        onChange={e => setStandaloneName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                        placeholder="backups"
                        className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
                      />
                      <p className="text-xs text-[var(--text-disabled)] mt-1">Se montará en /mnt/{standaloneName || 'nombre'}</p>
                    </div>
                  </div>
                )}

                {action === 'external' && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-teal/10 border border-teal/20 p-3 text-sm text-teal">
                      ✅ Sin formatear — monta el sistema de archivos existente (NTFS, FAT32, exFAT, ext4).
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Partición a montar</label>
                      <select
                        value={externalPartition}
                        onChange={e => setExternalPartition(e.target.value)}
                        className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
                      >
                        <option value={selectedDisk.device}>{selectedDisk.device} (disco completo)</option>
                        {selectedDisk.partitions.map(p => (
                          <option key={p.name} value={p.name}>
                            {p.name} {p.fstype ? `— ${p.fstype}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre del punto de montaje</label>
                      <input
                        value={externalName}
                        onChange={e => setExternalName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                        placeholder="recovery"
                        className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
                      />
                      <p className="text-xs text-[var(--text-disabled)] mt-1">Se montará en /mnt/{externalName || 'recovery'}</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={externalReadonly} onChange={e => setExternalReadonly(e.target.checked)}
                        className="accent-teal" />
                      <span className="text-sm text-[var(--text-primary)]">Solo lectura (recomendado para recuperación)</span>
                    </label>
                  </div>
                )}
              </>
            )}

            {result && (
              <div className={`rounded-lg p-4 text-sm border ${result.ok ? 'bg-teal/10 border-teal/20 text-teal' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                {result.ok ? '✅ ' : '❌ '}{result.msg}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { GlassCard, StitchButton, Modal } from '@/components/UI';
import { DeviceCard, DeviceDetail } from '@/components/ActiveBackup';
import { useAPI } from '@/hooks/useAPI';
import type { BackupDevice, PendingAgent } from '@/components/ActiveBackup';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}


export default function ActiveBackupPage() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [generatingPlatform, setGeneratingPlatform] = useState<string | null>(null);
  const [backupType, setBackupType] = useState<'full' | 'incremental' | 'folders'>('incremental');

  const fetchDevices = useCallback(() =>
    authFetch('/active-backup/devices').then(r => r.json() as Promise<BackupDevice[]>), []);
  const fetchPending = useCallback(() =>
    authFetch('/active-backup/pending').then(r => r.json() as Promise<PendingAgent[]>), []);

  const { data: devices, loading, refresh } = useAPI<BackupDevice[]>(fetchDevices, 5000);
  const { data: pending, refresh: refreshPending } = useAPI<PendingAgent[]>(fetchPending, 10000);

  const handleBackup = useCallback(async (id: string) => {
    await authFetch(`/active-backup/devices/${id}/backup`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await authFetch(`/active-backup/devices/${id}`, { method: 'DELETE' });
    setSelectedDevice(null);
    refresh();
  }, [refresh]);

  const handleApprove = useCallback(async (id: string) => {
    await authFetch(`/active-backup/pending/${id}/approve`, { method: 'POST' });
    refresh();
    refreshPending();
  }, [refresh, refreshPending]);

  const handleReject = useCallback(async (id: string) => {
    await authFetch(`/active-backup/pending/${id}/reject`, { method: 'POST' });
    refreshPending();
  }, [refreshPending]);

  const handleDownloadAgent = useCallback(async (platform: 'linux' | 'mac' | 'windows') => {
    setGeneratingPlatform(platform);
    try {
      const res = await authFetch(`/active-backup/agent/generate/${platform}?backupType=${backupType}`);
      const blob = await res.blob();
      const ext = platform === 'windows' ? 'ps1' : 'sh';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `homepinas-agent-${platform}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      refreshPending();
    } catch {
      alert('Error generando el agente. Comprueba la conexión con el NAS.');
    } finally {
      setGeneratingPlatform(null);
    }
  }, [refreshPending]);

  // Detail view
  const selected = devices?.find(d => d.id === selectedDevice);
  if (selected) {
    return (
      <DeviceDetail
        device={selected}
        onClose={() => setSelectedDevice(null)}
        onBackup={handleBackup}
        onDelete={handleDelete}
      />
    );
  }

  const onlineCount = devices?.filter(d => d.status === 'online').length ?? 0;
  const totalSize = devices?.reduce((acc, d) => acc + d.backupSize, 0) ?? 0;
  const backingUpCount = devices?.filter(d => d.status === 'backing-up').length ?? 0;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.devices')}</p>
          <p className="font-display text-2xl font-bold text-teal">{devices?.length ?? 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{onlineCount} {t('ab.online')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.totalBackup')}</p>
          <p className="font-display text-2xl font-bold text-teal">{formatBytes(totalSize)}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.active')}</p>
          <p className="font-display text-2xl font-bold text-orange">{backingUpCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('ab.runningNow')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('ab.agent')}</p>
          <StitchButton size="sm" className="mt-1" onClick={() => setAgentModalOpen(true)}>
            {t('ab.downloadAgent')}
          </StitchButton>
        </GlassCard>
      </div>

      {/* Pending approvals */}
      {pending && pending.length > 0 && (
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-orange mb-3">
            ⏳ Pending Approval ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map(agent => (
              <div key={agent.id} className="flex items-center justify-between py-2 border-b border-[var(--outline-variant)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{agent.hostname}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{agent.os} · {agent.ip}</p>
                </div>
                <div className="flex gap-2">
                  <StitchButton size="sm" onClick={() => handleApprove(agent.id)}>{t('ab.approve')}</StitchButton>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleReject(agent.id)}>{t('ab.reject')}</StitchButton>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Device grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-void" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {devices?.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onBackup={handleBackup}
              onSelect={setSelectedDevice}
            />
          ))}
        </div>
      )}

      {/* Agent download modal */}
      <Modal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        title="Generar agente de backup"
        actions={<StitchButton size="sm" variant="ghost" onClick={() => setAgentModalOpen(false)}>{t('common.cancel')}</StitchButton>}
      >
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Selecciona el tipo de backup y el sistema operativo del equipo remoto. Se generará un instalador con token único preconfigurado. Ejecútalo como administrador y aprueba el dispositivo desde esta pantalla.
        </p>

        {/* Backup type selector */}
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Tipo de backup</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([
            { type: 'full', icon: '💿', label: 'Disco completo', desc: 'Todo el disco, imagen completa' },
            { type: 'incremental', icon: '🔄', label: 'Incremental', desc: 'Solo cambios desde el último backup' },
            { type: 'folders', icon: '📁', label: 'Carpetas', desc: 'Carpetas específicas elegidas' },
          ] as const).map(({ type, icon, label, desc }) => (
            <button
              key={type}
              onClick={() => setBackupType(type)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                backupType === type
                  ? 'bg-teal/10 border-teal/40 text-teal'
                  : 'border-[var(--outline-variant)] text-[var(--text-secondary)] hover:bg-surface-void'
              }`}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] leading-tight opacity-70">{desc}</span>
            </button>
          ))}
        </div>

        <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Sistema operativo</p>
        <div className="grid grid-cols-1 gap-3">
          {([
            { platform: 'windows', icon: '🪟', label: 'Windows', sub: 'PowerShell (.ps1) · Ejecutar como Administrador', hint: 'robocopy + Tarea Programada' },
            { platform: 'mac', icon: '🍎', label: 'macOS', sub: 'Shell script (.sh) · macOS 12+', hint: 'rsync + launchd' },
            { platform: 'linux', icon: '🐧', label: 'Linux', sub: 'Shell script (.sh) · Debian/Ubuntu/Fedora', hint: 'rsync + cron' },
          ] as const).map(({ platform, icon, label, sub, hint }) => (
            <button
              key={platform}
              disabled={generatingPlatform !== null}
              onClick={() => handleDownloadAgent(platform)}
              className="flex items-center gap-4 rounded-xl border border-[var(--outline-variant)] px-4 py-3 hover:bg-teal/5 hover:border-teal/30 transition-colors text-left disabled:opacity-50"
            >
              <span className="text-3xl">{icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
                <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
                <p className="text-xs text-teal font-mono mt-0.5">{hint}</p>
              </div>
              {generatingPlatform === platform ? (
                <span className="text-xs text-teal animate-pulse">Generando...</span>
              ) : (
                <span className="text-xs text-[var(--text-disabled)]">↓ Descargar</span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-teal/5 border border-teal/20 px-3 py-2 text-xs text-[var(--text-secondary)] space-y-1">
          <p>📋 <strong>Pasos:</strong></p>
          <p>1. Descarga el instalador para tu sistema</p>
          <p>2. Ejecútalo en el equipo remoto (requiere permisos de administrador)</p>
          <p>3. Vuelve aquí y aprueba el dispositivo en "Pendientes"</p>
          <p>4. El equipo comenzará a hacer backup automáticamente</p>
        </div>
      </Modal>

      {/* How it works */}
      <GlassCard elevation="low">
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">{t('ab.howItWorks')}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 text-center text-sm">
          <div>
            <p className="text-2xl mb-2">📥</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step1')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step1desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔍</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step2')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step2desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔄</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step3')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step3desc')}</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

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
  const [installData, setInstallData] = useState<{ platform: string; command: string; deviceID: string } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleGenerateAgent = useCallback(async (platform: 'linux' | 'mac' | 'windows') => {
    setGeneratingPlatform(platform);
    setInstallData(null);
    try {
      const res = await authFetch(`/active-backup/agent/generate/${platform}?backupType=${backupType}`);
      const text = await res.text();
      if (!res.ok) {
        alert(`Error del servidor (${res.status}): ${text.slice(0, 200)}`);
        return;
      }
      let data: { installCommand: string; deviceID: string };
      try {
        data = JSON.parse(text);
      } catch {
        alert(`Respuesta inesperada del servidor:\n${text.slice(0, 300)}`);
        return;
      }
      setInstallData({ platform, command: data.installCommand, deviceID: data.deviceID });
      refreshPending();
    } catch (err) {
      alert(`Error de conexión con el NAS: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeneratingPlatform(null);
    }
  }, [backupType, refreshPending]);

  const handleCopyCommand = useCallback(() => {
    if (!installData) return;
    navigator.clipboard.writeText(installData.command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [installData]);

  const handleDownloadBinary = useCallback(async (platform: 'windows' | 'mac' | 'linux') => {
    const apiPlatform = platform === 'mac' ? 'darwin' : platform;
    const filename = platform === 'windows' ? 'agent-windows-amd64.exe'
      : platform === 'mac' ? 'agent-darwin-arm64'
      : 'agent-linux-amd64';
    try {
      const res = await authFetch(`/active-backup/agent/binary/${apiPlatform}`);
      if (!res.ok) { alert('Binario no encontrado. Ejecuta agent/build.sh en el Mac Studio.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error descargando el agente.');
    }
  }, []);

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

      {/* Agent install modal */}
      <Modal
        open={agentModalOpen}
        onClose={() => { setAgentModalOpen(false); setInstallData(null); }}
        title={installData ? 'Comando de instalación' : 'Generar agente de backup'}
        actions={
          installData
            ? <StitchButton size="sm" variant="ghost" onClick={() => setInstallData(null)}>← Atrás</StitchButton>
            : <StitchButton size="sm" variant="ghost" onClick={() => setAgentModalOpen(false)}>{t('common.cancel')}</StitchButton>
        }
      >
        {installData ? (
          /* Step 2: show install command */
          <div className="space-y-4">
            <div className="rounded-lg bg-teal/5 border border-teal/20 px-3 py-2 text-xs text-[var(--text-secondary)] space-y-1">
              <p>✅ Token generado · Device ID: <span className="font-mono text-teal">{installData.deviceID}</span></p>
              <p>📋 El agente aparecerá en <strong>Pendientes</strong> en cuanto el cliente lo ejecute</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                {installData.platform === 'windows' ? 'PowerShell (Administrador)' : installData.platform === 'mac' ? 'Terminal (macOS)' : 'Terminal (Linux)'}
              </p>
              <div className="relative rounded-lg bg-surface-void border border-[var(--outline-variant)] p-3">
                <pre className="text-xs text-[var(--text-primary)] font-mono whitespace-pre-wrap break-all leading-relaxed pr-16">
                  {installData.command}
                </pre>
                <button
                  onClick={handleCopyCommand}
                  className="absolute top-2 right-2 rounded-md bg-teal/10 border border-teal/30 px-2 py-1 text-xs text-teal hover:bg-teal/20 transition-colors"
                >
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadBinary(installData.platform as 'windows' | 'mac' | 'linux')}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-surface-void transition-colors"
              >
                ↓ Descargar binario ({installData.platform === 'windows' ? '.exe' : installData.platform === 'mac' ? 'darwin-arm64' : 'linux-amd64'})
              </button>
            </div>
            <div className="rounded-lg bg-surface-void border border-[var(--outline-variant)] px-3 py-2 text-xs text-[var(--text-secondary)] space-y-1">
              <p><strong>El agente Go:</strong></p>
              <p>• Se instala silenciosamente como servicio del sistema</p>
              <p>• No aparece en la barra de tareas ni en el Dock</p>
              <p>• Se ejecuta al iniciar el sistema aunque no haya sesión abierta</p>
              <p>• Backups diarios a las 02:00 con reintentos automáticos</p>
            </div>
          </div>
        ) : (
          /* Step 1: choose type + platform */
          <>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Genera un comando de instalación con token único. El cliente lo ejecuta como administrador y el agente binario se instala como servicio del sistema — sin ventanas, sin scripts visibles.
            </p>

            <p className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Tipo de backup</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { type: 'full', icon: '💿', label: 'Disco completo', desc: 'Backup de todo el disco' },
                { type: 'incremental', icon: '🔄', label: 'Incremental', desc: 'Solo cambios recientes' },
                { type: 'folders', icon: '📁', label: 'Carpetas', desc: 'Docs, Desktop, Imágenes' },
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
                { platform: 'windows', icon: '🪟', label: 'Windows', sub: 'Windows 10/11 · PowerShell como Admin', hint: 'Servicio del sistema · robocopy' },
                { platform: 'mac', icon: '🍎', label: 'macOS', sub: 'macOS 12+ · Intel y Apple Silicon', hint: 'LaunchDaemon · rsync' },
                { platform: 'linux', icon: '🐧', label: 'Linux', sub: 'Debian, Ubuntu, Fedora · x64/arm64', hint: 'systemd service · rsync' },
              ] as const).map(({ platform, icon, label, sub, hint }) => (
                <div key={platform} className="flex items-center gap-2 rounded-xl border border-[var(--outline-variant)] px-4 py-3">
                  <span className="text-3xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
                    <p className="text-xs text-teal font-mono mt-0.5">{hint}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      disabled={generatingPlatform !== null}
                      onClick={() => handleGenerateAgent(platform)}
                      className="rounded-lg bg-teal/10 border border-teal/30 px-2.5 py-1 text-xs font-medium text-teal hover:bg-teal/20 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {generatingPlatform === platform ? '...' : '⚡ Instalar silencioso'}
                    </button>
                    <button
                      onClick={() => handleDownloadBinary(platform)}
                      className="rounded-lg border border-[var(--outline-variant)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-surface-void transition-colors whitespace-nowrap"
                    >
                      ↓ Descargar binario
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* How it works */}
      <GlassCard elevation="low">
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-4">{t('ab.howItWorks')}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 text-center text-sm mb-6">
          <div>
            <p className="text-2xl mb-2">⚡</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step1')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step1desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">✅</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step2')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step2desc')}</p>
          </div>
          <div>
            <p className="text-2xl mb-2">🔄</p>
            <p className="font-medium text-[var(--text-primary)]">{t('ab.step3')}</p>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.step3desc')}</p>
          </div>
        </div>

        {/* Backup types explanation */}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">{t('ab.backupTypesTitle')}</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            { icon: '💿', titleKey: 'ab.typeFullTitle', descKey: 'ab.typeFullDesc' },
            { icon: '🔄', titleKey: 'ab.typeIncrTitle', descKey: 'ab.typeIncrDesc' },
            { icon: '📁', titleKey: 'ab.typeFoldersTitle', descKey: 'ab.typeFoldersDesc' },
          ]).map(({ icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-lg bg-surface-void border border-[var(--outline-variant)] p-3">
              <p className="text-lg mb-1">{icon} <span className="text-sm font-semibold text-[var(--text-primary)]">{t(titleKey)}</span></p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{t(descKey)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-secondary)] italic border-t border-[var(--outline-variant)] pt-3">
          ℹ️ {t('ab.sizeNote')}
        </p>
      </GlassCard>
    </div>
  );
}

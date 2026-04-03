/**
 * Device detail panel — backup versions, paths, restore actions
 */

import { useState, useRef } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { authFetch } from '@/api/authFetch';
import { t } from '@/i18n';
import type { BackupBrowseItem, BackupBrowseResponse, BackupDevice, BackupVersion } from './types';

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

// Placeholder paths per OS/type shown in editor when no paths are configured
function getDefaultPlaceholders(os: string, backupType: string): string[] {
  const isWindows = os.toLowerCase().includes('windows');
  const isMac = os.toLowerCase().includes('mac') || os.toLowerCase().includes('darwin');
  if (isWindows) {
    if (backupType === 'full') return ['C:\\'];
    if (backupType === 'incremental') return ['C:\\Users'];
    return ['C:\\Users\\User\\Documents', 'C:\\Users\\User\\Desktop', 'C:\\Users\\User\\Pictures'];
  }
  if (isMac) {
    if (backupType === 'full') return ['/'];
    if (backupType === 'incremental') return ['/Users'];
    return ['/Users/Shared/Documents', '/Users/Shared/Desktop'];
  }
  if (backupType === 'full') return ['/'];
  if (backupType === 'incremental') return ['/home'];
  return ['/home'];
}

interface DeviceDetailProps {
  device: BackupDevice;
  onClose: () => void;
  onBackup: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onSavePaths: (id: string, paths: string[]) => void;
}

export function DeviceDetail({ device, onClose, onBackup, onDelete, onRename, onSavePaths }: DeviceDetailProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(device.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingPaths, setEditingPaths] = useState(false);
  const [pathsValue, setPathsValue] = useState<string[]>(device.backupPaths);
  const [browseVersion, setBrowseVersion] = useState<BackupVersion | null>(null);
  const [browsePath, setBrowsePath] = useState('/');
  const [browseItems, setBrowseItems] = useState<BackupBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const startEdit = () => {
    setNameValue(device.name);
    setEditingName(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== device.name) onRename(device.id, trimmed);
    setEditingName(false);
  };

  const startEditPaths = () => {
    setPathsValue(device.backupPaths.length > 0 ? [...device.backupPaths] : ['']);
    setEditingPaths(true);
  };

  const cancelEditPaths = () => {
    setPathsValue([...device.backupPaths]);
    setEditingPaths(false);
  };

  const savePaths = () => {
    const filtered = pathsValue.map(p => p.trim()).filter(p => p.length > 0);
    onSavePaths(device.id, filtered);
    setEditingPaths(false);
  };

  const addPath = () => setPathsValue(prev => [...prev, '']);
  const removePath = (i: number) => setPathsValue(prev => prev.filter((_, idx) => idx !== i));
  const updatePath = (i: number, val: string) =>
    setPathsValue(prev => prev.map((p, idx) => idx === i ? val : p));

  const parentPath = browsePath === '/' ? null : (() => {
    const parts = browsePath.split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    return `/${parts.slice(0, -1).join('/')}`;
  })();

  const loadBrowse = async (version: BackupVersion, targetPath = '/') => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const res = await authFetch(`/active-backup/devices/${device.id}/browse?version=${encodeURIComponent(version.id)}&path=${encodeURIComponent(targetPath)}`);
      const data = await res.json() as BackupBrowseResponse | { error?: string };
      if (!res.ok) {
        setBrowseError((data as { error?: string }).error || 'No se pudo cargar el backup');
        return;
      }
      setBrowseVersion(version);
      setBrowsePath((data as BackupBrowseResponse).path);
      setBrowseItems((data as BackupBrowseResponse).items);
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleDownload = async (item: BackupBrowseItem) => {
    if (!browseVersion || item.type !== 'file') return;
    const res = await authFetch(`/active-backup/devices/${device.id}/download?version=${encodeURIComponent(browseVersion.id)}&path=${encodeURIComponent(item.path)}`);
    if (!res.ok) {
      alert('No se pudo descargar el archivo.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const placeholders = getDefaultPlaceholders(device.os, device.backupType);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {editingName ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(false); }}
              className="font-display text-xl font-bold bg-surface-void border border-teal/40 rounded px-2 py-0.5 text-[var(--text-primary)] outline-none focus:border-teal"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">{device.name}</h2>
              <button
                onClick={startEdit}
                className="text-[var(--text-disabled)] hover:text-teal transition-colors"
                title="Rename device"
              >
                ✏️
              </button>
            </div>
          )}
          <p className="text-sm text-[var(--text-secondary)]">{device.hostname} · {device.os}</p>
        </div>
        <div className="flex gap-2">
          <StitchButton size="sm" onClick={() => onBackup(device.id)} disabled={device.status === 'backing-up'}>{t('ab.backupNow')}</StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={onClose}>{t('ab.back')}</StitchButton>
        </div>
      </div>

      {/* Progress when backing-up */}
      {device.status === 'backing-up' && (
        <GlassCard elevation="low">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-sm font-semibold text-teal animate-pulse">⟳ Backup en progreso</h3>
            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              {device.backupProgress?.speed && <span className="font-mono">{device.backupProgress.speed}</span>}
              <span className="font-mono font-semibold text-teal">{device.backupProgress?.percent ?? 0}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-surface-void overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-teal transition-all duration-500"
              style={{ width: `${device.backupProgress?.percent ?? 0}%` }}
            />
          </div>
          {device.backupProgress?.currentFile && (
            <p className="text-xs text-[var(--text-disabled)] font-mono truncate">
              {device.backupProgress.currentFile}
            </p>
          )}
        </GlassCard>
      )}

      {/* Config + Paths */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">{t('ab.configuration')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t('ab.backupType')}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {device.backupType === 'full' ? 'Disco completo' : device.backupType === 'incremental' ? 'Incremental' : 'Carpetas'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t('ab.schedule')}</span>
              <span className="font-mono text-[var(--text-primary)]">{device.schedule}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">IP</span>
              <span className="font-mono text-[var(--text-primary)]">{device.ip}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">{t('ab.totalSize')}</span>
              <span className="font-mono text-teal">{formatBytes(device.backupSize)}</span>
            </div>
          </div>
        </GlassCard>

        {/* Backup Paths — editable */}
        <GlassCard elevation="low">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t('ab.backupPaths')}</h3>
            {!editingPaths ? (
              <button
                onClick={startEditPaths}
                className="text-xs text-teal hover:underline"
              >
                ✏️ Editar
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={savePaths} className="text-xs text-teal font-semibold hover:underline">✓ Guardar</button>
                <button onClick={cancelEditPaths} className="text-xs text-[var(--text-disabled)] hover:underline">✕ Cancelar</button>
              </div>
            )}
          </div>

          {editingPaths ? (
            <div className="space-y-2">
              {pathsValue.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={p}
                    onChange={e => updatePath(i, e.target.value)}
                    placeholder={placeholders[i % placeholders.length]}
                    className="flex-1 font-mono text-xs rounded px-2 py-1.5 bg-surface-void border border-[var(--outline-variant)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-teal"
                  />
                  <button
                    onClick={() => removePath(i)}
                    className="text-xs text-[var(--error)] hover:opacity-70 shrink-0"
                    title="Eliminar ruta"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addPath}
                className="text-xs text-teal hover:underline mt-1 block"
              >
                + Añadir ruta
              </button>
              <p className="text-[10px] text-[var(--text-disabled)] mt-2">
                Rutas separadas en el equipo remoto. Ej: {placeholders[0]}
              </p>
            </div>
          ) : (
            device.backupPaths.length > 0 ? (
              <div className="space-y-1">
                {device.backupPaths.map((p, i) => (
                  <div key={i} className="font-mono text-xs text-[var(--text-primary)] bg-surface-void rounded px-2 py-1">
                    {p}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orange">
                  ⚠️ Sin rutas configuradas — el agente usará valores por defecto
                </p>
                <p className="text-[10px] text-[var(--text-disabled)]">
                  Pulsa ✏️ Editar para configurar qué carpetas hacer backup
                </p>
              </div>
            )
          )}
        </GlassCard>
      </div>

      {/* Versions */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Backup Versions ({device.versions.length})
          </h3>
        </div>
        {device.versions.length === 0 ? (
          <p className="text-sm text-[var(--text-disabled)]">Sin backups completados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--text-secondary)] border-b border-[var(--outline-variant)]">
                  <th className="py-2 pr-4">{t('ab.date')}</th>
                  <th className="py-2 pr-4">{t('ab.type')}</th>
                  <th className="py-2 pr-4">{t('ab.size')}</th>
                  <th className="py-2 pr-4">{t('ab.status')}</th>
                  <th className="py-2">{t('ab.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {device.versions.map(v => (
                  <tr key={v.id} className="border-b border-[var(--outline-variant)]">
                    <td className="py-2 pr-4 font-mono text-xs">{new Date(v.timestamp).toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                        v.type === 'full' ? 'bg-teal/10 text-teal' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {v.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{formatBytes(v.size)}</td>
                    <td className="py-2 pr-4">
                      <GlowPill status={v.status === 'complete' ? 'healthy' : 'error'} label={v.status} />
                    </td>
                    <td className="py-2">
                      <StitchButton
                        size="sm"
                        variant="ghost"
                        onClick={() => loadBrowse(v, v.browsePath || '/')}
                        disabled={!v.backupAvailable}
                      >
                        {t('ab.browse')}
                      </StitchButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Danger zone */}
      <GlassCard elevation="low">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--error)]">{t('ab.removeDevice')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{t('ab.removeWarning')}</p>
          </div>
          <StitchButton size="sm" variant="ghost" onClick={() => onDelete(device.id)}>
            🗑️ Remove
          </StitchButton>
        </div>
      </GlassCard>

      <Modal
        open={browseVersion !== null}
        onClose={() => {
          setBrowseVersion(null);
          setBrowseItems([]);
          setBrowsePath('/');
          setBrowseError(null);
        }}
        title={browseVersion ? `Explorar backup · ${new Date(browseVersion.timestamp).toLocaleString()}` : 'Explorar backup'}
        actions={browseVersion ? <StitchButton size="sm" variant="ghost" onClick={() => setBrowseVersion(null)}>Cerrar</StitchButton> : undefined}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--outline-variant)] bg-surface-void px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Ruta</p>
              <p className="truncate font-mono text-xs text-[var(--text-primary)]">{browsePath}</p>
            </div>
            {parentPath && (
              <StitchButton size="sm" variant="ghost" onClick={() => browseVersion && loadBrowse(browseVersion, parentPath)}>
                Subir
              </StitchButton>
            )}
          </div>

          {browseLoading ? (
            <div className="rounded-lg border border-[var(--outline-variant)] bg-surface-void px-3 py-4 text-sm text-[var(--text-secondary)]">
              Cargando contenido del backup...
            </div>
          ) : browseError ? (
            <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/5 px-3 py-4 text-sm text-[var(--error)]">
              {browseError}
            </div>
          ) : browseItems.length === 0 ? (
            <div className="rounded-lg border border-[var(--outline-variant)] bg-surface-void px-3 py-4 text-sm text-[var(--text-secondary)]">
              Esta carpeta no contiene archivos.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-[var(--outline-variant)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-panel/95 backdrop-blur">
                  <tr className="text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Tamaño</th>
                    <th className="px-3 py-2">Modificado</th>
                    <th className="px-3 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {browseItems.map((item) => (
                    <tr key={item.path} className="border-t border-[var(--outline-variant)]">
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-primary)]">{item.name}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{item.type === 'directory' ? 'Carpeta' : 'Archivo'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-primary)]">{item.type === 'directory' ? '-' : formatBytes(item.size)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{item.modified ? new Date(item.modified).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2">
                        {item.type === 'directory' ? (
                          <StitchButton size="sm" variant="ghost" onClick={() => browseVersion && loadBrowse(browseVersion, item.path)}>
                            Abrir
                          </StitchButton>
                        ) : (
                          <StitchButton size="sm" variant="ghost" onClick={() => handleDownload(item)}>
                            Descargar
                          </StitchButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

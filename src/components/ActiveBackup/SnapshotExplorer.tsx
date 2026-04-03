import React, { useEffect, useState } from 'react';
import { authFetch } from '@/api/authFetch';

interface Snapshot {
  id: string;
  timestamp: string;
  state: string;
  stats: {
    files_total: number;
    bytes_total: number;
    chunks_new: number;
    chunks_deduped: number;
    bytes_saved: number;
  } | null;
}

interface BackupFile {
  path: string;
  size: number;
  mtime: string;
  chunks: string[];
}

interface Props {
  deviceId: string;
  deviceName: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function SnapshotExplorer({ deviceId, deviceName }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset stale state immediately so useEffect 2 doesn't fire with old selectedId
    setSnapshots([]);
    setSelectedId(null);
    setFiles([]);
    setError(null);
    setLoadingSnapshots(true);
    authFetch(`/active-backup/devices/${deviceId}/snapshots`)
      .then(r => r.json())
      .then((data: Snapshot[]) => {
        setSnapshots(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError('Failed to load snapshots'))
      .finally(() => setLoadingSnapshots(false));
  }, [deviceId]);

  useEffect(() => {
    if (!selectedId) return;
    setError(null);
    setLoadingFiles(true);
    setFiles([]);
    authFetch(`/active-backup/devices/${deviceId}/snapshots/${selectedId}/tree`)
      .then(r => r.json())
      .then((data: { files: BackupFile[] }) => setFiles(data.files || []))
      .catch(() => setError('Failed to load file tree'))
      .finally(() => setLoadingFiles(false));
  }, [deviceId, selectedId]);

  function downloadFile(filePath: string) {
    if (!selectedId) return;
    const params = new URLSearchParams({ deviceId, snapshotId: selectedId, filePath });
    authFetch(`/active-backup/upload/restore/file?${params}`)
      .then(async r => {
        if (!r.ok) { setError('Error al descargar el archivo'); return; }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filePath.split(/[/\\]/).pop() || 'file';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Error al descargar el archivo'));
  }

  function downloadSnapshot() {
    if (!selectedId) return;
    const params = new URLSearchParams({ deviceId, snapshotId: selectedId });
    authFetch(`/active-backup/upload/restore/snapshot?${params}`)
      .then(async r => {
        if (!r.ok) { setError('Error al descargar el snapshot'); return; }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot-${selectedId}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Error al descargar el snapshot'));
  }

  if (loadingSnapshots) return <div className="text-sm text-muted-foreground">Cargando snapshots...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (snapshots.length === 0) return <div className="text-sm text-muted-foreground">Sin snapshots disponibles.</div>;

  const selectedSnapshot = snapshots.find(s => s.id === selectedId);

  // Group files by top-level directory
  const groups = new Map<string, BackupFile[]>();
  for (const f of files) {
    const parts = f.path.replace(/\\/g, '/').split('/');
    const topDir = parts.length > 1 ? parts[0] : '(raíz)';
    if (!groups.has(topDir)) groups.set(topDir, []);
    groups.get(topDir)!.push(f);
  }

  return (
    <div className="space-y-4">
      {/* Snapshot selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">Snapshot:</label>
        <select
          className="text-sm border rounded px-2 py-1 bg-background"
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value)}
        >
          {snapshots.map(s => (
            <option key={s.id} value={s.id}>
              {s.timestamp} — {s.state}
            </option>
          ))}
        </select>
        {selectedSnapshot?.stats && (
          <span className="text-xs text-muted-foreground">
            {selectedSnapshot.stats.files_total.toLocaleString()} archivos ·{' '}
            {formatBytes(selectedSnapshot.stats.bytes_total)} ·{' '}
            {formatBytes(selectedSnapshot.stats.bytes_saved)} ahorrados
          </span>
        )}
        <button
          onClick={downloadSnapshot}
          className="ml-auto text-xs border rounded px-3 py-1 hover:bg-muted"
        >
          Descargar ZIP completo
        </button>
      </div>

      {/* File tree */}
      {loadingFiles ? (
        <div className="text-sm text-muted-foreground">Cargando árbol de archivos...</div>
      ) : (
        <div className="border rounded divide-y max-h-96 overflow-y-auto text-sm">
          {Array.from(groups.entries()).map(([dir, dirFiles]) => (
            <details key={dir} className="group">
              <summary className="px-3 py-2 cursor-pointer hover:bg-muted font-medium flex items-center gap-2">
                <span>📁</span> {dir}
                <span className="text-xs text-muted-foreground ml-auto">
                  {dirFiles.length} archivos
                </span>
              </summary>
              <div className="divide-y">
                {dirFiles.map(f => {
                  const filename = f.path.replace(/\\/g, '/').split('/').pop() || f.path;
                  return (
                    <div
                      key={f.path}
                      className="flex items-center gap-2 px-6 py-1.5 hover:bg-muted/50"
                    >
                      <span className="flex-1 truncate text-xs">{filename}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        onClick={() => downloadFile(f.path)}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Descargar
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

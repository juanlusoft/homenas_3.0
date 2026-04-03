import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback, useRef, useEffect } from 'react';
import { GlassCard, StitchButton, Modal } from '@/components/UI';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  permissions: string;
}

const FILE_ICONS: Record<string, string> = {
  directory: '📁', image: '🖼️', video: '🎬', audio: '🎵',
  document: '📄', archive: '📦', code: '💻', default: '📃',
};

function getFileIcon(entry: FileEntry): string {
  if (entry.type === 'directory') return FILE_ICONS.directory;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return FILE_ICONS.image;
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return FILE_ICONS.video;
  if (['mp3', 'flac', 'wav', 'aac'].includes(ext)) return FILE_ICONS.audio;
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(ext)) return FILE_ICONS.document;
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FILE_ICONS.archive;
  if (['js', 'ts', 'py', 'sh', 'json', 'html', 'css'].includes(ext)) return FILE_ICONS.code;
  return FILE_ICONS.default;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}


export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/files/list?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch { /* fallback to empty */ }
    setLoading(false);
  }, []);

  // Load files on path change
  const navigateTo = useCallback((entry: FileEntry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      setCurrentPath(newPath);
      fetchFiles(newPath);
      setSelectedFiles(new Set());
    }
  }, [currentPath, fetchFiles]);

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    setCurrentPath(newPath);
    fetchFiles(newPath);
    setSelectedFiles(new Set());
  }, [currentPath, fetchFiles]);

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // Create folder
  const handleMkdir = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await authFetch('/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath: currentPath, name: newFolderName.trim() }),
    });
    setMkdirOpen(false);
    setNewFolderName('');
    fetchFiles(currentPath);
  }, [currentPath, newFolderName, fetchFiles]);

  // Upload
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    await authFetch(`/files/upload?path=${encodeURIComponent(currentPath)}`, { method: 'POST', body: formData });
    fetchFiles(currentPath);
    e.target.value = '';
  }, [currentPath, fetchFiles]);

  // Initial load
  useEffect(() => { fetchFiles('/'); }, [fetchFiles]);

  const breadcrumbs = ['Home', ...currentPath.split('/').filter(Boolean)];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-[var(--text-disabled)]">/</span>}
              <button
                onClick={() => {
                  const newPath = i === 0 ? '/' : '/' + breadcrumbs.slice(1, i + 1).join('/');
                  setCurrentPath(newPath);
                  fetchFiles(newPath);
                }}
                className={`hover:text-teal transition-colors ${
                  i === breadcrumbs.length - 1 ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >{crumb}</button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selectedFiles.size > 0 && (
            <span className="text-xs text-teal font-mono">{selectedFiles.size} {t('files.selected')}</span>
          )}
          <StitchButton size="sm" variant="ghost" onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}>
            {viewMode === 'list' ? '⊞' : '☰'}
          </StitchButton>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <StitchButton size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
            {t('files.upload')}
          </StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={() => setMkdirOpen(true)}>
            {t('files.newFolder')}
          </StitchButton>
        </div>
      </div>

      {/* File list */}
      <GlassCard elevation="low" className="!p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--text-disabled)]">⏳</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--outline-variant)] text-left text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-2.5 px-4 w-8"></th>
                <th className="py-2.5 px-2">{t('files.name')}</th>
                <th className="py-2.5 px-2 hidden sm:table-cell">{t('files.size')}</th>
                <th className="py-2.5 px-2 hidden md:table-cell">{t('files.modified')}</th>
                <th className="py-2.5 px-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {currentPath !== '/' && (
                <tr onClick={navigateUp} className="border-b border-[var(--outline-variant)] cursor-pointer hover:bg-surface-void transition-colors">
                  <td className="py-2 px-4"></td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">📁 ..</td>
                  <td className="py-2 px-2 hidden sm:table-cell"></td>
                  <td className="py-2 px-2 hidden md:table-cell"></td>
                </tr>
              )}
              {entries.map(entry => (
                <tr key={entry.name}
                  className={`border-b border-[var(--outline-variant)] cursor-pointer transition-colors ${
                    selectedFiles.has(entry.name) ? 'bg-teal/5' : 'hover:bg-surface-void'
                  }`}
                  onDoubleClick={() => navigateTo(entry)}
                  onClick={() => toggleSelect(entry.name)}>
                  <td className="py-2 px-4">
                    <input type="checkbox" checked={selectedFiles.has(entry.name)} readOnly className="accent-teal" />
                  </td>
                  <td className="py-2 px-2">
                    <span className="mr-2">{getFileIcon(entry)}</span>
                    <span className={entry.type === 'directory' ? 'text-teal font-medium' : 'text-[var(--text-primary)]'}>{entry.name}</span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                    {entry.type === 'file' ? formatSize(entry.size) : '—'}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-secondary)] hidden md:table-cell">{entry.modified}</td>
                  <td className="py-2 px-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button title="Descargar" className="text-xs px-1.5 py-0.5 rounded hover:bg-surface-void text-[var(--text-secondary)]"
                        onClick={async () => {
                          if (entry.type === 'file') {
                            const res = await authFetch(`/files/download?path=${encodeURIComponent(currentPath + '/' + entry.name)}`);
                            if (!res.ok) return;
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = entry.name;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        }}>⬇️</button>
                      <button title="Renombrar" className="text-xs px-1.5 py-0.5 rounded hover:bg-surface-void text-[var(--text-secondary)]"
                        onClick={() => {
                          const newName = prompt('Nuevo nombre:', entry.name);
                          if (newName && newName !== entry.name) {
                            authFetch('/files/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: currentPath + '/' + entry.name, newName }) }).then(() => fetchFiles(currentPath));
                          }
                        }}>✏️</button>
                      <button title="Eliminar" className="text-xs px-1.5 py-0.5 rounded hover:bg-surface-void text-red-400"
                        onClick={() => {
                          if (confirm(`¿Eliminar ${entry.name}?`)) {
                            authFetch('/files/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: currentPath + '/' + entry.name }) }).then(() => fetchFiles(currentPath));
                          }
                        }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-8 text-center text-[var(--text-disabled)]">📂 {t('files.items')}: 0</td></tr>
              )}
            </tbody>
          </table>
        )}
      </GlassCard>

      <div className="flex items-center justify-between text-xs text-[var(--text-disabled)]">
        <span>{entries.length} {t('files.items')}</span>
        <span>{currentPath}</span>
      </div>

      {/* New Folder Modal */}
      <Modal open={mkdirOpen} onClose={() => setMkdirOpen(false)} title={t('files.newFolder')}
        actions={<>
          <StitchButton size="sm" variant="ghost" onClick={() => setMkdirOpen(false)}>{t('common.cancel')}</StitchButton>
          <StitchButton size="sm" onClick={handleMkdir}>{t('common.save')}</StitchButton>
        </>}>
        <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
          placeholder={t('files.name')} autoFocus
          className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
          onKeyDown={e => e.key === 'Enter' && handleMkdir()} />
      </Modal>
    </div>
  );
}

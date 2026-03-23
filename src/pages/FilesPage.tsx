import { useState, useCallback } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  permissions: string;
}

const FILE_ICONS: Record<string, string> = {
  directory: '📁',
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  document: '📄',
  archive: '📦',
  code: '💻',
  default: '📃',
};

function getFileIcon(entry: FileEntry): string {
  if (entry.type === 'directory') return FILE_ICONS.directory;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return FILE_ICONS.image;
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return FILE_ICONS.video;
  if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return FILE_ICONS.audio;
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

// Mock filesystem
const MOCK_FS: Record<string, FileEntry[]> = {
  '/': [
    { name: 'Documents', type: 'directory', size: 0, modified: '2026-03-22', permissions: 'rwxr-xr-x' },
    { name: 'Media', type: 'directory', size: 0, modified: '2026-03-20', permissions: 'rwxr-xr-x' },
    { name: 'Backups', type: 'directory', size: 0, modified: '2026-03-23', permissions: 'rwx------' },
    { name: 'Downloads', type: 'directory', size: 0, modified: '2026-03-21', permissions: 'rwxr-xr-x' },
    { name: 'docker-compose.yml', type: 'file', size: 2048, modified: '2026-03-15', permissions: 'rw-r--r--' },
    { name: 'notes.txt', type: 'file', size: 512, modified: '2026-03-23', permissions: 'rw-r--r--' },
  ],
  '/Documents': [
    { name: 'reports', type: 'directory', size: 0, modified: '2026-03-18', permissions: 'rwxr-xr-x' },
    { name: 'budget-2026.xlsx', type: 'file', size: 45000, modified: '2026-03-10', permissions: 'rw-r--r--' },
    { name: 'readme.md', type: 'file', size: 1200, modified: '2026-03-22', permissions: 'rw-r--r--' },
  ],
  '/Media': [
    { name: 'Photos', type: 'directory', size: 0, modified: '2026-03-19', permissions: 'rwxr-xr-x' },
    { name: 'Movies', type: 'directory', size: 0, modified: '2026-02-28', permissions: 'rwxr-xr-x' },
    { name: 'Music', type: 'directory', size: 0, modified: '2026-03-01', permissions: 'rwxr-xr-x' },
    { name: 'vacation.mp4', type: 'file', size: 2500000000, modified: '2026-03-15', permissions: 'rw-r--r--' },
  ],
};

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const entries = MOCK_FS[currentPath] ?? [];

  const navigateTo = useCallback((entry: FileEntry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      setCurrentPath(newPath);
      setSelectedFiles(new Set());
    }
  }, [currentPath]);

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
    setSelectedFiles(new Set());
  }, [currentPath]);

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const breadcrumbs = ['Home', ...currentPath.split('/').filter(Boolean)];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-[var(--text-disabled)]">/</span>}
              <button
                onClick={() => {
                  if (i === 0) setCurrentPath('/');
                  else setCurrentPath('/' + breadcrumbs.slice(1, i + 1).join('/'));
                }}
                className={`hover:text-teal transition-colors ${
                  i === breadcrumbs.length - 1 ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {selectedFiles.size > 0 && (
            <span className="text-xs text-teal font-mono">{selectedFiles.size} selected</span>
          )}
          <StitchButton size="sm" variant="ghost" onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}>
            {viewMode === 'list' ? '⊞' : '☰'}
          </StitchButton>
          <StitchButton size="sm" variant="ghost">⬆️ Upload</StitchButton>
          <StitchButton size="sm" variant="ghost">📁 New Folder</StitchButton>
        </div>
      </div>

      {/* File list/grid */}
      <GlassCard elevation="low" className="!p-0 overflow-hidden">
        {viewMode === 'list' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--outline-variant)] text-left text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-2.5 px-4 w-8"></th>
                <th className="py-2.5 px-2">Name</th>
                <th className="py-2.5 px-2 hidden sm:table-cell">Size</th>
                <th className="py-2.5 px-2 hidden md:table-cell">Modified</th>
                <th className="py-2.5 px-2 hidden lg:table-cell">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {currentPath !== '/' && (
                <tr
                  onClick={navigateUp}
                  className="border-b border-[var(--outline-variant)] cursor-pointer hover:bg-surface-void transition-colors"
                >
                  <td className="py-2 px-4">
                    <input type="checkbox" disabled className="opacity-0" />
                  </td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">📁 ..</td>
                  <td className="py-2 px-2 hidden sm:table-cell"></td>
                  <td className="py-2 px-2 hidden md:table-cell"></td>
                  <td className="py-2 px-2 hidden lg:table-cell"></td>
                </tr>
              )}
              {entries.map(entry => (
                <tr
                  key={entry.name}
                  className={`border-b border-[var(--outline-variant)] cursor-pointer transition-colors ${
                    selectedFiles.has(entry.name) ? 'bg-teal/5' : 'hover:bg-surface-void'
                  }`}
                  onDoubleClick={() => navigateTo(entry)}
                  onClick={() => toggleSelect(entry.name)}
                >
                  <td className="py-2 px-4">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(entry.name)}
                      onChange={() => toggleSelect(entry.name)}
                      className="accent-teal"
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <span className="mr-2">{getFileIcon(entry)}</span>
                    <span className={entry.type === 'directory' ? 'text-teal font-medium' : 'text-[var(--text-primary)]'}>
                      {entry.name}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                    {entry.type === 'file' ? formatSize(entry.size) : '—'}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-secondary)] hidden md:table-cell">
                    {entry.modified}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-disabled)] hidden lg:table-cell">
                    {entry.permissions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-4">
            {currentPath !== '/' && (
              <button onClick={navigateUp} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-surface-void">
                <span className="text-3xl">📁</span>
                <span className="text-xs text-[var(--text-secondary)]">..</span>
              </button>
            )}
            {entries.map(entry => (
              <button
                key={entry.name}
                onDoubleClick={() => navigateTo(entry)}
                onClick={() => toggleSelect(entry.name)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-colors ${
                  selectedFiles.has(entry.name) ? 'bg-teal/10 ring-1 ring-teal/30' : 'hover:bg-surface-void'
                }`}
              >
                <span className="text-3xl">{getFileIcon(entry)}</span>
                <span className="text-xs text-[var(--text-primary)] truncate max-w-full">{entry.name}</span>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-[var(--text-disabled)]">
        <span>{entries.length} items</span>
        <span>{currentPath}</span>
      </div>
    </div>
  );
}

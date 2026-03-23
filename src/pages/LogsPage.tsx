import { t } from '@/i18n';
import { useState, useCallback, useEffect, useRef } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';

interface LogEntry {
  id: string; timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string; message: string;
}

const API = import.meta.env.VITE_API_URL || '/api';
const LEVEL_COLORS: Record<string, string> = {
  info: 'text-teal', warn: 'text-orange', error: 'text-[var(--error)]', debug: 'text-[var(--text-disabled)]',
};

export default function LogsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch real logs
  const fetchLogs = useCallback(() => {
    const params = new URLSearchParams({ lines: '200' });
    if (sourceFilter !== 'all') params.set('unit', sourceFilter);
    if (filter !== 'all') {
      const pMap: Record<string, string> = { error: '3', warn: '4', info: '6', debug: '7' };
      params.set('priority', pMap[filter] || '6');
    }
    return fetch(`${API}/logs?${params}`).then(r => r.json());
  }, [filter, sourceFilter]);

  const { data: logs } = useAPI<LogEntry[]>(fetchLogs, 5000);

  // Fetch available units
  const fetchUnits = useCallback(() => fetch(`${API}/logs/units`).then(r => r.json()), []);
  const { data: units } = useAPI<string[]>(fetchUnits);

  const filtered = (logs || []).filter(log => {
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const scrollToBottom = useCallback(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [autoScroll]);

  useEffect(scrollToBottom, [filtered.length, scrollToBottom]);

  const errorCount = (logs || []).filter(l => l.level === 'error').length;
  const warnCount = (logs || []).filter(l => l.level === 'warn').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('logs.search')} className="stitch-input rounded-lg px-3 py-1.5 text-sm w-48 text-[var(--text-primary)]" />

        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="stitch-input rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]">
          <option value="all">{t('logs.allLevels')}</option>
          <option value="error">{t('logs.error')} ({errorCount})</option>
          <option value="warn">{t('logs.warning')} ({warnCount})</option>
          <option value="info">{t('logs.info')}</option>
          <option value="debug">{t('logs.debug')}</option>
        </select>

        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="stitch-input rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]">
          <option value="all">{t('logs.allSources')}</option>
          {(units || []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <StitchButton size="sm" variant={autoScroll ? 'primary' : 'ghost'} onClick={() => setAutoScroll(!autoScroll)}>
          {autoScroll ? t('logs.auto') : t('logs.paused')}
        </StitchButton>

        <span className="text-xs text-[var(--text-disabled)] ml-auto">
          {filtered.length} / {(logs || []).length} {t('logs.entries')}
        </span>
      </div>

      <GlassCard elevation="low" className="!p-0">
        <div ref={listRef} className="h-[60vh] overflow-y-auto font-mono text-xs">
          {filtered.map((log, i) => (
            <div key={log.id || i}
              className={`flex gap-2 px-4 py-1 border-b border-[var(--outline-variant)] hover:bg-surface-void ${log.level === 'error' ? 'bg-red-500/5' : ''}`}>
              <span className="text-[var(--text-disabled)] shrink-0 w-36">{log.timestamp}</span>
              <span className={`shrink-0 w-12 uppercase font-bold ${LEVEL_COLORS[log.level] || ''}`}>{log.level}</span>
              <span className="text-[var(--text-secondary)] shrink-0 w-20 truncate">[{log.source}]</span>
              <span className="text-[var(--text-primary)]">{log.message}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[var(--text-disabled)]">No hay registros</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

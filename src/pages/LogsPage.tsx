import { useState, useCallback, useEffect, useRef } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-teal',
  warn: 'text-orange',
  error: 'text-[var(--error)]',
  debug: 'text-[var(--text-disabled)]',
};

const SOURCES = ['system', 'docker', 'samba', 'nginx', 'homepinas', 'backup'];

// Generate mock logs
function generateLogs(count: number): LogEntry[] {
  const messages = [
    { level: 'info' as const, msg: 'Service started successfully' },
    { level: 'info' as const, msg: 'Backup job completed (4.2 GB)' },
    { level: 'info' as const, msg: 'User admin logged in from 192.168.1.10' },
    { level: 'warn' as const, msg: 'Disk /dev/sda temperature above 45°C' },
    { level: 'warn' as const, msg: 'High memory usage detected (87%)' },
    { level: 'error' as const, msg: 'Failed to mount /dev/sdb1: device busy' },
    { level: 'error' as const, msg: 'Connection refused: PostgreSQL on port 5432' },
    { level: 'debug' as const, msg: 'Cache invalidated for storage metrics' },
    { level: 'info' as const, msg: 'Docker container nginx restarted' },
    { level: 'info' as const, msg: 'SMB share "Media" accessed by 192.168.1.15' },
  ];

  return Array.from({ length: count }, (_, i) => {
    const entry = messages[i % messages.length];
    const date = new Date(Date.now() - (count - i) * 30000);
    return {
      id: i + 1,
      timestamp: date.toISOString().replace('T', ' ').slice(0, 19),
      level: entry.level,
      source: SOURCES[i % SOURCES.length],
      message: entry.msg,
    };
  });
}

export default function LogsPage() {
  const [logs] = useState(() => generateLogs(50));
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const scrollToBottom = useCallback(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [autoScroll]);

  useEffect(scrollToBottom, [filtered.length, scrollToBottom]);

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="stitch-input rounded-lg px-3 py-1.5 text-sm w-48 text-[var(--text-primary)]"
        />

        <select
          value={filter}
          onChange={e => setFilter(e.target.value as LogEntry['level'] | 'all')}
          className="stitch-input rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]"
        >
          <option value="all">All levels</option>
          <option value="error">Error ({errorCount})</option>
          <option value="warn">Warning ({warnCount})</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>

        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="stitch-input rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]"
        >
          <option value="all">All sources</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <StitchButton
          size="sm"
          variant={autoScroll ? 'primary' : 'ghost'}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? '⏬ Auto' : '⏸ Paused'}
        </StitchButton>

        <span className="text-xs text-[var(--text-disabled)] ml-auto">
          {filtered.length} / {logs.length} entries
        </span>
      </div>

      {/* Log output */}
      <GlassCard elevation="low" className="!p-0">
        <div ref={listRef} className="h-[60vh] overflow-y-auto font-mono text-xs">
          {filtered.map(log => (
            <div
              key={log.id}
              className={`flex gap-2 px-4 py-1 border-b border-[var(--outline-variant)] hover:bg-surface-void ${
                log.level === 'error' ? 'bg-red-500/5' : ''
              }`}
            >
              <span className="text-[var(--text-disabled)] shrink-0 w-36">{log.timestamp}</span>
              <span className={`shrink-0 w-12 uppercase font-bold ${LEVEL_COLORS[log.level]}`}>{log.level}</span>
              <span className="text-[var(--text-secondary)] shrink-0 w-20">[{log.source}]</span>
              <span className="text-[var(--text-primary)]">{log.message}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

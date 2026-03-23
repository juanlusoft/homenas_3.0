import { useState, useCallback, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/UI';

interface TermLine {
  id: number;
  type: 'input' | 'output' | 'error';
  text: string;
}

// Mock command handler — replace with WebSocket terminal in production
const MOCK_COMMANDS: Record<string, string> = {
  'help': 'Available commands: help, ls, df, uptime, hostname, whoami, uname, date, clear, cat /etc/os-release',
  'ls': 'Documents  Media  Backups  Downloads  docker-compose.yml  notes.txt',
  'df -h': 'Filesystem      Size  Used  Avail Use%  Mounted on\n/dev/sda1       100G   42G    58G  42%  /\n/dev/sdb1       2.0T  1.2T   800G  60%  /mnt/storage',
  'uptime': ' 10:45:32 up 12 days, 3:22, 1 user, load average: 0.42, 0.38, 0.35',
  'hostname': 'homepinas',
  'whoami': 'admin',
  'uname -a': 'Linux homepinas 6.1.0-rpi 2026-03-01 armv7l GNU/Linux',
  'date': new Date().toString(),
  'cat /etc/os-release': 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"',
  'free -h': '              total   used   free  shared  buff/cache  available\nMem:          3.7Gi  1.8Gi  456Mi    42Mi       1.5Gi       1.7Gi\nSwap:         1.0Gi   12Mi  1012Mi',
  'docker ps': 'CONTAINER ID  IMAGE          STATUS         PORTS                  NAMES\na1b2c3d4e5f6  nginx:1.27     Up 3 days      0.0.0.0:80->80/tcp     nginx\nb2c3d4e5f6a1  postgres:16    Up 3 days      0.0.0.0:5432->5432/tcp postgres',
};

let lineId = 0;

export default function TerminalPage() {
  const [lines, setLines] = useState<TermLine[]>([
    { id: lineId++, type: 'output', text: 'HomePiNAS Terminal v3.6.0 — Type "help" for commands' },
    { id: lineId++, type: 'output', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(scrollToBottom, [lines.length, scrollToBottom]);

  const executeCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const newLines: TermLine[] = [
      { id: lineId++, type: 'input', text: `admin@homepinas:~$ ${trimmed}` },
    ];

    if (trimmed === 'clear') {
      setLines([]);
      setInput('');
      setHistory(prev => [...prev, trimmed]);
      setHistoryIdx(-1);
      return;
    }

    const output = MOCK_COMMANDS[trimmed];
    if (output) {
      output.split('\n').forEach(line => {
        newLines.push({ id: lineId++, type: 'output', text: line });
      });
    } else {
      newLines.push({ id: lineId++, type: 'error', text: `bash: ${trimmed.split(' ')[0]}: command not found` });
    }

    setLines(prev => [...prev, ...newLines]);
    setHistory(prev => [...prev, trimmed]);
    setHistoryIdx(-1);
    setInput('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const newIdx = historyIdx + 1;
        if (newIdx >= history.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(newIdx);
          setInput(history[newIdx]);
        }
      }
    }
  }, [input, history, historyIdx, executeCommand]);

  return (
    <div className="space-y-4">
      <GlassCard elevation="low" className="!p-0 overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-void border-b border-[var(--outline-variant)]">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-xs text-[var(--text-secondary)] font-mono">admin@homepinas:~</span>
        </div>

        {/* Terminal output */}
        <div
          ref={scrollRef}
          className="h-[65vh] overflow-y-auto bg-surface-void p-4 font-mono text-sm cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {lines.map(line => (
            <div key={line.id} className={`leading-6 ${
              line.type === 'input' ? 'text-teal' :
              line.type === 'error' ? 'text-[var(--error)]' :
              'text-[var(--text-primary)]'
            }`}>
              {line.text || '\u00A0'}
            </div>
          ))}

          {/* Input line */}
          <div className="flex items-center leading-6">
            <span className="text-teal">admin@homepinas:~$ </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] font-mono text-sm"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      </GlassCard>

      <p className="text-xs text-[var(--text-disabled)] text-center">
        ⌨️ Arrow up/down for history · Type "clear" to reset · Mock terminal — connect WebSocket for real shell
      </p>
    </div>
  );
}

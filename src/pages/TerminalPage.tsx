import { t } from '@/i18n';
import { useState, useCallback, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/UI';

interface TermLine {
  id: number;
  type: 'input' | 'output' | 'error';
  text: string;
}

const API = import.meta.env.VITE_API_URL || '/api';
let lineId = 0;

export default function TerminalPage() {
  const [lines, setLines] = useState<TermLine[]>([
    { id: lineId++, type: 'output', text: 'HomePiNAS Terminal — Escribe "help" para ver comandos disponibles' },
    { id: lineId++, type: 'output', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [lines.length, scrollToBottom]);

  const executeCommand = useCallback(async (cmd: string) => {
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

    setLines(prev => [...prev, ...newLines]);
    setInput('');
    setHistory(prev => [...prev, trimmed]);
    setHistoryIdx(-1);
    setRunning(true);

    try {
      const res = await fetch(`${API}/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      const data = await res.json();

      if (data.clear) {
        setLines([]);
      } else if (data.output) {
        const outputLines: TermLine[] = data.output.split('\n').map((line: string) => ({
          id: lineId++,
          type: data.exitCode === 0 ? 'output' as const : 'error' as const,
          text: line,
        }));
        setLines(prev => [...prev, ...outputLines]);
      }
    } catch {
      setLines(prev => [...prev, { id: lineId++, type: 'error', text: 'Error de conexión con el servidor' }]);
    }

    setRunning(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !running) {
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
        if (newIdx >= history.length) { setHistoryIdx(-1); setInput(''); }
        else { setHistoryIdx(newIdx); setInput(history[newIdx]); }
      }
    }
  }, [input, history, historyIdx, executeCommand, running]);

  return (
    <div className="space-y-4">
      <GlassCard elevation="low" className="!p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-void border-b border-[var(--outline-variant)]">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-xs text-[var(--text-secondary)] font-mono">admin@homepinas:~</span>
        </div>

        <div ref={scrollRef} className="h-[65vh] overflow-y-auto bg-surface-void p-4 font-mono text-sm cursor-text"
          onClick={() => inputRef.current?.focus()}>
          {lines.map(line => (
            <div key={line.id} className={`leading-6 ${
              line.type === 'input' ? 'text-teal' : line.type === 'error' ? 'text-[var(--error)]' : 'text-[var(--text-primary)]'
            }`}>{line.text || '\u00A0'}</div>
          ))}

          <div className="flex items-center leading-6">
            <span className="text-teal">admin@homepinas:~$ </span>
            {running ? (
              <span className="text-[var(--text-disabled)] animate-pulse">ejecutando...</span>
            ) : (
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] font-mono text-sm"
                autoFocus spellCheck={false} autoComplete="off" />
            )}
          </div>
        </div>
      </GlassCard>

      <p className="text-xs text-[var(--text-disabled)] text-center">
        {t('term.history')}
      </p>
    </div>
  );
}

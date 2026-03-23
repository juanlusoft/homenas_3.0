import { useState, useCallback } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';

interface Stack {
  id: string;
  name: string;
  file: string;
  status: 'running' | 'stopped' | 'partial';
  services: number;
  runningServices: number;
}

const MOCK_STACKS: Stack[] = [
  { id: '1', name: 'media-server', file: 'version: "3.8"\nservices:\n  plex:\n    image: plexinc/pms-docker:latest\n    container_name: plex\n    ports:\n      - "32400:32400"\n    volumes:\n      - /mnt/storage/media:/data\n      - /opt/plex/config:/config\n    environment:\n      - PLEX_UID=1000\n      - PLEX_GID=1000\n    restart: unless-stopped\n\n  sonarr:\n    image: linuxserver/sonarr:latest\n    container_name: sonarr\n    ports:\n      - "8989:8989"\n    volumes:\n      - /opt/sonarr/config:/config\n      - /mnt/storage/media/tv:/tv\n    restart: unless-stopped', status: 'running', services: 2, runningServices: 2 },
  { id: '2', name: 'monitoring', file: 'version: "3.8"\nservices:\n  grafana:\n    image: grafana/grafana:latest\n    container_name: grafana\n    ports:\n      - "3000:3000"\n    volumes:\n      - grafana-data:/var/lib/grafana\n    restart: unless-stopped\n\nvolumes:\n  grafana-data:', status: 'running', services: 1, runningServices: 1 },
  { id: '3', name: 'dev-tools', file: 'version: "3.8"\nservices:\n  postgres:\n    image: postgres:16\n    container_name: postgres\n    ports:\n      - "5432:5432"\n    environment:\n      - POSTGRES_PASSWORD=secret\n    volumes:\n      - pg-data:/var/lib/postgresql/data\n    restart: unless-stopped\n\n  redis:\n    image: redis:7-alpine\n    container_name: redis\n    ports:\n      - "6379:6379"\n    restart: unless-stopped\n\nvolumes:\n  pg-data:', status: 'stopped', services: 2, runningServices: 0 },
];

export default function DockerComposePage() {
  const [stacks, setStacks] = useState(MOCK_STACKS);
  const [editing, setEditing] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');

  const startEdit = useCallback((stack: Stack) => {
    setEditing(stack.id);
    setEditorContent(stack.file);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    setStacks(prev => prev.map(s =>
      s.id === editing ? { ...s, file: editorContent } : s
    ));
    setEditing(null);
  }, [editing, editorContent]);

  const toggleStack = useCallback((id: string) => {
    setStacks(prev => prev.map(s => {
      if (s.id !== id) return s;
      const running = s.status === 'running';
      return { ...s, status: running ? 'stopped' : 'running', runningServices: running ? 0 : s.services };
    }));
  }, []);

  // Editor view
  if (editing) {
    const stack = stacks.find(s => s.id === editing);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Editing: {stack?.name}
          </h2>
          <div className="flex gap-2">
            <StitchButton size="sm" onClick={saveEdit}>💾 Save</StitchButton>
            <StitchButton size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</StitchButton>
          </div>
        </div>
        <GlassCard elevation="low" className="!p-0">
          <textarea
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            className="w-full h-[65vh] bg-surface-void text-[var(--text-primary)] font-mono text-sm p-4 rounded-xl border-none outline-none resize-none"
            spellCheck={false}
          />
        </GlassCard>
        <p className="text-xs text-[var(--text-disabled)]">
          ⚠️ Changes will be validated before applying. docker compose up -d will be run automatically.
        </p>
      </div>
    );
  }

  // Stack list
  const runningCount = stacks.filter(s => s.status === 'running').length;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Stacks</p>
          <p className="font-display text-2xl font-bold text-teal">{stacks.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{runningCount} running</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Services</p>
          <p className="font-display text-2xl font-bold text-teal">
            {stacks.reduce((a, s) => a + s.runningServices, 0)}/{stacks.reduce((a, s) => a + s.services, 0)}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Actions</p>
          <StitchButton size="sm" className="mt-1">+ New Stack</StitchButton>
        </GlassCard>
      </div>

      {/* Stack cards */}
      {stacks.map(stack => (
        <GlassCard key={stack.id} elevation="low">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${stack.status === 'running' ? 'bg-teal' : 'bg-[var(--text-disabled)]'}`} />
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{stack.name}</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {stack.runningServices}/{stack.services} services · docker-compose.yml
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <StitchButton size="sm" variant="ghost" onClick={() => startEdit(stack)}>✏️ Edit</StitchButton>
              <StitchButton size="sm" variant="ghost" onClick={() => toggleStack(stack.id)}>
                {stack.status === 'running' ? '⏹ Stop' : '▶ Start'}
              </StitchButton>
            </div>
          </div>

          {/* Preview */}
          <pre className="mt-3 p-3 bg-surface-void rounded-lg font-mono text-xs text-[var(--text-secondary)] overflow-x-auto max-h-32 overflow-y-hidden">
            {stack.file.slice(0, 300)}{stack.file.length > 300 ? '...' : ''}
          </pre>
        </GlassCard>
      ))}
    </div>
  );
}

import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { GlassCard, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';

interface Stack {
  id: string; name: string; file: string;
  status: 'running' | 'stopped' | 'partial';
  services: number; runningServices: number;
}

const API = import.meta.env.VITE_API_URL || '/api';

export default function DockerComposePage() {
  const fetchStacks = useCallback(() => authFetch(`${API}/stacks`).then(r => r.json()), []);
  const { data: stacks, loading, refresh } = useAPI<Stack[]>(fetchStacks, 5000);
  const [editing, setEditing] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n');

  const startEdit = useCallback((stack: Stack) => {
    setEditing(stack.id);
    setEditorContent(stack.file);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    await authFetch(`${API}/stacks/${editing}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: editorContent }) });
    setEditing(null);
    refresh();
  }, [editing, editorContent, refresh]);

  const handleUp = useCallback(async (id: string) => {
    await authFetch(`${API}/stacks/${id}/up`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const handleDown = useCallback(async (id: string) => {
    await authFetch(`${API}/stacks/${id}/down`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await authFetch(`${API}/stacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), file: newFile }) });
    setAddOpen(false); setNewName(''); refresh();
  }, [newName, newFile, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar stack y todos sus contenedores?')) return;
    await authFetch(`${API}/stacks/${id}`, { method: 'DELETE' });
    refresh();
  }, [refresh]);

  // Editor view
  if (editing) {
    const stack = stacks?.find(s => s.id === editing);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            {t('stacks.editing')}: {stack?.name}
          </h2>
          <div className="flex gap-2">
            <StitchButton size="sm" onClick={saveEdit}>{t('stacks.save')}</StitchButton>
            <StitchButton size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('stacks.cancel')}</StitchButton>
          </div>
        </div>
        <GlassCard elevation="low" className="!p-0">
          <textarea value={editorContent} onChange={e => setEditorContent(e.target.value)}
            className="w-full h-[65vh] bg-surface-void text-[var(--text-primary)] font-mono text-sm p-4 rounded-xl border-none outline-none resize-none" spellCheck={false} />
        </GlassCard>
      </div>
    );
  }

  const list = stacks || [];
  const runningCount = list.filter(s => s.status === 'running').length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('stacks.stacks')}</p>
          <p className="font-display text-2xl font-bold text-teal">{list.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{runningCount} {t('svc.running')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('stacks.services')}</p>
          <p className="font-display text-2xl font-bold text-teal">
            {list.reduce((a, s) => a + s.runningServices, 0)}/{list.reduce((a, s) => a + s.services, 0)}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('common.actions')}</p>
          <StitchButton size="sm" className="mt-1" onClick={() => setAddOpen(true)}>{t('stacks.newStack')}</StitchButton>
        </GlassCard>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-void" />)}</div>
      ) : list.length === 0 ? (
        <GlassCard elevation="low"><p className="text-center text-[var(--text-disabled)] py-8">No hay stacks. Crea uno nuevo.</p></GlassCard>
      ) : (
        list.map(stack => (
          <GlassCard key={stack.id} elevation="low">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${stack.status === 'running' ? 'bg-teal' : 'bg-[var(--text-disabled)]'}`} />
                <div>
                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{stack.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{stack.runningServices}/{stack.services} {t('stacks.services')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <StitchButton size="sm" variant="ghost" onClick={() => startEdit(stack)}>{t('stacks.edit')}</StitchButton>
                <StitchButton size="sm" variant="ghost" onClick={() => stack.status === 'running' ? handleDown(stack.id) : handleUp(stack.id)}>
                  {stack.status === 'running' ? t('stacks.stop') : t('stacks.start')}
                </StitchButton>
                <StitchButton size="sm" variant="ghost" onClick={() => handleDelete(stack.id)}>🗑️</StitchButton>
              </div>
            </div>
            {stack.file && (
              <pre className="mt-3 p-3 bg-surface-void rounded-lg font-mono text-xs text-[var(--text-secondary)] overflow-x-auto max-h-32 overflow-y-hidden">
                {stack.file.slice(0, 300)}{stack.file.length > 300 ? '...' : ''}
              </pre>
            )}
          </GlassCard>
        ))
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('stacks.newStack')}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleCreate}>{t('common.save')}</StitchButton></>}>
        <div className="space-y-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('files.name')} autoFocus className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <textarea value={newFile} onChange={e => setNewFile(e.target.value)} rows={10} className="w-full bg-surface-void text-[var(--text-primary)] font-mono text-sm p-3 rounded-lg border-none outline-none resize-none" spellCheck={false} />
        </div>
      </Modal>
    </div>
  );
}

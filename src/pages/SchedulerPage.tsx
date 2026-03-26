import { t, ts } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';

interface Task { id: string; name: string; schedule: string; command: string; enabled: boolean; lastRun: string; lastResult: 'success' | 'failed' | 'never'; lastOutput?: string; }


export default function SchedulerPage() {
  const fetchTasks = useCallback(() => authFetch('/scheduler').then(r => r.json()), []);
  const { data: tasks, refresh } = useAPI<Task[]>(fetchTasks, 5000);
  const [addOpen, setAddOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [form, setForm] = useState({ name: '', schedule: '0 * * * *', command: '' });

  const handleAdd = useCallback(async () => {
    if (!form.name.trim() || !form.command.trim()) return;
    await authFetch('/scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setAddOpen(false); setForm({ name: '', schedule: '0 * * * *', command: '' }); refresh();
  }, [form, refresh]);

  const handleRun = useCallback(async (id: string) => {
    await authFetch(`/scheduler/${id}/run`, { method: 'POST' }); refresh();
  }, [refresh]);

  const handleToggle = useCallback(async (task: Task) => {
    await authFetch(`/scheduler/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !task.enabled }) }); refresh();
  }, [refresh]);

  const handleEdit = useCallback(async () => {
    if (!editTask) return;
    await authFetch(`/scheduler/${editTask.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditTask(null); refresh();
  }, [editTask, form, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await authFetch(`/scheduler/${id}`, { method: 'DELETE' }); refresh();
  }, [refresh]);

  const list = tasks || [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('sched.title')}</p>
          <p className="font-display text-2xl font-bold text-teal">{list.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{list.filter(t => t.enabled).length} {ts('active')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('sched.result')}</p>
          <div className="flex gap-2 mt-1">
            <GlowPill status="healthy" label={`${list.filter(t => t.lastResult === 'success').length} OK`} />
            <GlowPill status="error" label={`${list.filter(t => t.lastResult === 'failed').length} fail`} />
          </div>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('common.actions')}</p>
          <StitchButton size="sm" className="mt-2" onClick={() => setAddOpen(true)}>{t('sched.newTask')}</StitchButton>
        </GlassCard>
      </div>

      <GlassCard elevation="low">
        {list.length === 0 ? (
          <p className="text-center text-[var(--text-disabled)] py-4">No hay tareas programadas</p>
        ) : (
          <div className="divide-y divide-[var(--outline-variant)]">
            {list.map(task => (
              <div key={task.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-2 h-2 rounded-full ${task.enabled ? 'bg-teal' : 'bg-[var(--text-disabled)]'}`} />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-[var(--text-primary)]">{task.name}</p>
                    <p className="font-mono text-xs text-[var(--text-secondary)]">{task.schedule} · {task.command}</p>
                    <p className="text-xs text-[var(--text-disabled)]">{t('sched.lastRun')}: {task.lastRun}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <GlowPill status={task.lastResult === 'success' ? 'healthy' : task.lastResult === 'failed' ? 'error' : 'warning'} label={task.lastResult === 'never' ? t('sched.never') : ts(task.lastResult)} />
                  <StitchButton size="sm" variant="ghost" onClick={() => { setForm({ name: task.name, schedule: task.schedule, command: task.command }); setEditTask(task); }}>✏️</StitchButton>
                  {task.lastOutput && <StitchButton size="sm" variant="ghost" onClick={() => { setLogContent(task.lastOutput || ''); setLogOpen(true); }}>📋</StitchButton>}
                  <StitchButton size="sm" variant="ghost" onClick={() => handleRun(task.id)}>▶</StitchButton>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleToggle(task)}>{task.enabled ? '⏸' : '▶'}</StitchButton>
                  <StitchButton size="sm" variant="ghost" onClick={() => handleDelete(task.id)}>🗑️</StitchButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('sched.newTask')}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleAdd}>{t('common.save')}</StitchButton></>}>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('sched.name')} autoFocus className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder={t('sched.schedule')} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} placeholder={t('sched.command')} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <p className="text-xs text-[var(--text-disabled)]">Ejemplos: <code>0 2 * * *</code> (diario 2am), <code>*/5 * * * *</code> (cada 5min)</p>
        </div>
      </Modal>
      <Modal open={!!editTask} onClose={() => setEditTask(null)} title="Editar Tarea"
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setEditTask(null)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleEdit}>{t('common.save')}</StitchButton></>}>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('sched.name')} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder={t('sched.schedule')} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} placeholder={t('sched.command')} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        </div>
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log de Ejecución">
        <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] max-h-[60vh] overflow-auto whitespace-pre-wrap">{logContent}</pre>
      </Modal>
    </div>
  );
}

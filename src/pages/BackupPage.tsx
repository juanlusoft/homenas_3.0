import { t, ts } from '@/i18n';
import { useState, useCallback } from 'react';
import { useAPI } from '@/hooks/useAPI';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface BackupJob {
  id: string; name: string; type: 'full' | 'incremental' | 'snapshot';
  schedule: string; lastRun: string; nextRun: string;
  status: 'success' | 'running' | 'failed' | 'scheduled'; size: string; destination: string;
}

// No mock data — empty state until API responds

const statusGlow = (s: string) => s === 'success' ? 'healthy' as const : s === 'running' || s === 'scheduled' ? 'warning' as const : 'error' as const;

/** Translate English schedule strings like "Daily 02:00", "Every 6h", "Weekly Sun 03:00" */
function translateSchedule(s: string): string {
  return s
    .replace(/^Daily\b/i, t('sched.daily'))
    .replace(/^Every\b/i, t('sched.every'))
    .replace(/^Weekly\b/i, t('sched.weekly'))
    .replace(/\bSun\b/, t('sched.sun'))
    .replace(/\bMon\b/, t('sched.mon'))
    .replace(/\bTue\b/, t('sched.tue'))
    .replace(/\bWed\b/, t('sched.wed'))
    .replace(/\bThu\b/, t('sched.thu'))
    .replace(/\bFri\b/, t('sched.fri'))
    .replace(/\bSat\b/, t('sched.sat'));
}
const EMPTY_FORM = { name: '', type: 'incremental' as BackupJob['type'], schedule: '0 2 * * *', destination: '/mnt/backup/' };

export default function BackupPage() {
  const API = import.meta.env.VITE_API_URL || '/api';
  const fetchJobs = useCallback(() =>
    fetch(`${API}/backup`).then(r => r.json()), [API]);
  const { data: jobsData, refresh } = useAPI<BackupJob[]>(fetchJobs, 5000);
  const jobs = jobsData || [];
  const [addOpen, setAddOpen] = useState(false);
  const [editJob, setEditJob] = useState<BackupJob | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logJobName, setLogJobName] = useState('');

  const successCount = jobs.filter(j => j.status === 'success').length;
  const totalSize = jobs.reduce((acc, j) => acc + parseFloat(j.size), 0);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) return;
    await fetch(`${API}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    refresh();
    setAddOpen(false);
    setForm(EMPTY_FORM);
  }, [form, API, refresh]);

  const handleEdit = useCallback(async () => {
    if (!editJob) return;
    await fetch(`${API}/backup/${editJob.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    refresh();
    setEditJob(null);
    setForm(EMPTY_FORM);
  }, [editJob, form, API, refresh]);

  const handleRunNow = useCallback(async (id: string) => {
    await fetch(`${API}/backup/run/${id}`, { method: 'POST' });
    refresh();
  }, []);

  const handleRunAll = useCallback(async () => { await fetch(`${API}/backup/run-all`, { method: 'POST' }); refresh(); }, [API, refresh]);

  const openEdit = (job: BackupJob) => {
    setForm({ name: job.name, type: job.type, schedule: job.schedule, destination: job.destination });
    setEditJob(job);
  };

  const JobForm = () => (
    <div className="space-y-3">
      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('files.name')} autoFocus className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as BackupJob['type'] }))} className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]">
        <option value="full">{ts('full')}</option><option value="incremental">{ts('incremental')}</option><option value="snapshot">{ts('snapshot')}</option>
      </select>
      <input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder="0 2 * * *" className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
      <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="/mnt/backup/..." className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('backup.jobs')}</p>
          <p className="font-display text-2xl font-bold text-teal">{jobs.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{successCount} {t('backup.successful')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('backup.totalSize')}</p>
          <p className="font-display text-2xl font-bold text-teal">{totalSize.toFixed(1)} GB</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('common.actions')}</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}>{t('backup.newJob')}</StitchButton>
            <StitchButton size="sm" variant="ghost" onClick={handleRunAll}>{t('backup.runAll')}</StitchButton>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map(job => (
          <GlassCard key={job.id} elevation="mid">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{job.name}</h3>
                <p className="text-xs text-[var(--text-secondary)]">{ts(job.type)} · {translateSchedule(job.schedule)}</p>
              </div>
              <GlowPill status={statusGlow(job.status)} label={ts(job.status)} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('backup.lastRun')}</span><span className="font-mono text-[var(--text-primary)]">{job.lastRun}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('backup.nextRun')}</span><span className="font-mono text-[var(--text-primary)]">{job.nextRun}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('backup.size')}</span><span className="font-mono text-teal">{job.size}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)]">{t('backup.destination')}</span><span className="font-mono text-xs text-[var(--text-primary)]">{job.destination}</span></div>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <StitchButton size="sm" variant="ghost" onClick={() => handleRunNow(job.id)}>▶ {t('backup.runNow')}</StitchButton>
              <StitchButton size="sm" variant="ghost" onClick={() => openEdit(job)}>{t('backup.configure')}</StitchButton>
              {job.status === 'failed' && (
                <StitchButton size="sm" variant="ghost" onClick={async () => {
                  const res = await fetch(`${API_URL}/backup/${job.id}/logs`);
                  if (res.ok) {
                    const data = await res.json();
                    setLogContent(data.log || 'No logs available');
                    setLogJobName(job.name);
                    setLogOpen(true);
                  }
                }}>📋 Log</StitchButton>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('backup.newJob')}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleAdd}>{t('common.save')}</StitchButton></>}>
        <JobForm />
      </Modal>

      <Modal open={!!editJob} onClose={() => setEditJob(null)} title={`${t('backup.configure')}: ${editJob?.name}`}
        actions={<><StitchButton size="sm" variant="ghost" onClick={() => setEditJob(null)}>{t('common.cancel')}</StitchButton><StitchButton size="sm" onClick={handleEdit}>{t('common.save')}</StitchButton></>}>
        <JobForm />
      </Modal>

      {/* Execution Log Modal */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title={`Log: ${logJobName}`}
        actions={<StitchButton size="sm" variant="ghost" onClick={() => setLogOpen(false)}>{t('common.cancel')}</StitchButton>}>
        <div className="bg-[#0a0a0a] rounded-lg p-4 max-h-[60vh] overflow-auto">
          <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap break-all">{logContent}</pre>
        </div>
      </Modal>
    </div>
  );
}

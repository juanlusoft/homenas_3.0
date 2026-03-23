import { t } from '@/i18n';
import { useState } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';

interface BackupJob {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'snapshot';
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: 'success' | 'running' | 'failed' | 'scheduled';
  size: string;
  destination: string;
}

// Mock data until backend endpoint is ready
const MOCK_JOBS: BackupJob[] = [
  {
    id: '1', name: 'System Backup', type: 'full',
    schedule: 'Daily 02:00', lastRun: '2026-03-23 02:00',
    nextRun: '2026-03-24 02:00', status: 'success',
    size: '4.2 GB', destination: '/mnt/backup/system',
  },
  {
    id: '2', name: 'User Data', type: 'incremental',
    schedule: 'Every 6h', lastRun: '2026-03-23 06:00',
    nextRun: '2026-03-23 12:00', status: 'success',
    size: '12.8 GB', destination: '/mnt/backup/data',
  },
  {
    id: '3', name: 'Docker Volumes', type: 'snapshot',
    schedule: 'Weekly Sun 03:00', lastRun: '2026-03-16 03:00',
    nextRun: '2026-03-23 03:00', status: 'scheduled',
    size: '2.1 GB', destination: '/mnt/backup/docker',
  },
];

function statusToGlow(status: BackupJob['status']): 'healthy' | 'warning' | 'error' {
  if (status === 'success') return 'healthy';
  if (status === 'running' || status === 'scheduled') return 'warning';
  return 'error';
}

function BackupJobCard({ job }: { job: BackupJob }) {
  return (
    <GlassCard elevation="mid">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{job.name}</h3>
          <p className="text-xs text-[var(--text-secondary)]">{job.type} · {job.schedule}</p>
        </div>
        <GlowPill status={statusToGlow(job.status)} label={job.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('backup.lastRun')}</span>
          <span className="font-mono text-[var(--text-primary)]">{job.lastRun}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('backup.nextRun')}</span>
          <span className="font-mono text-[var(--text-primary)]">{job.nextRun}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('backup.size')}</span>
          <span className="font-mono text-teal">{job.size}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">{t('backup.destination')}</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">{job.destination}</span>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <StitchButton size="sm" variant="ghost">{t('backup.runNow')}</StitchButton>
        <StitchButton size="sm" variant="ghost">{t('backup.configure')}</StitchButton>
      </div>
    </GlassCard>
  );
}

export default function BackupPage() {
  const [jobs] = useState<BackupJob[]>(MOCK_JOBS);

  const successCount = jobs.filter(j => j.status === 'success').length;
  const totalSize = jobs.reduce((acc, j) => acc + parseFloat(j.size), 0);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('backup.jobs')}</p>
          <p className="font-display text-2xl font-bold text-teal">{jobs.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{successCount} successful</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('backup.totalSize')}</p>
          <p className="font-display text-2xl font-bold text-teal">{totalSize.toFixed(1)} GB</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('backup.actions')}</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm">{t('backup.newJob')}</StitchButton>
            <StitchButton size="sm" variant="ghost">{t('backup.runAll')}</StitchButton>
          </div>
        </GlassCard>
      </div>

      {/* Job cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map(job => <BackupJobCard key={job.id} job={job} />)}
      </div>
    </div>
  );
}

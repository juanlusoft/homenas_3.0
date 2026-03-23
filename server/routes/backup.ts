/**
 * Backup REST endpoints — job management + execution
 */

import { Router } from 'express';
import { alerts } from '../utils/notify.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const backupRouter = Router();
const execFileAsync = promisify(execFile);

const BACKUP_FILE = path.join(process.cwd(), 'data', 'backup-jobs.json');

interface BackupJob {
  id: string; name: string; type: 'full' | 'incremental' | 'snapshot';
  schedule: string; lastRun: string; nextRun: string;
  status: 'success' | 'running' | 'failed' | 'scheduled';
  size: string; destination: string;
}

function loadJobs(): BackupJob[] {
  try { return JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8')); }
  catch { return []; }
}

function saveJobs(jobs: BackupJob[]): void {
  fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(jobs, null, 2));
}

/** GET /api/backup — List all jobs */
backupRouter.get('/', (_req, res) => {
  res.json(loadJobs());
});

/** POST /api/backup — Create new job */
backupRouter.post('/', (req, res) => {
  const { name, type, schedule, destination } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const jobs = loadJobs();
  const job: BackupJob = {
    id: String(Date.now()), name, type: type || 'incremental',
    schedule: schedule || '0 2 * * *', lastRun: '-', nextRun: '-',
    status: 'scheduled', size: '0 B', destination: destination || '/mnt/backup',
  };
  jobs.push(job);
  saveJobs(jobs);
  res.json(job);
});

/** PUT /api/backup/:id — Update job */
backupRouter.put('/:id', (req, res) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  jobs[idx] = { ...jobs[idx], ...req.body, id: jobs[idx].id };
  saveJobs(jobs);
  res.json(jobs[idx]);
});

/** DELETE /api/backup/:id — Delete job */
backupRouter.delete('/:id', (req, res) => {
  let jobs = loadJobs();
  jobs = jobs.filter(j => j.id !== req.params.id);
  saveJobs(jobs);
  res.json({ success: true });
});

/** POST /api/backup/run/:id — Execute a backup job */
backupRouter.post('/run/:id', async (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  job.status = 'running';
  saveJobs(jobs);

  // Run backup asynchronously
  runBackup(job).then(() => {
    const updated = loadJobs();
    const j = updated.find(x => x.id === job.id);
    if (j) {
      j.status = 'success';
      alerts.backupComplete(j.name, j.size);
      j.lastRun = new Date().toISOString().slice(0, 16).replace('T', ' ');
      saveJobs(updated);
    }
  }).catch(() => {
    const updated = loadJobs();
    const j = updated.find(x => x.id === job.id);
    if (j) { j.status = 'failed'; saveJobs(updated);
    alerts.backupFailed(job.name, 'Execution error'); }
  });

  res.json({ success: true, message: 'Backup started' });
});

/** POST /api/backup/run-all — Run all jobs */
backupRouter.post('/run-all', (_req, res) => {
  const jobs = loadJobs();
  for (const job of jobs) {
    job.status = 'running';
  }
  saveJobs(jobs);
  // Start all async
  for (const job of jobs) {
    runBackup(job).then(() => {
      const updated = loadJobs();
      const j = updated.find(x => x.id === job.id);
      if (j) {
        j.status = 'success';
        j.lastRun = new Date().toISOString().slice(0, 16).replace('T', ' ');
        saveJobs(updated);
      }
    }).catch(() => {
      const updated = loadJobs();
      const j = updated.find(x => x.id === job.id);
      if (j) { j.status = 'failed'; saveJobs(updated); }
    });
  }
  res.json({ success: true, message: `${jobs.length} backups started` });
});

async function runBackup(job: BackupJob): Promise<void> {
  const source = '/mnt/storage';
  const dest = job.destination;
  fs.mkdirSync(dest, { recursive: true });

  if (job.type === 'full' || job.type === 'incremental') {
    // Use rsync for actual backup
    await execFileAsync('rsync', [
      '-a', '--delete',
      job.type === 'incremental' ? '--link-dest=../latest' : '',
      source + '/', dest + '/' + new Date().toISOString().slice(0, 10),
    ].filter(Boolean), { timeout: 3600000 }); // 1h timeout
  } else if (job.type === 'snapshot') {
    // btrfs snapshot if available, otherwise rsync
    try {
      await execFileAsync('btrfs', ['subvolume', 'snapshot', '-r', source, dest + '/snap-' + Date.now()], { timeout: 60000 });
    } catch {
      await execFileAsync('rsync', ['-a', source + '/', dest + '/snap-' + Date.now()], { timeout: 3600000 });
    }
  }
}

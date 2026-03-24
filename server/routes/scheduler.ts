/**
 * Scheduled Tasks REST endpoints — secured with action allowlist
 */

import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

export const schedulerRouter = Router();
const execFileAsync = promisify(execFile);

const TASKS_FILE = path.join(process.cwd(), 'data', 'scheduled-tasks.json');

/** Predefined safe actions — no user-supplied commands */
const PREDEFINED_ACTIONS: Record<string, { label: string; cmd: string; args: string[] }> = {
  'snapraid-sync': { label: 'SnapRAID Sync', cmd: 'snapraid', args: ['sync'] },
  'snapraid-scrub': { label: 'SnapRAID Scrub', cmd: 'snapraid', args: ['scrub'] },
  'snapraid-status': { label: 'SnapRAID Status', cmd: 'snapraid', args: ['status'] },
  'apt-update': { label: 'Update packages list', cmd: 'sudo', args: ['apt', 'update'] },
  'apt-upgrade': { label: 'Upgrade packages', cmd: 'sudo', args: ['apt', 'upgrade', '-y'] },
  'docker-prune': { label: 'Docker cleanup', cmd: 'docker', args: ['system', 'prune', '-f'] },
  'system-reboot': { label: 'Reboot system', cmd: 'sudo', args: ['reboot'] },
  'disk-trim': { label: 'SSD TRIM', cmd: 'sudo', args: ['fstrim', '-av'] },
  'temp-cleanup': { label: 'Clean temp files', cmd: 'sudo', args: ['find', '/tmp', '-type', 'f', '-atime', '+7', '-delete'] },
};

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  actionId: string;
  enabled: boolean;
  lastRun: string;
  lastResult: 'success' | 'failed' | 'never';
  lastOutput?: string;
  // Legacy field — ignored but kept for migration
  command?: string;
}

// Cron schedule validation: 5 fields, each valid
const CRON_FIELD_RE = /^(\*|(\d{1,2})([-/]\d{1,2})?)(,(\*|(\d{1,2})([-/]\d{1,2})?))*$/;
function isValidCron(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every(f => CRON_FIELD_RE.test(f));
}

function loadTasks(): ScheduledTask[] {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveTasks(tasks: ScheduledTask[]): void {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/** Sync tasks to system crontab using predefined actions only */
async function syncCrontab(tasks: ScheduledTask[]): Promise<void> {
  const cronLines = tasks
    .filter(t => t.enabled && PREDEFINED_ACTIONS[t.actionId])
    .map(t => {
      const action = PREDEFINED_ACTIONS[t.actionId];
      return `${t.schedule} ${action.cmd} ${action.args.join(' ')} # homepinas:${t.id}`;
    })
    .join('\n');

  let existing = '';
  try {
    const { stdout } = await execFileAsync('crontab', ['-l'], { timeout: 5000 });
    existing = stdout.split('\n').filter(l => !l.includes('# homepinas:')).join('\n');
  } catch {}

  const newCrontab = (existing.trim() + '\n' + cronLines).trim() + '\n';
  const tmpFile = '/tmp/homepinas-crontab';
  fs.writeFileSync(tmpFile, newCrontab);
  await execFileAsync('crontab', [tmpFile], { timeout: 5000 });
  fs.unlinkSync(tmpFile);
}

/** GET /api/scheduler/actions — List available actions */
schedulerRouter.get('/actions', requireAdmin, (_req: Request, res: Response) => {
  const actions = Object.entries(PREDEFINED_ACTIONS).map(([id, a]) => ({ id, label: a.label }));
  res.json(actions);
});

/** GET /api/scheduler — List tasks (admin only) */
schedulerRouter.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json(loadTasks());
});

/** POST /api/scheduler — Create task (admin only) */
schedulerRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { name, schedule, actionId } = req.body;
  if (!name || !schedule || !actionId) return res.status(400).json({ error: 'Name, schedule, and actionId required' });
  if (!PREDEFINED_ACTIONS[actionId]) return res.status(400).json({ error: `Invalid actionId. Valid: ${Object.keys(PREDEFINED_ACTIONS).join(', ')}` });
  if (!isValidCron(schedule)) return res.status(400).json({ error: 'Invalid cron schedule format' });

  const tasks = loadTasks();
  const task: ScheduledTask = {
    id: String(Date.now()),
    name: String(name).slice(0, 100),
    schedule,
    actionId,
    enabled: true,
    lastRun: '-',
    lastResult: 'never',
  };
  tasks.push(task);
  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  audit('scheduler_created', { user: req.user?.username, details: `Task "${name}" (${actionId})` });
  res.json(task);
});

/** PUT /api/scheduler/:id — Update task (admin only) */
schedulerRouter.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.body.name) task.name = String(req.body.name).slice(0, 100);
  if (req.body.schedule) {
    if (!isValidCron(req.body.schedule)) return res.status(400).json({ error: 'Invalid cron schedule' });
    task.schedule = req.body.schedule;
  }
  if (req.body.actionId) {
    if (!PREDEFINED_ACTIONS[req.body.actionId]) return res.status(400).json({ error: 'Invalid actionId' });
    task.actionId = req.body.actionId;
  }
  if (typeof req.body.enabled === 'boolean') task.enabled = req.body.enabled;

  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  res.json(task);
});

/** DELETE /api/scheduler/:id — Delete task (admin only) */
schedulerRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  let tasks = loadTasks();
  const target = tasks.find(t => t.id === req.params.id);
  tasks = tasks.filter(t => t.id !== req.params.id);
  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  audit('scheduler_deleted', { user: req.user?.username, details: `Task "${target?.name}"` });
  res.json({ success: true });
});

/** POST /api/scheduler/:id/run — Run task now (admin only) */
schedulerRouter.post('/:id/run', requireAdmin, async (req: Request, res: Response) => {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const action = PREDEFINED_ACTIONS[task.actionId];
  if (!action) return res.status(400).json({ error: 'Unknown action' });

  audit('scheduler_run', { user: req.user?.username, details: `Running "${task.name}" (${task.actionId})` });

  try {
    const result = await execFileAsync(action.cmd, action.args, { timeout: 60000 });
    task.lastRun = new Date().toISOString().slice(0, 16).replace('T', ' ');
    task.lastResult = 'success';
    task.lastOutput = result.stdout.slice(0, 2000);
  } catch {
    task.lastResult = 'failed';
    task.lastOutput = 'Error de ejecución';
  }
  saveTasks(tasks);
  res.json(task);
});

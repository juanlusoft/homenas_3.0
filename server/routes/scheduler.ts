/**
 * Scheduled Tasks (Cron) REST endpoints
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const schedulerRouter = Router();
const execFileAsync = promisify(execFile);

const TASKS_FILE = path.join(process.cwd(), 'data', 'scheduled-tasks.json');

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string; // cron expression
  command: string;
  enabled: boolean;
  lastRun: string;
  lastResult: 'success' | 'failed' | 'never';
}

function loadTasks(): ScheduledTask[] {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveTasks(tasks: ScheduledTask[]): void {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/** Sync tasks to system crontab */
async function syncCrontab(tasks: ScheduledTask[]): Promise<void> {
  const cronLines = tasks
    .filter(t => t.enabled)
    .map(t => `${t.schedule} ${t.command} # homepinas:${t.id}`)
    .join('\n');

  // Read existing crontab, remove homepinas entries, append ours
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

/** GET /api/scheduler — List tasks */
schedulerRouter.get('/', (_req, res) => {
  res.json(loadTasks());
});

/** POST /api/scheduler — Create task */
schedulerRouter.post('/', async (req, res) => {
  const { name, schedule, command } = req.body;
  if (!name || !schedule || !command) return res.status(400).json({ error: 'Name, schedule, and command required' });

  const tasks = loadTasks();
  const task: ScheduledTask = {
    id: String(Date.now()),
    name, schedule, command,
    enabled: true, lastRun: '-', lastResult: 'never',
  };
  tasks.push(task);
  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  res.json(task);
});

/** PUT /api/scheduler/:id — Update task */
schedulerRouter.put('/:id', async (req, res) => {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  Object.assign(task, req.body, { id: task.id });
  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  res.json(task);
});

/** DELETE /api/scheduler/:id — Delete task */
schedulerRouter.delete('/:id', async (req, res) => {
  let tasks = loadTasks();
  tasks = tasks.filter(t => t.id !== req.params.id);
  saveTasks(tasks);
  await syncCrontab(tasks).catch(() => {});
  res.json({ success: true });
});

/** POST /api/scheduler/:id/run — Run task now */
schedulerRouter.post('/:id/run', async (req, res) => {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  try {
    const parts = task.command.split(' ');
    await execFileAsync(parts[0], parts.slice(1), { timeout: 60000 });
    task.lastRun = new Date().toISOString().slice(0, 16).replace('T', ' ');
    task.lastResult = 'success';
  } catch {
    task.lastResult = 'failed';
  }
  saveTasks(tasks);
  res.json(task);
});

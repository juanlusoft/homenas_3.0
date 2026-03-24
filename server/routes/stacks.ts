/**
 * Docker Compose Stacks — real management
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const stacksRouter = Router();
const execFileAsync = promisify(execFile);

const STACKS_DIR = process.env.STACKS_DIR || '/opt/homepinas-v3/stacks';

/** GET /api/stacks — List all stacks */
stacksRouter.get('/', requireAuth, async (_req, res) => {
  try {
    fs.mkdirSync(STACKS_DIR, { recursive: true });
    const dirs = fs.readdirSync(STACKS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    const stacks = await Promise.all(dirs.map(async dir => {
      const composePath = path.join(STACKS_DIR, dir.name, 'docker-compose.yml');
      let file = '';
      try { file = fs.readFileSync(composePath, 'utf-8'); } catch {}

      // Count services in YAML
      const serviceCount = (file.match(/^\s{2}\w+:/gm) || []).length;

      // Check running status
      let status: 'running' | 'stopped' | 'partial' = 'stopped';
      let runningServices = 0;
      try {
        const { stdout } = await execFileAsync('docker', ['compose', '-f', composePath, 'ps', '--format', 'json'], { timeout: 5000, cwd: path.join(STACKS_DIR, dir.name) });
        const containers = stdout.trim().split('\n').filter(Boolean);
        runningServices = containers.filter(c => { try { return JSON.parse(c).State === 'running'; } catch { return c.includes('running'); } }).length;
        status = runningServices === 0 ? 'stopped' : runningServices >= serviceCount ? 'running' : 'partial';
      } catch {}

      return { id: dir.name, name: dir.name, file, status, services: serviceCount || 1, runningServices };
    }));

    res.json(stacks);
  } catch {
    res.json([]);
  }
});

/** POST /api/stacks — Create new stack */
stacksRouter.post('/', requireAdmin, (req, res) => {
  const { name, file } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  const stackDir = path.join(STACKS_DIR, safeName);
  fs.mkdirSync(stackDir, { recursive: true });
  fs.writeFileSync(path.join(stackDir, 'docker-compose.yml'), file || '');
  res.json({ success: true, id: safeName });
});

/** PUT /api/stacks/:id — Update stack file */
stacksRouter.put('/:id', requireAdmin, (req, res) => {
  const stackDir = path.join(STACKS_DIR, req.params.id.replace(/[^a-zA-Z0-9_-]/g, ''));
  if (!fs.existsSync(stackDir)) return res.status(404).json({ error: 'Stack not found' });
  fs.writeFileSync(path.join(stackDir, 'docker-compose.yml'), req.body.file || '');
  res.json({ success: true });
});

/** POST /api/stacks/:id/up — Start stack */
stacksRouter.post('/:id/up', requireAdmin, async (req, res) => {
  const stackDir = path.join(STACKS_DIR, req.params.id.replace(/[^a-zA-Z0-9_-]/g, ''));
  try {
    await execFileAsync('docker', ['compose', '-f', path.join(stackDir, 'docker-compose.yml'), 'up', '-d'], { timeout: 120000, cwd: stackDir });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Failed to start stack' });
  }
});

/** POST /api/stacks/:id/down — Stop stack */
stacksRouter.post('/:id/down', requireAdmin, async (req, res) => {
  const stackDir = path.join(STACKS_DIR, req.params.id.replace(/[^a-zA-Z0-9_-]/g, ''));
  try {
    await execFileAsync('docker', ['compose', '-f', path.join(stackDir, 'docker-compose.yml'), 'down'], { timeout: 60000, cwd: stackDir });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: 'Failed to stop stack' });
  }
});

/** DELETE /api/stacks/:id — Remove stack */
stacksRouter.delete('/:id', requireAdmin, async (req, res) => {
  const stackDir = path.join(STACKS_DIR, req.params.id.replace(/[^a-zA-Z0-9_-]/g, ''));
  try {
    await execFileAsync('docker', ['compose', '-f', path.join(stackDir, 'docker-compose.yml'), 'down', '-v'], { timeout: 60000, cwd: stackDir }).catch(() => {});
    fs.rmSync(stackDir, { recursive: true });
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

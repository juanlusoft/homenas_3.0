/**
 * Services REST endpoints (Docker + systemd)
 */

import { Router } from 'express';
import { alerts } from '../utils/notify.js';
import si from 'systeminformation';

export const servicesRouter = Router();

/** GET /api/services/docker — Docker containers */
servicesRouter.get('/docker', async (_req, res) => {
  try {
    const containers = await si.dockerContainers(true);

    const result = containers.map(c => ({
      id: c.id.slice(0, 12),
      name: c.name,
      image: c.image,
      status: c.state === 'running' ? 'running' as const
        : c.state === 'paused' ? 'paused' as const
        : 'stopped' as const,
      uptime: c.started ? timeSince(new Date(c.started * 1000)) : '',
      ports: c.ports.map(p => `${p.PrivatePort}/${p.Type}`),
      cpu: '0',
      memory: 0,
    }));

    res.json(result);
  } catch {
    // Docker may not be installed
    res.json([]);
  }
});

/** GET /api/services/systemd — Key system services */
servicesRouter.get('/systemd', async (_req, res) => {
  try {
    const services = await si.services('sshd,nginx,smbd,nmbd,docker,homepinas');

    const result = services.map(s => ({
      name: s.name,
      status: s.running ? 'active' as const : 'inactive' as const,
      state: s.running ? 'running' : 'dead',
      enabled: true,
      uptime: '',
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to read services' });
  }
});

/** POST /api/services/start/:name — Start a service */
servicesRouter.post('/start/:name', async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);
    await execFileAsync('sudo', ['systemctl', 'start', name], { timeout: 10000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: `Failed to start ${name}` });
  }
});

/** POST /api/services/stop/:name — Stop a service */
servicesRouter.post('/stop/:name', async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);
    await execFileAsync('sudo', ['systemctl', 'stop', name], { timeout: 10000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: `Failed to stop ${name}` });
  }
});

/** GET /api/services/docker/:id/logs — Container logs */
servicesRouter.get('/docker/:id/logs', async (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const lines = parseInt(req.query.lines as string) || 100;
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify: p } = await import('util');
    const exec = p(ef);
    const { stdout } = await exec('docker', ['logs', '--tail', String(lines), '--timestamps', id], { timeout: 10000 });
    res.json({ logs: stdout });
  } catch {
    res.json({ logs: '', error: 'Failed to read container logs' });
  }
});

/** POST /api/services/docker/:id/stop — Stop container */
servicesRouter.post('/docker/:id/stop', async (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify: p } = await import('util');
    const exec = p(ef);
    await exec('docker', ['stop', id], { timeout: 30000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/** POST /api/services/docker/:id/restart — Restart container */
servicesRouter.post('/docker/:id/restart', async (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify: p } = await import('util');
    const exec = p(ef);
    await exec('docker', ['restart', id], { timeout: 30000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: 'Failed to restart container' });
  }
});

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

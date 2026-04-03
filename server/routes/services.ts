/**
 * Services REST endpoints (Docker + systemd)
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { alerts } from '../utils/notify.js';
import si from 'systeminformation';

export const servicesRouter = Router();

/** GET /api/services/docker — Docker containers */
servicesRouter.get('/docker', requireAuth, async (_req, res) => {
  try {
    const [containers, dockerStats] = await Promise.all([
      si.dockerContainers(true),
      si.dockerContainerStats('*').catch(() => []),
    ]);

    const statsMap = new Map<string, { cpu: number; memory: number }>();
    const statsList = Array.isArray(dockerStats) ? dockerStats : [dockerStats];
    for (const s of statsList) {
      if (s && s.id) {
        statsMap.set(s.id.slice(0, 12), {
          cpu: Math.round((s.cpuPercent || 0) * 10) / 10,
          memory: Math.round((s.memUsage || 0) / 1024 / 1024),
        });
      }
    }

    const result = containers.map(c => {
      const id = c.id.slice(0, 12);
      const stats = statsMap.get(id);
      // Deduplicate ports
      const uniquePorts = [...new Set(c.ports.map(p => `${p.PrivatePort}/${p.Type}`))];

      return {
        id,
        name: c.name,
        image: c.image,
        status: c.state === 'running' ? 'running' as const
          : c.state === 'paused' ? 'paused' as const
          : 'stopped' as const,
        uptime: c.started ? timeSince(new Date(c.started * 1000)) : '',
        ports: uniquePorts,
        cpu: stats ? String(stats.cpu) : '0',
        memory: stats?.memory ?? 0,
      };
    });

    res.json(result);
  } catch {
    // Docker may not be installed
    res.json([]);
  }
});

/** GET /api/services/systemd — Key system services */
servicesRouter.get('/systemd', requireAuth, async (_req, res) => {
  const names = ['sshd', 'nginx', 'smbd', 'nmbd', 'docker', 'homepinas'];
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);

    const results = await Promise.all(names.map(async (name) => {
      const [activeOut, enabledOut] = await Promise.all([
        execFileAsync('systemctl', ['is-active', name], { timeout: 3000 }).then(r => r.stdout.trim()).catch(e => (e.stdout ?? '').trim()),
        execFileAsync('systemctl', ['is-enabled', name], { timeout: 3000 }).then(r => r.stdout.trim()).catch(e => (e.stdout ?? '').trim()),
      ]);
      const running = activeOut === 'active';
      const enabled = enabledOut === 'enabled' || enabledOut === 'static';
      return {
        name,
        status: running ? 'active' as const : 'inactive' as const,
        state: activeOut,
        enabled,
        uptime: '',
      };
    }));

    res.json(results);
  } catch {
    res.status(500).json({ error: 'Failed to read services' });
  }
});

/** GET /api/services/docker/:name/logs — Container logs */
servicesRouter.get('/docker/:name/logs', requireAuth, async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);
    const { stdout } = await execFileAsync('docker', ['logs', '--tail', '100', name], { timeout: 10000 });
    res.json({ logs: stdout });
  } catch (e) {
    res.json({ logs: `Failed to fetch logs for ${name}` });
  }
});

/** POST /api/services/docker/:name/stop — Stop container */
servicesRouter.post('/docker/:name/stop', requireAdmin, async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);
    await execFileAsync('docker', ['stop', name], { timeout: 30000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: `Failed to stop ${name}` });
  }
});

/** POST /api/services/docker/:name/restart — Restart container */
servicesRouter.post('/docker/:name/restart', requireAdmin, async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(ef);
    await execFileAsync('docker', ['restart', name], { timeout: 30000 });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: `Failed to restart ${name}` });
  }
});

/** POST /api/services/start/:name — Start a service */
servicesRouter.post('/start/:name', requireAdmin, async (req, res) => {
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
servicesRouter.post('/stop/:name', requireAdmin, async (req, res) => {
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
servicesRouter.get('/docker/:id/logs', requireAuth, async (req, res) => {
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
servicesRouter.post('/docker/:id/stop', requireAdmin, async (req, res) => {
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
servicesRouter.post('/docker/:id/restart', requireAdmin, async (req, res) => {
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

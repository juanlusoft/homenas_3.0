/**
 * Services REST endpoints (Docker + systemd)
 */

import { Router } from 'express';
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

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

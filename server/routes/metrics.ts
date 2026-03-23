/**
 * System metrics REST endpoints
 */

import { Router } from 'express';
import si from 'systeminformation';

export const metricsRouter = Router();

/** GET /api/system/metrics — Current system metrics */
metricsRouter.get('/metrics', async (_req, res) => {
  try {
    const [cpu, mem, temp, time, load] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
      si.time(),
      si.currentLoad(),
    ]);

    res.json({
      cpu: cpu.currentLoad.toFixed(1),
      memory: {
        used: Math.round((mem.used / mem.total) * 100),
        total: Math.round(mem.total / (1024 * 1024)),
        free: Math.round(mem.free / (1024 * 1024)),
      },
      temperature: temp.main ?? 0,
      uptime: time.uptime,
      load: [
        load.currentLoad.toFixed(2),
        load.currentLoad.toFixed(2),
        load.currentLoad.toFixed(2),
      ],
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to read system metrics' });
  }
});

/** GET /api/system/diagnostics — System diagnostics */
metricsRouter.get('/diagnostics', async (_req, res) => {
  try {
    const [cpu, mem, os, disk, net, docker] = await Promise.all([
      si.cpu(), si.mem(), si.osInfo(), si.fsSize(),
      si.networkInterfaces(), si.dockerInfo(),
    ]);

    res.json({
      cpu: { brand: cpu.brand, cores: cpu.cores, speed: cpu.speed },
      memory: { total: Math.round(mem.total / 1e9), used: Math.round(mem.used / 1e9), free: Math.round(mem.free / 1e9) },
      os: { distro: os.distro, release: os.release, kernel: os.kernel, arch: os.arch },
      disks: (Array.isArray(disk) ? disk : [disk]).map(d => ({ mount: d.mount, use: d.use, size: d.size })),
      network: (Array.isArray(net) ? net : [net]).filter(n => !n.internal).map(n => ({ name: n.iface, ip: n.ip4, status: n.operstate })),
      docker: { containers: docker.containers, running: docker.containersRunning, images: docker.images },
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Diagnostics failed' });
  }
});

/** GET /api/system/updates — Check for package updates */
metricsRouter.get('/updates', async (_req, res) => {
  try {
    const { execFile: ef } = await import('child_process');
    const { promisify: p } = await import('util');
    const exec = p(ef);
    const { stdout } = await exec('sudo', ['apt', 'list', '--upgradable'], { timeout: 30000 });
    const updates = stdout.split('\n').filter(l => l.includes('upgradable')).map(l => {
      const [pkg] = l.split('/');
      return pkg;
    });
    res.json({ count: updates.length, packages: updates });
  } catch {
    res.json({ count: 0, packages: [], error: 'Could not check updates' });
  }
});

/** GET /api/system/info — Static system info */
metricsRouter.get('/info', async (_req, res) => {
  try {
    const [system, os, cpu] = await Promise.all([
      si.system(),
      si.osInfo(),
      si.cpu(),
    ]);

    res.json({
      hostname: os.hostname,
      platform: os.platform,
      distro: os.distro,
      release: os.release,
      kernel: os.kernel,
      arch: os.arch,
      cpu: `${cpu.manufacturer} ${cpu.brand}`,
      cores: cpu.cores,
      model: system.model,
    });
  } catch {
    res.status(500).json({ error: 'Failed to read system info' });
  }
});

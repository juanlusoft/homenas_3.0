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

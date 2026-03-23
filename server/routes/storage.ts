/**
 * Storage REST endpoints
 */

import { Router } from 'express';
import si from 'systeminformation';

export const storageRouter = Router();

/** GET /api/storage/disks — Disk information */
storageRouter.get('/disks', async (_req, res) => {
  try {
    const [disks, fsSize, diskTemp] = await Promise.all([
      si.blockDevices(),
      si.fsSize(),
      si.diskLayout(),
    ]);

    const tempMap = new Map(
      diskTemp.map(d => [d.device, d.temperature ?? 0])
    );

    const result = fsSize
      .filter(fs => fs.mount !== '' && !fs.mount.startsWith('/snap'))
      .map(fs => {
        const block = disks.find(d => fs.fs.includes(d.name));
        return {
          device: fs.fs,
          name: block?.label || fs.mount,
          mount: fs.mount,
          size: formatBytes(fs.size),
          used: formatBytes(fs.used),
          free: formatBytes(fs.available),
          usage: Math.round(fs.use),
          health: fs.use > 90 ? 'critical' as const : fs.use > 75 ? 'warning' as const : 'healthy' as const,
          temperature: tempMap.get(block?.name ?? '') ?? 0,
          type: block?.type || fs.type,
          smart: {
            status: 'OK',
            powerOnHours: 0,
            badSectors: 0,
          },
        };
      });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to read storage info' });
  }
});

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

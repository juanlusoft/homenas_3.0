/**
 * Network REST endpoints
 */

import { Router } from 'express';
import si from 'systeminformation';

export const networkRouter = Router();

/** GET /api/network/interfaces — Network interfaces */
networkRouter.get('/interfaces', async (_req, res) => {
  try {
    const [ifaces, stats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats(),
    ]);

    const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces];
    const statsList = Array.isArray(stats) ? stats : [stats];

    const result = ifaceList
      .filter(i => !i.internal)
      .map(i => {
        const stat = statsList.find(s => s.iface === i.iface);
        return {
          name: i.iface,
          ip: i.ip4 || '',
          netmask: i.ip4subnet || '',
          gateway: i.gateway || '',
          status: i.operstate === 'up' ? 'up' as const : 'down' as const,
          speed: i.speed ? `${i.speed} Mbps` : 'unknown',
          rx_bytes: stat?.rx_bytes ?? 0,
          tx_bytes: stat?.tx_bytes ?? 0,
        };
      });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to read network info' });
  }
});

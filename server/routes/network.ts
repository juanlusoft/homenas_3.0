/**
 * Network REST endpoints — interfaces + configuration
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

export const networkRouter = Router();
const execFileAsync = promisify(execFile);

/** GET /api/network/interfaces — Network interfaces (dynamic) */
networkRouter.get('/interfaces', async (_req, res) => {
  try {
    const [ifaces, stats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats(),
    ]);

    const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces];
    const statsList = Array.isArray(stats) ? stats : [stats];

    const result = ifaceList
      .filter(i => !i.internal && !i.iface.startsWith('veth') && !i.iface.startsWith('docker') && !i.iface.startsWith('br-'))
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

/** PUT /api/network/:interface/config — Configure network interface */
networkRouter.put('/:iface/config', async (req, res) => {
  const ifaceName = req.params.iface.replace(/[^a-zA-Z0-9]/g, '');
  const { mode, ip, netmask, gateway, dns } = req.body;

  try {
    if (mode === 'dhcp') {
      // Switch to DHCP
      await execFileAsync('sudo', [
        'nmcli', 'con', 'mod', ifaceName,
        'ipv4.method', 'auto',
      ], { timeout: 10000 });
    } else if (mode === 'static' && ip) {
      // Set static IP
      const cidr = netmaskToCidr(netmask || '255.255.255.0');
      await execFileAsync('sudo', [
        'nmcli', 'con', 'mod', ifaceName,
        'ipv4.method', 'manual',
        'ipv4.addresses', `${ip}/${cidr}`,
        ...(gateway ? ['ipv4.gateway', gateway] : []),
        ...(dns ? ['ipv4.dns', dns] : []),
      ], { timeout: 10000 });
    }

    // Restart the connection
    await execFileAsync('sudo', ['nmcli', 'con', 'down', ifaceName], { timeout: 5000 }).catch(() => {});
    await execFileAsync('sudo', ['nmcli', 'con', 'up', ifaceName], { timeout: 10000 });

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: 'Failed to configure network' });
  }
});

function netmaskToCidr(netmask: string): number {
  return netmask.split('.').reduce((acc, octet) =>
    acc + (parseInt(octet, 10).toString(2).match(/1/g)?.length || 0), 0);
}

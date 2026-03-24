/**
 * Network REST endpoints — interfaces + configuration
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import si from 'systeminformation';

export const networkRouter = Router();
const execFileAsync = promisify(execFile);

function generateWireGuardPublicKey(privateKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('wg', ['pubkey'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `wg pubkey exited with code ${code}`));
      }
    });

    child.stdin.write(privateKey.trim() + '\n');
    child.stdin.end();
  });
}

/** GET /api/network/interfaces — Network interfaces (dynamic) */
networkRouter.get('/interfaces', requireAuth, async (_req, res) => {
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
networkRouter.put('/:iface/config', requireAdmin, async (req, res) => {
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

/** POST /api/network/vpn/wireguard — Configure WireGuard VPN */
networkRouter.post('/vpn/wireguard', requireAdmin, async (req, res) => {
  const { listenPort, endpoint, dns, allowedIps } = req.body;
  try {
    const port = parseInt(listenPort) || 51820;

    // Generate server keys if not already present
    const { stdout: privateKey } = await execFileAsync('wg', ['genkey'], { timeout: 5000 });
    const privKey = privateKey.trim();
    const pubKey = await generateWireGuardPublicKey(privKey);

    // Write WireGuard config via temp file + sudo cp (no shell)
    const config = `[Interface]
Address = 10.0.0.1/24
ListenPort = ${port}
PrivateKey = ${privKey}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
`;

    const tmpConfig = path.join(process.cwd(), 'data', 'wg0.conf.tmp');
    fs.mkdirSync(path.dirname(tmpConfig), { recursive: true });
    fs.writeFileSync(tmpConfig, config, { mode: 0o600 });
    await execFileAsync('sudo', ['cp', tmpConfig, '/etc/wireguard/wg0.conf'], { timeout: 5000 });
    await execFileAsync('sudo', ['chmod', '600', '/etc/wireguard/wg0.conf'], { timeout: 5000 });
    try { fs.unlinkSync(tmpConfig); } catch {}

    // Enable and start WireGuard
    await execFileAsync('sudo', ['systemctl', 'enable', 'wg-quick@wg0'], { timeout: 10000 });
    await execFileAsync('sudo', ['systemctl', 'restart', 'wg-quick@wg0'], { timeout: 10000 });

    res.json({ success: true, publicKey: pubKey, endpoint: endpoint || '', port });
  } catch (e) {
    res.json({ success: false, error: 'WireGuard configuration failed. Ensure WireGuard is installed.' });
  }
});

function netmaskToCidr(netmask: string): number {
  return netmask.split('.').reduce((acc, octet) =>
    acc + (parseInt(octet, 10).toString(2).match(/1/g)?.length || 0), 0);
}

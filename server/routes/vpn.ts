/**
 * VPN (WireGuard) REST endpoints
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const vpnRouter = Router();
const execFileAsync = promisify(execFile);

const VPN_FILE = path.join(process.cwd(), 'data', 'vpn.json');
const WG_CONF = '/etc/wireguard/wg0.conf';

interface VpnConfig {
  enabled: boolean;
  listenPort: number;
  serverAddress: string;
  privateKey: string;
  publicKey: string;
  peers: VpnPeer[];
}

interface VpnPeer {
  id: string;
  name: string;
  publicKey: string;
  allowedIPs: string;
  createdAt: string;
}

function loadVpn(): VpnConfig {
  try { return JSON.parse(fs.readFileSync(VPN_FILE, 'utf-8')); }
  catch { return { enabled: false, listenPort: 51820, serverAddress: '10.0.0.1/24', privateKey: '', publicKey: '', peers: [] }; }
}

function saveVpn(config: VpnConfig): void {
  fs.mkdirSync(path.dirname(VPN_FILE), { recursive: true });
  fs.writeFileSync(VPN_FILE, JSON.stringify(config, null, 2));
}

/** GET /api/vpn — Get VPN config */
vpnRouter.get('/', requireAuth, (_req, res) => {
  const config = loadVpn();
  res.json({ ...config, privateKey: config.privateKey ? '***' : '' });
});

/** POST /api/vpn/setup — Initial WireGuard setup */
vpnRouter.post('/setup', requireAdmin, async (_req, res) => {
  try {
    // Generate server keys
    const { stdout: privKey } = await execFileAsync('wg', ['genkey'], { timeout: 5000 });
    const { stdout: pubKey } = await execFileAsync('wg', ['pubkey'], { timeout: 5000, input: privKey.trim() });

    const config = loadVpn();
    config.privateKey = privKey.trim();
    config.publicKey = pubKey.trim();
    config.enabled = true;
    saveVpn(config);

    await writeWgConfig(config);
    await execFileAsync('sudo', ['systemctl', 'enable', '--now', 'wg-quick@wg0'], { timeout: 10000 });

    res.json({ success: true, publicKey: pubKey.trim() });
  } catch (e) {
    res.json({ success: false, error: 'WireGuard setup failed. Is wireguard installed?' });
  }
});

/** POST /api/vpn/peers — Add peer */
vpnRouter.post('/peers', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const { stdout: privKey } = await execFileAsync('wg', ['genkey'], { timeout: 5000 });
    const { stdout: pubKey } = await execFileAsync('wg', ['pubkey'], { timeout: 5000, input: privKey.trim() });

    const config = loadVpn();
    const peerNum = config.peers.length + 2; // .1 is server
    const peer: VpnPeer = {
      id: crypto.randomUUID().slice(0, 8),
      name,
      publicKey: pubKey.trim(),
      allowedIPs: `10.0.0.${peerNum}/32`,
      createdAt: new Date().toISOString(),
    };
    config.peers.push(peer);
    saveVpn(config);
    await writeWgConfig(config);
    await execFileAsync('sudo', ['wg', 'syncconf', 'wg0', WG_CONF], { timeout: 5000 }).catch(() => {});

    // Generate client config
    const clientConfig = `[Interface]
PrivateKey = ${privKey.trim()}
Address = ${peer.allowedIPs.replace('/32', '/24')}
DNS = 1.1.1.1

[Peer]
PublicKey = ${config.publicKey}
Endpoint = YOUR_PUBLIC_IP:${config.listenPort}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

    res.json({ success: true, peer, clientConfig });
  } catch {
    res.json({ success: false, error: 'Failed to add peer' });
  }
});

/** DELETE /api/vpn/peers/:id — Remove peer */
vpnRouter.delete('/peers/:id', requireAdmin, async (req, res) => {
  const config = loadVpn();
  config.peers = config.peers.filter(p => p.id !== req.params.id);
  saveVpn(config);
  await writeWgConfig(config);
  res.json({ success: true });
});

async function writeWgConfig(config: VpnConfig): Promise<void> {
  const peers = config.peers.map(p => `
[Peer]
# ${p.name}
PublicKey = ${p.publicKey}
AllowedIPs = ${p.allowedIPs}`).join('\n');

  const wgConf = `[Interface]
PrivateKey = ${config.privateKey}
Address = ${config.serverAddress}
ListenPort = ${config.listenPort}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
${peers}`;

  fs.writeFileSync(WG_CONF, wgConf);
}

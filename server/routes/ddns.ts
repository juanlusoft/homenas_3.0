/**
 * DDNS REST endpoints
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const ddnsRouter = Router();

const DDNS_FILE = path.join(process.cwd(), 'data', 'ddns.json');

interface DdnsConfig {
  enabled: boolean;
  provider: 'duckdns' | 'noip' | 'cloudflare' | 'custom';
  domain: string;
  token: string;
  updateInterval: number; // minutes
  lastUpdate: string;
  lastIp: string;
}

function loadDdns(): DdnsConfig {
  try { return JSON.parse(fs.readFileSync(DDNS_FILE, 'utf-8')); }
  catch { return { enabled: false, provider: 'duckdns', domain: '', token: '', updateInterval: 5, lastUpdate: '', lastIp: '' }; }
}

function saveDdns(config: DdnsConfig): void {
  fs.mkdirSync(path.dirname(DDNS_FILE), { recursive: true });
  fs.writeFileSync(DDNS_FILE, JSON.stringify(config, null, 2));
}

/** GET /api/ddns — Get DDNS config */
ddnsRouter.get('/', (_req, res) => {
  res.json(loadDdns());
});

/** POST /api/ddns — Save DDNS config */
ddnsRouter.post('/', (req, res) => {
  const config = { ...loadDdns(), ...req.body };
  saveDdns(config);
  res.json({ success: true });
});

/** POST /api/ddns/update — Force DDNS update now */
ddnsRouter.post('/update', async (req, res) => {
  const config = loadDdns();
  if (!config.enabled || !config.domain || !config.token) {
    return res.json({ success: false, error: 'DDNS not configured' });
  }

  try {
    // Get current public IP
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipRes.json() as { ip: string };

    // Update DDNS based on provider
    let updateUrl = '';
    if (config.provider === 'duckdns') {
      updateUrl = `https://www.duckdns.org/update?domains=${config.domain}&token=${config.token}&ip=${ip}`;
    } else if (config.provider === 'noip') {
      updateUrl = `https://dynupdate.no-ip.com/nic/update?hostname=${config.domain}&myip=${ip}`;
    } else if (config.provider === 'cloudflare') {
      // Cloudflare uses API — simplified
      updateUrl = `https://api.cloudflare.com/client/v4/zones/${config.token}/dns_records`;
    }

    if (updateUrl) {
      await fetch(updateUrl);
    }

    config.lastUpdate = new Date().toISOString();
    config.lastIp = ip;
    saveDdns(config);

    res.json({ success: true, ip });
  } catch {
    res.json({ success: false, error: 'Update failed' });
  }
});

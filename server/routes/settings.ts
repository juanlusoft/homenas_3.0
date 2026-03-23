/**
 * Settings REST endpoints
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const settingsRouter = Router();
const execFileAsync = promisify(execFile);

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

/** GET /api/settings — Load settings */
settingsRouter.get('/', (_req, res) => {
  res.json(loadSettings());
});

/** POST /api/settings — Save settings */
settingsRouter.post('/', (req, res) => {
  saveSettings(req.body);
  res.json({ success: true });
});

/** POST /api/settings/ssh — Control SSH */
settingsRouter.post('/ssh', async (req, res) => {
  const { enabled, port } = req.body;
  try {
    if (enabled) {
      await execFileAsync('sudo', ['systemctl', 'enable', '--now', 'ssh'], { timeout: 10000 });
    } else {
      await execFileAsync('sudo', ['systemctl', 'disable', '--now', 'ssh'], { timeout: 10000 });
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: 'Failed to control SSH' });
  }
});

/** POST /api/settings/fan — Control fan mode */
settingsRouter.post('/fan', async (req, res) => {
  const { mode } = req.body;
  // Fan control via thermal cooling device
  try {
    const states: Record<string, string> = { auto: '0', manual: '1', quiet: '0' };
    const coolingDevices = fs.readdirSync('/sys/class/thermal/')
      .filter(d => d.startsWith('cooling_device'));
    for (const dev of coolingDevices) {
      const statePath = `/sys/class/thermal/${dev}/cur_state`;
      if (fs.existsSync(statePath)) {
        fs.writeFileSync(statePath, states[mode] || '0');
      }
    }
    res.json({ success: true, mode });
  } catch {
    res.json({ success: false, error: 'Fan control not available' });
  }
});

/** POST /api/settings/notifications/test-telegram — Test Telegram */
settingsRouter.post('/notifications/test-telegram', async (req, res) => {
  const { token, chatId } = req.body;
  if (!token || !chatId) return res.status(400).json({ error: 'Token and Chat ID required' });
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ HomePiNAS — Test notification' }),
    });
    const data = await response.json();
    res.json({ success: data.ok });
  } catch {
    res.json({ success: false, error: 'Failed to send' });
  }
});

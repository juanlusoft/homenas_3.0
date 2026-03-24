/**
 * Settings REST endpoints — secured
 */

import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

export const settingsRouter = Router();
const execFileAsync = promisify(execFile);

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

// Keys allowed for import
const IMPORT_ALLOWLIST = new Set(['settings', 'shares', 'scheduled-tasks', 'stacks', 'ddns', 'vpn']);

// Keys to redact from export
const SECRET_KEYS = new Set(['passwordHash', 'totpSecret', 'smtpPass', 'token', 'privateKey', 'presharedKey', 'wgPrivateKey']);

function loadSettings(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

/** Deep-redact secrets from an object */
function redactSecrets(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) {
        result[key] = '***REDACTED***';
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }
  return obj;
}

/** GET /api/settings/notifications/history */
settingsRouter.get('/notifications/history', requireAuth, (_req: Request, res: Response) => {
  try {
    const historyFile = path.join(process.cwd(), 'data', 'notifications.json');
    const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    res.json(history);
  } catch { res.json([]); }
});

/** GET /api/settings/export — Export config with secrets redacted */
settingsRouter.get('/export', requireAdmin, (_req: Request, res: Response) => {
  const dataDir = path.join(process.cwd(), 'data');
  const config: Record<string, unknown> = {};
  try {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      // Skip sensitive files entirely
      if (file === 'jwt-secret.key') continue;
      try { config[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8')); } catch {}
    }
  } catch {}
  const redacted = redactSecrets(config);
  res.setHeader('Content-Disposition', 'attachment; filename=homepinas-config.json');
  audit('config_exported', { user: (_req as Request).user?.username });
  res.json(redacted);
});

/** POST /api/settings/import — Import config from JSON (admin, allowlisted keys only) */
settingsRouter.post('/import', requireAdmin, (req: Request, res: Response) => {
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(req.body)) {
      // Only allow specific config files
      if (!IMPORT_ALLOWLIST.has(key)) {
        rejected.push(key);
        continue;
      }
      // Sanitize key to prevent path traversal
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
      fs.writeFileSync(path.join(dataDir, `${safeKey}.json`), JSON.stringify(value, null, 2));
    }
    audit('config_imported', { user: req.user?.username, details: `Imported keys: ${Object.keys(req.body).join(', ')}` });
    res.json({ success: true, rejected: rejected.length > 0 ? rejected : undefined });
  } catch {
    res.json({ success: false, error: 'Import failed' });
  }
});

/** GET /api/settings — Load settings (any authenticated user) */
settingsRouter.get('/', requireAuth, (_req: Request, res: Response) => {
  const settings = loadSettings();
  // Redact any secrets from settings too
  res.json(redactSecrets(settings));
});

/** POST /api/settings — Save settings (admin only) */
settingsRouter.post('/', requireAdmin, (req: Request, res: Response) => {
  saveSettings(req.body);
  audit('settings_changed', { user: req.user?.username });
  res.json({ success: true });
});

/** POST /api/settings/ssh — Control SSH (admin only) */
settingsRouter.post('/ssh', requireAdmin, async (req: Request, res: Response) => {
  const { enabled } = req.body;
  try {
    if (enabled) {
      await execFileAsync('sudo', ['systemctl', 'enable', '--now', 'ssh'], { timeout: 10000 });
    } else {
      await execFileAsync('sudo', ['systemctl', 'disable', '--now', 'ssh'], { timeout: 10000 });
    }
    audit('ssh_toggled', { user: req.user?.username, details: `SSH ${enabled ? 'enabled' : 'disabled'}` });
    res.json({ success: true });
  } catch {
    res.json({ success: false, error: 'Failed to control SSH' });
  }
});

/** POST /api/settings/fan — Control fan mode (admin only) */
settingsRouter.post('/fan', requireAdmin, async (req: Request, res: Response) => {
  const { mode } = req.body;
  const validModes = ['auto', 'manual', 'quiet'];
  if (!validModes.includes(mode)) return res.status(400).json({ error: 'Invalid fan mode' });
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
    audit('fan_changed', { user: req.user?.username, details: `Fan mode: ${mode}` });
    res.json({ success: true, mode });
  } catch {
    res.json({ success: false, error: 'Fan control not available' });
  }
});

/** POST /api/settings/notifications/test-email — Test SMTP (admin only) */
settingsRouter.post('/notifications/test-email', requireAdmin, async (req: Request, res: Response) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, emailTo } = req.body;
  if (!smtpHost || !emailTo) return res.status(400).json({ error: 'SMTP host and recipient required' });

  try {
    const net = await import('net');
    const tls = await import('tls');

    const port = parseInt(smtpPort) || 587;
    const socket = port === 465
      ? tls.connect(port, smtpHost)
      : net.createConnection(port, smtpHost);

    const commands = [
      `EHLO homepinas`,
      `AUTH LOGIN`,
      Buffer.from(smtpUser || '').toString('base64'),
      Buffer.from(smtpPass || '').toString('base64'),
      `MAIL FROM:<${smtpUser}>`,
      `RCPT TO:<${emailTo}>`,
      `DATA`,
      `From: HomePiNAS <${smtpUser}>\r\nTo: ${emailTo}\r\nSubject: HomePiNAS Test\r\n\r\nThis is a test notification from HomePiNAS.\r\n.`,
      `QUIT`,
    ];

    let cmdIdx = 0;
    socket.on('data', () => {
      if (cmdIdx < commands.length) {
        socket.write(commands[cmdIdx++] + '\r\n');
      }
    });

    setTimeout(() => { socket.destroy(); res.json({ success: true }); }, 5000);
  } catch {
    res.json({ success: false, error: 'SMTP connection failed' });
  }
});

/** POST /api/settings/notifications/test-telegram — Test Telegram (admin only) */
settingsRouter.post('/notifications/test-telegram', requireAdmin, async (req: Request, res: Response) => {
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

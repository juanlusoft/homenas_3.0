/**
 * Terminal — execute commands via REST (WebSocket PTY in future)
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const terminalRouter = Router();
const execFileAsync = promisify(execFile);

// Allowed commands whitelist for security
const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'df', 'du', 'free', 'uptime', 'hostname',
  'whoami', 'uname', 'date', 'id', 'pwd', 'env', 'ip', 'ss', 'ps',
  'top', 'htop', 'docker', 'systemctl', 'journalctl', 'smartctl',
  'lsblk', 'blkid', 'mount', 'findmnt', 'samba', 'nmcli', 'ping',
  'traceroute', 'dig', 'nslookup', 'curl', 'wget', 'netstat',
]);

/** POST /api/terminal/exec — Execute a command */
terminalRouter.post('/exec', async (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command required' });
  }

  const trimmed = command.trim();
  if (!trimmed) return res.json({ output: '', exitCode: 0 });

  // Parse command and args
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // Security: check whitelist
  if (!ALLOWED_COMMANDS.has(cmd) && cmd !== 'clear' && cmd !== 'help') {
    if (cmd === 'help') {
      return res.json({
        output: `Comandos disponibles: ${Array.from(ALLOWED_COMMANDS).sort().join(', ')}`,
        exitCode: 0,
      });
    }
    return res.json({
      output: `bash: ${cmd}: comando no permitido. Escribe "help" para ver comandos disponibles.`,
      exitCode: 127,
    });
  }

  if (cmd === 'clear') return res.json({ output: '', exitCode: 0, clear: true });
  if (cmd === 'help') {
    return res.json({
      output: `Comandos disponibles:\n${Array.from(ALLOWED_COMMANDS).sort().join('\n')}`,
      exitCode: 0,
    });
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, TERM: 'dumb', COLUMNS: '120' },
    });
    res.json({ output: stdout + (stderr ? '\n' + stderr : ''), exitCode: 0 });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    res.json({
      output: (err.stdout || '') + (err.stderr || '') || `Error ejecutando: ${cmd}`,
      exitCode: err.code || 1,
    });
  }
});

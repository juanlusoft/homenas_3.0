/**
 * Terminal — restricted command execution (admin only)
 */

import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAdmin } from '../middleware/auth.js';
import { terminalLimiter } from '../middleware/rate-limit.js';
import { audit } from '../middleware/audit.js';

export const terminalRouter = Router();
const execFileAsync = promisify(execFile);

// Strictly limited whitelist — read-only system inspection commands only
const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'df', 'du', 'free', 'uptime', 'hostname',
  'wc', 'grep', 'find', 'which', 'echo', 'sort', 'uniq',
  'whoami', 'uname', 'date', 'id', 'pwd',
  'ip', 'ss', 'lsblk', 'blkid', 'findmnt',
  'ping', 'smartctl', 'journalctl',
]);

// Block dangerous arguments
const BLOCKED_ARGS = ['--exec', '-exec', '|', ';', '&&', '||', '`', '$(', '>', '<', '>>'];

/** POST /api/terminal/exec — Execute a command (admin only, rate limited) */
let cwd = '/';

terminalRouter.post('/exec', requireAdmin, terminalLimiter, async (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command required' });
  }

  const trimmed = command.trim();
  if (!trimmed) return res.json({ output: '', exitCode: 0 });

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // Security: check whitelist
  if (!ALLOWED_COMMANDS.has(cmd) && cmd !== 'clear' && cmd !== 'help' && cmd !== 'cd') {
    audit('terminal_blocked', { user: req.user?.username, details: `Blocked: ${cmd}` });
    return res.json({
      output: `bash: ${cmd}: comando no permitido. Escribe "help" para ver comandos disponibles.`,
      exitCode: 127,
    });
  }

  // Block shell metacharacters in arguments
  const fullCommand = parts.join(' ');
  if (BLOCKED_ARGS.some(b => fullCommand.includes(b))) {
    audit('terminal_blocked', { user: req.user?.username, details: `Blocked metachar in: ${trimmed.slice(0, 100)}` });
    return res.json({
      output: 'Error: caracteres de shell no permitidos en los argumentos.',
      exitCode: 1,
    });
  }

  if (cmd === 'clear') return res.json({ output: '', exitCode: 0, clear: true });
  if (cmd === 'cd') {
    const target = args[0] || '/home';
    const pathMod = require('path');
    const fsMod = require('fs');
    const newDir = pathMod.resolve(cwd, target);
    if (fsMod.existsSync(newDir) && fsMod.statSync(newDir).isDirectory()) {
      cwd = newDir;
      return res.json({ output: '', exitCode: 0, cwd });
    }
    return res.json({ output: `bash: cd: ${target}: No existe el directorio`, exitCode: 1 });
  }
  if (cmd === 'help') {
    return res.json({
      output: `Comandos disponibles:\n${Array.from(ALLOWED_COMMANDS).sort().join('\n')}`,
      exitCode: 0,
    });
  }

  audit('terminal_exec', { user: req.user?.username, details: trimmed.slice(0, 200) });

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: 15000,
      cwd,
      cwd: '/home',
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

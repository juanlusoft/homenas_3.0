/**
 * Logs REST endpoint — real system logs via journalctl
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const logsRouter = Router();
const execFileAsync = promisify(execFile);

/** GET /api/logs?lines=100&unit=&priority= — Read system logs */
logsRouter.get('/', async (req, res) => {
  const lines = parseInt(req.query.lines as string) || 100;
  const unit = (req.query.unit as string) || '';
  const priority = (req.query.priority as string) || '';

  const args = ['--no-pager', '--output=json', `-n${Math.min(lines, 500)}`];
  if (unit) args.push(`-u${unit}`);
  if (priority) args.push(`-p${priority}`);

  try {
    const { stdout } = await execFileAsync('journalctl', args, { timeout: 10000 });
    const entries = stdout.trim().split('\n').filter(Boolean).map(line => {
      try {
        const j = JSON.parse(line);
        return {
          id: j.__CURSOR || '',
          timestamp: j.__REALTIME_TIMESTAMP
            ? new Date(parseInt(j.__REALTIME_TIMESTAMP) / 1000).toISOString().replace('T', ' ').slice(0, 19)
            : '',
          level: priorityToLevel(j.PRIORITY),
          source: j.SYSLOG_IDENTIFIER || j._SYSTEMD_UNIT || 'system',
          message: j.MESSAGE || '',
        };
      } catch {
        return { id: '', timestamp: '', level: 'info' as const, source: 'system', message: line };
      }
    });
    res.json(entries);
  } catch {
    // Fallback: read /var/log/syslog
    try {
      const { stdout } = await execFileAsync('tail', ['-n', String(lines), '/var/log/syslog'], { timeout: 5000 });
      const entries = stdout.trim().split('\n').map((line, i) => ({
        id: String(i),
        timestamp: line.slice(0, 15),
        level: 'info' as const,
        source: 'syslog',
        message: line.slice(16),
      }));
      res.json(entries);
    } catch {
      res.json([]);
    }
  }
});

/** GET /api/logs/units — List available units */
logsRouter.get('/units', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('journalctl', ['--field=_SYSTEMD_UNIT', '--no-pager'], { timeout: 5000 });
    const units = stdout.trim().split('\n').filter(Boolean).map(u => u.replace('.service', '')).slice(0, 50);
    res.json(units);
  } catch {
    res.json(['system', 'docker', 'samba', 'nginx', 'homepinas-v3']);
  }
});

function priorityToLevel(p: string | undefined): 'error' | 'warn' | 'info' | 'debug' {
  const n = parseInt(p || '6');
  if (n <= 3) return 'error';
  if (n <= 4) return 'warn';
  if (n <= 6) return 'info';
  return 'debug';
}

import { config } from '../state.js';
import type { EngineAdapter } from './adapter.js';
import { renderTemplate, runShell } from './command-utils.js';

type ProgressResult = { phase: string; bytes: number; files: number };

function parseProgress(raw: string): ProgressResult {
  if (!raw) return { phase: 'unknown', bytes: 0, files: 0 };

  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const phase = String(obj.phase ?? obj.status ?? 'unknown');
    const bytes = Number(obj.bytes ?? obj.totalBytes ?? obj.transferredBytes ?? 0);
    const files = Number(obj.files ?? obj.fileCount ?? obj.transferredFiles ?? 0);
    return {
      phase,
      bytes: Number.isFinite(bytes) ? bytes : 0,
      files: Number.isFinite(files) ? files : 0
    };
  } catch {
    // fall through
  }

  let phase = 'unknown';
  let bytes = 0;
  let files = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-zA-Z_]+)\s*[=:]\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'phase' || key === 'status') phase = value;
    if (key === 'bytes' || key === 'totalbytes' || key === 'transferredbytes') {
      const n = Number(value);
      if (Number.isFinite(n)) bytes = n;
    }
    if (key === 'files' || key === 'filecount' || key === 'transferredfiles') {
      const n = Number(value);
      if (Number.isFinite(n)) files = n;
    }
  }
  return { phase, bytes, files };
}

export class UrBackupAdapter implements EngineAdapter {
  readonly provider = 'urbackup' as const;

  async startBackup(deviceId: string): Promise<void> {
    if (!config.urbackupStartCmd) {
      throw new Error('URBackup start command not configured (SBV2_URBACKUP_START_CMD)');
    }
    const cmd = renderTemplate(config.urbackupStartCmd, { deviceId });
    await runShell(cmd, config.engineCommandTimeoutMs);
  }

  async getProgress(deviceId: string): Promise<ProgressResult> {
    if (!config.urbackupProgressCmd) {
      return { phase: 'running', bytes: 0, files: 0 };
    }
    const cmd = renderTemplate(config.urbackupProgressCmd, { deviceId });
    const out = await runShell(cmd, config.engineCommandTimeoutMs);
    return parseProgress(out);
  }
}

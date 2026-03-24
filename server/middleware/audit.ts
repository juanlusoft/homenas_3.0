/**
 * Audit logging — records security-relevant events to data/audit.log
 * Never logs secrets, passwords, or tokens.
 */

import fs from 'fs';
import path from 'path';

const AUDIT_FILE = path.join(process.cwd(), 'data', 'audit.log');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB rotation

export type AuditAction =
  | 'login_success' | 'login_failed' | 'login_locked' | 'logout'
  | 'user_created' | 'user_updated' | 'user_deleted'
  | 'settings_changed' | 'config_exported' | 'config_imported'
  | 'network_changed' | 'hostname_changed'
  | 'setup_started' | 'setup_completed' | 'setup_failed'
  | 'terminal_exec' | 'terminal_blocked'
  | 'scheduler_created' | 'scheduler_deleted' | 'scheduler_run'
  | 'share_created' | 'share_deleted' | 'share_updated'
  | 'backup_started' | 'backup_completed'
  | 'service_action' | 'ssh_toggled' | 'fan_changed'
  | 'vpn_changed' | 'ddns_changed'
  | '2fa_setup' | '2fa_verified';

interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  user?: string;
  ip?: string;
  details?: string;
}

function rotateIfNeeded(): void {
  try {
    const stats = fs.statSync(AUDIT_FILE);
    if (stats.size > MAX_SIZE) {
      const rotated = AUDIT_FILE + '.1';
      try { fs.unlinkSync(rotated); } catch {}
      fs.renameSync(AUDIT_FILE, rotated);
    }
  } catch {}
}

export function audit(action: AuditAction, opts?: { user?: string; ip?: string; details?: string }): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    ...opts,
  };

  // Sanitize: never log passwords or tokens
  if (entry.details) {
    entry.details = entry.details
      .replace(/password["\s:=]+[^\s,}]*/gi, 'password=***')
      .replace(/token["\s:=]+[^\s,}]*/gi, 'token=***')
      .replace(/secret["\s:=]+[^\s,}]*/gi, 'secret=***');
  }

  const line = JSON.stringify(entry) + '\n';

  try {
    rotateIfNeeded();
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, line);
  } catch {
    // Don't crash the app if audit logging fails
    console.error('[audit] Failed to write audit log');
  }
}

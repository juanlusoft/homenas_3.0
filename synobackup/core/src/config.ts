import path from 'path';

export const config = {
  host: process.env.SB_HOST || '127.0.0.1',
  port: Number(process.env.SB_PORT || 3021),
  tcpPort: Number(process.env.SB_TCP_PORT || 3022),
  dataDir: path.resolve(process.env.SB_DATA_DIR || './data'),
  backupDir: path.resolve(process.env.SB_BACKUP_DIR || './data/backups'),
  adminToken: process.env.SB_ADMIN_TOKEN || 'change-me',
  publicBaseUrl: process.env.SB_PUBLIC_BASE_URL || `http://${process.env.SB_HOST || '127.0.0.1'}:${process.env.SB_PORT || 3021}`,
  autoGcCooldownMs: Number(process.env.SB_AUTO_GC_COOLDOWN_MS || 15 * 60 * 1000),
};

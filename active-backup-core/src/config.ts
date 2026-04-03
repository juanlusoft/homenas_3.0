import path from 'path';

export const config = {
  host: process.env.AB_HOST || '127.0.0.1',
  port: Number(process.env.AB_PORT || 3011),
  dataDir: path.resolve(process.env.AB_DATA_DIR || './data'),
  backupDir: path.resolve(process.env.AB_BACKUP_DIR || '/mnt/storage/active-backup'),
  recoveryDir: path.resolve(process.env.AB_RECOVERY_DIR || '../recovery-usb'),
  agentBinDir: path.resolve(process.env.AB_AGENT_BIN_DIR || '../agent/dist'),
  adminToken: process.env.AB_ADMIN_TOKEN || 'change-me',
  publicBaseUrl: process.env.AB_PUBLIC_BASE_URL || `http://${process.env.AB_HOST || '127.0.0.1'}:${process.env.AB_PORT || 3011}`,
};

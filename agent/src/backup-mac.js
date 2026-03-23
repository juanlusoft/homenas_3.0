/**
 * BackupManager — macOS backup methods
 * Split from backup.js for maintainability
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

module.exports = {
// ════════════════════════════════════════════════════════════════════════════
// MAC
// ════════════════════════════════════════════════════════════════════════════

async _runMacBackup(config) {
  const { nasAddress, backupType, backupPaths, sambaShare, sambaUser, sambaPass } = config;
  const shareName = sambaShare || 'active-backup';

  if (!sambaUser || !sambaPass) {
    throw new Error('Samba credentials are required for backup');
  }
  const creds = { user: sambaUser, pass: sambaPass };

  if (backupType === 'image') {
    return this._macImageBackup(nasAddress, shareName, creds);
  } else {
    return this._macFileBackup(nasAddress, shareName, creds, backupPaths);
  }
},

async _macImageBackup(nasAddress, shareName, creds) {
  const mountPoint = '/Volumes/homepinas-backup';
  try { await execFileAsync('mkdir', ['-p', mountPoint]); } catch (e) {}

  const smbUrl = `smb://${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.pass)}@${nasAddress}/${shareName}`;
  try {
    await execFileAsync('mount_smbfs', ['-N', smbUrl, mountPoint]);
  } catch (e) {
    throw new Error(`No se pudo montar el share: ${e.message}`);
  }

  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = `${mountPoint}/ImageBackup/${hostname}/${timestamp}`;

  try {
    await execFileAsync('mkdir', ['-p', destPath]);
    this._setProgress('capture', 30, 'Creating system image with asr');
    await execFileAsync('sudo', ['asr', 'create', '--source', '/', '--target', `${destPath}/system.dmg`, '--erase', '--noprompt'], { timeout: 7200000 });
    this._setProgress('done', 100, 'Image backup complete');
    return { type: 'image', timestamp: new Date().toISOString() };
  } finally {
    try { await execFileAsync('umount', [mountPoint]); } catch (e) {}
  }
},

async _macFileBackup(nasAddress, shareName, creds, paths) {
  if (!paths || paths.length === 0) throw new Error('No hay carpetas configuradas para respaldar');

  const mountPoint = '/Volumes/homepinas-backup';
  try { await execFileAsync('mkdir', ['-p', mountPoint]); } catch (e) {}

  const smbUrl = `smb://${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.pass)}@${nasAddress}/${shareName}`;
  try {
    await execFileAsync('mount_smbfs', ['-N', smbUrl, mountPoint]);
  } catch (e) {
    throw new Error(`No se pudo montar el share: ${e.message}`);
  }

  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];

  try {
    for (let i = 0; i < paths.length; i++) {
      const srcPath = paths[i];
      const folderName = path.basename(srcPath) || 'root';
      const dest = `${mountPoint}/FileBackup/${hostname}/${timestamp}/${folderName}`;
      const pct = 20 + Math.round((i / paths.length) * 70);
      this._setProgress('copy', pct, `Copying ${folderName}`);

      try {
        await execFileAsync('mkdir', ['-p', dest]);
        await execFileAsync('rsync', ['-az', '--delete', `${srcPath}/`, `${dest}/`], { timeout: 3600000 });
        results.push({ path: srcPath, success: true });
      } catch (err) {
        results.push({ path: srcPath, success: false, error: err.message });
      }
    }
  } finally {
    try { await execFileAsync('umount', [mountPoint]); } catch (e) {}
  }

  this._setProgress('done', 100, 'File backup complete');
  return { type: 'files', results, timestamp: new Date().toISOString() };
}

};

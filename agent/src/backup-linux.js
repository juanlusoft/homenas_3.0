/**
 * BackupManager — Linux backup methods
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
// LINUX
// ════════════════════════════════════════════════════════════════════════════

async _runLinuxBackup(config) {
  const { nasAddress, backupType, backupPaths, sambaShare, sambaUser, sambaPass } = config;
  const shareName = sambaShare || 'active-backup';

  if (!sambaUser || !sambaPass) {
    throw new Error('Samba credentials are required for backup');
  }
  const creds = { user: sambaUser, pass: sambaPass };

  if (backupType === 'image') {
    return this._linuxImageBackup(nasAddress, shareName, creds);
  } else {
    return this._linuxFileBackup(nasAddress, shareName, creds, backupPaths);
  }
},

async _linuxImageBackup(nasAddress, shareName, creds) {
  const mountPoint = `/tmp/homepinas-backup-${process.pid}`;
  try { await execFileAsync('mkdir', ['-p', mountPoint]); } catch (e) {}

  // Write credentials to temp file (mode 0600) for security
  const credFile = `/tmp/homepinas-creds-${process.pid}`;
  fs.writeFileSync(credFile, `username=${creds.user}\npassword=${creds.pass}\n`, { mode: 0o600 });

  try {
    this._setProgress('connect', 10, 'Mounting SMB share');
    await execFileAsync('mount', [
      '-t', 'cifs',
      `//${nasAddress}/${shareName}`,
      mountPoint,
      '-o', `credentials=${credFile},vers=3.0`
    ]);

    const hostname = os.hostname();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destPath = `${mountPoint}/ImageBackup/${hostname}/${timestamp}`;
    await execFileAsync('mkdir', ['-p', destPath]);

    // Find root device and filesystem
    const { stdout: rootDev } = await execFileAsync('findmnt', ['-n', '-o', 'SOURCE', '/']);
    const { stdout: rootFs } = await execFileAsync('findmnt', ['-n', '-o', 'FSTYPE', '/']);
    const device = rootDev.trim();
    const fsType = rootFs.trim();

    this._log(`Root device: ${device} (${fsType})`);
    this._setProgress('capture', 30, `Capturing ${device} with partclone`);

    const imgFile = path.join(destPath, 'root.img.gz');

    // Use partclone for the detected filesystem, piped through gzip
    return new Promise((resolve, reject) => {
      const partclone = spawn('partclone.' + fsType, ['-c', '-s', device, '-o', '-'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const gzip = spawn('gzip', ['-c'], {
        stdio: ['pipe', fs.openSync(imgFile, 'w'), 'pipe'],
      });

      partclone.stdout.pipe(gzip.stdin);

      let stderr = '';
      partclone.stderr.on('data', (d) => { stderr += d.toString(); });

      gzip.on('close', (code) => {
        if (code === 0) {
          this._setProgress('done', 100, 'Image backup complete');
          resolve({ type: 'image', timestamp: new Date().toISOString() });
        } else {
          reject(new Error(`gzip failed with code ${code}`));
        }
      });

      partclone.on('close', (code) => {
        if (code !== 0) {
          gzip.stdin.end();
          reject(new Error(`partclone failed with code ${code}: ${stderr.substring(0, 300)}`));
        }
      });

      partclone.on('error', (err) => reject(new Error(`partclone error: ${err.message}`)));
      gzip.on('error', (err) => reject(new Error(`gzip error: ${err.message}`)));
    });

  } finally {
    try { await execFileAsync('umount', [mountPoint]); } catch (e) {}
    try { await execFileAsync('rmdir', [mountPoint]); } catch (e) {}
    try { fs.unlinkSync(credFile); } catch (e) {}
  }
},

async _linuxFileBackup(nasAddress, shareName, creds, paths) {
  if (!paths || paths.length === 0) throw new Error('No hay carpetas configuradas para respaldar');

  const mountPoint = `/tmp/homepinas-backup-${process.pid}`;
  try { await execFileAsync('mkdir', ['-p', mountPoint]); } catch (e) {}

  const credFile = `/tmp/homepinas-creds-${process.pid}`;
  fs.writeFileSync(credFile, `username=${creds.user}\npassword=${creds.pass}\n`, { mode: 0o600 });

  try {
    this._setProgress('connect', 10, 'Mounting SMB share');
    await execFileAsync('mount', [
      '-t', 'cifs',
      `//${nasAddress}/${shareName}`,
      mountPoint,
      '-o', `credentials=${credFile},vers=3.0`
    ]);

    const hostname = os.hostname();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const results = [];

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

    this._setProgress('done', 100, 'File backup complete');
    return { type: 'files', results, timestamp: new Date().toISOString() };

  } finally {
    try { await execFileAsync('umount', [mountPoint]); } catch (e) {}
    try { await execFileAsync('rmdir', [mountPoint]); } catch (e) {}
    try { fs.unlinkSync(credFile); } catch (e) {}
  }
}
};

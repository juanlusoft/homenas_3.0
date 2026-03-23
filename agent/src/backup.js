/**
 * Backup Manager - Execute backups on Windows/Mac/Linux
 * Windows: wimcapture (image) or robocopy (files)
 * Linux:   partclone (image) or rsync (files)
 * Mac:     rsync (files only — Apple restrictions prevent full image restore)
 *
 * SECURITY: Uses execFile (no shell) to prevent command injection.
 * Credentials are never interpolated into command strings.
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);


class BackupManager {
  constructor() {
    this.platform = process.platform;
    this.running = false;
    this._progress = null;
    this._logLines = [];
    this._logFile = null;
  }

  get progress() { return this._progress; }
  get logContent() { return this._logLines.join('\n'); }

  _setProgress(phase, percent, detail) {
    this._progress = { phase, percent: Math.min(100, Math.max(0, percent)), detail };
    this._log(`[${phase}] ${percent}% — ${detail}`);
  }

  _log(msg) {
    const ts = new Date().toISOString();
    const line = `${ts} ${msg}`;
    this._logLines.push(line);
    console.log(`[Backup] ${msg}`);
  }

  _initLog() {
    this._logLines = [];
    const logDir = this.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || 'C:\\ProgramData', 'HomePiNAS')
      : path.join(os.homedir(), '.homepinas');
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
    this._logFile = path.join(logDir, 'backup.log');
    this._log(`=== Backup started on ${os.hostname()} (${this.platform}) ===`);
    this._log(`OS: ${os.type()} ${os.release()} ${os.arch()}`);
    this._log(`RAM: ${Math.round(os.totalmem() / 1073741824)}GB`);
  }

  _flushLog() {
    if (this._logFile) {
      try {
        fs.writeFileSync(this._logFile, this._logLines.join('\n') + '\n');
      } catch (e) {
        console.error('[Backup] Could not write log file:', e.message);
      }
    }
  }

  async runBackup(config) {
    if (this.running) throw new Error('Backup already running');
    this.running = true;
    this._progress = null;
    this._initLog();

    try {
      let result;
      if (this.platform === 'win32') {
        result = await this._runWindowsBackup(config);
      } else if (this.platform === 'darwin') {
        result = await this._runMacBackup(config);
      } else if (this.platform === 'linux') {
        result = await this._runLinuxBackup(config);
      } else {
        throw new Error(`Plataforma no soportada: ${this.platform}`);
      }
      this._log(`=== Backup completed successfully ===`);
      result.log = this.logContent;
      this._flushLog();
      return result;
    } catch (err) {
      this._log(`=== Backup FAILED: ${err.message} ===`);
      this._flushLog();
      err.backupLog = this.logContent;
      throw err;
    } finally {
      this.running = false;
      this._progress = null;
    }
  }


  // Platform-specific methods mixed in from split modules
}

// Attach platform-specific backup methods
Object.assign(BackupManager.prototype, require('./backup-windows'));
Object.assign(BackupManager.prototype, require('./backup-mac'));
Object.assign(BackupManager.prototype, require('./backup-linux'));

module.exports = { BackupManager };

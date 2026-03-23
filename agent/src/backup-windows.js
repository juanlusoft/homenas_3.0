/**
 * BackupManager — Windows backup methods
 * Split from backup.js for maintainability (max 300 lines rule)
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

module.exports = {
// ════════════════════════════════════════════════════════════════════════════
// WINDOWS
// ════════════════════════════════════════════════════════════════════════════

async _runWindowsBackup(config) {
  const { nasAddress, backupType, sambaShare, sambaUser, sambaPass } = config;
  const shareName = sambaShare || 'active-backup';
  const sharePath = `\\\\${nasAddress}\\${shareName}`;

  if (!sambaUser || !sambaPass) {
    throw new Error('Samba credentials are required for backup');
  }
  const creds = { user: sambaUser, pass: sambaPass };

  if (backupType === 'image') {
    return this._windowsImageBackup(sharePath, creds);
  } else {
    return this._windowsFileBackup(sharePath, config.backupPaths, creds);
  }
},

async _windowsImageBackup(sharePath, creds) {
  const server = sharePath.split('\\').filter(Boolean)[0];
  let shadowId = null;

  try {
    // Phase 1: Check admin privileges
    this._setProgress('admin', 5, 'Checking administrator privileges');
    await this._checkAdminPrivileges();

    // Phase 2: Connect SMB share
    this._setProgress('connect', 10, 'Connecting to NAS share');
    await this._cleanSMBConnections(server, sharePath);
    try {
      await execFileAsync('net', ['use', sharePath, `/user:${creds.user}`, creds.pass, '/persistent:no'], { shell: false });
    } catch (e) {
      throw new Error(`No se pudo conectar al share ${sharePath}: ${e.message}`);
    }
    this._log(`Connected to ${sharePath}`);

    // Phase 3: Capture disk metadata
    this._setProgress('metadata', 15, 'Capturing disk metadata');
    const metadata = await this._captureWindowsDiskMetadata();

    // Phase 4: Create VSS snapshot
    this._setProgress('vss', 20, 'Creating VSS shadow copy');
    const vss = await this._createVSS();
    shadowId = vss.shadowId;
    this._log(`VSS shadow created: ID=${shadowId}, path=${vss.devicePath}`);

    // Phase 5: Ensure wimlib is available
    this._setProgress('wimlib', 25, 'Checking wimlib');
    const wimlibExe = await this._ensureWimlib();

    // Phase 6: Capture C: volume from VSS snapshot
    this._setProgress('capture', 30, 'Capturing system image (this may take a while)');
    const hostname = os.hostname();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destDir = path.join(sharePath, 'ImageBackup', hostname, timestamp);

    // Create destination directory
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) {
      throw new Error(`Could not create destination directory: ${e.message}`);
    }

    const wimPath = path.join(destDir, 'disk.wim');
    await this._wimCapture(wimlibExe, vss.devicePath, wimPath, `${hostname}-C`);

    // Phase 7: Capture EFI partition if present (live, no VSS — FAT32 doesn't support it)
    if (metadata.efiPartition && metadata.efiPartition.DriveLetter) {
      this._setProgress('efi', 80, 'Capturing EFI partition (live, no VSS)');
      const efiLetter = metadata.efiPartition.DriveLetter;
      const efiWimPath = path.join(destDir, 'efi.wim');
      try {
        await this._wimCapture(wimlibExe, `${efiLetter}:\\`, efiWimPath, `${hostname}-EFI`);
      } catch (e) {
        this._log(`WARNING: EFI capture failed (non-fatal): ${e.message}`);
      }
    }

    // Phase 8: Write manifest via temp file
    this._setProgress('manifest', 85, 'Writing backup manifest');
    await this._writeManifest(destDir, metadata);

    this._setProgress('done', 100, 'Backup complete');
    return { type: 'image', timestamp: new Date().toISOString() };

  } finally {
    // Cleanup: always delete VSS shadow and disconnect SMB
    if (shadowId) {
      this._setProgress('cleanup', 95, 'Cleaning up VSS shadow copy');
      await this._deleteVSS(shadowId);
    }
    try { await execFileAsync('net', ['use', sharePath, '/delete', '/y'], { shell: false }); } catch (e) {}
  }
},

async _checkAdminPrivileges() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
    ], { timeout: 10000, windowsHide: true, shell: false });

    if (stdout.trim().toLowerCase() !== 'true') {
      throw new Error('Se requieren privilegios de Administrador para crear snapshots VSS. Ejecute la aplicacion como Administrador.');
    }
    this._log('Admin privileges confirmed');
  } catch (e) {
    if (e.message.includes('Administrador')) throw e;
    this._log(`WARNING: Could not verify admin privileges: ${e.message}`);
  }
},

async _cleanSMBConnections(server, sharePath) {
  try { await execFileAsync('net', ['use', `\\\\${server}`, '/delete', '/y'], { shell: false }); } catch (e) {}
  try { await execFileAsync('net', ['use', sharePath, '/delete', '/y'], { shell: false }); } catch (e) {}

  // Clean mapped drives to this server
  try {
    const { stdout } = await execFileAsync('net', ['use'], { shell: false });
    const lines = stdout.split('\n').filter(l => l.includes(server));
    for (const line of lines) {
      const match = line.match(/([A-Z]:)\s/);
      if (match) {
        try { await execFileAsync('net', ['use', match[1], '/delete', '/y'], { shell: false }); } catch (e) {}
      }
    }
  } catch (e) {}
},

async _createVSS() {
  this._log('Creating VSS shadow copy for C:\\');

  const psScript = [
    '$ErrorActionPreference = "Stop"',
    '$s = (Get-WmiObject -List Win32_ShadowCopy).Create("C:\\", "ClientAccessible")',
    'if ($s.ReturnValue -ne 0) { throw "VSS creation failed with code $($s.ReturnValue)" }',
    '$id = $s.ShadowID',
    '$sc = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $id }',
    'Write-Output $id',
    'Write-Output $sc.DeviceObject',
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', psScript
  ], { timeout: 120000, windowsHide: true, shell: false });

  const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`VSS: could not parse shadow copy output: ${stdout.substring(0, 300)}`);
  }

  const shadowId = lines[0];
  // DeviceObject looks like: \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN
  // Append trailing backslash for wimlib to treat as directory
  let devicePath = lines[1];
  if (!devicePath.endsWith('\\')) devicePath += '\\';

  return { shadowId, devicePath };
},

async _deleteVSS(shadowId) {
  try {
    // Validate shadowId looks like a GUID to prevent injection
    if (!/^\{?[0-9a-fA-F-]+\}?$/.test(shadowId)) {
      this._log(`WARNING: Invalid shadow ID format, skipping deletion: ${shadowId}`);
      return;
    }

    const psScript = `$sc = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq '${shadowId}' }; if ($sc) { $sc.Delete() }`;
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', psScript
    ], { timeout: 30000, windowsHide: true, shell: false });
    this._log(`VSS shadow ${shadowId} deleted`);
  } catch (e) {
    this._log(`WARNING: VSS cleanup failed: ${e.message}`);
  }
},

_getWimlibPath() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'HomePiNAS', 'wimlib', 'wimlib-imagex.exe'),
  ];

  // Also search in subdirectories (zip may extract to a versioned subfolder)
  const wimlibDir = path.join(process.env.LOCALAPPDATA || '', 'HomePiNAS', 'wimlib');
  if (fs.existsSync(wimlibDir)) {
    try {
      const entries = fs.readdirSync(wimlibDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const nested = path.join(wimlibDir, entry.name, 'wimlib-imagex.exe');
          candidates.push(nested);
        }
      }
    } catch (e) {}
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
},

async _ensureWimlib() {
  let wimlibPath = this._getWimlibPath();
  if (wimlibPath) {
    this._log(`wimlib found: ${wimlibPath}`);
    return wimlibPath;
  }

  this._log('wimlib not found, downloading...');
  const installDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'HomePiNAS', 'wimlib'
  );
  if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });

  const zipUrl = 'https://wimlib.net/downloads/wimlib-1.14.4-windows-x86_64-bin.zip';
  const zipPath = path.join(installDir, 'wimlib.zip');

  // Download
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${zipPath}' -UseBasicParsing`
  ], { timeout: 120000, windowsHide: true, shell: false });

  // Extract
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${installDir}' -Force`
  ], { timeout: 60000, windowsHide: true, shell: false });

  // Clean up zip
  try { fs.unlinkSync(zipPath); } catch (e) {}

  // Find the extracted exe
  wimlibPath = this._getWimlibPath();
  if (!wimlibPath) {
    throw new Error('Failed to find wimlib-imagex.exe after download. Check internet connection.');
  }

  this._log(`wimlib installed: ${wimlibPath}`);
  return wimlibPath;
},

async _wimCapture(wimlibExe, sourcePath, destWimPath, imageName) {
  const destDir = path.dirname(destWimPath);
  if (!fs.existsSync(destDir)) {
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) {}
  }

  this._log(`wimcapture: ${sourcePath} -> ${destWimPath}`);

  const cpuCount = os.cpus().length;
  const args = [
    'capture',
    sourcePath,
    destWimPath,
    imageName || os.hostname(),
    '--compress=LZX',
    `--threads=${cpuCount}`,
    '--no-acls',
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(wimlibExe, args, {
      timeout: 14400000, // 4 hours max
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Log progress lines (wimlib prints progress percentage)
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (line.includes('%')) {
          const match = line.match(/(\d+)%/);
          if (match) {
            this._setProgress('capture', 30 + Math.round(parseInt(match[1]) * 0.5), line.trim());
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        this._log('wimcapture completed successfully');
        resolve();
      } else if (code === 47) {
        // WIMLIB_ERR_UNABLE_TO_READ — some files unreadable, but WIM is valid
        this._log(`wimcapture exited with code 47 (partial success — some files unreadable, WIM is valid)`);
        resolve();
      } else {
        const errOutput = (stderr || stdout || '').substring(0, 500);
        reject(new Error(`wimcapture failed (exit ${code}): ${errOutput}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`wimcapture spawn error: ${err.message}`));
    });
  });
},

async _captureWindowsDiskMetadata() {
  const metadata = {
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: os.arch(),
    totalMemory: os.totalmem(),
    partitions: [],
    efiPartition: null,
  };

  // Get partition layout via PowerShell
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-Partition | Select-Object DiskNumber,PartitionNumber,DriveLetter,Size,Type,GptType,IsSystem | ConvertTo-Json -Compress'
    ], { timeout: 15000, windowsHide: true, shell: false });

    const parsed = JSON.parse(stdout);
    metadata.partitions = Array.isArray(parsed) ? parsed : [parsed];

    // Detect EFI partition (FAT32/System type)
    metadata.efiPartition = metadata.partitions.find(p =>
      p.Type === 'System' ||
      (p.GptType && p.GptType.toLowerCase().includes('c12a7328'))
    ) || null;

    this._log(`Found ${metadata.partitions.length} partitions, EFI: ${metadata.efiPartition ? 'yes' : 'no'}`);
  } catch (e) {
    this._log(`WARNING: Could not capture partition info: ${e.message}`);
  }

  // Get boot config
  try {
    const { stdout } = await execFileAsync('bcdedit', ['/enum'], {
      timeout: 10000, windowsHide: true, shell: false
    });
    metadata.bootConfig = stdout.substring(0, 2000);
  } catch (e) {
    this._log(`WARNING: Could not capture bcdedit info: ${e.message}`);
  }

  return metadata;
},

async _writeManifest(destDir, metadata) {
  // Write to a temp file first, then copy to destination
  // This avoids issues with PowerShell escaping in JSON content
  const tempDir = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    'HomePiNAS', 'temp'
  );
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempPath = path.join(tempDir, `manifest-${Date.now()}.json`);
  const destPath = path.join(destDir, 'manifest.json');

  try {
    fs.writeFileSync(tempPath, JSON.stringify(metadata, null, 2), 'utf8');

    // If destDir is a UNC path (network share), use cmd copy for reliability
    if (destDir.startsWith('\\\\')) {
      await execFileAsync('cmd.exe', ['/c', 'copy', '/y', tempPath, destPath], {
        timeout: 15000, windowsHide: true, shell: false
      });
    } else {
      fs.copyFileSync(tempPath, destPath);
    }
    this._log('Manifest written successfully');
  } finally {
    try { fs.unlinkSync(tempPath); } catch (e) {}
  }
},

async _windowsFileBackup(sharePath, paths, creds) {
  if (!paths || paths.length === 0) throw new Error('No hay carpetas configuradas para respaldar');

  this._setProgress('connect', 10, 'Connecting to NAS share');
  try { await execFileAsync('net', ['use', 'Z:', '/delete', '/y'], { shell: false }); } catch (e) {}
  try {
    await execFileAsync('net', ['use', 'Z:', sharePath, `/user:${creds.user}`, creds.pass, '/persistent:no'], { shell: false });
  } catch (e) {
    throw new Error(`No se pudo conectar al share ${sharePath}: ${e.message}`);
  }

  const results = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destBase = `Z:\\FileBackup\\${os.hostname()}\\${timestamp}`;

  for (let i = 0; i < paths.length; i++) {
    const srcPath = paths[i];
    const folderName = path.basename(srcPath) || 'root';
    const dest = `${destBase}\\${folderName}`;
    const pct = 20 + Math.round((i / paths.length) * 70);
    this._setProgress('copy', pct, `Copying ${folderName}`);
    this._log(`robocopy: ${srcPath} -> ${dest}`);

    try {
      await execFileAsync('robocopy', [
        srcPath, dest,
        '/MIR', '/R:2', '/W:5', '/NP', '/NFL', '/NDL', '/MT:8'
      ], { timeout: 3600000, windowsHide: true, shell: false });
      results.push({ path: srcPath, success: true });
    } catch (err) {
      const exitCode = err.code || 0;
      if (exitCode < 8) {
        results.push({ path: srcPath, success: true });
      } else {
        this._log(`ERROR: robocopy failed for ${srcPath}: exit code ${exitCode}`);
        results.push({ path: srcPath, success: false, error: err.message });
      }
    }
  }

  try { await execFileAsync('net', ['use', 'Z:', '/delete', '/y'], { shell: false }); } catch (e) {}

  this._setProgress('done', 100, 'File backup complete');
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) throw new Error(`${failed.length} carpetas fallaron: ${failed.map(f => f.path).join(', ')}`);

  return { type: 'files', results, timestamp: new Date().toISOString() };
}

};

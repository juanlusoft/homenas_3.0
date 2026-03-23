/**
 * HomePiNAS Backup Agent v2 - Pure Node.js Windows Service
 *
 * Flujo:
 * 1. Config → auto-discovery → register → poll → backup → report
 * Split: service-utils.js (config/log), service-network.js (discovery/API)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const {
  CONFIG_DIR, CONFIG_FILE, STATUS_FILE, LOG_FILE, BACKUP_WORKER, STATUS_CHECK_INTERVAL,
  log, loadConfig, saveConfig, updateStatus, loadStatus
} = require('./src/service-utils');

const {
  discoverNAS, NASApi, registerWithNAS, getLocalIP
} = require('./src/service-network');

async function runBackup(config) {
  log('Starting backup via PowerShell worker');
  
  const workerConfig = {
    nasAddress: config.nasAddress,
    nasPort: config.nasPort || 443,
    backupType: config.backupType || 'image',
    backupPaths: config.backupPaths || [],
    sambaShare: config.sambaShare,
    sambaUser: config.sambaUser,
    sambaPass: config.sambaPass,
    statusFile: path.join(CONFIG_DIR, 'backup-status.json'),
  };
  
  // Clear previous status
  backupWorkerStatus = null;
  if (fs.existsSync(workerConfig.statusFile)) {
    try { fs.unlinkSync(workerConfig.statusFile); } catch (e) {}
  }
  
  // Spawn PowerShell worker as separate process
  const psArgs = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', BACKUP_WORKER,
    '-ConfigJson', JSON.stringify(workerConfig)
  ];
  
  log(`Spawning backup worker: powershell.exe ${psArgs.join(' ')}`);
  
  backupWorkerProcess = spawn('powershell.exe', psArgs, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  
  backupWorkerProcess.stdout.on('data', (data) => {
    log(`[Worker] ${data.toString().trim()}`);
  });
  
  backupWorkerProcess.stderr.on('data', (data) => {
    log(`[Worker ERROR] ${data.toString().trim()}`, 'ERROR');
  });
  
  // Start monitoring status file
  startStatusMonitoring(workerConfig.statusFile);
  
  // Wait for process to complete
  const exitCode = await waitForWorker(backupWorkerProcess);
  
  stopStatusMonitoring();
  
  // Read final status
  const result = readBackupResult(workerConfig.statusFile);
  
  if (exitCode !== 0 && (!result || result.status !== 'success')) {
    throw new Error(`Backup worker exited with code ${exitCode}`);
  }
  
  // If worker exited 0 but no status file, treat as success
  return result || { status: 'success', message: 'Backup completed (no status file)' };
}

function startStatusMonitoring(statusFile) {
  statusCheckInterval = setInterval(() => {
    try {
      if (fs.existsSync(statusFile)) {
        const data = fs.readFileSync(statusFile, 'utf8');
        backupWorkerStatus = JSON.parse(data);
        log(`Backup progress: ${backupWorkerStatus.progress}% - ${backupWorkerStatus.message || 'working'}`);
        updateStatus({
          backupProgress: backupWorkerStatus.progress,
          backupMessage: backupWorkerStatus.message,
          backupPhase: backupWorkerStatus.phase,
        });
      }
    } catch (e) {
      // Status file might be in flux
    }
  }, STATUS_CHECK_INTERVAL);
}

function stopStatusMonitoring() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

function waitForWorker(process) {
  return new Promise((resolve) => {
    process.on('close', (code) => {
      log(`Backup worker exited with code ${code}`);
      resolve(code);
    });
    process.on('error', (err) => {
      log(`Backup worker error: ${err.message}`, 'ERROR');
      resolve(-1);
    });
  });
}

function readBackupResult(statusFile) {
  try {
    if (fs.existsSync(statusFile)) {
      let data = fs.readFileSync(statusFile, 'utf8');
      // Strip BOM and null bytes (PowerShell UTF-8 quirks)
      data = data.replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
      if (!data) return null;
      return JSON.parse(data);
    }
  } catch (e) {
    log(`Error reading backup result: ${e.message}`, 'ERROR');
  }
  return null;
}

// ── Main Agent Loop ──────────────────────────────────────────────────────────

let pollInterval = null;
let api = null;

async function pollNAS(config) {
  try {
    const result = await api.poll(config.nasAddress, config.nasPort, config.agentToken);
    
    log(`Poll response: status=${result.status}, action=${result.action || 'none'}`);
    
    if (result.status === 'pending') {
      updateStatus({ status: 'pending', message: 'Esperando aprobación del NAS' });
      if (config.status !== 'pending') {
        config.status = 'pending';
        saveConfig(config);
      }
    } else if (result.status === 'approved') {
      if (config.status !== 'approved') {
        log('Agent approved by NAS!');
        config.status = 'approved';
        
        // Save config from NAS
        if (result.config) {
          config.deviceName = result.config.deviceName || '';
          config.backupType = result.config.backupType || 'image';
          config.schedule = result.config.schedule || '0 3 * * *';
          config.retention = result.config.retention || 3;
          if (result.config.paths) config.backupPaths = result.config.paths;
          if (result.config.sambaShare) config.sambaShare = result.config.sambaShare;
          if (result.config.sambaUser) config.sambaUser = result.config.sambaUser;
          if (result.config.sambaPass) config.sambaPass = result.config.sambaPass;
          saveConfig(config);
        }
        
        updateStatus({ 
          status: 'approved', 
          message: 'Conectado - esperando horario de backup',
          deviceName: config.deviceName,
        });
      }
      
      // Check if NAS triggered a manual backup
      if (result.action === 'backup') {
        log('NAS triggered manual backup');
        await executeBackup(config);
      }
    }
  } catch (err) {
    log(`Poll error: ${err.message}`, 'ERROR');
    updateStatus({ status: 'disconnected', message: `Error: ${err.message}` });
  }
}

async function executeBackup(config) {
  updateStatus({ 
    status: 'backing_up', 
    message: 'Backup en progreso...',
    backupProgress: 0,
  });
  
  const startTime = Date.now();
  
  try {
    const result = await runBackup(config);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    log(`Backup completed: ${result.status} in ${duration}s`);
    
    updateStatus({ 
      status: 'approved',
      lastBackup: new Date().toISOString(),
      lastResult: result.status,
      lastDuration: duration,
      message: result.status === 'success' ? 'Backup completado' : 'Backup fallido',
    });
    
    // Report to NAS
    try {
      await api.report(config.nasAddress, config.nasPort, config.agentToken, {
        status: result.status,
        duration,
        error: result.error || null,
        details: result.details || null,
      });
    } catch (e) {
      log(`Failed to report to NAS: ${e.message}`, 'WARN');
    }
    
  } catch (err) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    log(`Backup failed: ${err.message}`, 'ERROR');
    
    updateStatus({ 
      status: 'approved',
      lastBackup: new Date().toISOString(),
      lastResult: 'error',
      lastDuration: duration,
      message: `Error: ${err.message}`,
    });
    
    try {
      await api.report(config.nasAddress, config.nasPort, config.agentToken, {
        status: 'error',
        duration,
        error: err.message,
      });
    } catch (e) {
      log(`Failed to report error to NAS: ${e.message}`, 'WARN');
    }
  }
}

function startPolling(config) {
  if (pollInterval) clearInterval(pollInterval);
  
  log(`Starting NAS polling (every 60s) to ${config.nasAddress}:${config.nasPort}`);
  pollInterval = setInterval(() => pollNAS(config), 60000);
  
  // First poll immediately
  pollNAS(config);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Auto-discovery & Registration ────────────────────────────────────────────

async function autoDiscoverAndRegister() {
  log('No config found - starting auto-discovery');
  
  const discovered = await discoverNAS();
  
  if (discovered.length === 0) {
    log('No NAS found via auto-discovery', 'ERROR');
    updateStatus({ 
      status: 'disconnected', 
      message: 'No se encontró el NAS - verifique conexión de red',
    });
    return null;
  }
  
  log(`Found ${discovered.length} NAS device(s)`);
  
  // Try to register with the first one
  for (const nas of discovered) {
    try {
      api = new NASApi();
      const config = await registerWithNAS(api, nas.address, nas.port);
      saveConfig(config);
      updateStatus({ 
        status: config.status, 
        message: config.status === 'approved' ? 'Conectado' : 'Esperando aprobación',
        nasAddress: config.nasAddress,
      });
      return config;
    } catch (e) {
      log(`Failed to register with ${nas.address}:${nas.port}: ${e.message}`, 'WARN');
    }
  }
  
  return null;
}

// ── Service Entry Point ──────────────────────────────────────────────────────

async function main() {
  log('═══════════════════════════════════════════════════════════');
  log('HomePiNAS Backup Agent v2 starting...');
  log(`Platform: ${process.platform} ${os.arch()}`);
  log(`Hostname: ${os.hostname()}`);
  log(`Config: ${CONFIG_FILE}`);
  log('═══════════════════════════════════════════════════════════');
  
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  // Load or create config
  let config = loadConfig();
  
  if (!config || !config.nasAddress) {
    config = await autoDiscoverAndRegister();
    if (!config) {
      log('Could not auto-register. Waiting for config file...', 'WARN');
      // Wait for config file to be created by NAS
      await waitForConfigFile();
      config = loadConfig();
    }
  }
  
  if (!config || !config.agentToken) {
    log('No valid config - agent cannot start', 'ERROR');
    process.exit(1);
  }
  
  // Initialize API
  api = new NASApi();
  
  // Start polling
  startPolling(config);
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    log('Received SIGTERM - shutting down');
    stopPolling();
    stopStatusMonitoring();
    if (backupWorkerProcess) {
      backupWorkerProcess.kill();
    }
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    log('Received SIGINT - shutting down');
    stopPolling();
    stopStatusMonitoring();
    if (backupWorkerProcess) {
      backupWorkerProcess.kill();
    }
    process.exit(0);
  });
  
  log('Agent running. Press Ctrl+C to stop.');
}

async function waitForConfigFile() {
  log('Waiting for config file (max 5 minutes)...');
  const maxWait = 5 * 60 * 1000; // 5 minutes
  const checkInterval = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = loadConfig();
      if (config && config.nasAddress && config.agentToken) {
        log('Config file found!');
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  log('Timeout waiting for config file', 'ERROR');
}

// Start the agent
main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  process.exit(1);
});

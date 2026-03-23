/**
 * Agent Service — Config & logging utilities
 * Split from agent-service.js for maintainability
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'HomePiNAS');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const STATUS_FILE = path.join(CONFIG_DIR, 'status.json');
const LOG_FILE = path.join(CONFIG_DIR, 'agent.log');
const BACKUP_WORKER = path.join(__dirname, 'workers', 'backup-worker.ps1');
const STATUS_CHECK_INTERVAL = 5000; // 5 segundos

// ── Logging ──────────────────────────────────────────────────────────────────


function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // Silent fail for logging errors
  }
}

// ── Config Management ────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    log(`Error loading config: ${e.message}`, 'ERROR');
  }
  return null;
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    log('Config saved');
  } catch (e) {
    log(`Error saving config: ${e.message}`, 'ERROR');
  }
}

function updateStatus(status) {
  try {
    const current = loadStatus();
    const updated = { ...current, ...status, lastUpdate: new Date().toISOString() };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    log(`Error updating status: ${e.message}`, 'ERROR');
  }
}

function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

// ── NAS Discovery ────────────────────────────────────────────────────────────


module.exports = {
  CONFIG_DIR, CONFIG_FILE, STATUS_FILE, LOG_FILE, BACKUP_WORKER, STATUS_CHECK_INTERVAL,
  log, loadConfig, saveConfig, updateStatus, loadStatus
};

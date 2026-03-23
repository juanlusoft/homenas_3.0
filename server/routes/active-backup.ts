/**
 * Active Backup — Agent registration, polling, and backup management
 * Agents on remote PCs register here, poll for config, and report backup status
 */

import { Router } from 'express';
import crypto from 'crypto';

export const activeBackupRouter = Router();

// In-memory store (replace with SQLite in production)
interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  token: string;
  backupType: 'full' | 'folders';
  backupPaths: string[];
  schedule: string;
  status: 'online' | 'offline' | 'backing-up';
  lastSeen: string;
  lastBackup: string | null;
  backupSize: number;
  versions: BackupVersion[];
  approved: boolean;
}

interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
}

interface PendingAgent {
  id: string;
  hostname: string;
  os: string;
  ip: string;
  requestedAt: string;
}

const devices = new Map<string, Device>();
const pendingAgents = new Map<string, PendingAgent>();

// Seed demo data
seedDemoData();

/** POST /agent/register — Agent self-registration */
activeBackupRouter.post('/agent/register', (req, res) => {
  const { hostname, os } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname required' });

  const id = crypto.randomUUID().slice(0, 8);
  const ip = req.ip || 'unknown';

  pendingAgents.set(id, {
    id, hostname, os: os || 'unknown', ip,
    requestedAt: new Date().toISOString(),
  });

  res.json({ id, status: 'pending_approval', message: 'Waiting for admin approval' });
});

/** GET /agent/poll/:id — Agent polls for config */
activeBackupRouter.get('/agent/poll/:id', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  device.lastSeen = new Date().toISOString();
  device.status = 'online';

  res.json({
    approved: device.approved,
    backupType: device.backupType,
    backupPaths: device.backupPaths,
    schedule: device.schedule,
  });
});

/** POST /agent/report/:id — Agent reports backup result */
activeBackupRouter.post('/agent/report/:id', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const { status, size, type } = req.body;
  const version: BackupVersion = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    size: size || 0,
    type: type || 'incremental',
    status: status || 'complete',
  };

  device.versions.unshift(version);
  if (device.versions.length > 50) device.versions.pop();
  device.lastBackup = version.timestamp;
  device.backupSize += version.size;
  device.status = 'online';

  res.json({ success: true });
});

/** GET /devices — List all registered devices */
activeBackupRouter.get('/devices', (_req, res) => {
  res.json(Array.from(devices.values()));
});

/** GET /devices/:id — Single device detail */
activeBackupRouter.get('/devices/:id', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

/** POST /devices — Manually add device */
activeBackupRouter.post('/devices', (req, res) => {
  const { name, hostname, os, backupType, backupPaths, schedule } = req.body;
  const id = crypto.randomUUID().slice(0, 8);
  const token = crypto.randomBytes(32).toString('hex');

  const device: Device = {
    id, name: name || hostname, hostname, os: os || 'unknown',
    ip: '', token, backupType: backupType || 'folders',
    backupPaths: backupPaths || [], schedule: schedule || '0 2 * * *',
    status: 'offline', lastSeen: '', lastBackup: null,
    backupSize: 0, versions: [], approved: true,
  };

  devices.set(id, device);
  res.json({ id, token });
});

/** DELETE /devices/:id — Remove device */
activeBackupRouter.delete('/devices/:id', (req, res) => {
  devices.delete(req.params.id);
  res.json({ success: true });
});

/** POST /devices/:id/backup — Trigger manual backup */
activeBackupRouter.post('/devices/:id/backup', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  device.status = 'backing-up';
  res.json({ success: true, message: 'Backup triggered' });
});

/** GET /devices/:id/versions — List backup versions */
activeBackupRouter.get('/devices/:id/versions', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device.versions);
});

/** GET /pending — List pending agent registrations */
activeBackupRouter.get('/pending', (_req, res) => {
  res.json(Array.from(pendingAgents.values()));
});

/** POST /pending/:id/approve — Approve pending agent */
activeBackupRouter.post('/pending/:id/approve', (req, res) => {
  const pending = pendingAgents.get(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending agent not found' });

  const token = crypto.randomBytes(32).toString('hex');
  const device: Device = {
    id: pending.id, name: pending.hostname, hostname: pending.hostname,
    os: pending.os, ip: pending.ip, token,
    backupType: 'folders', backupPaths: [], schedule: '0 2 * * *',
    status: 'online', lastSeen: new Date().toISOString(),
    lastBackup: null, backupSize: 0, versions: [], approved: true,
  };

  devices.set(device.id, device);
  pendingAgents.delete(pending.id);
  res.json({ success: true, device });
});

/** POST /pending/:id/reject — Reject pending agent */
activeBackupRouter.post('/pending/:id/reject', (req, res) => {
  pendingAgents.delete(req.params.id);
  res.json({ success: true });
});

function seedDemoData() {
  const demoDevices: Omit<Device, 'token'>[] = [
    {
      id: 'pc-001', name: 'Juanlu Desktop', hostname: 'DESKTOP-JLU',
      os: 'Windows 11 Pro', ip: '192.168.1.10',
      backupType: 'full', backupPaths: ['C:\\'],
      schedule: '0 2 * * *', status: 'online',
      lastSeen: new Date().toISOString(),
      lastBackup: new Date(Date.now() - 3600000).toISOString(),
      backupSize: 142_000_000_000, versions: [
        { id: 'v1', timestamp: new Date(Date.now() - 3600000).toISOString(), size: 4_200_000_000, type: 'incremental', status: 'complete' },
        { id: 'v2', timestamp: new Date(Date.now() - 90000000).toISOString(), size: 142_000_000_000, type: 'full', status: 'complete' },
      ], approved: true,
    },
    {
      id: 'mac-001', name: 'MacBook Pro', hostname: 'Juanlus-MBP',
      os: 'macOS Sonoma 15.3', ip: '192.168.1.15',
      backupType: 'folders', backupPaths: ['/Users/juanlu/Documents', '/Users/juanlu/Projects'],
      schedule: '0 */6 * * *', status: 'online',
      lastSeen: new Date(Date.now() - 300000).toISOString(),
      lastBackup: new Date(Date.now() - 21600000).toISOString(),
      backupSize: 38_000_000_000, versions: [
        { id: 'v3', timestamp: new Date(Date.now() - 21600000).toISOString(), size: 1_500_000_000, type: 'incremental', status: 'complete' },
        { id: 'v4', timestamp: new Date(Date.now() - 43200000).toISOString(), size: 2_100_000_000, type: 'incremental', status: 'complete' },
        { id: 'v5', timestamp: new Date(Date.now() - 86400000).toISOString(), size: 38_000_000_000, type: 'full', status: 'complete' },
      ], approved: true,
    },
    {
      id: 'srv-001', name: 'Dev Server', hostname: 'devbox',
      os: 'Ubuntu 24.04 LTS', ip: '192.168.1.20',
      backupType: 'folders', backupPaths: ['/home', '/etc', '/opt'],
      schedule: '0 3 * * *', status: 'offline',
      lastSeen: new Date(Date.now() - 86400000 * 2).toISOString(),
      lastBackup: new Date(Date.now() - 86400000 * 2).toISOString(),
      backupSize: 22_000_000_000, versions: [
        { id: 'v6', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), size: 800_000_000, type: 'incremental', status: 'complete' },
      ], approved: true,
    },
  ];

  for (const d of demoDevices) {
    devices.set(d.id, { ...d, token: crypto.randomBytes(16).toString('hex') });
  }

  pendingAgents.set('pend-1', {
    id: 'pend-1', hostname: 'LAPTOP-MARIA', os: 'Windows 10',
    ip: '192.168.1.25', requestedAt: new Date(Date.now() - 1800000).toISOString(),
  });
}

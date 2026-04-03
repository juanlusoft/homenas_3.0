import cors from 'cors';
import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createEngineAdapter } from './engine/factory.js';
import { getEnginePublicInfo } from './engine/public-info.js';
import { config, devices, installTokens, now, randomId, saveState, sessions, stageDir } from './state.js';
import type { Device, Session } from './types.js';

function requireAdmin(req: Request, res: Response): boolean {
  const rawToken = req.headers['x-sb-admin-token'];
  const token = String(Array.isArray(rawToken) ? rawToken[0] : (rawToken || ''));
  if (token !== config.adminToken) {
    res.status(401).json({ error: 'Admin token required' });
    return false;
  }
  return true;
}

function requireAgent(req: Request, res: Response): Device | null {
  const id = String(req.params.id || '');
  const device = devices.get(id);
  const rawAuth = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : (req.headers.authorization || '');
  const auth = String(rawAuth).replace(/^Bearer\s+/i, '');
  if (!device || auth !== device.authToken) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  device.lastSeen = now();
  devices.set(device.id, device);
  return device;
}

export function createHttpApp() {
  const app = express();
  const engineAdapter = createEngineAdapter();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.post('/api/v2/admin/agents/generate/windows', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = randomId(8);
    const name = String(req.body?.name || `w11-${id}`);
    const token = `v2.${id}.${crypto.randomUUID().replace(/-/g, '')}`;
    installTokens.set(token, { id, name, os: 'Windows', issuedAt: now() });
    saveState();
    res.json({ token, deviceId: id, name });
  });

  app.post('/api/v2/admin/devices/:id/approve', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const device = devices.get(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    device.approved = true;
    devices.set(device.id, device);
    saveState();
    res.json({ success: true });
  });

  app.post('/api/v2/admin/devices/:id/trigger', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const device = devices.get(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    const inflight = Array.from(sessions.values()).find((s) => s.deviceId === device.id && s.status === 'uploading');
    if (inflight) return res.status(409).json({ error: 'Backup already in progress' });
    if (engineAdapter && config.engineProvider === 'urbackup') {
      try {
        await engineAdapter.startBackup(device.id);
        device.pendingJob = false;
        device.status = 'backing-up';
        device.lastSeen = now();
        devices.set(device.id, device);
        saveState();
        return res.json({ success: true, mode: 'adapter' });
      } catch (err) {
        return res.status(502).json({ error: err instanceof Error ? err.message : 'engine start failed' });
      }
    }
    device.pendingJob = true;
    devices.set(device.id, device);
    saveState();
    return res.json({ success: true, mode: 'agent' });
  });

  app.get('/api/v2/admin/devices', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(Array.from(devices.values()));
  });

  app.get('/api/v2/admin/engine', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(getEnginePublicInfo());
  });

  app.get('/api/v2/admin/devices/:id/progress', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const device = devices.get(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const inflight = Array.from(sessions.values()).find((s) => s.deviceId === device.id && s.status === 'uploading');
    if (inflight) {
      return res.json({
        mode: 'agent',
        sessionId: inflight.id,
        phase: inflight.status,
        bytes: inflight.totalBytes,
        files: inflight.fileCount
      });
    }

    if (engineAdapter && config.engineProvider === 'urbackup') {
      try {
        const p = await engineAdapter.getProgress(device.id);
        return res.json({ mode: 'adapter', ...p });
      } catch (err) {
        return res.status(502).json({ error: err instanceof Error ? err.message : 'engine progress failed' });
      }
    }

    return res.json({ mode: 'agent', phase: 'idle', bytes: 0, files: 0 });
  });

  app.post('/api/v2/agent/activate', (req, res) => {
    const token = String(req.body?.token || '');
    const hostname = String(req.body?.hostname || '');
    const os = String(req.body?.os || 'Windows');
    const meta = installTokens.get(token);
    if (!meta || !hostname) return res.status(400).json({ error: 'invalid token/hostname' });

    const authToken = crypto.randomBytes(32).toString('hex');
    const device: Device = {
      id: meta.id,
      name: meta.name,
      hostname,
      os,
      authToken,
      status: 'online',
      approved: false,
      pendingJob: false,
      lastSeen: now()
    };
    devices.set(device.id, device);
    installTokens.delete(token);
    saveState();
    res.json({ deviceId: device.id, authToken });
  });

  app.get('/api/v2/agent/:id/job', (req, res) => {
    const device = requireAgent(req, res);
    if (!device) return;
    res.json({
      approved: device.approved,
      pendingJob: device.pendingJob,
      mode: 'system-volume',
      volume: 'C:\\'
    });
  });

  app.post('/api/v2/agent/:id/sessions/start', (req, res) => {
    const device = requireAgent(req, res);
    if (!device) return;
    if (!device.approved) return res.status(403).json({ error: 'Device not approved' });
    const inflight = Array.from(sessions.values()).find((s) => s.deviceId === device.id && s.status === 'uploading');
    if (inflight) return res.json({ sessionId: inflight.id, tcpHost: config.host, tcpPort: config.tcpPort, resumed: true });

    const sid = randomId(8);
    const session: Session = {
      id: sid,
      deviceId: device.id,
      createdAt: now(),
      completedAt: null,
      status: 'uploading',
      totalBytes: 0,
      fileCount: 0,
      error: null,
      stageDir: stageDir(device.id, sid)
    };
    fs.mkdirSync(path.resolve(session.stageDir), { recursive: true });
    device.pendingJob = false;
    device.status = 'backing-up';
    devices.set(device.id, device);
    sessions.set(session.id, session);
    saveState();
    res.json({ sessionId: sid, tcpHost: config.host, tcpPort: config.tcpPort, resumed: false });
  });

  app.post('/api/v2/agent/:id/sessions/:sessionId/complete', (req, res) => {
    const device = requireAgent(req, res);
    if (!device) return;
    const session = sessions.get(req.params.sessionId);
    if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });
    session.status = 'completed';
    session.completedAt = now();
    sessions.set(session.id, session);
    device.status = 'online';
    devices.set(device.id, device);
    saveState();
    res.json({ success: true });
  });

  app.post('/api/v2/agent/:id/sessions/:sessionId/fail', (req, res) => {
    const device = requireAgent(req, res);
    if (!device) return;
    const session = sessions.get(req.params.sessionId);
    if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });
    session.status = 'failed';
    session.completedAt = now();
    session.error = String(req.body?.error || 'unknown');
    sessions.set(session.id, session);
    device.status = 'online';
    devices.set(device.id, device);
    saveState();
    res.json({ success: true });
  });

  return app;
}

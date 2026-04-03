import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { devices, saveData, Device, BACKUP_BASE_DIR } from '../lib/active-backup-store.js';
import { hasChunk, writeChunk, verifyChunk } from '../lib/chunk-store.js';
import {
  createSession,
  getSession,
  markChunkUploaded,
  completeSession,
  getSessionProgress,
  UploadFile,
} from '../lib/upload-session-store.js';

export const activeBackupUploadRouter = Router();

interface DeviceRequest extends Request {
  device: Device;
}

// ── Device auth middleware ────────────────────────────────────────────────────

function requireDeviceAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Device authentication required' });
    return;
  }
  const device = Array.from(devices.values()).find(d => d.token === token);
  if (!device) {
    res.status(401).json({ error: 'Invalid device token' });
    return;
  }
  (req as DeviceRequest).device = device;
  next();
}

// ── POST /upload/session/start ────────────────────────────────────────────────

activeBackupUploadRouter.post(
  '/upload/session/start',
  requireDeviceAuth,
  (req: Request, res: Response) => {
    const device = (req as DeviceRequest).device;
    const { snapshot_label, files } = req.body as {
      snapshot_label: string;
      files: UploadFile[];
    };

    if (!snapshot_label || !Array.isArray(files)) {
      res.status(400).json({ error: 'snapshot_label and files[] are required' });
      return;
    }

    // Deduplicate chunk hashes across all files
    const allHashes = [...new Set(files.flatMap(f => f.chunks))];

    // Determine which chunks the server does not yet have
    const needed = allHashes.filter(h => !hasChunk(h));

    const session = createSession(device.id, snapshot_label, files, needed);

    device.status = 'backing-up';
    device.lastSeen = new Date().toISOString();

    console.log(
      `[upload] session/start: device=${device.name} snapshot=${snapshot_label} ` +
        `files=${files.length} allChunks=${allHashes.length} needed=${needed.length}`
    );

    res.json({ session_id: session.id, needed });
  }
);

// ── POST /upload/chunk/:sha256 ────────────────────────────────────────────────
// express.raw() is applied per-route so the global express.json() does not consume the body

activeBackupUploadRouter.post(
  '/upload/chunk/:sha256',
  express.raw({ type: 'application/octet-stream', limit: '8mb' }),
  requireDeviceAuth,
  (req: Request, res: Response) => {
    const { sha256 } = req.params;
    const sessionId = req.headers['x-session-id'] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: 'X-Session-Id header required' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const device = (req as DeviceRequest).device;
    if (session.deviceId !== device.id) {
      res.status(403).json({ error: 'Session belongs to a different device' });
      return;
    }

    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || data.length === 0) {
      res.status(400).json({ error: 'Empty body' });
      return;
    }

    if (!verifyChunk(sha256, data)) {
      res.status(400).json({ error: 'SHA256 mismatch — chunk data is corrupt' });
      return;
    }

    // Idempotent: if chunk already exists (prior session), skip write
    if (!hasChunk(sha256)) {
      writeChunk(sha256, data);
    }

    markChunkUploaded(sessionId, sha256);
    res.json({ ok: true });
  }
);

// ── POST /upload/session/complete ─────────────────────────────────────────────

activeBackupUploadRouter.post(
  '/upload/session/complete',
  requireDeviceAuth,
  (req: Request, res: Response) => {
    const device = (req as DeviceRequest).device;
    const { session_id } = req.body as { session_id: string };

    if (!session_id) {
      res.status(400).json({ error: 'session_id is required' });
      return;
    }

    const session = getSession(session_id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (session.deviceId !== device.id) {
      res.status(403).json({ error: 'Session belongs to a different device' });
      return;
    }

    const completedAt = new Date().toISOString();
    const snapshotDir = path.join(
      BACKUP_BASE_DIR,
      'snapshots',
      device.id,
      session.snapshotLabel
    );
    fs.mkdirSync(snapshotDir, { recursive: true });

    const totalFiles = session.files.length;
    const totalBytes = session.files.reduce((sum, f) => sum + f.size, 0);
    const chunksNew = session.neededChunks.length;
    const allChunkRefs = session.files.flatMap(f => f.chunks).length;
    const chunksDeduped = allChunkRefs - chunksNew;

    const stats = {
      files_total: totalFiles,
      bytes_total: totalBytes,
      chunks_new: chunksNew,
      chunks_deduped: chunksDeduped,
      // Approximate: each deduplicated chunk ref saves one 4 MB write
      bytes_saved: chunksDeduped * 4 * 1024 * 1024,
    };

    const manifest = {
      version: 2,
      device: device.name,
      device_id: device.id,
      started_at: session.createdAt,
      completed_at: completedAt,
      files: session.files,
      stats,
    };

    fs.writeFileSync(
      path.join(snapshotDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    const statusData = {
      state: 'complete',
      session_id,
      progress: {
        files_done: totalFiles,
        chunks_done: allChunkRefs,
        bytes_done: totalBytes,
      },
    };

    fs.writeFileSync(
      path.join(snapshotDir, 'status.json'),
      JSON.stringify(statusData, null, 2),
      'utf8'
    );

    device.lastBackup = completedAt;
    device.backupSize = totalBytes;
    if (device.status === 'backing-up') device.status = 'online';
    saveData();

    completeSession(session_id);

    console.log(
      `[upload] session/complete: device=${device.name} snapshot=${session.snapshotLabel} ` +
        `files=${totalFiles} bytes=${totalBytes} saved=${stats.bytes_saved}`
    );

    res.json({ snapshot_id: session.snapshotLabel, stats });
  }
);

// ── GET /upload/session/:id/status ────────────────────────────────────────────

activeBackupUploadRouter.get(
  '/upload/session/:id/status',
  requireDeviceAuth,
  (req: Request, res: Response) => {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    const device = (req as DeviceRequest).device;
    if (session.deviceId !== device.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({
      session_id: session.id,
      status: session.status,
      snapshot_label: session.snapshotLabel,
      ...getSessionProgress(session),
    });
  }
);

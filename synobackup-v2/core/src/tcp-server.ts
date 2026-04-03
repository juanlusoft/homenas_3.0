import crypto from 'crypto';
import fs from 'fs';
import net, { type Socket } from 'net';
import path from 'path';
import { config, devices, saveState, sessions, stageDir } from './state.js';

type HelloHeader = {
  op: 'hello';
  agentToken: string;
  deviceId: string;
  sessionId: string;
  backupType: 'files' | 'image';
  totalFiles?: number;
};

type FileHeader = {
  op: 'file';
  path: string;
  size: number;
  sha256: string;
  modifiedAt?: string;
};

type FinishHeader = {
  op: 'finish';
};

type ActiveFile = {
  fd: number;
  tmp: string;
  target: string;
  expectedSha256: string;
  modifiedAt?: string;
  size: number;
  remaining: number;
  hash: crypto.Hash;
};

function writeFrame(socket: Socket, body: unknown) {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(raw.length, 0);
  socket.write(prefix);
  socket.write(raw);
}

function resolveFileTarget(root: string, rel: string) {
  const normalized = rel.replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return { normalized, target };
}

export function startTcpServer() {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let headerLen = -1;
    let authed = false;
    let activeSessionId = '';
    let activeDeviceId = '';
    let activeRoot = '';
    let activeFile: ActiveFile | null = null;

    const clearSessionContext = () => {
      authed = false;
      activeSessionId = '';
      activeDeviceId = '';
      activeRoot = '';
    };

    const markSessionFailed = (reason: string) => {
      if (!activeSessionId) return;
      const session = sessions.get(activeSessionId);
      if (session && session.status === 'uploading') {
        session.status = 'failed';
        session.error = reason || 'connection terminated';
        session.completedAt = session.completedAt || new Date().toISOString();
        sessions.set(session.id, session);
        const device = devices.get(activeDeviceId);
        if (device) {
          device.status = 'online';
          devices.set(device.id, device);
        }
        saveState();
      }
    };

    const resetFrameState = () => {
      headerLen = -1;
    };

    const parseFrame = (): Buffer | null => {
      if (headerLen < 0) {
        if (buffer.length < 4) return null;
        headerLen = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
      }
      if (buffer.length < headerLen) return null;
      const raw = buffer.subarray(0, headerLen);
      buffer = buffer.subarray(headerLen);
      resetFrameState();
      return raw;
    };

    const failAndClose = (message: string) => {
      if (activeFile) {
        try {
          fs.closeSync(activeFile.fd);
        } catch {
          // ignore
        }
        try {
          fs.rmSync(activeFile.tmp, { force: true });
        } catch {
          // ignore
        }
        activeFile = null;
      }
      markSessionFailed(message);
      clearSessionContext();
      writeFrame(socket, { ok: false, error: message });
      socket.end();
    };

    const handleHello = (obj: HelloHeader) => {
      const device = devices.get(obj.deviceId);
      const session = sessions.get(obj.sessionId);
      if (!device || device.authToken !== obj.agentToken) {
        failAndClose('invalid token');
        return;
      }
      if (!session || session.deviceId !== device.id || session.status !== 'uploading') {
        failAndClose('invalid session');
        return;
      }
      authed = true;
      activeSessionId = session.id;
      activeDeviceId = device.id;
      activeRoot = stageDir(device.id, session.id);
      fs.mkdirSync(activeRoot, { recursive: true });
      writeFrame(socket, { ok: true });
    };

    const handleFile = (obj: FileHeader) => {
      if (!authed) {
        failAndClose('not authed');
        return;
      }
      if (!Number.isFinite(obj.size) || obj.size < 0) {
        failAndClose('invalid size');
        return;
      }
      if (activeFile) {
        failAndClose('another file is already being received');
        return;
      }
      const resolved = resolveFileTarget(activeRoot, obj.path);
      if (!resolved) {
        failAndClose('invalid path');
        return;
      }
      try {
        fs.mkdirSync(path.dirname(resolved.target), { recursive: true });
        const tmp = `${resolved.target}.tmp-${process.pid}-${Date.now()}`;
        const fd = fs.openSync(tmp, 'w');
        activeFile = {
          fd,
          tmp,
          target: resolved.target,
          expectedSha256: String(obj.sha256 || '').toLowerCase(),
          modifiedAt: obj.modifiedAt,
          size: obj.size,
          remaining: obj.size,
          hash: crypto.createHash('sha256')
        };
      } catch {
        failAndClose('failed to open destination file');
        return;
      }
    };

    const consumeActiveFileBytes = () => {
      if (!activeFile) return;
      while (activeFile && activeFile.remaining > 0 && buffer.length > 0) {
        const take = Math.min(activeFile.remaining, buffer.length);
        const part = buffer.subarray(0, take);
        buffer = buffer.subarray(take);
        try {
          activeFile.hash.update(part);
          fs.writeSync(activeFile.fd, part);
        } catch {
          failAndClose('failed while writing file bytes');
          return;
        }
        activeFile.remaining -= take;
      }
      if (!activeFile || activeFile.remaining > 0) return;

      const current = activeFile;
      activeFile = null;
      try {
        fs.closeSync(current.fd);
        const got = current.hash.digest('hex');
        if (got !== current.expectedSha256) {
          fs.rmSync(current.tmp, { force: true });
          failAndClose('sha256 mismatch');
          return;
        }
        fs.renameSync(current.tmp, current.target);
        if (current.modifiedAt) {
          const parsed = new Date(current.modifiedAt);
          if (!Number.isNaN(parsed.getTime())) {
            fs.utimesSync(current.target, parsed, parsed);
          }
        }
        const session = sessions.get(activeSessionId);
        const device = devices.get(activeDeviceId);
        if (session) {
          session.fileCount += 1;
          session.totalBytes += current.size;
          sessions.set(session.id, session);
        }
        if (device) {
          device.lastSeen = new Date().toISOString();
          devices.set(device.id, device);
        }
        saveState();
        writeFrame(socket, { ok: true, counted: true });
      } catch {
        try {
          fs.rmSync(current.tmp, { force: true });
        } catch {
          // ignore
        }
        failAndClose('failed finalizing received file');
      }
    };

    const handleFinish = () => {
      if (!authed) {
        failAndClose('not authed');
        return;
      }
      if (activeFile) {
        failAndClose('finish received while file transfer is incomplete');
        return;
      }
      writeFrame(socket, { ok: true });
      clearSessionContext();
      socket.end();
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (activeFile) {
          consumeActiveFileBytes();
          if (activeFile || buffer.length === 0) break;
          continue;
        }
        const frame = parseFrame();
        if (!frame) break;
        let obj: unknown;
        try {
          obj = JSON.parse(frame.toString('utf8'));
        } catch {
          failAndClose('invalid json frame');
          return;
        }
        const op = (obj as { op?: string })?.op;
        if (op === 'hello') {
          handleHello(obj as HelloHeader);
          continue;
        }
        if (op === 'file') {
          handleFile(obj as FileHeader);
          continue;
        }
        if (op === 'finish') {
          handleFinish(obj as FinishHeader);
          continue;
        }
        failAndClose('unknown op');
        return;
      }
    });

    socket.setTimeout(config.tcpIdleTimeoutMs);
    socket.on('timeout', () => {
      if (authed && activeSessionId) {
        markSessionFailed('tcp idle timeout');
        clearSessionContext();
      }
      socket.destroy();
    });

    socket.on('close', () => {
      if (authed && activeSessionId) {
        markSessionFailed('connection closed');
        clearSessionContext();
      }
    });

    socket.on('error', (err) => {
      if (authed && activeSessionId) {
        markSessionFailed(err?.message || 'socket error');
        clearSessionContext();
      }
    });
  });

  server.listen(config.tcpPort, config.host, () => {
    console.log(`[synobackup-v2-core] tcp listening on ${config.host}:${config.tcpPort}`);
  });
  return server;
}

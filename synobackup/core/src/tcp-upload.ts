import crypto from 'crypto';
import fs from 'fs';
import net, { type Socket } from 'net';
import path from 'path';
import { config } from './config.js';
import { blobPath, devices, saveState, sessionStageDir, sessions } from './state.js';
import type { InventoryEntry } from './types.js';

const INVENTORY_FILE = '_inventory.ndjson';
const STATE_SAVE_FILE_INTERVAL = 250;

type UploadHeader = {
  op: 'upload_file_v1';
  deviceId: string;
  sessionId: string;
  authToken: string;
  path: string;
  modifiedAt?: string;
  sha256: string;
  size: number;
};

type UploadResponse = {
  ok: boolean;
  counted?: boolean;
  error?: string;
};

function sha256File(target: string) {
  const hash = crypto.createHash('sha256');
  const handle = fs.openSync(target, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest('hex');
}

function resolveStageTarget(deviceId: string, sessionId: string, relativePath: string) {
  const normalized = relativePath.replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const root = path.resolve(sessionStageDir(deviceId, sessionId));
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }
  return { normalized, target };
}

function materializeFromBlob(blobTarget: string, fileTarget: string) {
  fs.mkdirSync(path.dirname(fileTarget), { recursive: true });
  fs.rmSync(fileTarget, { force: true });
  try {
    fs.linkSync(blobTarget, fileTarget);
  } catch {
    fs.copyFileSync(blobTarget, fileTarget);
  }
}

function appendInventoryEntry(deviceId: string, sessionId: string, entry: InventoryEntry) {
  const inventoryPath = path.join(sessionStageDir(deviceId, sessionId), INVENTORY_FILE);
  fs.appendFileSync(inventoryPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function validateHeader(value: unknown): UploadHeader | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.op !== 'upload_file_v1') return null;
  const size = Number(candidate.size || 0);
  const header: UploadHeader = {
    op: 'upload_file_v1',
    deviceId: String(candidate.deviceId || ''),
    sessionId: String(candidate.sessionId || ''),
    authToken: String(candidate.authToken || ''),
    path: String(candidate.path || ''),
    modifiedAt: String(candidate.modifiedAt || ''),
    sha256: String(candidate.sha256 || '').trim().toLowerCase(),
    size,
  };
  if (!header.deviceId || !header.sessionId || !header.authToken || !header.path || !header.sha256) return null;
  if (!Number.isFinite(size) || size < 0) return null;
  return header;
}

function writeResponse(socket: Socket, response: UploadResponse) {
  const body = Buffer.from(JSON.stringify(response), 'utf8');
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(body.length, 0);
  socket.write(prefix);
  socket.write(body);
  socket.end();
}

function handleUpload(socket: Socket, header: UploadHeader, initialBody: Buffer) {
  const device = devices.get(header.deviceId);
  if (!device || device.token !== header.authToken) {
    writeResponse(socket, { ok: false, error: 'Invalid token' });
    return;
  }
  const session = sessions.get(header.sessionId);
  if (!session || session.deviceId !== device.id || session.status !== 'uploading') {
    writeResponse(socket, { ok: false, error: 'Session not found or not uploading' });
    return;
  }
  const resolved = resolveStageTarget(device.id, session.id, header.path);
  if (!resolved) {
    writeResponse(socket, { ok: false, error: 'Access denied' });
    return;
  }

  fs.mkdirSync(path.dirname(resolved.target), { recursive: true });
  const tempTarget = `${resolved.target}.tcp-${process.pid}-${Date.now()}`;
  const handle = fs.openSync(tempTarget, 'w');
  const hash = crypto.createHash('sha256');
  let remaining = header.size;
  let counted = true;
  let finished = false;

  const closeTemp = () => {
    try { fs.closeSync(handle); } catch {}
  };

  const fail = (message: string) => {
    if (finished) return;
    finished = true;
    closeTemp();
    fs.rmSync(tempTarget, { force: true });
    writeResponse(socket, { ok: false, error: message });
  };

  const finalize = () => {
    if (finished) return;
    finished = true;
    closeTemp();
    try {
      const computed = hash.digest('hex');
      if (computed !== header.sha256) {
        fs.rmSync(tempTarget, { force: true });
        writeResponse(socket, { ok: false, error: 'sha256 mismatch' });
        return;
      }
      const existing = fs.existsSync(resolved.target) ? fs.statSync(resolved.target) : null;
      if (existing && existing.size === header.size && sha256File(resolved.target) === header.sha256) {
        counted = false;
        fs.rmSync(tempTarget, { force: true });
        writeResponse(socket, { ok: true, counted: false });
        return;
      }

      const blobTarget = blobPath(header.sha256);
      fs.mkdirSync(path.dirname(blobTarget), { recursive: true });
      if (!fs.existsSync(blobTarget)) {
        try {
          fs.renameSync(tempTarget, blobTarget);
        } catch {
          fs.copyFileSync(tempTarget, blobTarget);
          fs.rmSync(tempTarget, { force: true });
        }
      } else {
        fs.rmSync(tempTarget, { force: true });
      }
      materializeFromBlob(blobTarget, resolved.target);
      if (header.modifiedAt) {
        const parsed = new Date(header.modifiedAt);
        if (!Number.isNaN(parsed.getTime())) {
          fs.utimesSync(resolved.target, parsed, parsed);
        }
      }
      appendInventoryEntry(device.id, session.id, {
        path: resolved.normalized,
        size: header.size,
        modifiedAt: header.modifiedAt || '',
        sha256: header.sha256,
        blobSha256: header.sha256,
        indexedAt: new Date().toISOString(),
      });
      if (counted) {
        session.fileCount += 1;
        session.totalBytes += header.size;
      }
      session.lastActivityAt = new Date().toISOString();
      if (session.fileCount > 0 && session.fileCount % STATE_SAVE_FILE_INTERVAL === 0) {
        saveState();
      }
      writeResponse(socket, { ok: true, counted });
    } catch (error) {
      fs.rmSync(tempTarget, { force: true });
      writeResponse(socket, { ok: false, error: error instanceof Error ? error.message : 'upload failed' });
    }
  };

  const consume = (chunk: Buffer) => {
    if (finished || remaining <= 0) return;
    const take = Math.min(remaining, chunk.length);
    const part = chunk.subarray(0, take);
    hash.update(part);
    fs.writeSync(handle, part);
    remaining -= take;
    if (remaining === 0) {
      finalize();
      return;
    }
    if (take < chunk.length) {
      consume(chunk.subarray(take));
    }
  };

  if (remaining === 0) {
    finalize();
    return;
  }

  consume(initialBody);
  socket.on('data', consume);
  socket.on('error', (err) => fail(err.message));
  socket.on('close', () => {
    if (!finished && remaining > 0) {
      fail('connection closed before payload completed');
    }
  });
}

function onConnection(socket: Socket) {
  let buffer = Buffer.alloc(0);
  let parsed = false;
  let expectedHeaderBytes = 0;

  socket.on('data', (chunk) => {
    if (parsed) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (expectedHeaderBytes === 0 && buffer.length >= 4) {
      expectedHeaderBytes = buffer.readUInt32BE(0);
      buffer = buffer.subarray(4);
    }
    if (expectedHeaderBytes > 0 && buffer.length >= expectedHeaderBytes) {
      const headerRaw = buffer.subarray(0, expectedHeaderBytes).toString('utf8');
      const bodyRemainder = buffer.subarray(expectedHeaderBytes);
      let headerObj: unknown = null;
      try {
        headerObj = JSON.parse(headerRaw);
      } catch {
        writeResponse(socket, { ok: false, error: 'invalid header json' });
        return;
      }
      const header = validateHeader(headerObj);
      if (!header) {
        writeResponse(socket, { ok: false, error: 'invalid header' });
        return;
      }
      parsed = true;
      handleUpload(socket, header, bodyRemainder);
    }
  });

  socket.on('error', () => {
    socket.destroy();
  });
}

export function startTcpUploadServer() {
  const server = net.createServer(onConnection);
  server.listen(config.tcpPort, config.host, () => {
    console.log(`[synobackup-core] tcp-upload listening on ${config.host}:${config.tcpPort}`);
  });
  server.on('error', (err) => {
    console.error('[synobackup-core] tcp-upload server error', err);
  });
  return server;
}

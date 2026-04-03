# Active Backup — Backend Upload API (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the server-side chunk store, upload session management, and REST endpoints that receive HTTPS backups from the Go agent.

**Architecture:** Content-addressed chunk store at `/mnt/storage/active-backup/chunks/<xx>/<sha256>`. Upload sessions tracked in memory. On `session/complete`, manifests are written to `/mnt/storage/active-backup/snapshots/<device-id>/<timestamp>/manifest.json`. A new Express router (`active-backup-upload.ts`) handles upload endpoints; the existing `active-backup.ts` gains snapshot listing endpoints. The shared device Map is extracted into `server/lib/active-backup-store.ts` so both routers can import it.

**Tech Stack:** TypeScript 5, Express 5, Node.js `fs`, `crypto`

---

## File Map

| File | Action |
|---|---|
| `server/lib/active-backup-store.ts` | Create — shared device store (Maps + interfaces + persistence) |
| `server/routes/active-backup.ts` | Modify — import from shared store, remove duplicates, add snapshot endpoints |
| `server/lib/chunk-store.ts` | Create — content-addressed chunk read/write/verify |
| `server/lib/upload-session-store.ts` | Create — in-memory upload session tracking |
| `server/routes/active-backup-upload.ts` | Create — upload API (session/start, chunk, session/complete, status) |
| `server/index.ts` | Modify — mount upload router |

---

### Task 1: Shared device store module

**Files:**
- Create: `server/lib/active-backup-store.ts`
- Modify: `server/routes/active-backup.ts`

Context: `devices`, `pendingAgents`, and `pendingTokens` Maps currently live inside `active-backup.ts`. The new upload router also needs them for device token validation. Moving them to a shared module avoids circular imports. The `loadData()` call at the bottom of the store module runs automatically on first import, so `active-backup.ts` no longer needs to call it explicitly.

- [ ] **Step 1.1: Create `server/lib/active-backup-store.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKUP_BASE_DIR =
  process.env.BACKUP_BASE_DIR || '/mnt/storage/active-backup';

export const DATA_FILE = path.join(__dirname, '../../data/active-backup.json');

export interface BackupVersion {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental';
  status: 'complete' | 'failed';
}

export interface Device {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  token: string;
  backupHost: string;
  backupShare: string;
  backupUsername: string;
  backupPassword: string;
  backupType: 'full' | 'incremental' | 'folders';
  backupPaths: string[];
  schedule: string;
  status: 'online' | 'offline' | 'backing-up';
  lastSeen: string;
  lastBackup: string | null;
  backupSize: number;
  versions: BackupVersion[];
  approved: boolean;
  pendingBackup: boolean;
  backupProgress: { percent: number; currentFile: string; speed: string } | null;
}

export interface PendingAgent {
  id: string;
  name: string;
  hostname: string;
  os: string;
  ip: string;
  requestedAt: string;
}

export const devices = new Map<string, Device>();
export const pendingAgents = new Map<string, PendingAgent>();
export const pendingTokens = new Map<
  string,
  {
    id: string;
    name: string;
    os: string;
    backupType: string;
    backupHost: string;
    backupShare: string;
    backupUsername: string;
    backupPassword: string;
  }
>();

export function saveData(): void {
  try {
    const payload = {
      devices: Array.from(devices.entries()),
      pendingAgents: Array.from(pendingAgents.entries()),
      pendingTokens: Array.from(pendingTokens.entries()),
    };
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('[active-backup] saveData error:', e);
  }
}

export function loadData(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const payload = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (payload.devices) {
      for (const [k, v] of payload.devices) devices.set(k, v as Device);
    }
    if (payload.pendingAgents) {
      for (const [k, v] of payload.pendingAgents) pendingAgents.set(k, v as PendingAgent);
    }
    if (payload.pendingTokens) {
      for (const [k, v] of payload.pendingTokens) pendingTokens.set(k, v as never);
    }
    console.log(
      `[active-backup] loaded ${devices.size} devices, ${pendingAgents.size} pending`
    );
  } catch (e) {
    console.error('[active-backup] loadData error:', e);
  }
}

// Load on module init so data is ready when routes import this module
loadData();
```

- [ ] **Step 1.2: Update imports in `server/routes/active-backup.ts`**

Read the file. Find the import block at the top (lines 1–14). Add this import right after the existing imports:

```typescript
import {
  devices,
  pendingAgents,
  pendingTokens,
  saveData,
  Device,
  PendingAgent,
  BACKUP_BASE_DIR,
  DATA_FILE,
} from '../lib/active-backup-store.js';
```

- [ ] **Step 1.3: Remove duplicate declarations from `server/routes/active-backup.ts`**

Remove each of the following blocks (find by exact text, delete the whole block):

**Remove:**
```typescript
const DATA_FILE = path.join(__dirname, '../../data/active-backup.json');
```

**Remove:**
```typescript
const BACKUP_BASE_DIR = '/mnt/storage/active-backup';
```

**Remove the entire `saveData` function** (from `function saveData()` through its closing `}`).

**Remove the entire `loadData` function** (from `function loadData()` through its closing `}`).

**Remove the in-memory store block** — from the comment `// In-memory store` through the closing `}` of the `pendingTokens` Map declaration. This includes the `Device`, `BackupVersion`, and `PendingAgent` interface definitions and the three `Map` declarations. Keep the `InstallTokenMeta` interface — it is used only in active-backup.ts.

**Remove the standalone `loadData()` call** (around line 294):
```typescript
loadData();
```

- [ ] **Step 1.4: Verify TypeScript**

```bash
cd /path/to/homenas_3.0
npx tsc --noEmit 2>&1 | head -50
```

Expected: 0 errors. If you see "Cannot find name 'X'" for any of the removed declarations, check that the import in Step 1.2 covers them. Fix any remaining issues before proceeding.

- [ ] **Step 1.5: Commit**

```bash
git add server/lib/active-backup-store.ts server/routes/active-backup.ts
git commit -m "refactor(active-backup): extract shared device store to lib/active-backup-store"
```

---

### Task 2: Chunk store utility

**Files:**
- Create: `server/lib/chunk-store.ts`

Context: Content-addressed storage. Each chunk is stored at `CHUNKS_DIR/<first-2-chars>/<full-sha256>`. The 2-char prefix avoids single directories with millions of files (same layout Git uses for object storage). Writes are atomic via rename-after-write. `verifyChunk` is used by the upload endpoint to reject corrupt data before writing.

- [ ] **Step 2.1: Create `server/lib/chunk-store.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BACKUP_BASE_DIR } from './active-backup-store.js';

const CHUNKS_DIR = path.join(BACKUP_BASE_DIR, 'chunks');

export function chunkPath(hash: string): string {
  return path.join(CHUNKS_DIR, hash.slice(0, 2), hash);
}

export function hasChunk(hash: string): boolean {
  return fs.existsSync(chunkPath(hash));
}

export function writeChunk(hash: string, data: Buffer): void {
  const dest = chunkPath(hash);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Write to .tmp then rename so readers never see a partial file
  const tmp = dest + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dest);
}

export function readChunk(hash: string): Buffer {
  return fs.readFileSync(chunkPath(hash));
}

export function verifyChunk(hash: string, data: Buffer): boolean {
  const actual = crypto.createHash('sha256').update(data).digest('hex');
  return actual === hash;
}
```

- [ ] **Step 2.2: Commit**

```bash
git add server/lib/chunk-store.ts
git commit -m "feat(active-backup): add content-addressed chunk store"
```

---

### Task 3: Upload session store

**Files:**
- Create: `server/lib/upload-session-store.ts`

Context: Tracks in-progress upload sessions in memory. A session is created by `session/start`, holds the file manifest and the list of chunks that still need uploading, and is closed by `session/complete`. Sessions auto-expire after 24 hours.

- [ ] **Step 3.1: Create `server/lib/upload-session-store.ts`**

```typescript
import crypto from 'crypto';

export interface UploadFile {
  path: string;
  size: number;
  mtime: string;
  attrs: number;
  chunks: string[];
}

export interface UploadSession {
  id: string;
  deviceId: string;
  snapshotLabel: string;
  files: UploadFile[];
  uploadedChunks: Set<string>;
  neededChunks: string[];
  createdAt: string;
  status: 'in_progress' | 'complete' | 'failed';
}

const sessions = new Map<string, UploadSession>();

export function createSession(
  deviceId: string,
  snapshotLabel: string,
  files: UploadFile[],
  neededChunks: string[]
): UploadSession {
  const id = crypto.randomUUID();
  const session: UploadSession = {
    id,
    deviceId,
    snapshotLabel,
    files,
    uploadedChunks: new Set<string>(),
    neededChunks,
    createdAt: new Date().toISOString(),
    status: 'in_progress',
  };
  sessions.set(id, session);
  // Auto-expire after 24 h
  setTimeout(() => sessions.delete(id), 24 * 60 * 60 * 1000);
  return session;
}

export function getSession(id: string): UploadSession | undefined {
  return sessions.get(id);
}

export function markChunkUploaded(sessionId: string, hash: string): void {
  sessions.get(sessionId)?.uploadedChunks.add(hash);
}

export function completeSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.status = 'complete';
  // Keep for 60 s so the agent can poll and see completion
  setTimeout(() => sessions.delete(sessionId), 60_000);
}

export function getSessionProgress(session: UploadSession): {
  done: number;
  total: number;
  percent: number;
} {
  const total = session.neededChunks.length;
  const done = session.uploadedChunks.size;
  return { done, total, percent: total === 0 ? 100 : Math.round((done / total) * 100) };
}
```

- [ ] **Step 3.2: Commit**

```bash
git add server/lib/upload-session-store.ts
git commit -m "feat(active-backup): add upload session store"
```

---

### Task 4: Upload router

**Files:**
- Create: `server/routes/active-backup-upload.ts`

Context: Handles the 3-phase upload protocol. Device authentication uses the `Authorization: Bearer <token>` header validated against the `devices` Map. The chunk upload endpoint uses `express.raw()` as route-level middleware (not the global `express.json()`) to receive binary bodies. The `session/complete` endpoint writes `manifest.json` + `status.json` to disk and updates the device record.

- [ ] **Step 4.1: Create `server/routes/active-backup-upload.ts`**

```typescript
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
```

- [ ] **Step 4.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: 0 errors. The most common issue here is `express.raw` not being found — ensure `express` is imported as the default export (already done in the file above).

- [ ] **Step 4.3: Commit**

```bash
git add server/routes/active-backup-upload.ts
git commit -m "feat(active-backup): add HTTPS upload router (session/start, chunk, session/complete)"
```

---

### Task 5: Snapshot listing endpoints + mount router

**Files:**
- Modify: `server/routes/active-backup.ts`
- Modify: `server/index.ts`

Context: The UI needs to list available HTTPS snapshots and browse file trees. These endpoints read `manifest.json` and `status.json` from the snapshots directory. The upload router is mounted under the same prefix as the existing router.

- [ ] **Step 5.1: Add snapshot listing endpoints to `server/routes/active-backup.ts`**

Add these two handlers after the existing `activeBackupRouter.get('/devices/:id/download', ...)` handler:

```typescript
/** GET /devices/:id/snapshots — list HTTPS snapshots for a device */
activeBackupRouter.get('/devices/:id/snapshots', requireAuth, (req: Request, res: Response) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const snapshotBase = path.join(BACKUP_BASE_DIR, 'snapshots', device.id);
  if (!fs.existsSync(snapshotBase)) return res.json([]);

  try {
    const entries = fs.readdirSync(snapshotBase);
    const snapshots = entries
      .filter(name => fs.existsSync(path.join(snapshotBase, name, 'status.json')))
      .map(name => {
        try {
          const status = JSON.parse(
            fs.readFileSync(path.join(snapshotBase, name, 'status.json'), 'utf8')
          );
          const manifestPath = path.join(snapshotBase, name, 'manifest.json');
          const manifest = fs.existsSync(manifestPath)
            ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
            : null;
          return {
            id: name,
            timestamp: name,
            state: status.state as string,
            stats: manifest?.stats ?? null,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.timestamp > a!.timestamp ? 1 : -1));

    res.json(snapshots);
  } catch (err) {
    console.error('[active-backup] snapshots list error:', err);
    res.status(500).json({ error: 'Failed to read snapshots' });
  }
});

/** GET /devices/:id/snapshots/:snapshotId/tree — file list from manifest */
activeBackupRouter.get(
  '/devices/:id/snapshots/:snapshotId/tree',
  requireAuth,
  (req: Request, res: Response) => {
    const device = devices.get(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const manifestPath = path.join(
      BACKUP_BASE_DIR,
      'snapshots',
      device.id,
      req.params.snapshotId,
      'manifest.json'
    );
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      res.json({ files: manifest.files, stats: manifest.stats });
    } catch (err) {
      console.error('[active-backup] snapshot tree error:', err);
      res.status(500).json({ error: 'Failed to read manifest' });
    }
  }
);
```

- [ ] **Step 5.2: Mount upload router in `server/index.ts`**

Find:
```typescript
import { activeBackupRouter } from './routes/active-backup.js';
```

Add directly after it:
```typescript
import { activeBackupUploadRouter } from './routes/active-backup-upload.js';
```

Find:
```typescript
app.use('/api/active-backup', activeBackupRouter);
```

Replace with:
```typescript
app.use('/api/active-backup', activeBackupRouter);
app.use('/api/active-backup', activeBackupUploadRouter);
```

- [ ] **Step 5.3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: 0 errors.

- [ ] **Step 5.4: Integration smoke test**

Start the server (`npm run dev` or `node dist/index.js`), then run:

```bash
# Without token → should 401
curl -s -X POST http://localhost:3001/api/active-backup/upload/session/start \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Expected: {"error":"Device authentication required"}

# Get a real device token from data/active-backup.json — look for the "token" field
# Then:
curl -s -X POST http://localhost:3001/api/active-backup/upload/session/start \
  -H "Authorization: Bearer REPLACE_WITH_REAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snapshot_label":"2026-04-03_test","files":[{"path":"C:\\test.txt","size":11,"mtime":"2026-04-03T10:00:00Z","attrs":32,"chunks":["a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"]}]}' | jq .
# Expected: {"session_id":"<uuid>","needed":["a665..."]}

# Snapshot list for that device (replace DEVICE_ID and use a user JWT)
curl -s http://localhost:3001/api/active-backup/devices/DEVICE_ID/snapshots \
  -H "Authorization: Bearer USER_JWT" | jq .
# Expected: [] (no snapshots yet, or list of existing ones)
```

- [ ] **Step 5.5: Commit**

```bash
git add server/routes/active-backup.ts server/index.ts
git commit -m "feat(active-backup): add snapshot listing endpoints and mount upload router"
```

---

## Final verification checklist

- [ ] `POST /api/active-backup/upload/session/start` without token → 401
- [ ] `POST /api/active-backup/upload/session/start` with valid device token → `{ session_id, needed }`
- [ ] `POST /api/active-backup/upload/chunk/:sha256` with binary body + correct SHA256 → `{ ok: true }`, chunk file appears on disk
- [ ] `POST /api/active-backup/upload/chunk/:sha256` with wrong SHA256 → 400 mismatch error
- [ ] `POST /api/active-backup/upload/session/complete` → `manifest.json` + `status.json` written to snapshots dir; device lastBackup updated
- [ ] `GET /api/active-backup/devices/:id/snapshots` → lists completed snapshots
- [ ] `GET /api/active-backup/devices/:id/snapshots/:id/tree` → returns files array from manifest
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] Existing device management endpoints still work (not broken by Task 1 refactor)

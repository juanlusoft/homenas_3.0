# Active Backup — UI + Restore Streaming (Plan C of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a snapshot explorer to the Active Backup UI (browse files from a completed snapshot, download individual files or full snapshot as ZIP) and implement the server-side restore streaming endpoints.

**Architecture:** Two new backend endpoints in `active-backup-upload.ts` — one that reconstructs a single file from chunks and streams it, and one that streams a full snapshot as a ZIP. The UI gets a new `SnapshotExplorer` component that fetches the file tree from `GET /devices/:id/snapshots/:snapshotId/tree` (added in Plan A) and renders a browsable directory tree with download buttons.

**Tech Stack:** TypeScript 5, Express 5, Node.js `stream`/`zlib`, React 19, existing `authFetch`

**Depends on:** Plan A (snapshot listing endpoints + chunk store) and at least one completed backup (from Plan B or a manually created manifest).

---

## File Map

| File | Action |
|---|---|
| `server/routes/active-backup-upload.ts` | Modify — add file restore endpoint + ZIP snapshot endpoint |
| `src/components/ActiveBackup/SnapshotExplorer.tsx` | Create — file tree browser + download buttons |
| `src/pages/ActiveBackupPage.tsx` | Modify — add snapshot explorer panel to device detail view |

---

### Task 1: File restore endpoint

**Files:**
- Modify: `server/routes/active-backup-upload.ts`

Context: `GET /upload/restore/file` reads a file's chunk list from a snapshot manifest, concatenates the chunks from the chunk store, and streams the result to the client. The path is URL-encoded because Windows paths contain backslashes.

- [ ] **Step 1.1: Add the restore/file endpoint to `active-backup-upload.ts`**

Add this handler at the bottom of `server/routes/active-backup-upload.ts`, after the session/status endpoint:

```typescript
import { requireAuth } from '../middleware/auth.js';
import { readChunk } from '../lib/chunk-store.js';
```

Add these imports at the top of the file (alongside the existing imports already there). Then add the endpoint:

```typescript
// ── GET /upload/restore/file ──────────────────────────────────────────────────
// Reconstructs a single file from chunks and streams it to the browser.
// Query params: deviceId, snapshotId, filePath (URL-encoded Windows path)

activeBackupUploadRouter.get(
  '/upload/restore/file',
  requireAuth,
  (req: Request, res: Response) => {
    const { deviceId, snapshotId, filePath } = req.query as {
      deviceId?: string;
      snapshotId?: string;
      filePath?: string;
    };

    if (!deviceId || !snapshotId || !filePath) {
      res.status(400).json({ error: 'deviceId, snapshotId, filePath are required' });
      return;
    }

    const manifestPath = path.join(
      BACKUP_BASE_DIR,
      'snapshots',
      deviceId,
      snapshotId,
      'manifest.json'
    );

    if (!fs.existsSync(manifestPath)) {
      res.status(404).json({ error: 'Snapshot not found' });
      return;
    }

    let manifest: { files: Array<{ path: string; size: number; chunks: string[] }> };
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      res.status(500).json({ error: 'Failed to read manifest' });
      return;
    }

    // Normalize separators for comparison (manifest stores forward slashes)
    const normalizedTarget = filePath.replace(/\\/g, '/');
    const fileEntry = manifest.files.find(f => f.path.replace(/\\/g, '/') === normalizedTarget);

    if (!fileEntry) {
      res.status(404).json({ error: 'File not found in snapshot' });
      return;
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileEntry.size);

    // Stream chunks one by one — no need to buffer the whole file
    try {
      for (const hash of fileEntry.chunks) {
        const chunk = readChunk(hash);
        res.write(chunk);
      }
      res.end();
    } catch (err) {
      console.error('[restore] file stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Chunk read error' });
      } else {
        res.destroy();
      }
    }
  }
);
```

- [ ] **Step 1.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 1.3: Smoke test**

```bash
# Start server, then (assuming a completed snapshot exists):
curl -s "http://localhost:3001/api/active-backup/upload/restore/file?deviceId=DEVICE_ID&snapshotId=SNAPSHOT_ID&filePath=Users%2FJuan%2FDocuments%2Ftest.txt" \
  -H "Authorization: Bearer USER_JWT" \
  --output /tmp/restored-test.txt

ls -la /tmp/restored-test.txt
# File should appear with correct size
```

- [ ] **Step 1.4: Commit**

```bash
git add server/routes/active-backup-upload.ts
git commit -m "feat(active-backup): add file restore streaming endpoint"
```

---

### Task 2: ZIP snapshot endpoint

**Files:**
- Modify: `server/routes/active-backup-upload.ts`

Context: Allows downloading an entire snapshot as a ZIP. Uses Node's built-in `zlib` — but ZIP format is not natively in `zlib`. The correct approach is to write a simple uncompressed ZIP (STORE method, no compression) which avoids a dependency on `archiver` or similar. Files are streamed directly from the chunk store into the ZIP. This works for home NAS use where files are already compressed (photos, videos).

- [ ] **Step 2.1: Add ZIP helper function to `active-backup-upload.ts`**

Add this import at the top of the file:
```typescript
import { Response } from 'express';
```
(Already imported as part of the Router imports — skip if already present.)

Add the ZIP streaming helpers and endpoint at the bottom of the file:

```typescript
// ── Minimal uncompressed ZIP writer ──────────────────────────────────────────
// Writes a STORE (no compression) ZIP to a Response stream.
// Avoids any npm dependency. Sufficient for a restore download.

function uint16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function writeZipSnapshot(
  res: Response,
  manifest: { files: Array<{ path: string; size: number; chunks: string[] }> }
): void {
  const centralDir: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const fileEntry of manifest.files) {
    // Use forward slashes in ZIP paths (standard)
    const zipPath = fileEntry.path.replace(/\\/g, '/');
    const nameBytes = Buffer.from(zipPath, 'utf8');

    // Compute CRC32 and collect data buffers
    let crc = 0xffffffff;
    const dataBuffers: Buffer[] = [];
    let actualSize = 0;

    for (const hash of fileEntry.chunks) {
      const chunk = readChunk(hash);
      dataBuffers.push(chunk);
      actualSize += chunk.length;
      // Update CRC32
      for (const byte of chunk) {
        crc ^= byte;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    // Local file header
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      uint16LE(20),                           // version needed
      uint16LE(0),                            // flags
      uint16LE(0),                            // compression: STORE
      uint16LE(dosTime),
      uint16LE(dosDate),
      uint32LE(crc),
      uint32LE(actualSize),                   // compressed size = uncompressed
      uint32LE(actualSize),
      uint16LE(nameBytes.length),
      uint16LE(0),                            // extra field length
      nameBytes,
    ]);

    // Central directory entry (for end-of-archive)
    centralDir.push(Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      uint16LE(20),                           // version made by
      uint16LE(20),                           // version needed
      uint16LE(0),                            // flags
      uint16LE(0),                            // compression: STORE
      uint16LE(dosTime),
      uint16LE(dosDate),
      uint32LE(crc),
      uint32LE(actualSize),
      uint32LE(actualSize),
      uint16LE(nameBytes.length),
      uint16LE(0),                            // extra
      uint16LE(0),                            // comment
      uint16LE(0),                            // disk start
      uint16LE(0),                            // internal attrs
      uint32LE(0),                            // external attrs
      uint32LE(offset),                       // local header offset
      nameBytes,
    ]));

    offset += localHeader.length + actualSize;

    res.write(localHeader);
    for (const buf of dataBuffers) res.write(buf);
  }

  // Write central directory
  const cdStart = offset;
  let cdSize = 0;
  for (const entry of centralDir) {
    res.write(entry);
    cdSize += entry.length;
  }

  // End of central directory record
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
    uint16LE(0),                            // disk number
    uint16LE(0),                            // disk with CD
    uint16LE(manifest.files.length),
    uint16LE(manifest.files.length),
    uint32LE(cdSize),
    uint32LE(cdStart),
    uint16LE(0),                            // comment length
  ]);
  res.write(eocd);
  res.end();
}

// ── GET /upload/restore/snapshot ─────────────────────────────────────────────
// Streams a full snapshot as an uncompressed ZIP.
// Query params: deviceId, snapshotId

activeBackupUploadRouter.get(
  '/upload/restore/snapshot',
  requireAuth,
  (req: Request, res: Response) => {
    const { deviceId, snapshotId } = req.query as { deviceId?: string; snapshotId?: string };

    if (!deviceId || !snapshotId) {
      res.status(400).json({ error: 'deviceId and snapshotId are required' });
      return;
    }

    const manifestPath = path.join(
      BACKUP_BASE_DIR, 'snapshots', deviceId, snapshotId, 'manifest.json'
    );

    if (!fs.existsSync(manifestPath)) {
      res.status(404).json({ error: 'Snapshot not found' });
      return;
    }

    let manifest: { files: Array<{ path: string; size: number; chunks: string[] }> };
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      res.status(500).json({ error: 'Failed to read manifest' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="snapshot-${snapshotId}.zip"`);

    try {
      writeZipSnapshot(res, manifest);
    } catch (err) {
      console.error('[restore] snapshot ZIP error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'ZIP generation error' });
      } else {
        res.destroy();
      }
    }
  }
);
```

- [ ] **Step 2.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 2.3: Commit**

```bash
git add server/routes/active-backup-upload.ts
git commit -m "feat(active-backup): add full snapshot ZIP download endpoint"
```

---

### Task 3: SnapshotExplorer component

**Files:**
- Create: `src/components/ActiveBackup/SnapshotExplorer.tsx`

Context: Fetches the snapshot list for a device, lets the user select one, shows the file tree grouped by top-level directory, and provides download buttons. Uses `authFetch` (already used throughout the app — import from wherever it's used in `FilesPage.tsx`). The component is self-contained: it fetches its own data and handles loading/error states.

- [ ] **Step 3.1: Find where authFetch is defined**

```bash
grep -r "export.*authFetch\|function authFetch" src/
```

Note the import path for use in the component.

- [ ] **Step 3.2: Create `src/components/ActiveBackup/SnapshotExplorer.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { authFetch } from '../../lib/authFetch'; // adjust path from Step 3.1

interface Snapshot {
  id: string;
  timestamp: string;
  state: string;
  stats: {
    files_total: number;
    bytes_total: number;
    chunks_new: number;
    chunks_deduped: number;
    bytes_saved: number;
  } | null;
}

interface BackupFile {
  path: string;
  size: number;
  mtime: string;
  chunks: string[];
}

interface Props {
  deviceId: string;
  deviceName: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function SnapshotExplorer({ deviceId, deviceName }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingSnapshots(true);
    authFetch(`/active-backup/devices/${deviceId}/snapshots`)
      .then(r => r.json())
      .then((data: Snapshot[]) => {
        setSnapshots(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError('Failed to load snapshots'))
      .finally(() => setLoadingSnapshots(false));
  }, [deviceId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingFiles(true);
    setFiles([]);
    authFetch(`/active-backup/devices/${deviceId}/snapshots/${selectedId}/tree`)
      .then(r => r.json())
      .then((data: { files: BackupFile[] }) => setFiles(data.files || []))
      .catch(() => setError('Failed to load file tree'))
      .finally(() => setLoadingFiles(false));
  }, [deviceId, selectedId]);

  function downloadFile(filePath: string) {
    const params = new URLSearchParams({ deviceId, snapshotId: selectedId!, filePath });
    authFetch(`/active-backup/upload/restore/file?${params}`)
      .then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filePath.split(/[/\\]/).pop() || 'file';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  function downloadSnapshot() {
    const params = new URLSearchParams({ deviceId, snapshotId: selectedId! });
    authFetch(`/active-backup/upload/restore/snapshot?${params}`)
      .then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot-${selectedId}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  if (loadingSnapshots) return <div className="text-sm text-muted-foreground">Cargando snapshots...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (snapshots.length === 0) return <div className="text-sm text-muted-foreground">Sin snapshots disponibles.</div>;

  const selectedSnapshot = snapshots.find(s => s.id === selectedId);

  // Group files by top-level directory
  const groups = new Map<string, BackupFile[]>();
  for (const f of files) {
    const parts = f.path.replace(/\\/g, '/').split('/');
    const topDir = parts.length > 1 ? parts[0] : '(raíz)';
    if (!groups.has(topDir)) groups.set(topDir, []);
    groups.get(topDir)!.push(f);
  }

  return (
    <div className="space-y-4">
      {/* Snapshot selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Snapshot:</label>
        <select
          className="text-sm border rounded px-2 py-1 bg-background"
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value)}
        >
          {snapshots.map(s => (
            <option key={s.id} value={s.id}>
              {s.timestamp} — {s.state}
            </option>
          ))}
        </select>
        {selectedSnapshot?.stats && (
          <span className="text-xs text-muted-foreground">
            {selectedSnapshot.stats.files_total.toLocaleString()} archivos ·{' '}
            {formatBytes(selectedSnapshot.stats.bytes_total)} ·{' '}
            {formatBytes(selectedSnapshot.stats.bytes_saved)} ahorrados
          </span>
        )}
        <button
          onClick={downloadSnapshot}
          className="ml-auto text-xs border rounded px-3 py-1 hover:bg-muted"
        >
          Descargar ZIP completo
        </button>
      </div>

      {/* File tree */}
      {loadingFiles ? (
        <div className="text-sm text-muted-foreground">Cargando árbol de archivos...</div>
      ) : (
        <div className="border rounded divide-y max-h-96 overflow-y-auto text-sm">
          {Array.from(groups.entries()).map(([dir, dirFiles]) => (
            <details key={dir} className="group">
              <summary className="px-3 py-2 cursor-pointer hover:bg-muted font-medium flex items-center gap-2">
                <span>📁</span> {dir}
                <span className="text-xs text-muted-foreground ml-auto">
                  {dirFiles.length} archivos
                </span>
              </summary>
              <div className="divide-y">
                {dirFiles.map(f => {
                  const filename = f.path.replace(/\\/g, '/').split('/').pop() || f.path;
                  return (
                    <div
                      key={f.path}
                      className="flex items-center gap-2 px-6 py-1.5 hover:bg-muted/50"
                    >
                      <span className="flex-1 truncate text-xs">{filename}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        onClick={() => downloadFile(f.path)}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Descargar
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3.3: Fix the authFetch import path**

From Step 3.1, you found where `authFetch` is exported. Update the import at the top of `SnapshotExplorer.tsx` to match the actual path. Common locations:
- `../../lib/authFetch`
- `../../utils/authFetch`
- `../../hooks/useAuthFetch` (if it's a hook, use `const authFetch = useAuthFetch()` inside the component instead)

Grep to find it and fix the import accordingly.

- [ ] **Step 3.4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. The most common issue is the authFetch import path — fix it per Step 3.3.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/ActiveBackup/SnapshotExplorer.tsx
git commit -m "feat(active-backup): add SnapshotExplorer component with file tree + download"
```

---

### Task 4: Integrate SnapshotExplorer into ActiveBackupPage

**Files:**
- Modify: `src/pages/ActiveBackupPage.tsx`

Context: The existing ActiveBackupPage shows a list of devices. When a device is selected, it shows device details. We add the SnapshotExplorer below the device details, shown only for devices that have at least one snapshot (checked by whether the HTTPS backup protocol is in use — we can show it always and let the component handle the "no snapshots" empty state).

- [ ] **Step 4.1: Read `src/pages/ActiveBackupPage.tsx`**

Read the file to understand the current structure: where device details are rendered, what component handles the selected device view.

- [ ] **Step 4.2: Add SnapshotExplorer import**

Find the existing imports at the top of `ActiveBackupPage.tsx`. Add:

```tsx
import { SnapshotExplorer } from '../components/ActiveBackup/SnapshotExplorer';
```

- [ ] **Step 4.3: Add SnapshotExplorer to the device detail panel**

Find the JSX section that renders device details (look for where `selectedDevice` is used). After the existing device detail content, add:

```tsx
{selectedDevice && (
  <div className="mt-6 space-y-3">
    <h3 className="text-sm font-semibold">Snapshots HTTPS</h3>
    <SnapshotExplorer
      deviceId={selectedDevice.id}
      deviceName={selectedDevice.name}
    />
  </div>
)}
```

Place this immediately after the existing `DeviceDetail` component usage or after the device backup status section.

- [ ] **Step 4.4: Verify the page renders without errors**

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to Active Backup, select a device. Verify:
- "Snapshots HTTPS" section appears below device details
- If no snapshots: "Sin snapshots disponibles." message
- If snapshots exist: snapshot selector + file tree

- [ ] **Step 4.5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/pages/ActiveBackupPage.tsx
git commit -m "feat(active-backup): integrate SnapshotExplorer into device detail panel"
```

---

## Final verification checklist

- [ ] `GET /api/active-backup/upload/restore/file?deviceId=X&snapshotId=Y&filePath=Z` → file downloads correctly, size matches manifest
- [ ] `GET /api/active-backup/upload/restore/snapshot?deviceId=X&snapshotId=Y` → ZIP downloads, opens correctly, contains all files
- [ ] SnapshotExplorer renders snapshot selector with correct timestamps
- [ ] File tree shows directories as collapsible groups
- [ ] "Descargar" button downloads the individual file
- [ ] "Descargar ZIP completo" downloads the full snapshot ZIP
- [ ] No snapshot → "Sin snapshots disponibles." message shown cleanly
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run build` → production build succeeds

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import { config } from './config.js';
import { blobPath, blobRoot, chunkPath, chunkRoot, devices, deviceRoot, parseInstallToken, pendingTokens, refsRoot, saveState, sessionStageDir, sessions, signInstallToken, versionDir } from './state.js';
import type { BackupSession, ChunkedFileDescriptor, Device, InstallTokenMeta, InventoryEntry, ProgressSample, RetentionPolicy, VersionManifest } from './types.js';

export const router = Router();
const STATE_SAVE_FILE_INTERVAL = 250;
const INVENTORY_FILE = '_inventory.ndjson';
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const STALLED_AFTER_MS = 30 * 1000;
const MAX_PROGRESS_SAMPLES = 12;

function readManifest(deviceId: string, sessionId: string): VersionManifest | null {
  const manifestPath = path.join(versionDir(deviceId, sessionId), '_manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as VersionManifest;
}

function inventoryPathForRoot(root: string) {
  return path.join(root, INVENTORY_FILE);
}

function inventoryPathForStage(deviceId: string, sessionId: string) {
  return inventoryPathForRoot(sessionStageDir(deviceId, sessionId));
}

function inventoryPathForVersion(deviceId: string, sessionId: string) {
  return inventoryPathForRoot(versionDir(deviceId, sessionId));
}

function appendInventoryEntry(deviceId: string, sessionId: string, entry: InventoryEntry) {
  fs.appendFileSync(inventoryPathForStage(deviceId, sessionId), `${JSON.stringify(entry)}\n`, 'utf8');
}

function readInventory(target: string) {
  if (!fs.existsSync(target)) return [] as InventoryEntry[];
  const latest = new Map<string, InventoryEntry>();
  for (const line of fs.readFileSync(target, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = JSON.parse(trimmed) as InventoryEntry;
    latest.set(entry.path, entry);
  }
  return Array.from(latest.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function walkFiles(root: string, currentDir: string, entries: string[] = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name === INVENTORY_FILE || entry.name === '_manifest.json') continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, fullPath, entries);
      continue;
    }
    if (!entry.isFile()) continue;
    entries.push(path.relative(root, fullPath).replace(/\\/g, '/'));
  }
  return entries;
}

function reconcileStageInventory(deviceId: string, sessionId: string) {
  const root = sessionStageDir(deviceId, sessionId);
  if (!fs.existsSync(root)) return [] as InventoryEntry[];

  const inventoryFile = inventoryPathForStage(deviceId, sessionId);
  const known = new Map(readInventory(inventoryFile).map((entry) => [entry.path, entry]));
  const discovered = walkFiles(root, root);
  let changed = false;

  for (const relativePath of discovered) {
    if (known.has(relativePath)) continue;
    const fullPath = path.join(root, relativePath);
    const stat = fs.statSync(fullPath);
    const entry: InventoryEntry = {
      path: relativePath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: sha256File(fullPath),
      indexedAt: new Date().toISOString(),
    };
    known.set(relativePath, entry);
    changed = true;
  }

  if (changed) {
    const body = Array.from(known.values())
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    fs.writeFileSync(inventoryFile, `${body}\n`, 'utf8');
  }

  return Array.from(known.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function readVersionInventory(deviceId: string, sessionId: string) {
  return readInventory(inventoryPathForVersion(deviceId, sessionId));
}

function findVersionInventoryEntry(deviceId: string, sessionId: string, requestedPath: string) {
  const normalized = requestedPath.replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  return readVersionInventory(deviceId, sessionId).find((entry) => entry.path === normalized) || null;
}

function inventorySummary(entries: InventoryEntry[]) {
  return {
    indexedFiles: entries.length,
    indexedBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
  };
}

function versionStorageSummary(entries: InventoryEntry[]) {
  const blobObjects = new Map<string, number>();
  const chunkObjects = new Map<string, number>();
  let logicalBytes = 0;

  for (const entry of entries) {
    logicalBytes += entry.size;
    const blobHash = String(entry.blobSha256 || entry.sha256 || '').trim().toLowerCase();
    if (blobHash && !blobObjects.has(blobHash)) {
      blobObjects.set(blobHash, entry.size);
    }
    const chunkBytes = Array.isArray(entry.chunkBytes) ? entry.chunkBytes : [];
    const fallbackChunkSize = Number(entry.chunkSize || 0);
    (entry.chunkSha256 || []).forEach((chunkHash, index) => {
      const normalized = String(chunkHash || '').trim().toLowerCase();
      if (!normalized || chunkObjects.has(normalized)) return;
      const existingChunkPath = chunkPath(normalized);
      const knownSize = chunkBytes[index] || fallbackChunkSize;
      chunkObjects.set(normalized, fs.existsSync(existingChunkPath) ? fs.statSync(existingChunkPath).size : knownSize);
    });
  }

  const uniqueBlobBytes = Array.from(blobObjects.values()).reduce((sum, size) => sum + size, 0);
  const uniqueChunkBytes = Array.from(chunkObjects.values()).reduce((sum, size) => sum + size, 0);
  return {
    blobObjects: blobObjects.size,
    chunkObjects: chunkObjects.size,
    uniqueBlobBytes,
    uniqueChunkBytes,
    estimatedStoredBytes: chunkObjects.size > 0 ? uniqueChunkBytes : uniqueBlobBytes,
    logicalBytes,
  };
}

function diffInventories(baseEntries: InventoryEntry[], targetEntries: InventoryEntry[]) {
  const baseMap = new Map(baseEntries.map((entry) => [entry.path, entry]));
  const targetMap = new Map(targetEntries.map((entry) => [entry.path, entry]));
  const added: InventoryEntry[] = [];
  const modified: Array<{ path: string; from: InventoryEntry; to: InventoryEntry }> = [];
  const deleted: InventoryEntry[] = [];
  const unchanged: InventoryEntry[] = [];

  for (const target of targetEntries) {
    const base = baseMap.get(target.path);
    if (!base) {
      added.push(target);
      continue;
    }
    if (base.sha256 !== target.sha256 || base.size !== target.size) {
      modified.push({ path: target.path, from: base, to: target });
      continue;
    }
    unchanged.push(target);
  }

  for (const base of baseEntries) {
    if (!targetMap.has(base.path)) {
      deleted.push(base);
    }
  }

  return {
    added,
    modified,
    deleted,
    unchangedCount: unchanged.length,
    summary: {
      addedFiles: added.length,
      modifiedFiles: modified.length,
      deletedFiles: deleted.length,
      unchangedFiles: unchanged.length,
      addedBytes: added.reduce((sum, entry) => sum + entry.size, 0),
      modifiedBytes: modified.reduce((sum, item) => sum + item.to.size, 0),
      deletedBytes: deleted.reduce((sum, entry) => sum + entry.size, 0),
    },
  };
}

function versionRoot(deviceId: string, sessionId: string) {
  return versionDir(deviceId, sessionId);
}

function latestPointerPath(deviceId: string) {
  return path.join(deviceRoot(deviceId), 'latest.json');
}

function listVersionManifests(deviceId: string) {
  const versionsPath = path.join(deviceRoot(deviceId), 'versions');
  if (!fs.existsSync(versionsPath)) return [] as VersionManifest[];
  return fs.readdirSync(versionsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readManifest(deviceId, entry.name))
    .filter((manifest): manifest is VersionManifest => Boolean(manifest))
    .sort((a, b) => String(b.completedAt || b.createdAt).localeCompare(String(a.completedAt || a.createdAt)));
}

function normalizeRetentionPolicy(input: unknown) {
  if (!input || typeof input !== 'object') return null as RetentionPolicy | null;
  const candidate = input as Record<string, unknown>;
  const normalizeNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  };
  return {
    keepLast: normalizeNumber(candidate.keepLast),
    keepDaily: normalizeNumber(candidate.keepDaily),
    keepWeekly: normalizeNumber(candidate.keepWeekly),
    keepMonthly: normalizeNumber(candidate.keepMonthly),
  };
}

function isoWeekKey(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function selectVersionsForRetention(versions: VersionManifest[], policy: RetentionPolicy) {
  const keepIds = new Set<string>();
  const keepByBucket = (limit: number | undefined, bucketKey: (manifest: VersionManifest) => string) => {
    if (!limit || limit <= 0) return;
    const seen = new Set<string>();
    for (const manifest of versions) {
      const key = bucketKey(manifest);
      if (seen.has(key)) continue;
      seen.add(key);
      keepIds.add(manifest.id);
      if (seen.size >= limit) break;
    }
  };

  const keepLast = policy.keepLast || 0;
  for (const manifest of versions.slice(0, keepLast)) {
    keepIds.add(manifest.id);
  }
  keepByBucket(policy.keepDaily, (manifest) => String(manifest.completedAt || manifest.createdAt).slice(0, 10));
  keepByBucket(policy.keepWeekly, (manifest) => isoWeekKey(new Date(String(manifest.completedAt || manifest.createdAt))));
  keepByBucket(policy.keepMonthly, (manifest) => String(manifest.completedAt || manifest.createdAt).slice(0, 7));

  const keep = versions.filter((manifest) => keepIds.has(manifest.id));
  const prune = versions.filter((manifest) => !keepIds.has(manifest.id));
  return { keep, prune };
}

function resolveVersionPath(deviceId: string, sessionId: string, requestedPath: string) {
  const normalized = requestedPath.replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  const root = path.resolve(versionRoot(deviceId, sessionId));
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }
  return { normalized, root, target };
}

function listTreeEntries(root: string, currentDir: string) {
  return fs.readdirSync(currentDir, { withFileTypes: true })
    .filter((entry) => entry.name !== '_manifest.json')
    .map((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      const stat = fs.statSync(fullPath);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      return {
        name: entry.name,
        path: relativePath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findUploadingSession(deviceId: string, volume: string) {
  return Array.from(sessions.values())
    .find((session) => session.deviceId === deviceId && session.status === 'uploading' && session.volume === volume);
}

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

function sha256Buffer(body: Buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(body);
  return hash.digest('hex');
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

function persistHashBlob(target: string, body: Buffer) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) return;
  const tempTarget = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempTarget, body);
  try {
    fs.renameSync(tempTarget, target);
  } catch {
    fs.rmSync(tempTarget, { force: true });
  }
}

function ensureChunkBlobs(body: Buffer, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunkSha256: string[] = [];
  const chunkBytes: number[] = [];
  for (let offset = 0; offset < body.length; offset += chunkSize) {
    const chunk = body.subarray(offset, Math.min(offset + chunkSize, body.length));
    const hash = sha256Buffer(chunk);
    persistHashBlob(chunkPath(hash), chunk);
    chunkSha256.push(hash);
    chunkBytes.push(chunk.length);
  }
  return {
    chunkSize,
    chunkCount: chunkSha256.length,
    chunkSha256,
    chunkBytes,
  };
}

function loadChunkDescriptor(body: unknown): ChunkedFileDescriptor | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  const chunkSha256 = Array.isArray(candidate.chunkSha256)
    ? candidate.chunkSha256.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const chunkBytes = Array.isArray(candidate.chunkBytes)
    ? candidate.chunkBytes.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const descriptor: ChunkedFileDescriptor = {
    path: String(candidate.path || '').replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, ''),
    size: Number(candidate.size || 0),
    modifiedAt: String(candidate.modifiedAt || ''),
    sha256: String(candidate.sha256 || '').trim().toLowerCase(),
    chunkSize: Number(candidate.chunkSize || 0),
    chunkSha256,
    chunkBytes,
  };
  if (!descriptor.path || !descriptor.sha256 || descriptor.size < 0 || descriptor.chunkSha256.length === 0) {
    return null;
  }
  if (descriptor.chunkBytes && descriptor.chunkBytes.length > 0 && descriptor.chunkBytes.length !== descriptor.chunkSha256.length) {
    return null;
  }
  if ((!descriptor.chunkBytes || descriptor.chunkBytes.length === 0) && descriptor.chunkSize <= 0) {
    return null;
  }
  return descriptor;
}

function resolveStageTarget(deviceId: string, sessionId: string, relativePath: string) {
  const normalized = relativePath.replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const root = path.resolve(sessionStageDir(deviceId, sessionId));
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }
  return { normalized, root, target };
}

function readLatestInventoryEntry(deviceId: string, sessionId: string, normalizedPath: string) {
  const entries = readInventory(inventoryPathForStage(deviceId, sessionId));
  return entries.find((entry) => entry.path === normalizedPath) || null;
}

function appendOrRewriteInventoryEntry(deviceId: string, sessionId: string, entry: InventoryEntry) {
  const inventoryFile = inventoryPathForStage(deviceId, sessionId);
  const latest = new Map(readInventory(inventoryFile).map((existing) => [existing.path, existing]));
  latest.set(entry.path, entry);
  const body = Array.from(latest.values())
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => JSON.stringify(item))
    .join('\n');
  fs.writeFileSync(inventoryFile, `${body}\n`, 'utf8');
}

function buildBlobFromChunks(targetPath: string, chunkSha256: string[]) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempTarget = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const handle = fs.openSync(tempTarget, 'w');
  try {
    for (const hash of chunkSha256) {
      const source = chunkPath(hash);
      if (!fs.existsSync(source)) {
        throw new Error(`missing chunk ${hash}`);
      }
      fs.writeSync(handle, fs.readFileSync(source));
    }
  } finally {
    fs.closeSync(handle);
  }
  try {
    fs.renameSync(tempTarget, targetPath);
  } catch {
    fs.rmSync(tempTarget, { force: true });
  }
}

function resolveVersionContent(deviceId: string, sessionId: string, requestedPath: string) {
  const resolved = resolveVersionPath(deviceId, sessionId, requestedPath);
  if (!resolved) return null;
  const inventoryEntry = findVersionInventoryEntry(deviceId, sessionId, resolved.normalized);
  const fileExists = fs.existsSync(resolved.target) && fs.statSync(resolved.target).isFile();
  const blobTarget = inventoryEntry?.blobSha256 ? blobPath(inventoryEntry.blobSha256) : null;
  const blobExists = blobTarget ? fs.existsSync(blobTarget) : false;
  const chunkTargets = (inventoryEntry?.chunkSha256 || []).map((hash) => chunkPath(hash));
  const hasAllChunks = chunkTargets.length > 0 && chunkTargets.every((target) => fs.existsSync(target));
  return {
    resolved,
    inventoryEntry,
    fileExists,
    blobTarget,
    blobExists,
    chunkTargets,
    hasAllChunks,
  };
}

function streamChunks(res: Response, chunkTargets: string[]) {
  for (const target of chunkTargets) {
    res.write(fs.readFileSync(target));
  }
  res.end();
}

function listHashObjects(root: string) {
  if (!fs.existsSync(root)) {
    return [] as Array<{ hash: string; size: number; path: string }>;
  }
  const entries: Array<{ hash: string; size: number; path: string }> = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(fullPath);
      entries.push({
        hash: entry.name.toLowerCase(),
        size: stat.size,
        path: fullPath,
      });
    }
  };
  walk(root);
  return entries.sort((a, b) => a.hash.localeCompare(b.hash));
}

function collectInventoryTargets() {
  const targets: Array<{ scope: 'version' | 'stage'; deviceId: string; sessionId: string; inventoryPath: string }> = [];
  for (const session of sessions.values()) {
    if (session.status === 'uploading') {
      const inventoryPath = inventoryPathForStage(session.deviceId, session.id);
      if (fs.existsSync(inventoryPath)) {
        targets.push({ scope: 'stage', deviceId: session.deviceId, sessionId: session.id, inventoryPath });
      }
    }
  }
  for (const device of devices.values()) {
    const versionsPath = path.join(deviceRoot(device.id), 'versions');
    if (!fs.existsSync(versionsPath)) continue;
    for (const entry of fs.readdirSync(versionsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const inventoryPath = inventoryPathForVersion(device.id, entry.name);
      if (!fs.existsSync(inventoryPath)) continue;
      targets.push({ scope: 'version', deviceId: device.id, sessionId: entry.name, inventoryPath });
    }
  }
  return targets;
}

function collectStorageReferences() {
  const blobs = new Map<string, { refs: number; bytes: number }>();
  const chunks = new Map<string, { refs: number; bytes: number }>();
  let files = 0;

  for (const target of collectInventoryTargets()) {
    const entries = readInventory(target.inventoryPath);
    for (const entry of entries) {
      files += 1;
      const blobHash = String(entry.blobSha256 || entry.sha256 || '').trim().toLowerCase();
      if (blobHash) {
        const current = blobs.get(blobHash) || { refs: 0, bytes: entry.size };
        current.refs += 1;
        current.bytes = Math.max(current.bytes, entry.size);
        blobs.set(blobHash, current);
      }
      const entryChunkBytes = Array.isArray(entry.chunkBytes) ? entry.chunkBytes : [];
      (entry.chunkSha256 || []).forEach((chunkHash, index) => {
        const normalized = String(chunkHash || '').trim().toLowerCase();
        if (!normalized) return;
        const current = chunks.get(normalized) || { refs: 0, bytes: entryChunkBytes[index] || entry.chunkSize || 0 };
        current.refs += 1;
        current.bytes = Math.max(current.bytes, entryChunkBytes[index] || entry.chunkSize || 0);
        chunks.set(normalized, current);
      });
    }
  }

  return { blobs, chunks, files };
}

function persistReferenceSnapshot(snapshot: ReturnType<typeof collectStorageReferences>) {
  fs.mkdirSync(refsRoot(), { recursive: true });
  const createdAt = new Date().toISOString();
  fs.writeFileSync(path.join(refsRoot(), 'blobs.json'), JSON.stringify({
    createdAt,
    total: snapshot.blobs.size,
    entries: Array.from(snapshot.blobs.entries()).map(([hash, meta]) => ({ hash, ...meta })),
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(refsRoot(), 'chunks.json'), JSON.stringify({
    createdAt,
    total: snapshot.chunks.size,
    entries: Array.from(snapshot.chunks.entries()).map(([hash, meta]) => ({ hash, ...meta })),
  }, null, 2), 'utf8');
}

function sweepHashStore(root: string, references: Map<string, { refs: number; bytes: number }>, dryRun: boolean) {
  const storeObjects = listHashObjects(root);
  const removed: Array<{ hash: string; size: number; path: string }> = [];
  let removedBytes = 0;

  for (const object of storeObjects) {
    if (references.has(object.hash)) continue;
    removed.push(object);
    removedBytes += object.size;
    if (!dryRun) {
      fs.rmSync(object.path, { force: true });
    }
  }

  return {
    totalObjects: storeObjects.length,
    totalBytes: storeObjects.reduce((sum, object) => sum + object.size, 0),
    referencedObjects: references.size,
    orphanObjects: removed.length,
    orphanBytes: removedBytes,
    removed: removed.slice(0, 50),
  };
}

function storageGcReport(dryRun: boolean) {
  const snapshot = collectStorageReferences();
  persistReferenceSnapshot(snapshot);
  return {
    dryRun,
    createdAt: new Date().toISOString(),
    inventoryFiles: snapshot.files,
    blobs: sweepHashStore(blobRoot(), snapshot.blobs, dryRun),
    chunks: sweepHashStore(chunkRoot(), snapshot.chunks, dryRun),
  };
}

function gcMetaPath() {
  return path.join(refsRoot(), 'gc-meta.json');
}

function readGcMeta() {
  if (!fs.existsSync(gcMetaPath())) return null as null | { lastRunAt?: string };
  return JSON.parse(fs.readFileSync(gcMetaPath(), 'utf8')) as { lastRunAt?: string };
}

function writeGcMeta(meta: { lastRunAt: string }) {
  fs.mkdirSync(refsRoot(), { recursive: true });
  fs.writeFileSync(gcMetaPath(), JSON.stringify(meta, null, 2), 'utf8');
}

function maybeRunAutomaticGc(reason: string) {
  const now = Date.now();
  const meta = readGcMeta();
  const lastRunAt = meta?.lastRunAt ? Date.parse(meta.lastRunAt) : 0;
  if (lastRunAt && !Number.isNaN(lastRunAt) && now - lastRunAt < config.autoGcCooldownMs) {
    return {
      triggered: false,
      reason,
      skipped: 'cooldown',
      cooldownMs: config.autoGcCooldownMs,
      lastRunAt: meta?.lastRunAt || null,
    };
  }
  const report = storageGcReport(false);
  writeGcMeta({ lastRunAt: report.createdAt });
  return {
    triggered: true,
    reason,
    report,
  };
}

function refreshDeviceLatestVersion(device: Device, remainingVersions: VersionManifest[]) {
  const latestPointer = latestPointerPath(device.id);
  if (remainingVersions.length > 0) {
    const latest = remainingVersions[0];
    fs.writeFileSync(latestPointer, JSON.stringify({
      sessionId: latest.id,
      completedAt: latest.completedAt,
      totalBytes: latest.totalBytes,
      fileCount: latest.fileCount,
    }, null, 2), 'utf8');
    device.lastBackup = latest.completedAt;
    device.backupSize = latest.totalBytes;
    return;
  }
  fs.rmSync(latestPointer, { force: true });
  device.lastBackup = null;
  device.backupSize = 0;
}

function deletePublishedVersion(device: Device, sessionId: string) {
  const manifest = readManifest(device.id, sessionId);
  if (!manifest) return null;
  fs.rmSync(versionDir(device.id, sessionId), { recursive: true, force: true });
  const remainingVersions = listVersionManifests(device.id);
  refreshDeviceLatestVersion(device, remainingVersions);
  return { manifest, remainingVersions };
}

function sessionProgressPayload(device: Device, session: BackupSession) {
  const samples = (session.progressSamples || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const first = samples[0] || null;
  const last = samples[samples.length - 1] || null;
  const elapsedSeconds = first && last ? Math.max(0, (Date.parse(last.at) - Date.parse(first.at)) / 1000) : 0;
  const bytesPerSecond = first && last && elapsedSeconds > 0
    ? Math.max(0, (last.uploadedBytes - first.uploadedBytes) / elapsedSeconds)
    : 0;
  const filesPerSecond = first && last && elapsedSeconds > 0
    ? Math.max(0, (last.uploadedFiles - first.uploadedFiles) / elapsedSeconds)
    : 0;
  const stalled = session.status === 'uploading' && session.lastActivityAt
    ? Date.now() - Date.parse(session.lastActivityAt) > STALLED_AFTER_MS
    : false;
  return {
    device: {
      id: device.id,
      name: device.name,
      hostname: device.hostname,
      status: device.status,
      lastSeen: device.lastSeen,
    },
    session: {
      id: session.id,
      status: session.status,
      volume: session.volume,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      totalBytes: session.totalBytes,
      fileCount: session.fileCount,
      lastPath: session.lastPath || null,
      reusedFiles: session.reusedFiles || 0,
      knownRemoteSize: session.knownRemoteSize || 0,
      lastActivityAt: session.lastActivityAt || null,
      stats: {
        samples: samples.length,
        bytesPerSecond,
        filesPerSecond,
        stalled,
      },
      error: session.error,
    },
  };
}

function appendSessionSample(session: BackupSession, sample: ProgressSample) {
  const samples = session.progressSamples ? session.progressSamples.slice() : [];
  const last = samples[samples.length - 1];
  if (last && last.uploadedBytes === sample.uploadedBytes && last.uploadedFiles === sample.uploadedFiles && last.reusedFiles === sample.reusedFiles) {
    return;
  }
  samples.push(sample);
  while (samples.length > MAX_PROGRESS_SAMPLES) {
    samples.shift();
  }
  session.progressSamples = samples;
}

function requireAdmin(req: Request, res: Response, next: () => void) {
  const adminToken = Array.isArray(req.headers['x-sb-admin-token'])
    ? req.headers['x-sb-admin-token'][0]
    : req.headers['x-sb-admin-token'];
  if (adminToken !== config.adminToken) {
    res.status(401).json({ error: 'Admin token required' });
    return;
  }
  next();
}

function requireAgent(req: Request, res: Response) {
  const deviceId = String(req.params.id || '');
  const device = devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return null;
  }
  const auth = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : (req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== device.token) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  device.lastSeen = new Date().toISOString();
  return device;
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, devices: devices.size, sessions: sessions.size });
});

router.post('/admin/agents/generate/windows', (req, res) => requireAdmin(req, res, () => {
  const id = crypto.randomUUID().slice(0, 8);
  const meta: InstallTokenMeta = {
    id,
    name: String(req.body?.name || `windows-${id}`).trim(),
    os: 'Windows',
    mode: 'system-volume',
    issuedAt: new Date().toISOString(),
  };
  const token = signInstallToken(meta);
  pendingTokens.set(token, meta);
  saveState();
  res.json({
    deviceId: id,
    token,
    mode: meta.mode,
    nasUrl: config.publicBaseUrl,
  });
}));

router.get('/admin/devices', (req, res) => requireAdmin(req, res, () => {
  res.json(Array.from(devices.values()));
}));

router.put('/admin/devices/:id/retention-policy', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const policy = normalizeRetentionPolicy(req.body);
  if (!policy) return res.status(400).json({ error: 'Invalid retention policy' });
  device.retentionPolicy = policy;
  saveState();
  res.json({ success: true, deviceId: device.id, retentionPolicy: policy });
}));

router.post('/admin/devices/:id/retention/run', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const policy = normalizeRetentionPolicy(req.body?.policy) || device.retentionPolicy;
  if (!policy) return res.status(400).json({ error: 'Retention policy required' });
  const dryRun = String(req.query.dryRun ?? req.body?.dryRun ?? 'true').toLowerCase() !== 'false';
  const versions = listVersionManifests(device.id);
  const plan = selectVersionsForRetention(versions, policy);

  const deletedVersionIds: string[] = [];
  if (!dryRun) {
    for (const manifest of plan.prune) {
      const deleted = deletePublishedVersion(device, manifest.id);
      if (deleted) deletedVersionIds.push(manifest.id);
    }
    saveState();
  }

  const autoGc = dryRun || plan.prune.length === 0
    ? { triggered: false, reason: `retention:${device.id}`, skipped: dryRun ? 'dry-run' : 'nothing-to-prune' }
    : maybeRunAutomaticGc(`retention:${device.id}`);
  if (!dryRun && plan.prune.length > 0) {
    saveState();
  }

  res.json({
    success: true,
    dryRun,
    deviceId: device.id,
    retentionPolicy: policy,
    keep: plan.keep.map((item) => item.id),
    prune: plan.prune.map((item) => item.id),
    deletedVersionIds,
    autoGc,
  });
}));

router.get('/admin/storage/refs', (req, res) => requireAdmin(req, res, () => {
  const snapshot = collectStorageReferences();
  persistReferenceSnapshot(snapshot);
  res.json({
    createdAt: new Date().toISOString(),
    inventoryFiles: snapshot.files,
    blobs: {
      referencedObjects: snapshot.blobs.size,
      referencedBytes: Array.from(snapshot.blobs.values()).reduce((sum, item) => sum + item.bytes, 0),
    },
    chunks: {
      referencedObjects: snapshot.chunks.size,
      referencedBytes: Array.from(snapshot.chunks.values()).reduce((sum, item) => sum + item.bytes, 0),
    },
  });
}));

router.post('/admin/storage/gc', (req, res) => requireAdmin(req, res, () => {
  const dryRun = String(req.query.dryRun ?? req.body?.dryRun ?? 'true').toLowerCase() !== 'false';
  res.json(storageGcReport(dryRun));
}));

router.get('/admin/devices/:id/versions', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(listVersionManifests(device.id));
}));

router.get('/admin/devices/:id/versions/:sessionId/manifest', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const manifest = readManifest(device.id, req.params.sessionId);
  if (!manifest) return res.status(404).json({ error: 'Version not found' });

  const entries = readVersionInventory(device.id, req.params.sessionId);
  res.json({
    manifest: {
      ...manifest,
      inventory: inventorySummary(entries),
      storage: versionStorageSummary(entries),
    },
  });
}));

router.get('/admin/devices/:id/versions/:sessionId/diff', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const targetManifest = readManifest(device.id, req.params.sessionId);
  if (!targetManifest) return res.status(404).json({ error: 'Target version not found' });

  const compareTo = String(req.query.compareTo || '').trim();
  if (!compareTo) return res.status(400).json({ error: 'compareTo query required' });
  const baseManifest = readManifest(device.id, compareTo);
  if (!baseManifest) return res.status(404).json({ error: 'Base version not found' });

  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const diff = diffInventories(
    readVersionInventory(device.id, compareTo),
    readVersionInventory(device.id, req.params.sessionId),
  );

  res.json({
    baseVersion: baseManifest,
    targetVersion: targetManifest,
    summary: diff.summary,
    added: diff.added.slice(0, limit),
    modified: diff.modified.slice(0, limit),
    deleted: diff.deleted.slice(0, limit),
    truncated: {
      added: diff.added.length > limit,
      modified: diff.modified.length > limit,
      deleted: diff.deleted.length > limit,
    },
  });
}));

router.get('/admin/devices/:id/sessions/:sessionId/progress', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });
  res.json(sessionProgressPayload(device, session));
}));

router.delete('/admin/devices/:id/versions/:sessionId', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const deleted = deletePublishedVersion(device, req.params.sessionId);
  if (!deleted) return res.status(404).json({ error: 'Version not found' });

  const autoGc = maybeRunAutomaticGc(`delete-version:${device.id}:${req.params.sessionId}`);
  saveState();
  res.json({
    success: true,
    deletedVersionId: req.params.sessionId,
    remainingVersions: deleted.remainingVersions.map((item) => item.id),
    autoGc,
  });
}));

router.get('/admin/devices/:id/versions/:sessionId/files', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const manifest = readManifest(device.id, req.params.sessionId);
  if (!manifest) return res.status(404).json({ error: 'Version not found' });

  const relativeDir = String(req.query.path || '').replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const root = path.resolve(versionRoot(device.id, req.params.sessionId));
  const currentDir = path.resolve(root, relativeDir);
  if (currentDir !== root && !currentDir.startsWith(root + path.sep)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  res.json({
    version: manifest,
    currentPath: relativeDir,
    entries: listTreeEntries(root, currentDir),
  });
}));

router.get('/admin/devices/:id/versions/:sessionId/search', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const manifest = readManifest(device.id, req.params.sessionId);
  if (!manifest) return res.status(404).json({ error: 'Version not found' });

  const query = String(req.query.q || '').trim().toLowerCase();
  if (!query) return res.status(400).json({ error: 'q query required' });

  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const entries = readVersionInventory(device.id, req.params.sessionId)
    .filter((entry) => entry.path.toLowerCase().includes(query))
    .slice(0, limit);

  res.json({
    version: manifest,
    query,
    total: entries.length,
    entries,
  });
}));

router.get('/admin/devices/:id/versions/:sessionId/download', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const manifest = readManifest(device.id, req.params.sessionId);
  if (!manifest) return res.status(404).json({ error: 'Version not found' });

  const requestedPath = String(req.query.path || '');
  const content = resolveVersionContent(device.id, req.params.sessionId, requestedPath);
  if (!content) return res.status(400).json({ error: 'path query required' });
  if (content.fileExists) {
    return res.download(content.resolved.target, path.basename(content.resolved.target));
  }
  if (content.blobExists && content.blobTarget) {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(content.resolved.target)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    return fs.createReadStream(content.blobTarget).pipe(res);
  }
  if (content.hasAllChunks) {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(content.resolved.target)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    if (content.inventoryEntry?.size != null) {
      res.setHeader('Content-Length', String(content.inventoryEntry.size));
    }
    streamChunks(res, content.chunkTargets);
    return;
  }
  return res.status(404).json({ error: 'File content not available' });
}));

router.get('/agent/:id/sessions/:sessionId/inventory', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const entries = reconcileStageInventory(device.id, session.id);
  res.json({
    sessionId: session.id,
    total: entries.length,
    entries,
  });
});

router.post('/agent/:id/sessions/:sessionId/progress', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  session.lastPath = String(req.body?.lastPath || session.lastPath || '').replace(/\0/g, '').replace(/\\/g, '/').replace(/^\/+/, '') || null;
  session.reusedFiles = Number(req.body?.reusedFiles ?? session.reusedFiles ?? 0);
  session.knownRemoteSize = Number(req.body?.knownRemoteSize ?? session.knownRemoteSize ?? 0);
  session.fileCount = Number(req.body?.uploadedFiles ?? session.fileCount ?? 0);
  session.totalBytes = Number(req.body?.uploadedBytes ?? session.totalBytes ?? 0);
  session.lastActivityAt = String(req.body?.updatedAt || new Date().toISOString());
  appendSessionSample(session, {
    at: session.lastActivityAt,
    uploadedBytes: session.totalBytes,
    uploadedFiles: session.fileCount,
    reusedFiles: session.reusedFiles,
  });
  saveState();

  res.json({
    success: true,
    session: sessionProgressPayload(device, session).session,
  });
});

router.post('/admin/devices/:id/approve', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  device.approved = true;
  saveState();
  res.json({ success: true, device });
}));

router.post('/admin/devices/:id/trigger', (req, res) => requireAdmin(req, res, () => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (device.status === 'backing-up') return res.status(409).json({ error: 'Backup already in progress' });
  device.pendingJob = true;
  saveState();
  res.json({ success: true });
}));

router.post('/agent/activate', (req, res) => {
  const token = String(req.body?.token || '');
  const hostname = String(req.body?.hostname || '').trim();
  if (!token || !hostname) return res.status(400).json({ error: 'token and hostname required' });

  const tokenMeta = pendingTokens.get(token) || parseInstallToken(token);
  if (tokenMeta) pendingTokens.delete(token);

  const authToken = crypto.randomBytes(32).toString('hex');
  const existing = Array.from(devices.values()).find((device) => device.hostname === hostname);
  if (existing) {
    existing.token = authToken;
    existing.ip = String(req.body?.ip || req.ip || 'unknown');
    existing.lastSeen = new Date().toISOString();
    if (existing.status === 'offline') existing.status = 'online';
    saveState();
    return res.json({ deviceId: existing.id, authToken, message: 'Re-activated' });
  }

  const id = tokenMeta?.id || crypto.randomUUID().slice(0, 8);
  const device: Device = {
    id,
    name: tokenMeta?.name || hostname,
    hostname,
    os: String(req.body?.os || tokenMeta?.os || 'Windows'),
    ip: String(req.body?.ip || req.ip || 'unknown'),
    token: authToken,
    status: 'online',
    approved: false,
    lastSeen: new Date().toISOString(),
    pendingJob: false,
    lastBackup: null,
    backupSize: 0,
  };
  devices.set(id, device);
  fs.mkdirSync(deviceRoot(id), { recursive: true });
  saveState();
  res.json({ deviceId: id, authToken, message: 'Registered, waiting for admin approval' });
});

router.get('/agent/:id/job', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  if (!device.approved) return res.json({ approved: false, pendingJob: false });
  const pendingJob = device.pendingJob;
  if (pendingJob) {
    device.pendingJob = false;
    device.status = 'backing-up';
    saveState();
  }
  res.json({
    approved: true,
    pendingJob,
    mode: 'system-volume',
    volume: 'C:\\',
  });
});

router.post('/agent/:id/sessions/start', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const volume = String(req.body?.volume || 'C:\\');
  const snapshotPath = String(req.body?.snapshotPath || '');
  const existing = findUploadingSession(device.id, volume);
  if (existing) {
    existing.snapshotPath = snapshotPath || existing.snapshotPath;
    saveState();
    return res.json({ sessionId: existing.id, uploadBase: `/api/synobackup/agent/${device.id}/sessions/${existing.id}/files`, resumed: true });
  }
  const sessionId = crypto.randomUUID().slice(0, 8);
  const session: BackupSession = {
    id: sessionId,
    deviceId: device.id,
    createdAt: new Date().toISOString(),
    completedAt: null,
    snapshotPath,
    volume,
    status: 'uploading',
    totalBytes: 0,
    fileCount: 0,
    error: null,
    progressSamples: [],
  };
  sessions.set(sessionId, session);
  fs.mkdirSync(sessionStageDir(device.id, sessionId), { recursive: true });
  saveState();
  res.json({ sessionId, uploadBase: `/api/synobackup/agent/${device.id}/sessions/${sessionId}/files` });
});

router.post('/agent/:id/sessions/:sessionId/files/probe', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const descriptor = loadChunkDescriptor(req.body);
  if (!descriptor) return res.status(400).json({ error: 'Invalid chunk descriptor' });
  const resolved = resolveStageTarget(device.id, session.id, descriptor.path);
  if (!resolved) return res.status(403).json({ error: 'Access denied' });

  const current = readLatestInventoryEntry(device.id, session.id, resolved.normalized);
  if (current && current.sha256 === descriptor.sha256 && current.size === descriptor.size) {
    return res.json({ exists: true, missingChunks: [] });
  }

  const missingChunks = descriptor.chunkSha256.filter((hash) => !fs.existsSync(chunkPath(hash)));
  res.json({
    exists: false,
    missingChunks,
    knownChunks: descriptor.chunkSha256.length - missingChunks.length,
  });
});

router.put('/agent/:id/sessions/:sessionId/chunks/:sha256', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const requestedHash = String(req.params.sha256 || '').trim().toLowerCase();
  if (!requestedHash) return res.status(400).json({ error: 'sha256 required' });

  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const computedHash = sha256Buffer(body);
    if (computedHash !== requestedHash) {
      return res.status(400).json({ error: 'sha256 mismatch' });
    }
    persistHashBlob(chunkPath(requestedHash), body);
    res.json({ success: true, chunkSha256: requestedHash, size: body.length });
  });
});

router.post('/agent/:id/sessions/:sessionId/files/commit', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const descriptor = loadChunkDescriptor(req.body);
  if (!descriptor) return res.status(400).json({ error: 'Invalid chunk descriptor' });
  const resolved = resolveStageTarget(device.id, session.id, descriptor.path);
  if (!resolved) return res.status(403).json({ error: 'Access denied' });

  const current = readLatestInventoryEntry(device.id, session.id, resolved.normalized);
  if (current && current.sha256 === descriptor.sha256 && current.size === descriptor.size) {
    return res.json({ success: true, counted: false, reused: true });
  }

  const missingChunks = descriptor.chunkSha256.filter((hash) => !fs.existsSync(chunkPath(hash)));
  if (missingChunks.length > 0) {
    return res.status(409).json({ error: 'Missing chunks', missingChunks });
  }

  const blobTarget = blobPath(descriptor.sha256);
  if (!fs.existsSync(blobTarget)) {
    buildBlobFromChunks(blobTarget, descriptor.chunkSha256);
  }
  const computedHash = sha256File(blobTarget);
  if (computedHash !== descriptor.sha256) {
    return res.status(400).json({ error: 'blob sha256 mismatch after commit' });
  }

  materializeFromBlob(blobTarget, resolved.target);
  if (descriptor.modifiedAt) {
    const parsed = new Date(descriptor.modifiedAt);
    if (!Number.isNaN(parsed.getTime())) {
      fs.utimesSync(resolved.target, parsed, parsed);
    }
  }

  appendOrRewriteInventoryEntry(device.id, session.id, {
    path: resolved.normalized,
    size: descriptor.size,
    modifiedAt: descriptor.modifiedAt,
    sha256: descriptor.sha256,
    blobSha256: descriptor.sha256,
    chunkSize: descriptor.chunkSize,
    chunkCount: descriptor.chunkSha256.length,
    chunkSha256: descriptor.chunkSha256,
    chunkBytes: descriptor.chunkBytes,
    indexedAt: new Date().toISOString(),
  });

  session.fileCount += 1;
  session.totalBytes += descriptor.size;
  if (session.fileCount > 0 && session.fileCount % STATE_SAVE_FILE_INTERVAL === 0) {
    saveState();
  }
  res.json({ success: true, counted: true, reused: false });
});

router.put('/agent/:id/sessions/:sessionId/files', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const relativePath = String(req.query.path || '').replace(/\0/g, '');
  const modifiedAt = String(req.headers['x-sb-modified-at'] || '');
  const requestedHash = String(req.headers['x-sb-sha256'] || '').trim().toLowerCase();
  if (!relativePath) return res.status(400).json({ error: 'path query required' });

  const resolved = resolveStageTarget(device.id, session.id, relativePath);
  if (!resolved) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { normalized, target } = resolved;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const existing = fs.existsSync(target) ? fs.statSync(target) : null;
    let shouldCount = !existing || existing.size !== body.length;
    if (existing && requestedHash && existing.size === body.length) {
      shouldCount = sha256File(target) !== requestedHash;
    }
    if (!shouldCount) {
      return res.json({ success: true, counted: false });
    }
    const computedHash = sha256Buffer(body);
    const finalHash = requestedHash || computedHash;
    if (requestedHash && requestedHash !== computedHash) {
      return res.status(400).json({ error: 'sha256 mismatch' });
    }
    const blobTarget = blobPath(finalHash);
    persistHashBlob(blobTarget, body);
    const chunkMeta = ensureChunkBlobs(body);
    materializeFromBlob(blobTarget, target);
    if (modifiedAt) {
      const parsed = new Date(modifiedAt);
      if (!Number.isNaN(parsed.getTime())) {
        fs.utimesSync(target, parsed, parsed);
      }
    }
    appendInventoryEntry(device.id, session.id, {
      path: normalized,
      size: body.length,
      modifiedAt,
      sha256: finalHash,
      blobSha256: finalHash,
      chunkSize: chunkMeta.chunkSize,
      chunkCount: chunkMeta.chunkCount,
      chunkSha256: chunkMeta.chunkSha256,
      chunkBytes: chunkMeta.chunkBytes,
      indexedAt: new Date().toISOString(),
    });
    if (shouldCount) {
      session.fileCount += 1;
      session.totalBytes += body.length;
    }
    if (session.fileCount > 0 && session.fileCount % STATE_SAVE_FILE_INTERVAL === 0) {
      saveState();
    }
    res.json({ success: true, counted: shouldCount });
  });
});

router.post('/agent/:id/sessions/:sessionId/complete', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });

  const finalDir = versionDir(device.id, session.id);
  fs.mkdirSync(path.dirname(finalDir), { recursive: true });
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(sessionStageDir(device.id, session.id), finalDir);

  session.status = 'completed';
  session.completedAt = new Date().toISOString();
  device.status = 'online';
  device.lastBackup = session.completedAt;
  device.backupSize = session.totalBytes;

  const latestPointer = path.join(deviceRoot(device.id), 'latest.json');
  fs.writeFileSync(latestPointer, JSON.stringify({
    sessionId: session.id,
    completedAt: session.completedAt,
    totalBytes: session.totalBytes,
    fileCount: session.fileCount,
  }, null, 2), 'utf8');

  const inventory = readVersionInventory(device.id, session.id);
  const storage = versionStorageSummary(inventory);
  const manifestPath = path.join(finalDir, '_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    id: session.id,
    deviceId: session.deviceId,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    snapshotPath: session.snapshotPath,
    volume: session.volume,
    status: session.status,
    totalBytes: session.totalBytes,
    fileCount: session.fileCount,
    error: session.error,
    inventory: inventorySummary(inventory),
    storage,
  }, null, 2), 'utf8');
  let retention: {
    applied: boolean;
    keep: string[];
    pruned: string[];
  } | null = null;
  if (device.retentionPolicy) {
    const versions = listVersionManifests(device.id);
    const plan = selectVersionsForRetention(versions, device.retentionPolicy);
    const pruned: string[] = [];
    for (const manifest of plan.prune) {
      const deleted = deletePublishedVersion(device, manifest.id);
      if (deleted) pruned.push(manifest.id);
    }
    retention = {
      applied: true,
      keep: plan.keep.map((item) => item.id),
      pruned,
    };
  }
  const autoGc = maybeRunAutomaticGc(`complete:${session.id}`);
  saveState();
  res.json({ success: true, autoGc, retention });
});

router.post('/agent/:id/sessions/:sessionId/fail', (req, res) => {
  const device = requireAgent(req, res);
  if (!device) return;
  const session = sessions.get(req.params.sessionId);
  if (!session || session.deviceId !== device.id) return res.status(404).json({ error: 'Session not found' });
  session.status = 'failed';
  session.completedAt = new Date().toISOString();
  session.error = String(req.body?.error || 'unknown error');
  device.status = 'online';
  const autoGc = maybeRunAutomaticGc(`fail:${session.id}`);
  saveState();
  res.json({ success: true, autoGc });
});

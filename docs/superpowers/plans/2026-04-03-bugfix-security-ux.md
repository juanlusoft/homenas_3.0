# HomePiNAS — Security, Features & UX Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 confirmed bugs: missing auth on file endpoints, broken rename/delete in FilesPage, and missing service status translations.

**Architecture:** All fixes are surgical — no new files, no refactors. Two backend edits (auth middleware injection), one frontend edit (missing HTTP headers), two i18n edits (new translation keys). Storage eMMC/dedup logic is already implemented in storage.ts and needs no change.

**Tech Stack:** TypeScript, Express, React, custom i18n (`ts()` uses `status.` key prefix)

---

## File Map

| File | Change |
|---|---|
| `server/routes/files.ts` | Add `requireAuth` to 6 endpoints |
| `src/pages/FilesPage.tsx` | Add `Content-Type: application/json` to rename + delete calls |
| `src/i18n/es.ts` | Add `status.*` keys for systemd/docker/backup states |
| `src/i18n/en.ts` | Same keys in English |

---

## Task 1: Auth middleware on file endpoints

**Files:**
- Modify: `server/routes/files.ts`

Context: `files.ts` currently has zero auth. The `requireAuth` middleware is already exported from `server/middleware/auth.ts` and used by every other router. The fix is to import it and add it as the first argument of each route handler.

- [ ] **Step 1.1: Add requireAuth import**

Open `server/routes/files.ts`. The current imports are:
```typescript
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
```

Add the auth import:
```typescript
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';
```

- [ ] **Step 1.2: Add requireAuth to GET /list**

Find:
```typescript
filesRouter.get('/list', async (req, res) => {
```
Replace with:
```typescript
filesRouter.get('/list', requireAuth, async (req, res) => {
```

- [ ] **Step 1.3: Add requireAuth to POST /mkdir**

Find:
```typescript
filesRouter.post('/mkdir', async (req, res) => {
```
Replace with:
```typescript
filesRouter.post('/mkdir', requireAuth, async (req, res) => {
```

- [ ] **Step 1.4: Add requireAuth to POST /upload**

Find:
```typescript
filesRouter.post('/upload', upload.array('files', 20), (req, res) => {
```
Replace with:
```typescript
filesRouter.post('/upload', requireAuth, upload.array('files', 20), (req, res) => {
```

- [ ] **Step 1.5: Add requireAuth to GET /download**

Find:
```typescript
filesRouter.get('/download', async (req, res) => {
```
Replace with:
```typescript
filesRouter.get('/download', requireAuth, async (req, res) => {
```

- [ ] **Step 1.6: Add requireAuth to DELETE /delete**

Find:
```typescript
filesRouter.delete('/delete', async (req, res) => {
```
Replace with:
```typescript
filesRouter.delete('/delete', requireAuth, async (req, res) => {
```

- [ ] **Step 1.7: Add requireAuth to POST /rename**

Find:
```typescript
filesRouter.post('/rename', async (req, res) => {
```
Replace with:
```typescript
filesRouter.post('/rename', requireAuth, async (req, res) => {
```

- [ ] **Step 1.8: Verify manually**

Run the server and test with curl (no token):
```bash
curl http://localhost:3001/api/files/list
```
Expected response: `{"error":"Authentication required"}` with status 401.

- [ ] **Step 1.9: Commit**

```bash
git add server/routes/files.ts
git commit -m "fix(security): require auth on all file endpoints"
```

---

## Task 2: Fix rename and delete in FilesPage

**Files:**
- Modify: `src/pages/FilesPage.tsx`

Context: `authFetch` wraps `fetch` with the JWT header. When calling it with `body: JSON.stringify(...)`, Express's `express.json()` middleware only parses the body if `Content-Type: application/json` is present. Without it, `req.body` is `{}` and both endpoints fail silently (no error in the UI).

The fix is to add the header to the two inline `authFetch` calls inside the JSX action buttons.

- [ ] **Step 2.1: Fix rename call**

In `src/pages/FilesPage.tsx`, find the rename button onClick (around line 211):
```typescript
authFetch('/files/rename', { method: 'POST', body: JSON.stringify({ oldPath: currentPath + '/' + entry.name, newName }) }).then(() => fetchFiles(currentPath));
```
Replace with:
```typescript
authFetch('/files/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: currentPath + '/' + entry.name, newName }) }).then(() => fetchFiles(currentPath));
```

- [ ] **Step 2.2: Fix delete call**

Find the delete button onClick (around line 216):
```typescript
authFetch('/files/delete', { method: 'DELETE', body: JSON.stringify({ filePath: currentPath + '/' + entry.name }) }).then(() => fetchFiles(currentPath));
```
Replace with:
```typescript
authFetch('/files/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: currentPath + '/' + entry.name }) }).then(() => fetchFiles(currentPath));
```

- [ ] **Step 2.3: Commit**

```bash
git add src/pages/FilesPage.tsx
git commit -m "fix(files): add Content-Type header to rename and delete calls"
```

---

## Task 3: Service status translations

**Files:**
- Modify: `src/i18n/es.ts`
- Modify: `src/i18n/en.ts`

Context: `ts(value)` in `src/i18n/index.ts` works as follows:
```typescript
export function ts(value: string): string {
  const key = 'status.' + value.toLowerCase();
  const translated = t(key);
  return translated !== key ? translated : value;  // fallback to raw value
}
```
So `ts('running')` looks up `status.running`. If the key doesn't exist, it returns `'running'` unchanged.

The following values are passed to `ts()` across the app (ServicesPage, BackupPage, GlowPill):
- Docker container status: `running`, `paused`, `exited`, `dead`
- Systemd service status: `active`, `inactive`, `failed`, `activating`, `deactivating`
- Systemd enabled flag: `enabled`, `disabled`
- Backup job status: `success`, `scheduled`
- Backup job types: `full`, `incremental`, `snapshot`
- Generic states used in other pages: `error`, `healthy`, `warning`, `online`, `offline`

Currently none of these have `status.*` keys in either locale file.

- [ ] **Step 3.1: Add status keys to es.ts**

Find the `// Services` section in `src/i18n/es.ts` (around line 144). After the last `svc.*` key, add:

```typescript
  // Service / Docker / Backup status values (used by ts())
  'status.running': 'ejecutándose',
  'status.active': 'activo',
  'status.inactive': 'inactivo',
  'status.activating': 'iniciando',
  'status.deactivating': 'deteniendo',
  'status.failed': 'fallido',
  'status.dead': 'detenido',
  'status.paused': 'pausado',
  'status.stopped': 'detenido',
  'status.exited': 'finalizado',
  'status.enabled': 'habilitado',
  'status.disabled': 'deshabilitado',
  'status.success': 'completado',
  'status.scheduled': 'programado',
  'status.error': 'error',
  'status.healthy': 'saludable',
  'status.warning': 'atención',
  'status.online': 'en línea',
  'status.offline': 'fuera de línea',
  // Backup job types (used by ts(job.type))
  'status.full': 'completo',
  'status.incremental': 'incremental',
  'status.snapshot': 'instantánea',
```

- [ ] **Step 3.2: Add status keys to en.ts**

Find the `// Network` section in `src/i18n/en.ts` (around line 26, after `'status.up'` and `'status.down'`). Add the missing keys right after the existing status keys:

```typescript
  'status.running': 'running',
  'status.active': 'active',
  'status.inactive': 'inactive',
  'status.activating': 'activating',
  'status.deactivating': 'deactivating',
  'status.failed': 'failed',
  'status.dead': 'stopped',
  'status.paused': 'paused',
  'status.stopped': 'stopped',
  'status.exited': 'exited',
  'status.enabled': 'enabled',
  'status.disabled': 'disabled',
  'status.success': 'completed',
  'status.scheduled': 'scheduled',
  'status.error': 'error',
  'status.healthy': 'healthy',
  'status.warning': 'warning',
  'status.online': 'online',
  'status.offline': 'offline',
  'status.full': 'full',
  'status.incremental': 'incremental',
  'status.snapshot': 'snapshot',
```

- [ ] **Step 3.3: Verify**

Open `src/i18n/en.ts` and confirm no duplicate keys exist for any `status.*` entry. The existing ones are only `status.up` and `status.down` — no conflict.

- [ ] **Step 3.4: Commit**

```bash
git add src/i18n/es.ts src/i18n/en.ts
git commit -m "fix(i18n): add status translation keys for services, docker, and backup states"
```

---

## Task 4: Verify storage filtering (no-change verification)

**Files:**
- Read-only: `server/routes/storage.ts`

Context: The TODO.md listed eMMC filtering and disk deduplication as pending. After reading `storage.ts`, both are already implemented (added in a commit after the TODO was written). This task confirms they work and closes the items.

- [ ] **Step 4.1: Confirm eMMC filter exists**

In `server/routes/storage.ts`, line ~126, confirm this line is present:
```typescript
if (fs.fs.includes('mmcblk')) return false;  // eMMC / SD card
```
If present: no change needed, mark done.
If missing: add it inside the `filtered` array's `.filter()` callback, alongside the other filter conditions.

- [ ] **Step 4.2: Confirm deduplication exists**

Lines ~137–153, confirm the `seen` Map deduplication block is present with `mountScore` function.
If present: no change needed, mark done.
If missing: add the deduplication block from the spec.

- [ ] **Step 4.3: Commit (only if changes were made)**

```bash
git add server/routes/storage.ts
git commit -m "fix(storage): ensure eMMC filter and disk deduplication are applied"
```
Skip this commit if steps 4.1 and 4.2 confirmed the code was already there.

---

## Final verification checklist

- [ ] `GET /api/files/list` without token → 401
- [ ] Rename a file in FilesPage UI → works without error
- [ ] Delete a file in FilesPage UI → works without error
- [ ] ServicesPage: systemd service states show in Spanish (e.g. "activo" not "active")
- [ ] ServicesPage: Docker container states show in Spanish (e.g. "ejecutándose" not "running")
- [ ] BackupPage: job status shows in Spanish (e.g. "completado" not "success")
- [ ] StoragePage: no `mmcblk` devices in disk list
- [ ] StoragePage: sdc appears only once

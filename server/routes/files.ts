/**
 * File management REST endpoints
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const filesRouter = Router();
const execFileAsync = promisify(execFile);

const STORAGE_BASE = '/mnt/storage';

/** Sanitize path to prevent traversal */
function safePath(userPath: string): string {
  const resolved = path.resolve(STORAGE_BASE, userPath.replace(/\.\./g, ''));
  if (!resolved.startsWith(STORAGE_BASE)) return STORAGE_BASE;
  return resolved;
}

/** GET /api/files/list?path=/ — List directory contents */
filesRouter.get('/list', async (req, res) => {
  const dirPath = safePath((req.query.path as string) || '/');
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const result = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = await fs.promises.stat(fullPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' as const : 'file' as const,
          size: stat.size,
          modified: stat.mtime.toISOString().slice(0, 10),
          permissions: (stat.mode & 0o777).toString(8),
        };
      } catch {
        return { name: entry.name, type: 'file' as const, size: 0, modified: '', permissions: '' };
      }
    }));
    res.json(result);
  } catch {
    res.json([]);
  }
});

/** POST /api/files/mkdir — Create directory */
filesRouter.post('/mkdir', async (req, res) => {
  const { dirPath, name } = req.body;
  if (!name || /[\/\\]/.test(name)) return res.status(400).json({ error: 'Invalid name' });
  const target = path.join(safePath(dirPath || '/'), name);
  try {
    await fs.promises.mkdir(target, { recursive: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

/** POST /api/files/upload — Upload file (express raw body) */
filesRouter.post('/upload', async (req, res) => {
  // Simple implementation — in production use multer
  res.json({ success: false, error: 'Upload requires multer middleware — not yet implemented' });
});

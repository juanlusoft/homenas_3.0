/**
 * File management REST endpoints — FULLY FUNCTIONAL
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

export const filesRouter = Router();

const STORAGE_BASE = process.env.STORAGE_BASE || '/mnt/storage';

/** Sanitize path to prevent traversal */
function safePath(userPath: string): string {
  const clean = (userPath || '/').replace(/\.\./g, '').replace(/\/+/g, '/');
  const resolved = path.resolve(STORAGE_BASE, clean.startsWith('/') ? clean.slice(1) : clean);
  if (!resolved.startsWith(STORAGE_BASE)) return STORAGE_BASE;
  return resolved;
}

/** Multer storage — dynamic destination from query param */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dest = safePath((req.query.path as string) || '/');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    // Sanitize filename: remove path separators, null bytes
    const safe = file.originalname.replace(/[\/\\:*?"<>|\0]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB max

/** GET /api/files/list?path=/ — List directory contents */
filesRouter.get('/list', async (req, res) => {
  const dirPath = safePath((req.query.path as string) || '/');
  try {
    if (!fs.existsSync(dirPath)) {
      return res.json([]);
    }
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const result = await Promise.all(entries
      .filter(e => !e.name.startsWith('.')) // hide dotfiles
      .map(async (entry) => {
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
    // Sort: directories first, then files
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
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
    try {
      await fs.promises.mkdir(target, { recursive: true });
    } catch {
      // Fallback: use sudo if permission denied
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      await promisify(execFile)('sudo', ['mkdir', '-p', target], { timeout: 5000 });
      await promisify(execFile)('sudo', ['chown', `${process.env.USER || 'juanlu'}:${process.env.USER || 'juanlu'}`, target], { timeout: 5000 });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

/** POST /api/files/upload?path=/ — Upload files */
filesRouter.post('/upload', upload.array('files', 20), (req, res) => {
  const files = req.files as Express.Multer.File[];
  res.json({
    success: true,
    uploaded: files?.length || 0,
    files: files?.map(f => ({ name: f.originalname, size: f.size })) || [],
  });
});

/** DELETE /api/files/delete — Delete file or directory */
filesRouter.delete('/delete', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Path required' });
  const target = safePath(filePath);
  try {
    const stat = await fs.promises.stat(target);
    if (stat.isDirectory()) {
      await fs.promises.rm(target, { recursive: true });
    } else {
      await fs.promises.unlink(target);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

/** POST /api/files/rename — Rename file or directory */
filesRouter.post('/rename', async (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) return res.status(400).json({ error: 'Path and new name required' });
  const source = safePath(oldPath);
  const dest = path.join(path.dirname(source), newName.replace(/[\/\\]/g, '_'));
  try {
    await fs.promises.rename(source, dest);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to rename' });
  }
});

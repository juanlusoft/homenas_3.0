/**
 * HomeStore REST endpoints — Docker-based app install/uninstall
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const storeRouter = Router();
const execFileAsync = promisify(execFile);

/** POST /api/store/install/:id — Pull and run a Docker container */
storeRouter.post('/install/:id', requireAdmin, async (req, res) => {
  const { image, port, name, env, volumes } = req.body as {
    image: string; port?: number; name?: string;
    env?: string[]; volumes?: string[];
  };
  if (!image) return res.status(400).json({ error: 'Docker image required' });

  const containerName = name || req.params.id;

  try {
    // Pull the image
    await execFileAsync('docker', ['pull', image], { timeout: 300000 });

    // Build run args
    const args = ['run', '-d', '--name', containerName, '--restart', 'unless-stopped'];
    if (port) {
      args.push('-p', `${port}:${port}`);
    }
    // Environment variables
    if (env?.length) {
      for (const e of env) {
        if (e.includes('=')) args.push('-e', e);
      }
    }
    // Volume mounts
    if (volumes?.length) {
      for (const v of volumes) {
        if (v.includes(':')) args.push('-v', v);
      }
    }
    args.push(image);

    await execFileAsync('docker', args, { timeout: 30000 });
    res.json({ success: true, message: `${containerName} installed and running` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Install failed: ${msg}` });
  }
});

/** POST /api/store/uninstall/:id — Stop and remove a Docker container */
storeRouter.post('/uninstall/:id', requireAdmin, async (req, res) => {
  const containerName = req.body.name || req.params.id;

  try {
    // Stop container (ignore errors if already stopped)
    await execFileAsync('docker', ['stop', containerName], { timeout: 30000 }).catch(() => {});
    // Remove container
    await execFileAsync('docker', ['rm', containerName], { timeout: 10000 });
    res.json({ success: true, message: `${containerName} removed` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Uninstall failed: ${msg}` });
  }
});

/** PUT /api/store/update/:id — Recreate container with new config */
storeRouter.put('/update/:id', requireAdmin, async (req, res) => {
  const { image, port, env, volumes } = req.body as {
    image: string; port?: number;
    env?: string[]; volumes?: string[];
  };
  const containerName = req.params.id;

  try {
    // Stop and remove old container
    await execFileAsync('docker', ['stop', containerName], { timeout: 30000 }).catch(() => {});
    await execFileAsync('docker', ['rm', containerName], { timeout: 10000 }).catch(() => {});

    // Pull and run with new config
    await execFileAsync('docker', ['pull', image], { timeout: 300000 });

    const args = ['run', '-d', '--name', containerName, '--restart', 'unless-stopped'];
    if (port) args.push('-p', `${port}:${port}`);
    if (env?.length) {
      for (const e of env) { if (e.includes('=')) args.push('-e', e); }
    }
    if (volumes?.length) {
      for (const v of volumes) { if (v.includes(':')) args.push('-v', v); }
    }
    args.push(image);

    await execFileAsync('docker', args, { timeout: 30000 });
    res.json({ success: true, message: `${containerName} updated and running` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Update failed: ${msg}` });
  }
});

/** GET /api/store/status — Check running containers */
storeRouter.get('/status', requireAuth, async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}'], { timeout: 10000 });
    const running = stdout.trim().split('\n').filter(Boolean);
    res.json({ running });
  } catch {
    res.json({ running: [] });
  }
});

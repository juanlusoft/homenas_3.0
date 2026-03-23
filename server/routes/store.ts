/**
 * HomeStore REST endpoints — Docker-based app install/uninstall
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const storeRouter = Router();
const execFileAsync = promisify(execFile);

/** POST /api/store/install/:id — Pull and run a Docker container */
storeRouter.post('/install/:id', async (req, res) => {
  const { image, port, name } = req.body;
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
    args.push(image);

    await execFileAsync('docker', args, { timeout: 30000 });
    res.json({ success: true, message: `${containerName} installed and running` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Install failed: ${msg}` });
  }
});

/** POST /api/store/uninstall/:id — Stop and remove a Docker container */
storeRouter.post('/uninstall/:id', async (req, res) => {
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

/** GET /api/store/status — Check running containers */
storeRouter.get('/status', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}'], { timeout: 10000 });
    const running = stdout.trim().split('\n').filter(Boolean);
    res.json({ running });
  } catch {
    res.json({ running: [] });
  }
});

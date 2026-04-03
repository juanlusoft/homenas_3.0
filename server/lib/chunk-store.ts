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

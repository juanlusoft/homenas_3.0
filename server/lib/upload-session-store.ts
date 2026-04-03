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

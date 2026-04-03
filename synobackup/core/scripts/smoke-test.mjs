#!/usr/bin/env node

import crypto from 'crypto';

const baseUrl = process.env.SB_BASE_URL || 'http://127.0.0.1:3021';
const adminToken = process.env.SB_ADMIN_TOKEN || 'change-me';
const suffix = crypto.randomUUID().slice(0, 8);
const deviceName = `smoke-${suffix}`;
const hostname = `SMOKE-${suffix}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function api(path, { method = 'GET', auth, headers = {}, body, expectStatus } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (expectStatus && response.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus} for ${method} ${path}, got ${response.status}`);
  }
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  }
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return response.json();
  }
  return response.arrayBuffer();
}

async function admin(path, options = {}) {
  return api(path, {
    ...options,
    headers: {
      'x-sb-admin-token': adminToken,
      ...(options.headers || {}),
    },
  });
}

async function uploadFile(deviceId, authToken, sessionId, relativePath, content) {
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const response = await fetch(`${baseUrl}/api/synobackup/agent/${deviceId}/sessions/${sessionId}/files?path=${encodeURIComponent(relativePath)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'X-SB-Modified-At': new Date().toISOString(),
      'X-SB-SHA256': sha256,
    },
    body: content,
  });
  if (response.status >= 400) {
    throw new Error(`upload failed ${relativePath}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const health = await api('/api/synobackup/health');
  assert(health.ok === true, 'health check failed');

  const generated = await admin('/api/synobackup/admin/agents/generate/windows', {
    method: 'POST',
    body: { name: deviceName },
  });
  const activated = await api('/api/synobackup/agent/activate', {
    method: 'POST',
    body: {
      token: generated.token,
      hostname,
      os: 'Windows',
      ip: '127.0.0.1',
    },
  });
  await admin(`/api/synobackup/admin/devices/${activated.deviceId}/approve`, { method: 'POST' });
  await admin(`/api/synobackup/admin/devices/${activated.deviceId}/retention-policy`, {
    method: 'PUT',
    body: { keepLast: 2, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
  });

  const session1 = await api(`/api/synobackup/agent/${activated.deviceId}/sessions/start`, {
    method: 'POST',
    auth: activated.authToken,
    body: { volume: 'C:\\', snapshotPath: 'smoke-test-1' },
  });
  await uploadFile(activated.deviceId, activated.authToken, session1.sessionId, 'docs/a.txt', Buffer.from('alpha-v1', 'utf8'));
  await uploadFile(activated.deviceId, activated.authToken, session1.sessionId, 'docs/common.txt', Buffer.from('common-v1', 'utf8'));
  const complete1 = await api(`/api/synobackup/agent/${activated.deviceId}/sessions/${session1.sessionId}/complete`, {
    method: 'POST',
    auth: activated.authToken,
    body: { success: true },
  });
  assert(complete1.success === true, 'first complete failed');

  const session2 = await api(`/api/synobackup/agent/${activated.deviceId}/sessions/start`, {
    method: 'POST',
    auth: activated.authToken,
    body: { volume: 'C:\\', snapshotPath: 'smoke-test-2' },
  });
  await uploadFile(activated.deviceId, activated.authToken, session2.sessionId, 'docs/b.txt', Buffer.from('beta-v2', 'utf8'));
  await uploadFile(activated.deviceId, activated.authToken, session2.sessionId, 'docs/common.txt', Buffer.from('common-v2-updated', 'utf8'));
  const complete2 = await api(`/api/synobackup/agent/${activated.deviceId}/sessions/${session2.sessionId}/complete`, {
    method: 'POST',
    auth: activated.authToken,
    body: { success: true },
  });
  assert(complete2.success === true, 'second complete failed');

  const versions = await admin(`/api/synobackup/admin/devices/${activated.deviceId}/versions`);
  assert(Array.isArray(versions) && versions.length === 2, 'expected exactly 2 versions after smoke');

  const manifest = await admin(`/api/synobackup/admin/devices/${activated.deviceId}/versions/${session2.sessionId}/manifest`);
  assert(manifest.manifest.inventory.indexedFiles === 2, 'manifest inventory mismatch');

  const diff = await admin(`/api/synobackup/admin/devices/${activated.deviceId}/versions/${session2.sessionId}/diff?compareTo=${session1.sessionId}`);
  assert(diff.summary.addedFiles === 1, 'diff added mismatch');
  assert(diff.summary.modifiedFiles === 1, 'diff modified mismatch');
  assert(diff.summary.deletedFiles === 1, 'diff deleted mismatch');

  const download = await admin(`/api/synobackup/admin/devices/${activated.deviceId}/versions/${session2.sessionId}/download?path=docs/common.txt`);
  const downloaded = Buffer.from(download).toString('utf8');
  assert(downloaded === 'common-v2-updated', 'download content mismatch');

  const retentionPreview = await admin(`/api/synobackup/admin/devices/${activated.deviceId}/retention/run?dryRun=true`, {
    method: 'POST',
    body: {},
  });
  assert(retentionPreview.keep.length === 2, 'retention preview keep mismatch');

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    deviceId: activated.deviceId,
    sessionIds: [session1.sessionId, session2.sessionId],
    checks: {
      health: true,
      activation: true,
      versions: versions.length,
      diff: diff.summary,
      retentionPreviewKeep: retentionPreview.keep,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

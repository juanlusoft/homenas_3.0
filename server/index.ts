/**
 * HomePiNAS v3 — Backend Server
 * Express + Socket.io for real-time system monitoring
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { metricsRouter } from './routes/metrics.js';
import { storageRouter } from './routes/storage.js';
import { networkRouter } from './routes/network.js';
import { servicesRouter } from './routes/services.js';
import { activeBackupRouter } from './routes/active-backup.js';
import { filesRouter } from './routes/files.js';
import { settingsRouter } from './routes/settings.js';
import { sharesRouter } from './routes/shares.js';
import { backupRouter } from './routes/backup.js';
import { usersRouter } from './routes/users.js';
import { stacksRouter } from './routes/stacks.js';
import { logsRouter } from './routes/logs.js';
import { terminalRouter } from './routes/terminal.js';
import { ddnsRouter } from './routes/ddns.js';
import { vpnRouter } from './routes/vpn.js';
import { schedulerRouter } from './routes/scheduler.js';
import { storeRouter } from './routes/store.js';
import { setupRouter } from './routes/setup.js';
import { startMetricsEmitter } from './realtime/metrics-emitter.js';
import { startHealthMonitor } from './realtime/health-monitor.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';  // Only listen on localhost — nginx handles external
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(cors());
app.use(express.json());

// REST API routes
app.use('/api/system', metricsRouter);
app.use('/api/storage', storageRouter);
app.use('/api/network', networkRouter);
app.use('/api/services', servicesRouter);
app.use('/api/active-backup', activeBackupRouter);
app.use('/api/files', filesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/backup', backupRouter);
app.use('/api/users', usersRouter);
app.use('/api/stacks', stacksRouter);
app.use('/api/logs', logsRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/ddns', ddnsRouter);
app.use('/api/vpn', vpnRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/store', storeRouter);
app.use('/api/setup', setupRouter);

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = new URL('../dist', import.meta.url).pathname;
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile('index.html', { root: distPath });
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`[ws] Client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
  });
});

// Start real-time metrics emitter
startMetricsEmitter(io);

// Start health monitor (disk/temp alerts)
startHealthMonitor();

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] HomePiNAS API running on http://${HOST}:${PORT}`);
  console.log(`[server] Socket.io ready for real-time connections`);
});

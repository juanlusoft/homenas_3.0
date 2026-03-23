/**
 * Real-time metrics emitter via Socket.io
 * Pushes system metrics every 2 seconds to all connected clients
 */

import type { Server } from 'socket.io';
import si from 'systeminformation';

const INTERVAL_MS = 2000;

export function startMetricsEmitter(io: Server): void {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function emitMetrics(): Promise<void> {
    // Only emit if clients are connected
    if (io.engine.clientsCount === 0) return;

    try {
      const [cpu, mem, temp, netStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.cpuTemperature(),
        si.networkStats(),
      ]);

      const stats = Array.isArray(netStats) ? netStats : [netStats];
      const primaryNet = stats.find(s => s.rx_bytes > 0) ?? stats[0];

      io.emit('metrics', {
        cpu: cpu.currentLoad.toFixed(1),
        memory: {
          used: Math.round((mem.used / mem.total) * 100),
          total: Math.round(mem.total / (1024 * 1024)),
        },
        temperature: temp.main ?? 0,
        network: primaryNet ? {
          rx: primaryNet.rx_sec,
          tx: primaryNet.tx_sec,
        } : null,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* non-critical: skip this tick */
    }
  }

  // Start emitting
  timer = setInterval(emitMetrics, INTERVAL_MS);
  console.log(`[realtime] Metrics emitter started (${INTERVAL_MS}ms interval)`);

  // Cleanup on process exit
  process.on('SIGTERM', () => {
    if (timer) clearInterval(timer);
  });
}

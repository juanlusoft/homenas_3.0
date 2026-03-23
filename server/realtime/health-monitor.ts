/**
 * Health Monitor — periodic checks for disk, temperature, services
 * Sends Telegram/email alerts when thresholds exceeded
 */

import si from 'systeminformation';
import { alerts } from '../utils/notify.js';

const CHECK_INTERVAL = 60_000; // 1 minute
const DISK_WARNING = 85;
const DISK_CRITICAL = 95;
const TEMP_WARNING = 70;
const TEMP_CRITICAL = 85;

let lastAlerts = new Map<string, number>(); // debounce: key → timestamp

function shouldAlert(key: string, cooldownMs = 600_000): boolean {
  const last = lastAlerts.get(key) || 0;
  if (Date.now() - last < cooldownMs) return false;
  lastAlerts.set(key, Date.now());
  return true;
}

async function checkHealth(): Promise<void> {
  try {
    // Check disk usage
    const disks = await si.fsSize();
    for (const disk of disks) {
      if (!disk.mount || disk.fs.includes('mmcblk') || disk.mount === '/') continue;
      if (disk.use >= DISK_CRITICAL && shouldAlert(`disk-critical-${disk.mount}`)) {
        await alerts.diskFull(disk.mount, Math.round(disk.use));
      } else if (disk.use >= DISK_WARNING && shouldAlert(`disk-warning-${disk.mount}`)) {
        await alerts.diskWarning(disk.mount, Math.round(disk.use));
      }
    }

    // Check CPU temperature
    const temp = await si.cpuTemperature();
    if (temp.main) {
      if (temp.main >= TEMP_CRITICAL && shouldAlert('temp-critical')) {
        await alerts.temperatureCritical('CPU', temp.main);
      } else if (temp.main >= TEMP_WARNING && shouldAlert('temp-warning')) {
        await alerts.temperatureHigh('CPU', temp.main);
      }
    }
  } catch {
    // Non-critical: skip this check
  }
}

export function startHealthMonitor(): void {
  // Initial check after 30s (let services start)
  setTimeout(checkHealth, 30_000);
  // Then every minute
  setInterval(checkHealth, CHECK_INTERVAL);
  console.log(`[health] Monitor started (${CHECK_INTERVAL / 1000}s interval)`);
}

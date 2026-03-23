/**
 * Storage REST endpoints
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execFileAsync = promisify(execFile);

/** Read disk temperature via smartctl (fallback to 0) */
async function getDiskTemp(device: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('sudo', ['smartctl', '-A', device], { timeout: 5000 });
    // Look for "Temperature_Celsius" or "194" (SMART attr)
    const match = stdout.match(/Temperature_Celsius.*?(\d+)\s*$/m)
      || stdout.match(/194\s+.*?(\d+)\s+/m)
      || stdout.match(/Current Temperature:\s+(\d+)/m);
    return match ? parseInt(match[1], 10) : 0;
  } catch { return 0; }
}

export const storageRouter = Router();

/** GET /api/storage/disks — Disk information */
storageRouter.get('/disks', async (_req, res) => {
  try {
    const [disks, fsSize, diskTemp] = await Promise.all([
      si.blockDevices(),
      si.fsSize(),
      si.diskLayout(),
    ]);

    const tempMap = new Map(
      diskTemp.map(d => [d.device, d.temperature ?? 0])
    );

    const result = fsSize
      .filter(fs => fs.mount !== '' && !fs.mount.startsWith('/snap'))
      .map(fs => {
        const block = disks.find(d => fs.fs.includes(d.name));
        return {
          device: fs.fs,
          name: block?.label || fs.mount,
          mount: fs.mount,
          size: formatBytes(fs.size),
          used: formatBytes(fs.used),
          free: formatBytes(fs.available),
          usage: Math.round(fs.use),
          health: fs.use > 90 ? 'critical' as const : fs.use > 75 ? 'warning' as const : 'healthy' as const,
          temperature: tempMap.get(block?.name ?? '') ?? 0,
          type: block?.type || fs.type,
          smart: {
            status: 'OK',
            powerOnHours: 0,
            badSectors: 0,
          },
        };
      });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to read storage info' });
  }
});

/** GET /api/storage/detect-disks — Raw disk detection for wizard */
storageRouter.get('/detect-disks', async (_req, res) => {
  try {
    const layout = await si.diskLayout();

    // Filter: no empty ports, no SD cards, no boot devices
    const filtered = layout.filter(d => {
      if (d.size < 1e9) return false;                           // empty port
      if (d.device?.includes('mmcblk')) return false;           // SD card
      if (d.device?.includes('boot') || d.device?.includes('loop')) return false;
      // JMB585 phantom: model is numeric-only AND size < 1GB
      const modelStr = (d.name || d.model || '').trim();
      if (/^\d+$/.test(modelStr) && d.size < 1e9) return false;
      return true;
    });

    let nvmeIdx = 0;
    let bayIdx = 0;

    const result = filtered.map(d => {
      const modelStr = (d.name || d.model || '').trim();
      const vendorStr = (d.vendor || '').trim();

      // Detect NVMe: by interface, device path, or JMB585 bridge (ASM vendor + sda/sdb)
      const isNvmeByInterface = d.interfaceType === 'NVMe' || d.device?.includes('nvme');
      const isNvmeByBridge = vendorStr === 'ASM' && /^\d+$/.test(modelStr);
      const isNvme = isNvmeByInterface || isNvmeByBridge;

      const isSsd = !isNvme && (
        d.type === 'SSD' ||
        modelStr.toLowerCase().includes('ssd') ||
        modelStr.toLowerCase().includes('evo')
      );

      // Clean model name for JMB585 bridge NVMe
      let cleanModel = modelStr;
      let cleanVendor = vendorStr;
      if (isNvmeByBridge) {
        cleanModel = `${d.size ? formatBytes(d.size) : 'Unknown'} NVMe`;
        cleanVendor = 'JMB585 Bridge';
      }

      const type = isNvme ? 'nvme' as const : isSsd ? 'ssd' as const : 'hdd' as const;
      const bay = isNvme ? `NVMe ${++nvmeIdx}` : `Bay ${++bayIdx}`;

      return {
        device: d.device || '',
        name: d.name || d.device || '',
        size: d.size,
        sizeHuman: formatBytes(d.size),
        vendor: cleanVendor || 'Unknown',
        model: cleanModel || 'Unknown',
        type,
        bay,
        serial: d.serialNum || '',
        temperatureRaw: d.temperature ?? 0,
        connected: true,
      };
    });

    // Read real temperatures in parallel
    const temps = await Promise.all(
      result.map(d => getDiskTemp(d.device))
    );
    const withTemps = result.map((d, i) => ({
      ...d,
      temperature: temps[i] || d.temperatureRaw,
    }));
    // Remove temperatureRaw from response
    const final = withTemps.map(({ temperatureRaw: _, ...rest }) => rest);

    res.json(final);
  } catch {
    res.json([]);
  }
});

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

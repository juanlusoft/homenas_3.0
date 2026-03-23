/**
 * Storage REST endpoints
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

export const storageRouter = Router();
const execFileAsync = promisify(execFile);

/** Read SMART data for a device */
async function getSmartData(device: string): Promise<{ temperature: number; powerOnHours: number; badSectors: number; status: string }> {
  try {
    const { stdout } = await execFileAsync('sudo', ['smartctl', '-A', '-H', device], { timeout: 5000 });
    const temp = stdout.match(/Temperature_Celsius.*?(\d+)\s*$/m)
      || stdout.match(/194\s+.*?(\d+)\s+/m)
      || stdout.match(/Current Temperature:\s+(\d+)/m);
    const hours = stdout.match(/Power_On_Hours.*?(\d+)\s*$/m)
      || stdout.match(/9\s+Power_On_Hours.*?(\d+)\s+/m);
    const badSectors = stdout.match(/Reallocated_Sector_Ct.*?(\d+)\s*$/m)
      || stdout.match(/5\s+Reallocated.*?(\d+)\s+/m);
    const healthy = stdout.includes('PASSED') || stdout.includes('OK');

    return {
      temperature: temp ? parseInt(temp[1], 10) : 0,
      powerOnHours: hours ? parseInt(hours[1], 10) : 0,
      badSectors: badSectors ? parseInt(badSectors[1], 10) : 0,
      status: healthy ? 'OK' : 'WARN',
    };
  } catch {
    return { temperature: 0, powerOnHours: 0, badSectors: 0, status: 'N/A' };
  }
}

/** Determine disk role by mount path */
function getDiskRole(mount: string): 'cache' | 'data' | 'parity' | 'system' {
  if (mount.includes('/cache')) return 'cache';
  if (mount.includes('/parity')) return 'parity';
  if (mount.startsWith('/mnt/') || mount.includes('/storage') || mount.includes('/disks/')) return 'data';
  return 'system';
}

/** GET /api/storage/disks — Disk information (filtered, deduplicated) */
storageRouter.get('/disks', async (_req, res) => {
  try {
    const [blockDevs, fsSize] = await Promise.all([
      si.blockDevices(),
      si.fsSize(),
    ]);

    // Filter: no eMMC, no snap, no tmpfs, no boot, only real mounts
    const filtered = fsSize.filter(fs => {
      if (!fs.mount || !fs.fs) return false;
      if (fs.fs.includes('mmcblk')) return false;        // eMMC / SD card
      if (fs.mount.startsWith('/snap')) return false;     // snap mounts
      if (fs.mount === '/boot/firmware') return false;    // boot partition
      if (fs.mount === '/') return false;                 // root OS partition
      if (fs.type === 'tmpfs' || fs.type === 'devtmpfs') return false;
      if (fs.fs === 'efivarfs' || fs.fs === 'overlay') return false;
      if (fs.size < 1e8) return false;                   // tiny filesystems
      return true;
    });

    // Deduplicate by base device (sdc1, sdc2 → sdc)
    const seen = new Map<string, typeof filtered[0]>();
    for (const fs of filtered) {
      const baseDevice = fs.fs.replace(/\d+$/, '').replace('/dev/', '');
      if (!seen.has(baseDevice) || fs.mount.includes('/storage')) {
        seen.set(baseDevice, fs);  // prefer /mnt/storage mount
      }
    }

    // Get SMART data in parallel
    const entries = Array.from(seen.values());
    const smartResults = await Promise.all(
      entries.map(fs => getSmartData(fs.fs.replace(/\d+$/, '')))
    );

    const result = entries.map((fs, i) => {
      const block = blockDevs.find(d => fs.fs.includes(d.name));
      const smart = smartResults[i];
      const role = getDiskRole(fs.mount);

      return {
        device: fs.fs,
        name: block?.label || fs.mount,
        mount: fs.mount,
        size: formatBytes(fs.size),
        sizeRaw: fs.size,
        used: formatBytes(fs.used),
        free: formatBytes(fs.available),
        usage: Math.round(fs.use),
        health: smart.badSectors > 0 ? 'critical' as const : fs.use > 90 ? 'warning' as const : 'healthy' as const,
        temperature: smart.temperature,
        type: block?.type || fs.type,
        role,
        smart: {
          status: smart.status,
          powerOnHours: smart.powerOnHours,
          badSectors: smart.badSectors,
        },
      };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to read storage info' });
  }
});

/** GET /api/storage/smart/:device — SMART data for a specific device */
storageRouter.get('/smart/:device', async (req, res) => {
  const device = `/dev/${req.params.device.replace(/[^a-zA-Z0-9]/g, '')}`;
  const data = await getSmartData(device);
  res.json(data);
});

/** POST /api/storage/smart-test/:device — Run short SMART test */
storageRouter.post('/smart-test/:device', async (req, res) => {
  const device = `/dev/${req.params.device.replace(/[^a-zA-Z0-9]/g, '')}`;
  try {
    const { stdout } = await execFileAsync('sudo', ['smartctl', '-t', 'short', device], { timeout: 10000 });
    res.json({ success: true, output: stdout });
  } catch (e) {
    res.json({ success: false, error: 'SMART test failed or not supported' });
  }
});

/** GET /api/storage/detect-disks — Raw disk detection for wizard */
storageRouter.get('/detect-disks', async (_req, res) => {
  try {
    const layout = await si.diskLayout();

    const filtered = layout.filter(d => {
      if (d.size < 1e9) return false;
      if (d.device?.includes('mmcblk')) return false;
      if (d.device?.includes('boot') || d.device?.includes('loop')) return false;
      const modelStr = (d.name || d.model || '').trim();
      if (/^\d+$/.test(modelStr) && d.size < 1e9) return false;
      return true;
    });

    let nvmeIdx = 0;
    let bayIdx = 0;

    const result = filtered.map(d => {
      const modelStr = (d.name || d.model || '').trim();
      const vendorStr = (d.vendor || '').trim();
      const isNvmeByInterface = d.interfaceType === 'NVMe' || d.device?.includes('nvme');
      const isNvmeByBridge = vendorStr === 'ASM' && /^\d+$/.test(modelStr);
      const isNvme = isNvmeByInterface || isNvmeByBridge;
      const isSsd = !isNvme && (d.type === 'SSD' || modelStr.toLowerCase().includes('ssd') || modelStr.toLowerCase().includes('evo'));

      let cleanModel = modelStr;
      let cleanVendor = vendorStr;
      if (isNvmeByBridge) {
        cleanModel = `${formatBytes(d.size)} NVMe`;
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
        type, bay,
        serial: d.serialNum || '',
        temperature: d.temperature ?? 0,
        connected: true,
      };
    });

    const temps = await Promise.all(result.map(d => getSmartData(d.device)));
    const final = result.map((d, i) => ({ ...d, temperature: temps[i].temperature || d.temperature }));

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

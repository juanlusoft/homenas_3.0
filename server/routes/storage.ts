/**
 * Storage REST endpoints
 */

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import si from 'systeminformation';

export const storageRouter = Router();
const execFileAsync = promisify(execFile);

/**
 * Read SMART data for a device.
 * Requires sudoers entry:  homepinas ALL=(ALL) NOPASSWD: /usr/sbin/smartctl
 * Without it, smartctl will fail and all SMART values will show N/A.
 */
async function getSmartData(device: string): Promise<{ temperature: number; powerOnHours: number; badSectors: number; status: string }> {
  // Try multiple smartctl strategies
  for (const args of [
    ['sudo', 'smartctl', '-A', '-H', device],              // standard
    ['sudo', 'smartctl', '-A', '-H', '-d', 'sat', device], // USB/SATA bridge (JMB585)
    ['sudo', 'smartctl', '-A', '-H', '-d', 'auto', device], // auto-detect
  ]) {
    try {
      const result = await trySmartctl(args);
      if (result) return result;
    } catch {}
  }

  // Fallback: read temperature from hwmon/thermal
  const temp = await getHwmonTemp(device);
  return { temperature: temp, powerOnHours: 0, badSectors: 0, status: temp > 0 ? 'OK' : 'N/A' };
}

/** Read temp from /sys/class/hwmon or /sys/class/thermal */
async function getHwmonTemp(_device: string): Promise<number> {
  try {
    const fs = await import('fs');
    // Check all hwmon devices for temperature
    const hwmonDirs = fs.readdirSync('/sys/class/hwmon/');
    for (const dir of hwmonDirs) {
      const tempFile = `/sys/class/hwmon/${dir}/temp1_input`;
      if (fs.existsSync(tempFile)) {
        const val = parseInt(fs.readFileSync(tempFile, 'utf-8').trim(), 10);
        if (val > 0) return Math.round(val / 1000); // millidegrees to degrees
      }
    }
  } catch {}
  return 0;
}

async function trySmartctl(args: string[]): Promise<{ temperature: number; powerOnHours: number; badSectors: number; status: string } | null> {
  try {
    const { stdout } = await execFileAsync(args[0], args.slice(1), { timeout: 5000 });
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
    return null;
  }
}

/** Determine disk role — checks saved wizard config first, then falls back to mount path */
function getDiskRole(mount: string, device: string): 'cache' | 'data' | 'parity' | 'system' {
  // Check wizard config first
  try {
    const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      // Check explicit diskRoles map from wizard
      if (settings.diskRoles) {
        for (const [dev, role] of Object.entries(settings.diskRoles)) {
          if (mount.includes(dev as string)) return role as 'cache' | 'data' | 'parity';
        }
      }
      // Check role arrays (dataDisks, parityDisks, cacheDisks)
      const baseDev = device.replace('/dev/', '').replace(/\d+$/, '');
      if (settings.dataDisks?.some((d: string) => d.includes(baseDev))) return 'data';
      if (settings.parityDisks?.some((d: string) => d.includes(baseDev))) return 'parity';
      if (settings.cacheDisks?.some((d: string) => d.includes(baseDev))) return 'cache';
    }
  } catch { /* fall through to path-based detection */ }

  // Fallback: detect by mount path
  if (mount.includes('/parity')) return 'parity';
  if (mount.includes('/cache')) return 'cache';
  if (mount.startsWith('/mnt/') || mount.includes('/storage') || mount.includes('/disks/')) return 'data';
  return 'system';
}

/** Score mount points for deduplication: higher = preferred */
function mountScore(mount: string): number {
  if (mount.includes('/storage')) return 3;
  if (mount.startsWith('/mnt/')) return 2;
  if (mount.includes('/disks/')) return 1;
  return 0;
}

/** GET /api/storage/disks — Disk information (filtered, deduplicated) */
storageRouter.get('/disks', requireAuth, async (_req, res) => {
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
      const existing = seen.get(baseDevice);
      if (!existing) {
        seen.set(baseDevice, fs);
      } else {
        // Prefer the mount with the largest partition (most likely the data partition)
        // and prefer /storage or /mnt mounts over device-named mounts like /data-sdc
        const existingScore = mountScore(existing.mount);
        const newScore = mountScore(fs.mount);
        if (newScore > existingScore) {
          seen.set(baseDevice, fs);
        }
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
      const role = getDiskRole(fs.mount, fs.fs);

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
storageRouter.get('/smart/:device', requireAuth, async (req, res) => {
  const device = `/dev/${req.params.device.replace(/[^a-zA-Z0-9]/g, '')}`;
  const data = await getSmartData(device);
  res.json(data);
});

/** POST /api/storage/smart-test/:device — Run short SMART test */
storageRouter.post('/smart-test/:device', requireAdmin, async (req, res) => {
  const device = `/dev/${req.params.device.replace(/[^a-zA-Z0-9]/g, '')}`;
  try {
    const { stdout } = await execFileAsync('sudo', ['smartctl', '-t', 'short', device], { timeout: 10000 });
    res.json({ success: true, output: stdout });
  } catch (e) {
    res.json({ success: false, error: 'SMART test failed or not supported' });
  }
});

/** Get all block devices via lsblk (more reliable than systeminformation for USB bridges) */
async function getLsblkDisks(): Promise<Array<{ device: string; size: number; model: string; vendor: string; type: string; serial: string; tran: string }>> {
  try {
    const { stdout } = await execFileAsync('lsblk', ['-b', '-d', '-n', '-o', 'NAME,SIZE,MODEL,VENDOR,TYPE,SERIAL,TRAN', '--json'], { timeout: 5000 });
    const data = JSON.parse(stdout);
    return (data.blockdevices || [])
      .filter((d: any) => {
        if (d.type !== 'disk' || d.size < 1e9) return false;
        if (d.name.startsWith('mmcblk') || d.name.startsWith('loop')) return false;
        return true;
      })
      .map((d: any) => ({
        device: '/dev/' + d.name,
        size: parseInt(d.size) || 0,
        model: (d.model || '').trim(),
        vendor: (d.vendor || '').trim(),
        type: d.tran || '',
        serial: (d.serial || '').trim(),
        tran: d.tran || '',
      }));
  } catch {
    return [];
  }
}

/** GET /api/storage/detect-disks — Raw disk detection for wizard */
storageRouter.get('/detect-disks', async (_req, res) => {  // Public: needed by setup wizard before auth
  try {
    // Use both systeminformation AND lsblk for complete detection
    // Each source wrapped in try/catch so one failure doesn't kill the other
    let layout: Awaited<ReturnType<typeof si.diskLayout>> = [];
    let lsblkDisks: Awaited<ReturnType<typeof getLsblkDisks>> = [];
    try { layout = await si.diskLayout(); } catch { console.warn('[detect-disks] si.diskLayout failed'); }
    try { lsblkDisks = await getLsblkDisks(); } catch { console.warn('[detect-disks] lsblk failed'); }
    console.log(`[detect-disks] si: ${layout.length} disks, lsblk: ${lsblkDisks.length} disks`);

    // Merge: start with lsblk (more complete), enrich with si data
    const siMap = new Map(layout.map(d => [(d.device || '').replace('/dev/', ''), d]));
    
    const allDisks = lsblkDisks.map(lb => {
      const siDisk = siMap.get(lb.device.replace('/dev/', ''));
      return {
        device: lb.device,
        name: siDisk?.name || lb.model || lb.device,
        size: lb.size || siDisk?.size || 0,
        vendor: lb.vendor || siDisk?.vendor || '',
        model: lb.model || siDisk?.name || siDisk?.model || '',
        interfaceType: lb.tran === 'nvme' ? 'NVMe' : lb.tran === 'sata' ? 'SATA' : lb.tran || siDisk?.interfaceType || '',
        type: lb.tran === 'nvme' ? 'SSD' : (siDisk?.type || 'HD'),
        serialNum: lb.serial || siDisk?.serialNum || '',
        temperature: siDisk?.temperature ?? 0,
      };
    });
    
    // If lsblk found nothing, fall back to si only
    const source = allDisks.length > 0 ? allDisks : layout.map(d => ({
      device: d.device || '',
      name: d.name || '',
      size: d.size,
      vendor: d.vendor || '',
      model: d.name || d.model || '',
      interfaceType: d.interfaceType || '',
      type: d.type || '',
      serialNum: d.serialNum || '',
      temperature: d.temperature ?? 0,
    }));

    const filtered = source.filter(d => {
      if (d.size < 1e9) return false;
      if (d.device?.includes('mmcblk') || d.device?.includes('loop')) return false;
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

    // Detect OS disk (where / is mounted) and mark it
    try {
      const { stdout: dfOut } = await execFileAsync('df', ['/', '--output=source'], { timeout: 3000 });
      const rootDevice = dfOut.trim().split('\n').pop()?.replace(/[0-9p]+$/, '').replace('/dev/', '') || '';
      for (const disk of final) {
        const diskName = disk.device.replace('/dev/', '');
        if (rootDevice && diskName === rootDevice) {
          (disk as any).isSystemDisk = true;
          (disk as any).bay = 'Sistema';
        }
      }
    } catch {}

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

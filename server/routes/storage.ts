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
      if (fs.type?.includes('fuse') || fs.type?.includes('mergerfs')) return false; // mergerfs virtual mount
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
        if (d.type !== 'disk') return false;
        if (d.name.startsWith('mmcblk') || d.name.startsWith('loop') || d.name.startsWith('zram')) return false;
        // JMB585 bridge reports size=0 but disk is real — keep it
        if (d.size < 1e9 && d.model !== '456' && d.vendor?.trim() !== 'ASM') return false;
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
    // Fix size=0 for JMB585 bridge: read from /sys/block/NAME/size
    for (const disk of result) {
      if (disk.size === 0 || disk.size < 1e9) {
        try {
          const fs = await import('fs');
          const sysSize = fs.readFileSync('/sys/block/' + disk.device.replace('/dev/', '') + '/size', 'utf-8').trim();
          disk.size = parseInt(sysSize) * 512; // sectors * 512 bytes
        } catch {}
      }
    }
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

/** Validate device name — only allow safe block device names like sda, sdb1, nvme0n1 */
function sanitizeDevice(raw: string): string | null {
  const clean = raw.replace(/^\/dev\//, '');
  if (!/^[a-zA-Z0-9]+$/.test(clean)) return null;
  return `/dev/${clean}`;
}

/** Get next available disk index for naming (/mnt/disk1, /mnt/disk2…) */
async function getNextDiskIndex(): Promise<number> {
  let i = 1;
  while (fs.existsSync(`/mnt/disk${i}`)) i++;
  return i;
}

/** Get current MergerFS pool mount point and sources from /proc/mounts */
async function getMergerFSPool(): Promise<{ mountpoint: string; sources: string[] } | null> {
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
    for (const line of mounts.split('\n')) {
      if (line.includes('fuse.mergerfs') || line.includes('mergerfs')) {
        const parts = line.split(' ');
        const sources = parts[0].split(':').filter(Boolean);
        return { mountpoint: parts[1], sources };
      }
    }
  } catch {}
  return null;
}

/** Append a line to /etc/fstab safely via temp file + sudo cp */
async function appendFstab(line: string): Promise<void> {
  const current = fs.readFileSync('/etc/fstab', 'utf-8');
  const tmpPath = path.join(process.cwd(), 'data', 'fstab.tmp');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.writeFileSync(tmpPath, current.trimEnd() + '\n' + line + '\n');
  await execFileAsync('sudo', ['cp', tmpPath, '/etc/fstab'], { timeout: 5000 });
  try { fs.unlinkSync(tmpPath); } catch {}
}

/**
 * GET /api/storage/available-disks
 * Returns disks that are not the system disk and have no mounted partitions.
 * These are candidates for hot-plug add to pool, standalone mount, or external mount.
 */
storageRouter.get('/available-disks', requireAuth, async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('lsblk', [
      '-J', '-b', '-o', 'NAME,SIZE,MODEL,TYPE,FSTYPE,MOUNTPOINT,SERIAL,TRAN,VENDOR',
    ], { timeout: 8000 });

    const data = JSON.parse(stdout);
    const allDevices: any[] = data.blockdevices || [];

    // Find system disk (where / is mounted)
    let systemDisk = '';
    try {
      const { stdout: dfOut } = await execFileAsync('df', ['/', '--output=source'], { timeout: 3000 });
      systemDisk = dfOut.trim().split('\n').pop()?.replace(/[0-9p]+$/, '').replace('/dev/', '') || '';
    } catch {}

    const result = allDevices
      .filter(d => {
        if (d.type !== 'disk') return false;
        if (d.name.startsWith('loop') || d.name.startsWith('zram') || d.name.startsWith('mmcblk')) return false;
        if (d.name === systemDisk) return false;
        return true;
      })
      .map(d => {
        const partitions: { name: string; size: number; fstype: string; mountpoint: string }[] = [];
        let hasMountedPartition = false;
        let hasFilesystem = !!d.fstype;

        for (const child of (d.children || [])) {
          partitions.push({
            name: `/dev/${child.name}`,
            size: parseInt(child.size) || 0,
            fstype: child.fstype || '',
            mountpoint: child.mountpoint || '',
          });
          if (child.mountpoint) hasMountedPartition = true;
          if (child.fstype) hasFilesystem = true;
        }

        // Also check if disk itself has a mountpoint
        if (d.mountpoint) hasMountedPartition = true;

        const isNvme = d.tran === 'nvme' || d.name.includes('nvme');
        const isSsd = !isNvme && (d.model || '').toLowerCase().includes('ssd');
        const diskType = isNvme ? 'nvme' : isSsd ? 'ssd' : 'hdd';

        return {
          device: `/dev/${d.name}`,
          model: (d.model || d.vendor || d.name || '').trim(),
          size: parseInt(d.size) || 0,
          sizeHuman: formatBytes(parseInt(d.size) || 0),
          type: diskType,
          serial: (d.serial || '').trim(),
          hasFilesystem,
          hasMountedPartition,
          filesystem: d.fstype || (partitions[0]?.fstype) || '',
          partitions,
        };
      });

    res.json(result);
  } catch {
    res.json([]);
  }
});

/**
 * POST /api/storage/add-to-pool
 * Hot-adds a disk to the MergerFS pool.
 * Formats ext4, mounts at /mnt/diskN, hot-adds to MergerFS, updates fstab.
 */
storageRouter.post('/add-to-pool', requireAdmin, async (req, res) => {
  const device = sanitizeDevice(req.body.device);
  if (!device) return res.status(400).json({ error: 'Invalid device' });

  try {
    // 1. Wipe + create GPT + single partition
    await execFileAsync('sudo', ['sgdisk', '--zap-all', device], { timeout: 15000 });
    await execFileAsync('sudo', ['sgdisk', '-n', '0:0:0', device], { timeout: 10000 });
    await execFileAsync('sudo', ['partprobe', device], { timeout: 5000 }).catch(() => {});

    // Partition name: sdb → sdb1, nvme0n1 → nvme0n1p1
    const partDevice = device.includes('nvme') ? `${device}p1` : `${device}1`;

    // 2. Format ext4
    const idx = await getNextDiskIndex();
    const label = `disk${idx}`;
    await execFileAsync('sudo', ['mkfs.ext4', '-L', label, '-F', partDevice], { timeout: 60000 });

    // 3. Get UUID
    const { stdout: uuidOut } = await execFileAsync('sudo', ['blkid', '-s', 'UUID', '-o', 'value', partDevice], { timeout: 5000 });
    const uuid = uuidOut.trim();

    // 4. Mount
    const mountPoint = `/mnt/${label}`;
    await execFileAsync('sudo', ['mkdir', '-p', mountPoint], { timeout: 5000 });
    await execFileAsync('sudo', ['mount', partDevice, mountPoint], { timeout: 10000 });

    // 5. Add to fstab
    await appendFstab(`UUID=${uuid} ${mountPoint} ext4 defaults,nofail 0 2`);

    // 6. Hot-add to MergerFS if pool exists
    const pool = await getMergerFSPool();
    let poolAdded = false;
    if (pool) {
      try {
        await execFileAsync('sudo', ['mount', '-o', `remount,add:${mountPoint}`, pool.mountpoint], { timeout: 10000 });
        poolAdded = true;
      } catch {}
    }

    res.json({
      success: true,
      mountPoint,
      label,
      poolAdded,
      poolMount: pool?.mountpoint || null,
      message: poolAdded
        ? `Disco añadido al pool en ${mountPoint} y unido a ${pool!.mountpoint}`
        : `Disco montado en ${mountPoint}. Configura el pool MergerFS para añadirlo.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[add-to-pool]', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/storage/mount-standalone
 * Formats and mounts a disk as an independent volume at /mnt/:name.
 */
storageRouter.post('/mount-standalone', requireAdmin, async (req, res) => {
  const device = sanitizeDevice(req.body.device);
  const rawName = (req.body.name as string || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!device) return res.status(400).json({ error: 'Invalid device' });
  if (!rawName) return res.status(400).json({ error: 'Name required' });

  const mountPoint = `/mnt/${rawName}`;

  // Prevent overwriting existing mount points
  if (fs.existsSync(mountPoint)) {
    const { stdout: checkMount } = await execFileAsync('mountpoint', ['-q', mountPoint]).catch(() => ({ stdout: '' })) as { stdout: string };
    if (checkMount !== undefined) {
      const already = await execFileAsync('mountpoint', ['-q', mountPoint]).then(() => true).catch(() => false);
      if (already) return res.status(409).json({ error: `${mountPoint} ya está montado` });
    }
  }

  try {
    await execFileAsync('sudo', ['sgdisk', '--zap-all', device], { timeout: 15000 });
    await execFileAsync('sudo', ['sgdisk', '-n', '0:0:0', device], { timeout: 10000 });
    await execFileAsync('sudo', ['partprobe', device], { timeout: 5000 }).catch(() => {});

    const partDevice = device.includes('nvme') ? `${device}p1` : `${device}1`;
    await execFileAsync('sudo', ['mkfs.ext4', '-L', rawName, '-F', partDevice], { timeout: 60000 });

    const { stdout: uuidOut } = await execFileAsync('sudo', ['blkid', '-s', 'UUID', '-o', 'value', partDevice], { timeout: 5000 });
    const uuid = uuidOut.trim();

    await execFileAsync('sudo', ['mkdir', '-p', mountPoint], { timeout: 5000 });
    await execFileAsync('sudo', ['mount', partDevice, mountPoint], { timeout: 10000 });
    await appendFstab(`UUID=${uuid} ${mountPoint} ext4 defaults,nofail 0 2`);

    res.json({ success: true, mountPoint, message: `Disco montado en ${mountPoint}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mount-standalone]', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/storage/mount-external
 * Mounts an existing NTFS/FAT32/exFAT/ext4 disk without formatting.
 * Useful for data recovery from Windows/external drives.
 */
storageRouter.post('/mount-external', requireAdmin, async (req, res) => {
  const rawDevice = req.body.partition || req.body.device;
  const device = sanitizeDevice(rawDevice);
  const readonly = req.body.readonly === true;
  const rawName = (req.body.name as string || 'recovery').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!device) return res.status(400).json({ error: 'Invalid device' });

  try {
    // Detect filesystem
    const { stdout: fstypeOut } = await execFileAsync('sudo', ['blkid', '-s', 'TYPE', '-o', 'value', device], { timeout: 5000 });
    const fstype = fstypeOut.trim().toLowerCase();

    if (!fstype) return res.status(400).json({ error: 'No se detectó sistema de archivos en el dispositivo. ¿Está la partición correcta?' });

    // Mount options by filesystem
    const mountPoint = `/mnt/${rawName}`;
    await execFileAsync('sudo', ['mkdir', '-p', mountPoint], { timeout: 5000 });

    let mountArgs: string[];
    if (fstype === 'ntfs' || fstype === 'ntfs-3g') {
      const opts = readonly ? 'ro' : 'rw,uid=1000,gid=1000,umask=0022';
      mountArgs = ['sudo', 'mount', '-t', 'ntfs-3g', '-o', opts, device, mountPoint];
    } else if (fstype === 'vfat' || fstype === 'fat32' || fstype === 'msdos') {
      const opts = readonly ? 'ro' : 'rw,uid=1000,gid=1000,umask=0022';
      mountArgs = ['sudo', 'mount', '-t', 'vfat', '-o', opts, device, mountPoint];
    } else if (fstype === 'exfat') {
      const opts = readonly ? 'ro' : 'rw,uid=1000,gid=1000,umask=0022';
      mountArgs = ['sudo', 'mount', '-t', 'exfat', '-o', opts, device, mountPoint];
    } else {
      // ext4, xfs, btrfs — mount as-is
      const opts = readonly ? 'ro' : 'defaults';
      mountArgs = ['sudo', 'mount', '-o', opts, device, mountPoint];
    }

    await execFileAsync(mountArgs[0], mountArgs.slice(1), { timeout: 10000 });

    res.json({
      success: true,
      mountPoint,
      filesystem: fstype,
      readonly,
      message: `${fstype.toUpperCase()} montado en ${mountPoint}${readonly ? ' (solo lectura)' : ''}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mount-external]', msg);
    // Common error: ntfs-3g not installed
    if (msg.includes('ntfs-3g') || msg.includes('No such file')) {
      return res.status(500).json({ success: false, error: 'ntfs-3g no instalado. Ejecuta: sudo apt install ntfs-3g' });
    }
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/storage/unmount
 * Safely unmounts a disk from a given mountpoint.
 */
storageRouter.post('/unmount', requireAdmin, async (req, res) => {
  const rawMount = (req.body.mountpoint as string || '');
  if (!rawMount.startsWith('/mnt/') || rawMount.includes('..')) {
    return res.status(400).json({ error: 'Invalid mountpoint' });
  }
  try {
    await execFileAsync('sudo', ['umount', rawMount], { timeout: 15000 });
    res.json({ success: true, message: `${rawMount} desmontado` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/storage/remove-from-pool
 * Hot-removes a disk from the MergerFS pool, unmounts it, and removes from fstab.
 * body: { mountpoint: '/mnt/disk2' }
 */
storageRouter.post('/remove-from-pool', requireAdmin, async (req, res) => {
  const rawMount = (req.body.mountpoint as string || '');
  if (!rawMount.startsWith('/mnt/') || rawMount.includes('..')) {
    return res.status(400).json({ error: 'Invalid mountpoint' });
  }

  try {
    const pool = await getMergerFSPool();
    let poolRemoved = false;

    // 1. Hot-remove from MergerFS if pool exists and disk is in it
    if (pool && pool.sources.includes(rawMount)) {
      try {
        await execFileAsync('sudo', ['mount', '-o', `remount,remove:${rawMount}`, pool.mountpoint], { timeout: 10000 });
        poolRemoved = true;
      } catch (e) {
        console.warn('[remove-from-pool] mergerfs remount failed:', e);
      }
    }

    // 2. Unmount the disk
    await execFileAsync('sudo', ['umount', rawMount], { timeout: 15000 });

    // 3. Remove from /etc/fstab (remove lines matching the mountpoint)
    try {
      const fstab = fs.readFileSync('/etc/fstab', 'utf-8');
      const filtered = fstab.split('\n').filter(line => !line.includes(rawMount)).join('\n');
      const tmpPath = path.join(process.cwd(), 'data', 'fstab.tmp');
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, filtered);
      await execFileAsync('sudo', ['cp', tmpPath, '/etc/fstab'], { timeout: 5000 });
      try { fs.unlinkSync(tmpPath); } catch {}
    } catch {}

    res.json({
      success: true,
      poolRemoved,
      message: poolRemoved
        ? `Disco eliminado del pool y desmontado desde ${rawMount}`
        : `Disco desmontado desde ${rawMount}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[remove-from-pool]', msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// ── SnapRAID ────────────────────────────────────────────────────────────────

/** In-memory store for running snapraid operations */
const snapraidJobs = new Map<string, { output: string[]; done: boolean; exitCode: number | null; startedAt: string }>();

function runSnapraidAsync(jobId: string, args: string[]): void {
  const { spawn } = require('child_process') as typeof import('child_process');
  const job = { output: [] as string[], done: false, exitCode: null as number | null, startedAt: new Date().toISOString() };
  snapraidJobs.set(jobId, job);

  const proc = spawn('sudo', ['snapraid', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

  const onData = (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    job.output.push(...lines);
    // Keep last 500 lines
    if (job.output.length > 500) job.output = job.output.slice(-500);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('close', (code) => {
    job.done = true;
    job.exitCode = code;
  });
}

/** GET /api/storage/snapraid/status — SnapRAID pool status */
storageRouter.get('/snapraid/status', requireAuth, async (_req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync('sudo', ['snapraid', 'status'], { timeout: 30000 });
    const output = (stdout + stderr).trim();
    const hasError = output.includes('DANGER') || output.includes('failed');
    const synced = output.includes('No differences') || output.includes('Everything OK') || output.includes('0 files') ;
    res.json({ available: true, synced, hasError, output });
  } catch {
    res.json({ available: false, synced: false, hasError: false, output: 'SnapRAID no está instalado o configurado.' });
  }
});

/** POST /api/storage/snapraid/sync — Start async SnapRAID sync */
storageRouter.post('/snapraid/sync', requireAdmin, async (req, res) => {
  const jobId = `sync-${Date.now()}`;
  runSnapraidAsync(jobId, ['sync']);
  res.json({ jobId, message: 'SnapRAID sync iniciado' });
});

/** POST /api/storage/snapraid/scrub — Start async SnapRAID scrub */
storageRouter.post('/snapraid/scrub', requireAdmin, async (req, res) => {
  const jobId = `scrub-${Date.now()}`;
  runSnapraidAsync(jobId, ['scrub', '-p', '100', '-o', '0']);
  res.json({ jobId, message: 'SnapRAID scrub iniciado' });
});

/** GET /api/storage/snapraid/progress/:jobId — Live output of a running job */
storageRouter.get('/snapraid/progress/:jobId', requireAuth, (req, res) => {
  const job = snapraidJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ output: job.output, done: job.done, exitCode: job.exitCode, startedAt: job.startedAt });
});

// ── Badblocks ────────────────────────────────────────────────────────────────

interface BadblocksJob {
  output: string[];
  done: boolean;
  exitCode: number | null;
  startedAt: string;
  percent: number;
  badCount: number;
  proc?: import('child_process').ChildProcess;
}

const badblocksJobs = new Map<string, BadblocksJob>();

/**
 * POST /api/storage/badblocks/:device
 * Starts a non-destructive read-only surface scan using badblocks.
 * Safe to run on a mounted disk.
 */
storageRouter.post('/badblocks/:device', requireAdmin, (req, res) => {
  const devName = req.params.device.replace(/[^a-zA-Z0-9]/g, '');
  if (!devName) return res.status(400).json({ error: 'Invalid device' });
  const device = `/dev/${devName}`;

  // Only one scan per device at a time
  const existing = badblocksJobs.get(devName);
  if (existing && !existing.done) {
    return res.status(409).json({ error: 'Scan already running for this device' });
  }

  const { spawn } = require('child_process') as typeof import('child_process');
  const job: BadblocksJob = {
    output: [], done: false, exitCode: null,
    startedAt: new Date().toISOString(), percent: 0, badCount: 0,
  };
  badblocksJobs.set(devName, job);

  // -s = show progress, -v = verbose, -n = non-destructive read-write (safer than -w)
  // Use -s (progress to stderr) -v (verbose) readonly mode
  const proc = spawn('sudo', ['badblocks', '-sv', device], { stdio: ['ignore', 'pipe', 'pipe'] });
  job.proc = proc;

  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    const lines = text.split(/[\n\r]+/).filter(Boolean);
    for (const line of lines) {
      job.output.push(line);
      // Parse progress: "Checking blocks 0 to 976773167"  / "123456789/976773167"
      const pctMatch = line.match(/(\d+)\/(\d+)/);
      if (pctMatch) {
        job.percent = Math.round((parseInt(pctMatch[1]) / parseInt(pctMatch[2])) * 100);
      }
      // Count bad blocks reported
      if (line.match(/^\d+$/)) job.badCount++;
    }
    if (job.output.length > 1000) job.output = job.output.slice(-1000);
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('close', (code) => {
    job.done = true;
    job.exitCode = code;
    job.percent = 100;
    job.proc = undefined;
  });

  res.json({ device, message: `Escaneo iniciado en ${device}` });
});

/** GET /api/storage/badblocks/:device/status — Progress of a running scan */
storageRouter.get('/badblocks/:device/status', requireAuth, (req, res) => {
  const devName = req.params.device.replace(/[^a-zA-Z0-9]/g, '');
  const job = badblocksJobs.get(devName);
  if (!job) return res.json({ running: false, done: false, percent: 0, badCount: 0, output: [] });
  res.json({
    running: !job.done,
    done: job.done,
    exitCode: job.exitCode,
    percent: job.percent,
    badCount: job.badCount,
    startedAt: job.startedAt,
    output: job.output.slice(-50), // last 50 lines
  });
});

/** DELETE /api/storage/badblocks/:device — Cancel a running scan */
storageRouter.delete('/badblocks/:device', requireAdmin, (req, res) => {
  const devName = req.params.device.replace(/[^a-zA-Z0-9]/g, '');
  const job = badblocksJobs.get(devName);
  if (!job || job.done) return res.status(404).json({ error: 'No active scan' });
  try {
    job.proc?.kill('SIGTERM');
    job.done = true;
    job.exitCode = -1;
    res.json({ success: true, message: 'Escaneo cancelado' });
  } catch {
    res.status(500).json({ error: 'Could not cancel scan' });
  }
});

// ── Cache mover ──────────────────────────────────────────────────────────────

interface CacheMoverJob {
  output: string[];
  done: boolean;
  exitCode: number | null;
  startedAt: string;
  proc?: import('child_process').ChildProcess;
}

let cacheMoverJob: CacheMoverJob | null = null;

/** GET /api/storage/cache/status — Cache disk usage and mover status */
storageRouter.get('/cache/status', requireAuth, async (_req, res) => {
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
    const cacheLines = mounts.split('\n').filter(l => l.includes('/mnt/cache'));
    const pool = await getMergerFSPool();

    const cacheDisks = await Promise.all(
      cacheLines.map(async line => {
        const parts = line.split(' ');
        const mountpoint = parts[1];
        try {
          const { stdout } = await execFileAsync('df', ['-B1', '--output=size,used,avail,pcent', mountpoint], { timeout: 5000 });
          const [, dataLine] = stdout.trim().split('\n');
          const [size, used, avail, pct] = dataLine.trim().split(/\s+/);
          return { mountpoint, size: parseInt(size), used: parseInt(used), avail: parseInt(avail), usePercent: parseInt(pct) };
        } catch {
          return { mountpoint, size: 0, used: 0, avail: 0, usePercent: 0 };
        }
      })
    );

    res.json({
      cacheDisks,
      poolMount: pool?.mountpoint || null,
      moverRunning: !!(cacheMoverJob && !cacheMoverJob.done),
      moverJob: cacheMoverJob ? { done: cacheMoverJob.done, exitCode: cacheMoverJob.exitCode, startedAt: cacheMoverJob.startedAt, output: cacheMoverJob.output.slice(-20) } : null,
    });
  } catch {
    res.json({ cacheDisks: [], poolMount: null, moverRunning: false, moverJob: null });
  }
});

/**
 * POST /api/storage/cache/move
 * Moves files from cache disk(s) to the main MergerFS pool using rsync.
 * Files are removed from cache after successful transfer (--remove-source-files).
 */
storageRouter.post('/cache/move', requireAdmin, async (_req, res) => {
  if (cacheMoverJob && !cacheMoverJob.done) {
    return res.status(409).json({ error: 'Cache mover ya está en ejecución' });
  }

  const pool = await getMergerFSPool();
  if (!pool) return res.status(400).json({ error: 'No se encontró pool MergerFS' });

  // Find cache mount points
  const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
  const cacheMounts = mounts.split('\n')
    .filter(l => l.includes('/mnt/cache'))
    .map(l => l.split(' ')[1])
    .filter(Boolean);

  if (cacheMounts.length === 0) {
    return res.status(400).json({ error: 'No se encontraron discos de caché montados' });
  }

  const { spawn } = require('child_process') as typeof import('child_process');

  cacheMoverJob = {
    output: [], done: false, exitCode: null,
    startedAt: new Date().toISOString(),
  };

  // Move from each cache disk to pool
  const runNext = (idx: number) => {
    if (idx >= cacheMounts.length) {
      cacheMoverJob!.done = true;
      cacheMoverJob!.exitCode = 0;
      return;
    }
    const src = cacheMounts[idx] + '/';
    const dst = pool.mountpoint + '/';
    cacheMoverJob!.output.push(`[mover] ${src} → ${dst}`);

    const proc = spawn('sudo', [
      'rsync', '-av', '--remove-source-files',
      '--exclude=.snapraid*', '--exclude=lost+found',
      src, dst,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    cacheMoverJob!.proc = proc;

    const onData = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      cacheMoverJob!.output.push(...lines);
      if (cacheMoverJob!.output.length > 500) cacheMoverJob!.output = cacheMoverJob!.output.slice(-500);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('close', (code) => {
      if (code !== 0) {
        cacheMoverJob!.done = true;
        cacheMoverJob!.exitCode = code;
      } else {
        runNext(idx + 1);
      }
    });
  };

  runNext(0);
  res.json({ message: `Cache mover iniciado: ${cacheMounts.join(', ')} → ${pool.mountpoint}` });
});

/** GET /api/storage/iostats — Disk I/O statistics */
storageRouter.get('/iostats', requireAuth, async (_req, res) => {
  try {
    const stats = await si.disksIO();
    const statList = Array.isArray(stats) ? stats : [stats];
    res.json(statList.map(s => ({
      name: s.name,
      readSpeed: s.rIO_sec ?? 0,
      writeSpeed: s.wIO_sec ?? 0,
      readBytes: s.rIO ?? 0,
      writeBytes: s.wIO ?? 0,
    })));
  } catch {
    res.json([]);
  }
});

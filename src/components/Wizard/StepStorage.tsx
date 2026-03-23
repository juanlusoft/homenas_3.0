import { useState, useEffect } from 'react';
import type { StepProps } from './types';

interface DetectedDisk {
  device: string;
  name: string;
  size: number;
  sizeHuman: string;
  vendor: string;
  model: string;
  type: 'nvme' | 'ssd' | 'hdd';
  bay: string;          // "NVMe 1", "Bay 1", etc.
  serial: string;
  temperature: number;
  connected: boolean;    // false = empty port
}

const POOL_MODES = [
  { id: 'single' as const, label: 'Single', desc: 'No redundancy, max capacity', minDisks: 1, icon: '💾' },
  { id: 'mirror' as const, label: 'Mirror (RAID1)', desc: '1 disk can fail, 50% capacity', minDisks: 2, icon: '🪞' },
  { id: 'stripe' as const, label: 'Stripe (RAID0)', desc: 'Max speed, no redundancy', minDisks: 2, icon: '⚡' },
  { id: 'raidz' as const, label: 'RAID-Z', desc: '1 disk can fail, good capacity', minDisks: 3, icon: '🛡️' },
];

const FS_LIST = [
  { id: 'ext4' as const, label: 'ext4', desc: 'Stable, proven, best compatibility' },
  { id: 'btrfs' as const, label: 'Btrfs', desc: 'Snapshots, compression, checksums' },
  { id: 'zfs' as const, label: 'ZFS', desc: 'Enterprise-grade, needs more RAM' },
];

const TYPE_ICONS = { nvme: '⚡', ssd: '💿', hdd: '🔘' };
const TYPE_LABELS = { nvme: 'NVMe', ssd: 'SSD', hdd: 'HDD' };

async function detectDisks(): Promise<DetectedDisk[]> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/storage/detect-disks`);
    if (res.ok) return res.json();
  } catch { /* fallback to mock */ }

  // Fallback mock — realistic CM5 NAS layout
  return [
    { device: '/dev/nvme0n1', name: 'nvme0n1', size: 500e9, sizeHuman: '500 GB', vendor: 'Samsung', model: '980 PRO', type: 'nvme', bay: 'NVMe 1', serial: 'S6B2NA0T', temperature: 38, connected: true },
    { device: '/dev/nvme1n1', name: 'nvme1n1', size: 500e9, sizeHuman: '500 GB', vendor: 'Samsung', model: '980 PRO', type: 'nvme', bay: 'NVMe 2', serial: 'S6B2NA1K', temperature: 40, connected: true },
    { device: '/dev/sda', name: 'sda', size: 4e12, sizeHuman: '4 TB', vendor: 'WD', model: 'Red Plus WD40EFPX', type: 'hdd', bay: 'Bay 1', serial: 'WD-WX12AB', temperature: 32, connected: true },
    { device: '/dev/sdb', name: 'sdb', size: 4e12, sizeHuman: '4 TB', vendor: 'WD', model: 'Red Plus WD40EFPX', type: 'hdd', bay: 'Bay 2', serial: 'WD-WX12CD', temperature: 33, connected: true },
    { device: '/dev/sdc', name: 'sdc', size: 2e12, sizeHuman: '2 TB', vendor: 'Seagate', model: 'IronWolf ST2000VN003', type: 'hdd', bay: 'Bay 3', serial: 'ZDH1234X', temperature: 35, connected: true },
    { device: '/dev/sdd', name: 'sdd', size: 1e12, sizeHuman: '1 TB', vendor: 'Samsung', model: '870 EVO', type: 'ssd', bay: 'Bay 4', serial: 'S5Y2NB0T', temperature: 28, connected: true },
    // Empty bays — NOT shown
  ];
}

export function StepStorage({ data, update }: StepProps) {
  const [disks, setDisks] = useState<DetectedDisk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectDisks().then(detected => {
      // ONLY show connected disks — filter empty ports
      setDisks(detected.filter(d => d.connected && d.size > 1e9));
      setLoading(false);
    });
  }, []);

  const toggleDisk = (device: string) => {
    const next = data.selectedDisks.includes(device)
      ? data.selectedDisks.filter(d => d !== device)
      : [...data.selectedDisks, device];
    update('selectedDisks', next);
  };

  const nvmeDisks = disks.filter(d => d.type === 'nvme');
  const dataDisks = disks.filter(d => d.type !== 'nvme');

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        💾 Create Storage Pool
      </h2>

      {loading ? (
        <div className="space-y-3 py-4">
          <p className="text-sm text-[var(--text-secondary)]">🔍 Detecting disks...</p>
          {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-void" />)}
        </div>
      ) : (
        <>
          {/* NVMe section */}
          {nvmeDisks.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                ⚡ NVMe Drives
              </p>
              <div className="space-y-2">
                {nvmeDisks.map(disk => (
                  <DiskRow key={disk.device} disk={disk} selected={data.selectedDisks.includes(disk.device)} onToggle={toggleDisk} />
                ))}
              </div>
            </div>
          )}

          {/* HDD/SSD section */}
          {dataDisks.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                💾 Drive Bays
              </p>
              <div className="space-y-2">
                {dataDisks.map(disk => (
                  <DiskRow key={disk.device} disk={disk} selected={data.selectedDisks.includes(disk.device)} onToggle={toggleDisk} />
                ))}
              </div>
            </div>
          )}

          {disks.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--error)]">No disks detected. Check connections.</p>
          )}

          {/* Pool mode */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-2">Pool Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {POOL_MODES.map(mode => (
                <button key={mode.id} onClick={() => update('poolMode', mode.id)}
                  disabled={data.selectedDisks.length < mode.minDisks}
                  className={`px-4 py-3 rounded-lg text-left transition-colors ${
                    data.poolMode === mode.id ? 'bg-teal/10 text-teal ring-1 ring-teal/30' :
                    data.selectedDisks.length < mode.minDisks ? 'opacity-30 cursor-not-allowed' :
                    'text-[var(--text-secondary)] hover:bg-surface-void'
                  }`}>
                  <span className="text-sm font-medium">{mode.icon} {mode.label}</span>
                  <p className="text-xs text-[var(--text-disabled)] mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Filesystem */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-2">Filesystem</p>
            <div className="flex gap-2">
              {FS_LIST.map(fs => (
                <button key={fs.id} onClick={() => update('poolFs', fs.id)}
                  className={`flex-1 px-4 py-3 rounded-lg text-center transition-colors ${
                    data.poolFs === fs.id ? 'bg-teal/10 text-teal ring-1 ring-teal/30' : 'text-[var(--text-secondary)] hover:bg-surface-void'
                  }`}>
                  <span className="text-sm font-bold">{fs.label}</span>
                  <p className="text-xs text-[var(--text-disabled)] mt-1">{fs.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {data.selectedDisks.length > 0 && (
            <p className="text-xs text-orange py-2">
              ⚠️ All data on {data.selectedDisks.length} selected disk{data.selectedDisks.length > 1 ? 's' : ''} will be erased.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── Disk Row Component ────────────────────────────────── */

function DiskRow({ disk, selected, onToggle }: { disk: DetectedDisk; selected: boolean; onToggle: (d: string) => void }) {
  return (
    <button
      onClick={() => onToggle(disk.device)}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors ${
        selected ? 'bg-teal/10 ring-1 ring-teal/30' : 'hover:bg-surface-void'
      }`}
    >
      <input type="checkbox" checked={selected} readOnly className="accent-teal shrink-0" />
      <span className="text-lg shrink-0">{TYPE_ICONS[disk.type]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-[var(--text-primary)]">{disk.bay}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
            disk.type === 'nvme' ? 'bg-purple-500/10 text-purple-400' :
            disk.type === 'ssd' ? 'bg-blue-500/10 text-blue-400' :
            'bg-surface-high text-[var(--text-secondary)]'
          }`}>
            {TYPE_LABELS[disk.type]}
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
          {disk.vendor} {disk.model}
        </p>
        <p className="text-xs text-[var(--text-disabled)] font-mono">{disk.device} · {disk.temperature}°C</p>
      </div>
      <span className="font-mono text-sm font-bold text-teal shrink-0">{disk.sizeHuman}</span>
    </button>
  );
}

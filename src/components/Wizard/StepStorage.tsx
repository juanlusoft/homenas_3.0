import { useState } from 'react';
import type { StepProps } from './types';

interface DiskInfo {
  device: string;
  size: string;
  model: string;
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

export function StepStorage({ data, update }: StepProps) {
  // Mock detected disks — in production, fetch from /api/storage/disks
  const [disks] = useState<DiskInfo[]>([
    { device: '/dev/sda', size: '2 TB', model: 'WD Red Plus' },
    { device: '/dev/sdb', size: '2 TB', model: 'WD Red Plus' },
    { device: '/dev/sdc', size: '4 TB', model: 'Seagate IronWolf' },
    { device: '/dev/sdd', size: '500 GB', model: 'Samsung 870 EVO (SSD)' },
  ]);

  const toggleDisk = (device: string) => {
    const current = data.selectedDisks;
    const next = current.includes(device) ? current.filter(d => d !== device) : [...current, device];
    update('selectedDisks', next);
  };

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        💾 Create Storage Pool
      </h2>

      <p className="text-xs text-[var(--text-secondary)] mb-2">Select disks for the pool:</p>
      <div className="space-y-2 mb-4">
        {disks.map(disk => (
          <button key={disk.device} onClick={() => toggleDisk(disk.device)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
              data.selectedDisks.includes(disk.device) ? 'bg-teal/10 ring-1 ring-teal/30' : 'hover:bg-surface-void'
            }`}>
            <input type="checkbox" checked={data.selectedDisks.includes(disk.device)} readOnly className="accent-teal" />
            <div className="flex-1">
              <span className="font-mono text-sm text-[var(--text-primary)]">{disk.device}</span>
              <span className="text-xs text-[var(--text-secondary)] ml-2">{disk.model}</span>
            </div>
            <span className="font-mono text-sm text-teal">{disk.size}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-2">Pool mode:</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {POOL_MODES.map(mode => (
          <button key={mode.id} onClick={() => update('poolMode', mode.id)}
            disabled={data.selectedDisks.length < mode.minDisks}
            className={`px-3 py-2 rounded-lg text-left transition-colors ${
              data.poolMode === mode.id ? 'bg-teal/10 text-teal ring-1 ring-teal/30' :
              data.selectedDisks.length < mode.minDisks ? 'opacity-30 cursor-not-allowed' :
              'text-[var(--text-secondary)] hover:bg-surface-void'
            }`}>
            <span className="text-sm font-medium">{mode.icon} {mode.label}</span>
            <p className="text-xs text-[var(--text-disabled)] mt-0.5">{mode.desc}</p>
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-2">Filesystem:</p>
      <div className="flex gap-2">
        {FS_LIST.map(fs => (
          <button key={fs.id} onClick={() => update('poolFs', fs.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-center transition-colors ${
              data.poolFs === fs.id ? 'bg-teal/10 text-teal ring-1 ring-teal/30' : 'text-[var(--text-secondary)] hover:bg-surface-void'
            }`}>
            <span className="text-sm font-bold">{fs.label}</span>
            <p className="text-xs text-[var(--text-disabled)] mt-0.5">{fs.desc}</p>
          </button>
        ))}
      </div>

      {data.selectedDisks.length > 0 && (
        <p className="mt-3 text-xs text-orange">
          ⚠️ All data on selected disks will be erased during pool creation.
        </p>
      )}
    </div>
  );
}

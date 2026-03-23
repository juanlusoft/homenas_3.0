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
  bay: string;
  serial: string;
  temperature: number;
  connected: boolean;
}

const TYPE_ICONS = { nvme: '⚡', ssd: '💿', hdd: '🔘' };
const TYPE_LABELS = { nvme: 'NVMe', ssd: 'SSD', hdd: 'HDD' };

type DiskRole = 'parity' | 'data' | 'cache' | 'none';

const ROLE_COLORS: Record<DiskRole, string> = {
  parity: 'bg-orange/10 text-orange border-orange/30',
  data: 'bg-teal/10 text-teal border-teal/30',
  cache: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  none: 'border-[var(--outline-variant)]',
};

const ROLE_LABELS: Record<DiskRole, string> = {
  parity: '🛡️ Parity',
  data: '💾 Data',
  cache: '⚡ Cache',
  none: 'Not assigned',
};

async function detectDisks(): Promise<DetectedDisk[]> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/storage/detect-disks`);
    if (res.ok) return res.json();
  } catch { /* fallback */ }
  return [
    { device: '/dev/sda', name: 'nvme0n1', size: 500e9, sizeHuman: '500 GB', vendor: 'JMB585 Bridge', model: '500 GB NVMe', type: 'nvme', bay: 'NVMe 1', serial: 'S6B2NA0T', temperature: 38, connected: true },
    { device: '/dev/sdc', name: 'sdc', size: 4e12, sizeHuman: '4 TB', vendor: 'WD', model: 'Red Plus WD40EFPX', type: 'hdd', bay: 'Bay 1', serial: 'WD-WX12AB', temperature: 32, connected: true },
    { device: '/dev/sdd', name: 'sdd', size: 4e12, sizeHuman: '4 TB', vendor: 'WD', model: 'Red Plus WD40EFPX', type: 'hdd', bay: 'Bay 2', serial: 'WD-WX12CD', temperature: 33, connected: true },
  ];
}

export function StepStorage({ data, update }: StepProps) {
  const [disks, setDisks] = useState<DetectedDisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Record<string, DiskRole>>({});

  useEffect(() => {
    detectDisks().then(detected => {
      setDisks(detected.filter(d => d.connected && d.size > 1e9));
      setLoading(false);
    });
  }, []);

  // Sync roles to parent
  useEffect(() => {
    const parity = Object.entries(roles).filter(([, r]) => r === 'parity').map(([d]) => d);
    const dataDsks = Object.entries(roles).filter(([, r]) => r === 'data').map(([d]) => d);
    const cache = Object.entries(roles).filter(([, r]) => r === 'cache').map(([d]) => d);
    update('selectedDisks', [...parity, ...dataDsks, ...cache]);
    update('parityDisks', parity);
    update('dataDisks', dataDsks);
    update('cacheDisks', cache);
  }, [roles, update]);

  const cycleRole = (device: string) => {
    const order: DiskRole[] = ['none', 'data', 'parity', 'cache'];
    const current = roles[device] || 'none';
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    setRoles(prev => ({ ...prev, [device]: order[nextIdx] }));
  };

  const parityCount = Object.values(roles).filter(r => r === 'parity').length;
  const dataCount = Object.values(roles).filter(r => r === 'data').length;
  const cacheCount = Object.values(roles).filter(r => r === 'cache').length;

  const FS_LIST = [
    { id: 'ext4' as const, label: 'ext4', desc: 'Stable, proven, best compatibility' },
    { id: 'btrfs' as const, label: 'Btrfs', desc: 'Snapshots, compression, checksums' },
    { id: 'xfs' as const, label: 'XFS', desc: 'High performance, large files' },
  ];

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        💾 SnapRAID + MergerFS Setup
      </h2>
      <p className="text-xs text-[var(--text-secondary)]">
        Click each disk to assign its role. You need at least 1 parity + 1 data disk.
      </p>

      {loading ? (
        <div className="space-y-3 py-4">
          <p className="text-sm text-[var(--text-secondary)]">🔍 Detecting disks...</p>
          {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-void" />)}
        </div>
      ) : (
        <>
          {/* Disk list with role assignment */}
          <div className="space-y-2">
            {disks.map(disk => {
              const role = roles[disk.device] || 'none';
              return (
                <button
                  key={disk.device}
                  onClick={() => cycleRole(disk.device)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-lg text-left transition-all border ${ROLE_COLORS[role]}`}
                >
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
                      {disk.vendor !== disk.model && !disk.model.includes(disk.vendor) ? `${disk.vendor} · ${disk.model}` : disk.model}
                    </p>
                    <p className="text-xs text-[var(--text-disabled)] font-mono">
                      {disk.device} · {disk.sizeHuman}{disk.temperature > 0 ? ` · ${disk.temperature}°C` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ROLE_COLORS[role]}`}>
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Role summary */}
          <div className="flex gap-4 text-xs py-2">
            <span className="text-orange">🛡️ Parity: {parityCount}</span>
            <span className="text-teal">💾 Data: {dataCount}</span>
            <span className="text-purple-400">⚡ Cache: {cacheCount}</span>
          </div>

          {parityCount === 0 && dataCount === 0 && (
            <p className="text-xs text-[var(--text-disabled)]">
              💡 Tip: Use your largest disk as parity, other HDDs as data, and SSD/NVMe as cache.
            </p>
          )}

          {parityCount > 0 && dataCount === 0 && (
            <p className="text-xs text-[var(--error)]">⚠️ You need at least 1 data disk.</p>
          )}

          {/* Filesystem */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              Filesystem (for data disks)
            </p>
            <div className="flex gap-2">
              {FS_LIST.map(fs => (
                <button key={fs.id} onClick={() => update('poolFs', fs.id)}
                  className={`flex-1 px-4 py-3 rounded-lg text-center transition-colors border ${
                    data.poolFs === fs.id ? 'bg-teal/10 text-teal border-teal/30' : 'border-[var(--outline-variant)] text-[var(--text-secondary)] hover:bg-surface-void'
                  }`}>
                  <span className="text-sm font-bold">{fs.label}</span>
                  <p className="text-xs text-[var(--text-disabled)] mt-1">{fs.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {data.selectedDisks.length > 0 && (
            <p className="text-xs text-orange py-2">
              ⚠️ All data on assigned disks will be erased during pool creation.
            </p>
          )}
        </>
      )}
    </div>
  );
}

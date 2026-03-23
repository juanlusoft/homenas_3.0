import { useState } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';

interface Share {
  id: string;
  name: string;
  path: string;
  protocol: 'smb' | 'nfs';
  status: 'active' | 'inactive';
  accessMode: 'read-write' | 'read-only';
  allowedUsers: string[];
  connectedClients: number;
}

const MOCK_SHARES: Share[] = [
  {
    id: '1', name: 'Media', path: '/mnt/storage/media', protocol: 'smb',
    status: 'active', accessMode: 'read-only', allowedUsers: ['everyone'],
    connectedClients: 3,
  },
  {
    id: '2', name: 'Documents', path: '/mnt/storage/documents', protocol: 'smb',
    status: 'active', accessMode: 'read-write', allowedUsers: ['juanlu', 'admin'],
    connectedClients: 1,
  },
  {
    id: '3', name: 'Backups', path: '/mnt/storage/backups', protocol: 'nfs',
    status: 'active', accessMode: 'read-write', allowedUsers: ['192.168.1.0/24'],
    connectedClients: 0,
  },
  {
    id: '4', name: 'Public', path: '/mnt/storage/public', protocol: 'smb',
    status: 'inactive', accessMode: 'read-write', allowedUsers: ['guest'],
    connectedClients: 0,
  },
];

function ShareCard({ share }: { share: Share }) {
  const protocolBadge = share.protocol === 'smb'
    ? 'bg-blue-500/10 text-blue-400'
    : 'bg-purple-500/10 text-purple-400';

  return (
    <GlassCard elevation="mid">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{share.name}</h3>
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${protocolBadge}`}>
              {share.protocol.toUpperCase()}
            </span>
          </div>
          <p className="font-mono text-xs text-[var(--text-secondary)] mt-1">{share.path}</p>
        </div>
        <GlowPill status={share.status === 'active' ? 'healthy' : 'error'} label={share.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Access</span>
          <span className={`font-mono ${share.accessMode === 'read-write' ? 'text-teal' : 'text-[var(--text-primary)]'}`}>
            {share.accessMode}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Users</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">{share.allowedUsers.join(', ')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Connected</span>
          <span className={`font-mono ${share.connectedClients > 0 ? 'text-teal' : 'text-[var(--text-disabled)]'}`}>
            {share.connectedClients} clients
          </span>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <StitchButton size="sm" variant="ghost">Edit</StitchButton>
        <StitchButton size="sm" variant="ghost">
          {share.status === 'active' ? 'Disable' : 'Enable'}
        </StitchButton>
      </div>
    </GlassCard>
  );
}

export default function SharesPage() {
  const [shares] = useState(MOCK_SHARES);

  const activeCount = shares.filter(s => s.status === 'active').length;
  const totalClients = shares.reduce((acc, s) => acc + s.connectedClients, 0);
  const smbCount = shares.filter(s => s.protocol === 'smb').length;
  const nfsCount = shares.filter(s => s.protocol === 'nfs').length;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Shares</p>
          <p className="font-display text-2xl font-bold text-teal">{activeCount}/{shares.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">active</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Connected</p>
          <p className="font-display text-2xl font-bold text-teal">{totalClients}</p>
          <p className="text-xs text-[var(--text-secondary)]">clients</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Protocols</p>
          <div className="flex gap-2 mt-1">
            <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">SMB {smbCount}</span>
            <span className="text-xs font-mono bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">NFS {nfsCount}</span>
          </div>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Actions</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm">+ New Share</StitchButton>
          </div>
        </GlassCard>
      </div>

      {/* Share cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {shares.map(share => <ShareCard key={share.id} share={share} />)}
      </div>
    </div>
  );
}

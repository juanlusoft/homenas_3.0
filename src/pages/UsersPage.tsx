import { useState } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'user' | 'readonly';
  lastLogin: string;
  twoFactor: boolean;
  status: 'active' | 'locked';
}

const MOCK_USERS: User[] = [
  { id: 1, username: 'admin', role: 'admin', lastLogin: '2026-03-23 10:30', twoFactor: true, status: 'active' },
  { id: 2, username: 'juanlu', role: 'admin', lastLogin: '2026-03-23 09:15', twoFactor: true, status: 'active' },
  { id: 3, username: 'backup-agent', role: 'user', lastLogin: '2026-03-22 02:00', twoFactor: false, status: 'active' },
];

const ROLE_COLORS: Record<User['role'], string> = {
  admin: 'text-teal',
  user: 'text-[var(--text-primary)]',
  readonly: 'text-[var(--text-secondary)]',
};

function UserRow({ user }: { user: User }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-high flex items-center justify-center text-sm font-bold text-teal">
          {user.username[0].toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-sm text-[var(--text-primary)]">{user.username}</p>
          <p className={`text-xs font-mono ${ROLE_COLORS[user.role]}`}>{user.role}</p>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="hidden sm:block text-right">
          <p className="text-xs text-[var(--text-secondary)]">Last login</p>
          <p className="font-mono text-xs text-[var(--text-primary)]">{user.lastLogin}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.twoFactor && (
            <span className="text-xs text-teal font-mono" title="2FA enabled">🔐</span>
          )}
          <GlowPill
            status={user.status === 'active' ? 'healthy' : 'error'}
            label={user.status}
          />
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users] = useState<User[]>(MOCK_USERS);

  const adminCount = users.filter(u => u.role === 'admin').length;
  const twoFaCount = users.filter(u => u.twoFactor).length;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Total Users</p>
          <p className="font-display text-2xl font-bold text-teal">{users.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{adminCount} admin</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">2FA Enabled</p>
          <p className="font-display text-2xl font-bold text-teal">{twoFaCount}/{users.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {twoFaCount === users.length ? 'All secured' : `${users.length - twoFaCount} without 2FA`}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Actions</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm">+ Add User</StitchButton>
            <StitchButton size="sm" variant="ghost">Audit Log</StitchButton>
          </div>
        </GlassCard>
      </div>

      {/* User list */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">User Accounts</h3>
        <div className="divide-y divide-[var(--outline-variant)]">
          {users.map(user => <UserRow key={user.id} user={user} />)}
        </div>
      </GlassCard>

      {/* Security settings */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Security Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">Require 2FA for all users</p>
              <p className="text-xs text-[var(--text-secondary)]">Enforce TOTP authentication</p>
            </div>
            <StitchButton size="sm" variant="ghost">Enable</StitchButton>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">Session timeout</p>
              <p className="text-xs text-[var(--text-secondary)]">Auto-logout after inactivity</p>
            </div>
            <span className="font-mono text-sm text-teal">30 min</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">Failed login lockout</p>
              <p className="text-xs text-[var(--text-secondary)]">Lock after 5 failed attempts</p>
            </div>
            <GlowPill status="healthy" label="Active" />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

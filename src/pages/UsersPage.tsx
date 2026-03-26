import { t, ts } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { useAPI } from '@/hooks/useAPI';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'user' | 'readonly';
  lastLogin: string;
  twoFactor: boolean;
  status: 'active' | 'locked';
}

// No mock data — empty state until API responds

const ROLE_COLORS: Record<string, string> = { admin: 'text-teal', user: 'text-[var(--text-primary)]', readonly: 'text-[var(--text-secondary)]' };

export default function UsersPage() {
  const fetchUsers = useCallback(() =>
    authFetch('/users').then(r => r.json()), []);
  const { data: usersData, refresh } = useAPI<User[]>(fetchUsers, 10000);
  const users = usersData || [];
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', role: 'user' as User['role'] });
  const [error, setError] = useState('');
  const [twoFaEnforced, setTwoFaEnforced] = useState(false);

  const adminCount = users.filter(u => u.role === 'admin').length;
  const twoFaCount = users.filter(u => u.twoFactor).length;

  const resetForm = () => { setForm({ username: '', password: '', confirmPassword: '', role: 'user' }); setError(''); };

  const handleAdd = useCallback(async () => {
    if (!form.username.trim()) { setError(t('users.username') + ' required'); return; }
    if (form.password.length < 6) { setError(t('wiz.passwordTooShort')); return; }
    if (form.password !== form.confirmPassword) { setError(t('wiz.passwordsNoMatch')); return; }
    await authFetch('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.trim(), password: form.password, role: form.role }) });
    refresh();
    setAddOpen(false);
    resetForm();
  }, [form]);

  const handleEdit = useCallback(async () => {
    if (!editUser) return;
    await authFetch(`/users/${editUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: form.role }) });
    refresh();
    setEditUser(null);
    resetForm();
  }, [editUser, form]);

  const handleDelete = useCallback(async (id: number) => {
    await authFetch(`/users/${id}`, { method: 'DELETE' });
    refresh();
  }, []);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('users.totalUsers')}</p>
          <p className="font-display text-2xl font-bold text-teal">{users.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">{adminCount} admin</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('users.twoFA')}</p>
          <p className="font-display text-2xl font-bold text-teal">{twoFaCount}/{users.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {twoFaCount === users.length ? t('users.allSecured') : `${users.length - twoFaCount} ${t('users.without2FA')}`}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('users.actions')}</p>
          <div className="flex gap-2 mt-2">
            <StitchButton size="sm" onClick={() => { resetForm(); setAddOpen(true); }}>{t('users.addUser')}</StitchButton>
          </div>
        </GlassCard>
      </div>

      {/* User list */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('users.userAccounts')}</h3>
        <div className="divide-y divide-[var(--outline-variant)]">
          {users.map(user => (
            <div key={user.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-high flex items-center justify-center text-sm font-bold text-teal">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm text-[var(--text-primary)]">{user.username}</p>
                  <p className={`text-xs font-mono ${ROLE_COLORS[user.role]}`}>{user.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-[var(--text-secondary)]">{t('users.lastLogin')}</p>
                  <p className="font-mono text-xs text-[var(--text-primary)]">{user.lastLogin}</p>
                </div>
                {user.twoFactor && <span className="text-xs text-teal font-mono" title="2FA">🔐</span>}
                <GlowPill status={user.status === 'active' ? 'healthy' : 'error'} label={ts(user.status)} />
                <StitchButton size="sm" variant="ghost" onClick={() => { setForm({ ...form, role: user.role }); setEditUser(user); }}>
                  {t('users.edit')}
                </StitchButton>
                <StitchButton size="sm" variant="ghost" onClick={() => handleDelete(user.id)}>
                  🗑️
                </StitchButton>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Security */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('users.securitySettings')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">{t('users.require2FA')}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t('users.enforce2FA')}</p>
            </div>
            <StitchButton size="sm" variant="ghost" onClick={() => {
              authFetch('/users/enforce-2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enforce: !twoFaEnforced }) });
              setTwoFaEnforced(v => !v);
            }}>
              {twoFaEnforced ? t('users.disable') : t('users.enable')}
            </StitchButton>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">{t('users.sessionTimeout')}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t('users.autoLogout')}</p>
            </div>
            <span className="font-mono text-sm text-teal">30 min</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">{t('users.failedLockout')}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t('users.lockAfter5')}</p>
            </div>
            <GlowPill status="healthy" label={ts('active')} />
          </div>
        </div>
      </GlassCard>

      {/* Add User Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('users.addUser')}
        actions={<>
          <StitchButton size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</StitchButton>
          <StitchButton size="sm" onClick={handleAdd}>{t('users.create')}</StitchButton>
        </>}>
        <div className="space-y-3">
          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder={t('users.username')} autoFocus
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder={t('users.password')}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
            placeholder={t('users.confirmPassword')}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]">
            <option value="admin">Admin</option>
            <option value="user">User</option>
            <option value="readonly">Read-only</option>
          </select>
          {error && <p className="text-xs text-[var(--error)]">{error}</p>}
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`${t('users.edit')}: ${editUser?.username}`}
        actions={<>
          <StitchButton size="sm" variant="ghost" onClick={() => setEditUser(null)}>{t('common.cancel')}</StitchButton>
          <StitchButton size="sm" onClick={handleEdit}>{t('common.save')}</StitchButton>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('users.role')}</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
              className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="readonly">Read-only</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

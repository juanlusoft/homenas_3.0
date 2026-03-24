import { useState } from 'react';
import { fetchAPI, setToken, setStoredUser } from '../api/client';
import { StitchButton } from '@/components/UI';

interface Props {
  onLogin: (username: string, role: string) => void;
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: { username: string; role: string };
  error?: string;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [noUsers, setNoUsers] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await fetchAPI<LoginResponse>('/users/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (data.success && data.token) {
        setToken(data.token);
        setStoredUser({ username: data.user.username, role: data.user.role });
        onLogin(data.user.username, data.user.role);
      } else {
        setError('Invalid credentials');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      // If backend says no users exist, show setup message
      if (msg.includes('No users') || msg.includes('no users')) {
        setNoUsers(true);
        setError('No users found. Run setup first.');
      } else if (msg) {
        setError(msg);
      } else {
        setError('Connection error. Check the server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-teal">HomePiNAS</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Luminous Obsidian</p>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-6">
            Sign In
          </h2>

          {noUsers ? (
            <div className="text-center py-4">
              <p className="text-sm text-[var(--error)] mb-2">
                No users found. Run setup first.
              </p>
              <p className="text-xs text-[var(--text-disabled)]">
                The initial setup wizard must be completed before logging in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                  placeholder="admin"
                  autoFocus
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="text-xs text-[var(--error)]">{error}</p>
              )}

              <StitchButton type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </StitchButton>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-[var(--text-disabled)]">
            Secured connection
          </p>
        </div>
      </div>
    </div>
  );
}

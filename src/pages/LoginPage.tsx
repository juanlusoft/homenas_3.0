import { useState } from 'react';
import { t } from '@/i18n';
import { StitchButton } from '@/components/UI';

interface LoginPageProps {
  onLogin: (username: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    if (username && password.length >= 4) {
      onLogin(username);
    } else {
      setError(t('login.invalidCredentials'));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-teal">HomePiNAS</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t('common.luminousObsidian')}</p>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-6">
            {t('login.signIn')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('login.username')}
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                placeholder="admin" autoFocus required />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('login.password')}
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]"
                placeholder="••••••••" required />
            </div>

            {error && <p className="text-xs text-[var(--error)]">{error}</p>}

            <StitchButton type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.signIn')}
            </StitchButton>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--text-disabled)]">
            {t('login.secured')}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { GlassCard, StitchButton } from '@/components/UI';
import { StepStorage } from "@/components/Wizard/StepStorage";
import type { SetupData, StepProps } from "@/components/Wizard/types";


interface SetupWizardProps {
  onComplete: (data: SetupData) => void;
}

const STEPS = ['Language', 'Admin Account', 'NAS Name', 'Network', 'Storage Pool', 'Ready'];

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SetupData>({
    language: 'es', hostname: 'homepinas', username: 'admin',
    password: '', passwordConfirm: '', networkMode: 'dhcp',
    staticIp: '', gateway: '', dns: '8.8.8.8',
    poolMode: 'snapraid', poolFs: 'ext4', selectedDisks: [], parityDisks: [], dataDisks: [], cacheDisks: [],
  });
  const [error, setError] = useState('');

  const update = <K extends keyof SetupData>(key: K, value: SetupData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const canNext = (): boolean => {
    if (step === 1) {
      if (!data.username || data.password.length < 6) return false;
      if (data.password !== data.passwordConfirm) return false;
    }
    if (step === 2 && !data.hostname) return false;
    if (step === 3 && data.networkMode === 'static' && !data.staticIp) return false;
    if (step === 4 && (data.parityDisks.length === 0 || data.dataDisks.length === 0)) return false;
    return true;
  };

  const next = () => {
    if (step === 1 && data.password !== data.passwordConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (step === 1 && data.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-teal">HomePiNAS</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Initial Setup</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-teal text-surface' :
                i === step ? 'bg-teal/20 text-teal border border-teal' :
                'bg-surface-high text-[var(--text-disabled)]'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-teal' : 'bg-surface-high'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-[var(--text-secondary)] mb-6">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>

        {/* Steps */}
        <GlassCard elevation="mid">
          {step === 0 && <StepLanguage data={data} update={update} />}
          {step === 1 && <StepAccount data={data} update={update} error={error} />}
          {step === 2 && <StepHostname data={data} update={update} />}
          {step === 3 && <StepNetwork data={data} update={update} />}
          {step === 4 && <StepStorage data={data} update={update} />}
          {step === 5 && <StepReady data={data} />}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-[var(--outline-variant)]">
            <StitchButton size="sm" variant="ghost" onClick={prev} disabled={step === 0}>
              ← Back
            </StitchButton>
            {step < STEPS.length - 1 ? (
              <StitchButton size="sm" onClick={next} disabled={!canNext()}>
                Next →
              </StitchButton>
            ) : (
              <StitchButton onClick={() => onComplete(data)}>
                🚀 Start HomePiNAS
              </StitchButton>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* ── Step Components ────────────────────────────────────── */

function StepLanguage({ data, update }: StepProps) {
  const langs = [
    { id: 'es', label: 'Español', flag: '🇪🇸' },
    { id: 'en', label: 'English', flag: '🇬🇧' },
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
    { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { id: 'pt', label: 'Português', flag: '🇧🇷' },
    { id: 'it', label: 'Italiano', flag: '🇮🇹' },
  ];

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        🌍 Select Language
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {langs.map(l => (
          <button
            key={l.id}
            onClick={() => update('language', l.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              data.language === l.id ? 'bg-teal/10 text-teal ring-1 ring-teal/30' : 'text-[var(--text-secondary)] hover:bg-surface-void'
            }`}
          >
            <span className="text-xl">{l.flag}</span>
            <span className="text-sm font-medium">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepAccount({ data, update, error }: StepProps & { error: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        👤 Create Admin Account
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Username</label>
          <input value={data.username} onChange={e => update('username', e.target.value)}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Password (min. 6 chars)</label>
          <input type="password" value={data.password} onChange={e => update('password', e.target.value)}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Confirm Password</label>
          <input type="password" value={data.passwordConfirm} onChange={e => update('passwordConfirm', e.target.value)}
            className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        </div>
        {error && <p className="text-xs text-[var(--error)]">{error}</p>}
      </div>
    </div>
  );
}

function StepHostname({ data, update }: StepProps) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        🏠 Name Your NAS
      </h2>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Device Name</label>
        <input value={data.hostname} onChange={e => update('hostname', e.target.value)}
          placeholder="homepinas"
          className="stitch-input w-full rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        <p className="mt-2 text-xs text-[var(--text-disabled)]">
          This name will be visible on your network. Other devices will see it as "{data.hostname}" when browsing shared folders.
        </p>
      </div>
    </div>
  );
}

function StepNetwork({ data, update }: StepProps) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        🌐 Network Configuration
      </h2>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['dhcp', 'static'] as const).map(mode => (
            <button key={mode} onClick={() => update('networkMode', mode)}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                data.networkMode === mode ? 'bg-teal/10 text-teal ring-1 ring-teal/30' : 'text-[var(--text-secondary)] hover:bg-surface-void'
              }`}
            >
              {mode === 'dhcp' ? '🔄 DHCP (Automatic)' : '📌 Static IP'}
            </button>
          ))}
        </div>

        {data.networkMode === 'static' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">IP Address</label>
              <input value={data.staticIp} onChange={e => update('staticIp', e.target.value)}
                placeholder="192.168.1.81" className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Gateway</label>
              <input value={data.gateway} onChange={e => update('gateway', e.target.value)}
                placeholder="192.168.1.1" className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">DNS</label>
              <input value={data.dns} onChange={e => update('dns', e.target.value)}
                placeholder="8.8.8.8" className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepReady({ data }: { data: SetupData }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">
        🚀 Ready to Go!
      </h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">Language</span>
          <span className="text-[var(--text-primary)]">{data.language === 'es' ? 'Español' : data.language}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">Admin user</span>
          <span className="font-mono text-teal">{data.username}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">NAS name</span>
          <span className="font-mono text-[var(--text-primary)]">{data.hostname}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">Network</span>
          <span className="font-mono text-[var(--text-primary)]">
            {data.networkMode === 'dhcp' ? 'DHCP (auto)' : data.staticIp}
          </span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">Storage</span>
          <span className="font-mono text-[var(--text-primary)]">SnapRAID + MergerFS · {data.poolFs}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">🛡️ Parity</span>
          <span className="font-mono text-xs text-orange">{data.parityDisks.join(', ') || 'None'}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[var(--outline-variant)]">
          <span className="text-[var(--text-secondary)]">💾 Data</span>
          <span className="font-mono text-xs text-teal">{data.dataDisks.join(', ') || 'None'}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-[var(--text-secondary)]">⚡ Cache</span>
          <span className="font-mono text-xs text-purple-400">{data.cacheDisks.join(', ') || 'None'}</span>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--text-disabled)] text-center">
        Click "Start HomePiNAS" to apply settings and launch the dashboard.
      </p>
    </div>
  );
}


import { useState } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';

interface SettingsState {
  hostname: string;
  timezone: string;
  language: string;
  autoUpdate: boolean;
  sshEnabled: boolean;
  sshPort: number;
  httpsEnabled: boolean;
  notifyEmail: string;
  notifyOnError: boolean;
  notifyOnBackup: boolean;
  fanMode: 'auto' | 'manual' | 'quiet';
  powerOnAfterFailure: boolean;
}

const INITIAL: SettingsState = {
  hostname: 'homepinas',
  timezone: 'Europe/Madrid',
  language: 'es',
  autoUpdate: true,
  sshEnabled: true,
  sshPort: 22,
  httpsEnabled: false,
  notifyEmail: '',
  notifyOnError: true,
  notifyOnBackup: true,
  fanMode: 'auto',
  powerOnAfterFailure: true,
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="flex items-center gap-3 w-full text-left py-2">
      <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-teal' : 'bg-surface-highest'}`}>
        <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(INITIAL);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    // TODO: POST to /api/settings
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* General */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">General</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Hostname</label>
            <input
              value={settings.hostname}
              onChange={e => update('hostname', e.target.value)}
              className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Timezone</label>
              <select
                value={settings.timezone}
                onChange={e => update('timezone', e.target.value)}
                className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
              >
                <option>Europe/Madrid</option>
                <option>Europe/London</option>
                <option>America/New_York</option>
                <option>Asia/Tokyo</option>
                <option>UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Language</label>
              <select
                value={settings.language}
                onChange={e => update('language', e.target.value)}
                className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <Toggle checked={settings.autoUpdate} onChange={() => update('autoUpdate', !settings.autoUpdate)} label="Auto-update system packages" />
        </div>
      </GlassCard>

      {/* Network & Security */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Network & Security</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Toggle checked={settings.sshEnabled} onChange={() => update('sshEnabled', !settings.sshEnabled)} label="SSH Access" />
            <input
              type="number"
              value={settings.sshPort}
              onChange={e => update('sshPort', parseInt(e.target.value) || 22)}
              className="stitch-input rounded-lg px-3 py-1.5 text-sm w-20 text-center text-[var(--text-primary)]"
              disabled={!settings.sshEnabled}
            />
          </div>
          <Toggle checked={settings.httpsEnabled} onChange={() => update('httpsEnabled', !settings.httpsEnabled)} label="HTTPS (Let's Encrypt)" />
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Notifications</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Email for alerts</label>
            <input
              type="email"
              value={settings.notifyEmail}
              onChange={e => update('notifyEmail', e.target.value)}
              placeholder="admin@example.com"
              className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
            />
          </div>
          <Toggle checked={settings.notifyOnError} onChange={() => update('notifyOnError', !settings.notifyOnError)} label="Notify on errors" />
          <Toggle checked={settings.notifyOnBackup} onChange={() => update('notifyOnBackup', !settings.notifyOnBackup)} label="Notify on backup completion" />
        </div>
      </GlassCard>

      {/* Hardware */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Hardware</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Fan control mode</label>
            <div className="flex gap-2">
              {(['auto', 'manual', 'quiet'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => update('fanMode', mode)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    settings.fanMode === mode ? 'bg-teal/10 text-teal' : 'text-[var(--text-secondary)] hover:bg-surface-void'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            checked={settings.powerOnAfterFailure}
            onChange={() => update('powerOnAfterFailure', !settings.powerOnAfterFailure)}
            label="Power on after power failure"
          />
        </div>
      </GlassCard>

      {/* Save */}
      <div className="flex items-center gap-3">
        <StitchButton onClick={handleSave}>
          {saved ? '✅ Saved!' : '💾 Save Settings'}
        </StitchButton>
        {saved && <GlowPill status="healthy" label="Settings saved" />}
      </div>
    </div>
  );
}

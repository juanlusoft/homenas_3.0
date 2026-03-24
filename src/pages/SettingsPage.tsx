import { t } from '@/i18n';
import { useState, useEffect } from 'react';
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
  telegramToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpTo: string;
  smtpEnabled: boolean;
  ddnsEnabled: boolean;
  ddnsProvider: string;
  ddnsDomain: string;
  ddnsToken: string;
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
  telegramToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpTo: '',
  smtpEnabled: false,
  ddnsEnabled: false,
  ddnsProvider: 'duckdns',
  ddnsDomain: '',
  ddnsToken: '',
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
  const [loaded, setLoaded] = useState(false);

  // Load real settings from backend on mount
  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || '/api';
    fetch(`${API}/settings`).then(r => r.json()).then(data => {
      if (data && typeof data === 'object') {
        setSettings(prev => ({ ...prev, ...data }));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const API = import.meta.env.VITE_API_URL || '/api';

  const handleSave = async () => {
    await fetch(`${API}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestTelegram = async () => {
    if (!settings.telegramToken || !settings.telegramChatId) return;
    await fetch(`${API}/settings/notifications/test-telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: settings.telegramToken, chatId: settings.telegramChatId }),
    });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* General */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('set.general')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.hostname')}</label>
            <input
              value={settings.hostname}
              onChange={e => update('hostname', e.target.value)}
              className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.timezone')}</label>
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
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.language')}</label>
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
          <Toggle checked={settings.autoUpdate} onChange={() => update('autoUpdate', !settings.autoUpdate)} label={t('set.autoUpdate')} />
        </div>
      </GlassCard>

      {/* Network & Security */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('set.networkSecurity')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Toggle checked={settings.sshEnabled} onChange={() => update('sshEnabled', !settings.sshEnabled)} label={t('set.sshAccess')} />
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
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('set.notifications')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.emailAlerts')}</label>
            <input
              type="email"
              value={settings.notifyEmail}
              onChange={e => update('notifyEmail', e.target.value)}
              placeholder="admin@example.com"
              className="stitch-input rounded-lg px-3 py-2 text-sm w-full text-[var(--text-primary)]"
            />
          </div>
          <Toggle checked={settings.notifyOnError} onChange={() => update('notifyOnError', !settings.notifyOnError)} label={t('set.notifyErrors')} />
          <Toggle checked={settings.notifyOnBackup} onChange={() => update('notifyOnBackup', !settings.notifyOnBackup)} label={t('set.notifyBackup')} />
        </div>
      </GlassCard>

      {/* Telegram */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('set.telegram')}</h3>
        <div className="space-y-4">
          <Toggle checked={settings.telegramEnabled} onChange={() => update('telegramEnabled', !settings.telegramEnabled)} label={t('set.telegramEnabled')} />
          {settings.telegramEnabled && (
            <>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.telegramToken')}</label>
                <input value={settings.telegramToken} onChange={e => update('telegramToken', e.target.value)}
                  placeholder="123456:ABC-DEF..."
                  className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.telegramChatId')}</label>
                <input value={settings.telegramChatId} onChange={e => update('telegramChatId', e.target.value)}
                  placeholder="146574793"
                  className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              </div>
              <StitchButton size="sm" variant="ghost" onClick={handleTestTelegram}>{t('set.telegramTest')}</StitchButton>
            </>
          )}
        </div>
      </GlassCard>

      {/* SMTP */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('smtp.title')}</h3>
        <div className="space-y-4">
          <Toggle checked={settings.smtpEnabled} onChange={() => update('smtpEnabled', !settings.smtpEnabled)} label={t('smtp.enabled')} />
          {settings.smtpEnabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('smtp.host')}</label>
                  <input value={settings.smtpHost} onChange={e => update('smtpHost', e.target.value)} placeholder="smtp.gmail.com" className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('smtp.port')}</label>
                  <input type="number" value={settings.smtpPort} onChange={e => update('smtpPort', parseInt(e.target.value) || 587)} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
                </div>
              </div>
              <input value={settings.smtpUser} onChange={e => update('smtpUser', e.target.value)} placeholder={t('smtp.user')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              <input type="password" value={settings.smtpPass} onChange={e => update('smtpPass', e.target.value)} placeholder={t('smtp.pass')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              <input value={settings.smtpTo} onChange={e => update('smtpTo', e.target.value)} placeholder={t('smtp.to')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              <StitchButton size="sm" variant="ghost" onClick={async () => { await fetch(`${API}/settings/notifications/test-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smtpHost: settings.smtpHost, smtpPort: settings.smtpPort, smtpUser: settings.smtpUser, smtpPass: settings.smtpPass, emailTo: settings.smtpTo }) }); }}>{t('smtp.test')}</StitchButton>
            </>
          )}
        </div>
      </GlassCard>

      {/* DDNS */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('ddns.title')}</h3>
        <div className="space-y-4">
          <Toggle checked={settings.ddnsEnabled} onChange={() => update('ddnsEnabled', !settings.ddnsEnabled)} label={t('ddns.enabled')} />
          {settings.ddnsEnabled && (
            <>
              <select value={settings.ddnsProvider} onChange={e => update('ddnsProvider', e.target.value)} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="duckdns">DuckDNS</option>
                <option value="noip">No-IP</option>
                <option value="cloudflare">Cloudflare</option>
              </select>
              <input value={settings.ddnsDomain} onChange={e => update('ddnsDomain', e.target.value)} placeholder={t('ddns.domain')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              <input value={settings.ddnsToken} onChange={e => update('ddnsToken', e.target.value)} placeholder={t('ddns.token')} className="stitch-input w-full rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
              <StitchButton size="sm" variant="ghost" onClick={async () => { await fetch(`${API}/ddns/update`, { method: 'POST' }); }}>{t('ddns.updateNow')}</StitchButton>
            </>
          )}
        </div>
      </GlassCard>

      {/* Hardware */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('set.hardware')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('set.fanMode')}</label>
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
            label={t('set.powerRecovery')}
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

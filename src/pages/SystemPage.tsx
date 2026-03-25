import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { useState, useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';

interface SystemInfo {
  hostname: string;
  platform: string;
  distro: string;
  release: string;
  kernel: string;
  arch: string;
  cpu: string;
  cores: number;
  model: string;
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="font-mono text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const goTo = (view: string) => window.dispatchEvent(new CustomEvent('homepinas:navigate', { detail: view }));

export default function SystemPage() {
  const API = import.meta.env.VITE_API_URL || '/api';
  const [diagResult, setDiagResult] = useState<string>('');
  const [updatesResult, setUpdatesResult] = useState<string>('');

  const fetchInfo = useCallback(() =>
    authFetch(`${API}/system/info`).then(r => r.json() as Promise<SystemInfo>),
  [API]);
  const { data: info, loading: infoLoading } = useAPI<SystemInfo>(fetchInfo);
  const { metrics, isConnected } = useLiveMetrics();
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  const checkUpdates = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await authFetch(`${API}/system/updates`);
      if (res.ok) {
        const data = await res.json();
        if (data.count > 0) {
          setUpdateResult(`${data.count} ${t('sys.updatesAvailable')}: ${data.packages.slice(0, 5).join(', ')}${data.count > 5 ? '...' : ''}`);
          setUpdatesResult(`${data.count} ${t('sys.updatesAvailable')}: ${data.packages.slice(0, 5).join(', ')}${data.count > 5 ? '...' : ''}`);
        } else {
          setUpdateResult(t('sys.upToDate'));
          setUpdatesResult(t('sys.upToDate'));
        }
      } else {
        setUpdateResult(t('sys.updateCheckFailed'));
        setUpdatesResult(t('sys.updateCheckFailed'));
      }
    } catch {
      setUpdateResult(t('sys.updateCheckFailed'));
      setUpdatesResult(t('sys.updateCheckFailed'));
    } finally {
      setUpdating(false);
    }
  }, [API]);

  const runDiagnostics = useCallback(async () => {
    setDiagRunning(true);
    setDiagResult('Running diagnostics...');
    try {
      const res = await authFetch(`${API}/system/diagnostics`);
      if (res.ok) {
        const data = await res.json();
        const lines = [
          `=== System Diagnostics ===`,
          `Timestamp: ${data.timestamp || new Date().toISOString()}`,
          ``,
          `--- OS ---`,
          `Distro: ${data.os?.distro || 'N/A'} ${data.os?.release || ''}`,
          `Kernel: ${data.os?.kernel || 'N/A'}`,
          `Arch: ${data.os?.arch || 'N/A'}`,
          ``,
          `--- CPU ---`,
          `Model: ${data.cpu?.brand || 'N/A'}`,
          `Cores: ${data.cpu?.cores || 'N/A'}`,
          `Speed: ${data.cpu?.speed || 'N/A'} GHz`,
          ``,
          `--- Memory ---`,
          `Total: ${data.memory?.total || 0} GB`,
          `Used: ${data.memory?.used || 0} GB`,
          `Free: ${data.memory?.free || 0} GB`,
          ``,
          `--- Docker ---`,
          `Containers: ${data.docker?.containers || 0} (${data.docker?.running || 0} running)`,
          `Images: ${data.docker?.images || 0}`,
          ``,
          `--- Disks ---`,
          ...(data.disks || []).map((d: { mount: string; use: number }) => `  ${d.mount}: ${d.use}% used`),
          ``,
          `--- Network ---`,
          ...(data.network || []).map((n: { name: string; ip: string; status: string }) => `  ${n.name}: ${n.ip} (${n.status})`),
          ``,
          `Status: All checks complete`,
        ];
        setDiagResult(lines.join('\n'));
      } else {
        setDiagResult('Diagnostics failed: server error');
      }
    } catch {
      setDiagResult('Diagnostics failed: connection error');
    } finally {
      setDiagRunning(false);
    }
  }, [API]);

  return (
    <div className="space-y-8">
      {/* Live status */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('sys.cpu')}</p>
          <p className={`font-display text-3xl font-bold ${parseFloat(metrics?.cpu || '0') > 80 ? 'text-red-400' : 'text-teal'}`}>
            {metrics?.cpu ?? '—'}%
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('dash.memory')}</p>
          <p className="font-display text-3xl font-bold text-teal">
            {metrics?.memory.used ?? '—'}%
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {metrics ? `${(metrics.memory.total / 1024).toFixed(1)} GB total` : ''}
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('dash.temperature')}</p>
          <p className={`font-display text-3xl font-bold ${(metrics?.temperature ?? 0) > 70 ? 'text-red-400' : 'text-teal'}`}>
            {metrics?.temperature ?? '—'}°C
          </p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('sys.status')}</p>
          <div className="flex items-center gap-2 mt-2">
            <GlowPill status={isConnected ? 'healthy' : 'error'} label={isConnected ? 'Online' : 'Offline'} />
          </div>
        </GlassCard>
      </div>

      {/* System info */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlassCard elevation="low">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('sys.systemInfo')}</h3>
          {infoLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-6 animate-pulse rounded bg-surface-void" />)}
            </div>
          ) : info ? (
            <div className="divide-y divide-[var(--outline-variant)]">
              <InfoRow label={t('sys.hostname')} value={info.hostname} />
              <InfoRow label="OS" value={`${info.distro} ${info.release}`} />
              <InfoRow label={t('sys.kernel')} value={info.kernel} />
              <InfoRow label={t('sys.arch')} value={info.arch} />
              <InfoRow label={t('sys.model')} value={info.model || 'Unknown'} />
            </div>
          ) : null}
        </GlassCard>

        <GlassCard elevation="low">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('sys.hardware')}</h3>
          {infoLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-6 animate-pulse rounded bg-surface-void" />)}
            </div>
          ) : info ? (
            <div className="divide-y divide-[var(--outline-variant)]">
              <InfoRow label={t('sys.cpu')} value={info.cpu} />
              <InfoRow label={t('sys.cores')} value={info.cores} />
              <InfoRow label={t('sys.uptime')} value={metrics?.uptime ? formatUptime(metrics.uptime) : '—'} />
            </div>
          ) : null}
        </GlassCard>
      </div>

      {/* Actions */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">{t('sys.actions')}</h3>
        <div className="flex flex-wrap gap-3">
          <StitchButton size="sm" variant="ghost" onClick={runDiagnostics} disabled={diagRunning}>
            {diagRunning ? '...' : t('sys.diagnostics')}
          </StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={checkUpdates} disabled={updating}>
            {updating ? '...' : t('sys.checkUpdates')}
          </StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={() => goTo('logs')}>{t('sys.viewLogs')}</StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={() => goTo('settings')}>{t('sys.configuration')}</StitchButton>
        </div>
        {updateResult && (
          <p className="mt-3 text-sm text-[var(--text-primary)] font-mono">{updateResult}</p>
        )}
      </GlassCard>

      {diagResult && (
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-teal mb-2">Diagnostics</h3>
          <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] max-h-60 overflow-auto">{diagResult}</pre>
          <StitchButton size="sm" variant="ghost" className="mt-2" onClick={() => setDiagResult('')}>Close</StitchButton>
        </GlassCard>
      )}

      {updatesResult && (
        <GlassCard elevation="low">
          <h3 className="font-display text-sm font-semibold text-teal mb-2">Updates</h3>
          <p className="text-sm text-[var(--text-primary)]">{updatesResult}</p>
          <StitchButton size="sm" variant="ghost" className="mt-2" onClick={() => setUpdatesResult('')}>Close</StitchButton>
        </GlassCard>
      )}

      {/* Factory Reset */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--error)] mb-4">🔄 Restablecer</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Borra toda la configuración y vuelve al wizard de inicio. Los datos de los discos NO se borran.</p>
        <StitchButton size="sm" variant="ghost" onClick={async () => {
          if (!confirm('¿Restablecer HomePiNAS? Se borrarán usuarios, ajustes y configuración. Los archivos en disco NO se borran.')) return;
          if (!confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return;
          await authFetch('/system/factory-reset', { method: 'POST' });
          localStorage.clear();
          window.location.reload();
        }}>🔄 Restablecer de fábrica</StitchButton>
      </GlassCard>

      {/* Power */}
      <GlassCard elevation="low">
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-4">Power Control</h3>
        <div className="flex gap-3">
          <StitchButton size="sm" variant="ghost" onClick={async () => {
            if (!confirm('Reboot NAS?')) return;
            await authFetch((import.meta.env.VITE_API_URL || '/api') + '/system/reboot', { method: 'POST' });
          }}>Reboot</StitchButton>
          <StitchButton size="sm" variant="ghost" onClick={async () => {
            if (!confirm('Shutdown NAS? You will need to power it on physically.')) return;
            await authFetch((import.meta.env.VITE_API_URL || '/api') + '/system/shutdown', { method: 'POST' });
          }}>Shutdown</StitchButton>
        </div>
      </GlassCard>
    </div>
  );
}

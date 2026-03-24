import { t, ts } from '@/i18n';
import { useState, useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { api } from '@/api/client';
import type { DockerContainer, SystemdService } from '@/api/client';

const BASE = import.meta.env.VITE_API_URL || '/api';

function ContainerCard({ container, onLogs }: { container: DockerContainer; onLogs: (id: string) => void }) {
  const status = container.status === 'running' ? 'healthy' : container.status === 'paused' ? 'warning' : 'error';

  const handleRestart = async () => {
    await fetch(BASE + '/services/docker/' + container.id + '/restart', { method: 'POST' });
  };

  const handleStop = async () => {
    await fetch(BASE + '/services/docker/' + container.id + '/stop', { method: 'POST' });
  };

  return (
    <GlassCard elevation="mid" className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)] capitalize">{container.name}</h3>
          <p className="font-mono text-xs text-[var(--text-secondary)]">{container.image}</p>
        </div>
        <GlowPill status={status} label={ts(container.status)} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center mb-3">
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">{container.cpu}%</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.cpu')}</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">{container.memory > 0 ? `${container.memory} MB` : '—'}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.memory')}</p>
        </div>
        <div>
          <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{container.uptime || '—'}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.uptime')}</p>
        </div>
      </div>

      {container.ports.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {[...new Set(container.ports)].map((port) => (
            <span key={port} className="font-mono text-xs px-2 py-0.5 rounded bg-surface-void text-[var(--text-secondary)]">
              {port}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <StitchButton size="sm" variant="ghost" onClick={() => onLogs(container.id)}>{t('svc.logs')}</StitchButton>
        <StitchButton size="sm" variant="ghost" onClick={handleRestart}>{t('svc.restart')}</StitchButton>
        {container.status === 'running' && (
          <StitchButton size="sm" variant="ghost" onClick={handleStop}>{t('svc.stop')}</StitchButton>
        )}
      </div>
    </GlassCard>
  );
}

function ServiceRow({ service, onToggle }: { service: SystemdService; onToggle: (name: string, start: boolean) => void }) {
  const status = service.status === 'active' ? 'healthy' : service.status === 'failed' ? 'error' : 'warning';
  const isRunning = service.status === 'active';

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-teal animate-pulse' : 'bg-[var(--text-disabled)]'}`} />
        <div>
          <span className="font-mono text-sm text-[var(--text-primary)]">{service.name}</span>
          {service.enabled && <span className="ml-2 text-xs text-[var(--text-disabled)]">{ts('enabled')}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <GlowPill status={status} label={ts(service.state)} />
        <StitchButton size="sm" variant="ghost" onClick={() => onToggle(service.name, !isRunning)}>
          {isRunning ? t('svc.stop') : t('svc.start')}
        </StitchButton>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const fetchDocker = useCallback(() => api.getDocker(), []);
  const fetchSystemd = useCallback(() => api.getSystemd(), []);

  const { data: containers, loading: dockerLoading, refresh: refreshDocker } = useAPI<DockerContainer[]>(fetchDocker, 5000);
  const { data: services, loading: systemdLoading, refresh: refreshSvc } = useAPI<SystemdService[]>(fetchSystemd, 10000);

  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logContainer, setLogContainer] = useState('');

  const handleViewLogs = useCallback(async (containerId: string) => {
    setLogContainer(containerId);
    setLogContent('Loading logs...');
    setLogOpen(true);
    try {
      const res = await fetch(BASE + '/services/docker/' + containerId + '/logs?lines=100');
      if (res.ok) {
        const data = await res.json();
        setLogContent(data.logs || 'No logs available');
      } else {
        setLogContent('Failed to fetch logs');
      }
    } catch {
      setLogContent('Failed to connect to server');
    }
  }, []);

  const handleToggleService = useCallback(async (name: string, start: boolean) => {
    const action = start ? 'start' : 'stop';
    await fetch(BASE + '/services/' + action + '/' + name, { method: 'POST' });
    refreshSvc();
  }, [refreshSvc]);

  const runningContainers = containers?.filter((c) => c.status === 'running').length || 0;
  const activeServices = services?.filter((s) => s.status === 'active').length || 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('svc.containers')}</p>
          <p className="font-display text-2xl font-bold text-teal">{runningContainers}/{containers?.length || 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.running')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('svc.systemServices')}</p>
          <p className="font-display text-2xl font-bold text-teal">{activeServices}/{services?.length || 0}</p>
          <p className="text-xs text-[var(--text-secondary)]">{ts('active')}</p>
        </GlassCard>
      </div>

      <div>
        <h2 className="mb-5 font-display text-lg font-semibold text-[var(--text-primary)]">{t('svc.containers')}</h2>
        {dockerLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-void" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {containers?.map((c) => <ContainerCard key={c.id} container={c} onLogs={handleViewLogs} />)}
          </div>
        )}
      </div>

      <GlassCard elevation="low">
        <h2 className="mb-5 font-display text-lg font-semibold text-[var(--text-primary)]">{t('svc.systemServices')}</h2>
        {systemdLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-surface-void" />)}
          </div>
        ) : (
          <div className="divide-y divide-[var(--outline-variant)]">
            {services?.map((s) => <ServiceRow key={s.name} service={s} onToggle={handleToggleService} />)}
          </div>
        )}
      </GlassCard>

      {/* Logs Modal */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title={`Logs: ${logContainer}`}>
        <div className="bg-[#0a0a0a] rounded-lg p-4 max-h-[60vh] overflow-auto">
          <pre className="font-mono text-xs text-green-400 whitespace-pre-wrap break-all">{logContent}</pre>
        </div>
      </Modal>
    </div>
  );
}

import { t, ts } from '@/i18n';
import { useState, useCallback } from 'react';
import { GlassCard, GlowPill, StitchButton, Modal } from '@/components/UI';
import { useAPI } from '@/hooks/useAPI';
import { api } from '@/api/client';
import type { DockerContainer, SystemdService } from '@/api/client';

function ContainerCard({ container }: { container: DockerContainer }) {
  const status = container.status === 'running' ? 'healthy' : container.status === 'paused' ? 'warning' : 'error';

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
          <p className="font-mono text-lg font-bold text-[var(--text-primary)]">{container.memory > 0 ? `${container.memory}MB` : '—'}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.memory')}</p>
        </div>
        <div>
          <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{container.uptime || '—'}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('svc.uptime')}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <StitchButton size="sm" variant="ghost" onClick={async () => {
          const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/services/docker/\${container.id}/logs?lines=50\`);
          const data = await res.json();
          setLogContent(data.logs || 'Sin logs'); setLogOpen(true);
        }}>{t('svc.logs')}</StitchButton>
        <StitchButton size="sm" variant="ghost" onClick={async () => {
          await fetch(`${import.meta.env.VITE_API_URL || '/api'}/services/docker/${container.id}/restart`, { method: 'POST' });
        }}>{t('svc.restart')}</StitchButton>
        <StitchButton size="sm" variant="ghost" onClick={async () => { await fetch(`${import.meta.env.VITE_API_URL || '/api'}/services/stop/${container.name}`, { method: 'POST' }); }}>{t('svc.stop')}</StitchButton>
      </div>
      {container.ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {[...new Set(container.ports)].map((port) => (
            <span key={port} className="font-mono text-xs px-2 py-0.5 rounded bg-surface-void text-[var(--text-secondary)]">
              {port}
            </span>
          ))}
        </div>
      )}
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
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Container Logs">
        <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] max-h-[60vh] overflow-auto whitespace-pre-wrap">{logContent}</pre>
      </Modal>
    </div>
  );
}

export default function ServicesPage() {
  const fetchDocker = useCallback(() => api.getDocker(), []);
  const fetchSystemd = useCallback(() => api.getSystemd(), []);

  const { data: containers, loading: dockerLoading } = useAPI<DockerContainer[]>(fetchDocker, 5000);
  const { data: services, loading: systemdLoading, refresh: refreshSvc } = useAPI<SystemdService[]>(fetchSystemd, 10000);

  const handleToggleService = useCallback(async (name: string, start: boolean) => {
    const base = import.meta.env.VITE_API_URL || '/api';
    const action = start ? 'start' : 'stop';
    await fetch(base + '/services/' + action + '/' + name, { method: 'POST' });
    refreshSvc();
  }, [refreshSvc]);

  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');

  const runningContainers = containers?.filter((c) => c.status === 'running').length || 0;
  const activeServices = services?.filter((s) => s.status === 'active').length || 0;

  return (
    <div className="space-y-8">
      {/* Summary */}
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

      {/* Docker containers */}
      <div>
        <h2 className="mb-5 font-display text-lg font-semibold text-[var(--text-primary)]">{t('svc.containers')}</h2>
        {dockerLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-void" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {containers?.map((c) => <ContainerCard key={c.id} container={c} />)}
          </div>
        )}
      </div>

      {/* Systemd services */}
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
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Container Logs">
        <pre className="bg-surface-void rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] max-h-[60vh] overflow-auto whitespace-pre-wrap">{logContent}</pre>
      </Modal>
    </div>
  );
}

/**
 * App card for the HomeStore — installable application
 */

import { GlassCard, GlowPill, StitchButton } from '@/components/UI';
import type { StoreApp } from './types';

interface AppCardProps {
  app: StoreApp;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onOpen: (id: string) => void;
}

export function AppCard({ app, onInstall, onUninstall, onOpen }: AppCardProps) {
  return (
    <GlassCard elevation="mid" className="flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{app.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">{app.name}</h3>
            {app.official && (
              <span className="text-xs bg-teal/10 text-teal px-1.5 py-0.5 rounded-full font-mono">✓</span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{app.author}</p>
        </div>
        {app.installed && (
          <GlowPill status={app.running ? 'healthy' : 'error'} label={app.running ? 'Running' : 'Stopped'} />
        )}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2 flex-1">{app.description}</p>

      <div className="flex items-center justify-between text-xs text-[var(--text-disabled)] mb-3">
        <span className="font-mono">{app.version}</span>
        <span>{app.category}</span>
        {app.port && <span className="font-mono">:{app.port}</span>}
      </div>

      <div className="flex gap-2">
        {app.installed ? (
          <>
            {app.port && (
              <StitchButton size="sm" onClick={() => onOpen(app.id)}>Open</StitchButton>
            )}
            <StitchButton size="sm" variant="ghost" onClick={() => onUninstall(app.id)}>Uninstall</StitchButton>
          </>
        ) : (
          <StitchButton size="sm" onClick={() => onInstall(app.id)}>Install</StitchButton>
        )}
      </div>
    </GlassCard>
  );
}

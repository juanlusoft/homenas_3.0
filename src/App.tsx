import { useState } from 'react';
import { GlowPill, StitchButton } from '@/components/UI';
import DashboardPage from '@/pages/DashboardPage';
import StoragePage from '@/pages/StoragePage';
import ServicesPage from '@/pages/ServicesPage';
import NetworkPage from '@/pages/NetworkPage';

type View = 'dashboard' | 'storage' | 'services' | 'network';

const navItems: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'storage', label: 'Storage', icon: '💾' },
  { id: 'services', label: 'Services', icon: '🐳' },
  { id: 'network', label: 'Network', icon: '🌐' },
];

const viewComponents: Record<View, React.FC> = {
  dashboard: DashboardPage,
  storage: StoragePage,
  services: ServicesPage,
  network: NetworkPage,
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const ViewComponent = viewComponents[currentView];

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-60 bg-surface-raised flex flex-col">
        {/* Logo */}
        <div className="p-stitch-6 mb-stitch-4">
          <h1 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">
            HomePiNAS
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">Luminous Obsidian</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors mb-1 ${
                currentView === item.id
                  ? 'bg-teal/10 text-teal'
                  : 'text-[var(--text-secondary)] hover:bg-surface-void hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-disabled)]">
            <GlowPill status="healthy" label="Online" />
          </div>
          <p className="mt-2 text-xs text-[var(--text-disabled)]">v3.1.0 · Stitch</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 p-stitch-6 lg:p-stitch-10">
        {/* Header */}
        <header className="mb-stitch-8 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] capitalize">
              {currentView}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {currentView === 'dashboard' && 'System overview & metrics'}
              {currentView === 'storage' && 'Disk health & capacity'}
              {currentView === 'services' && 'Docker & systemd management'}
              {currentView === 'network' && 'Network interfaces & traffic'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <GlowPill status="healthy" label="All Systems" />
            <StitchButton size="sm">Settings</StitchButton>
          </div>
        </header>

        {/* View content */}
        <ViewComponent />

        {/* Footer */}
        <footer className="mt-stitch-10 text-center text-xs text-[var(--text-disabled)]">
          HomePiNAS v3.1.0 · Luminous Obsidian · Built with Stitch Design System
        </footer>
      </main>
    </div>
  );
}

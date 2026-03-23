import { useState, useCallback } from 'react';
import { GlowPill, StitchButton } from '@/components/UI';
import DashboardPage from '@/pages/DashboardPage';
import StoragePage from '@/pages/StoragePage';
import ServicesPage from '@/pages/ServicesPage';
import NetworkPage from '@/pages/NetworkPage';
import SystemPage from '@/pages/SystemPage';
import BackupPage from '@/pages/BackupPage';
import ActiveBackupPage from '@/pages/ActiveBackupPage';
import UsersPage from '@/pages/UsersPage';
import FilesPage from '@/pages/FilesPage';
import SharesPage from '@/pages/SharesPage';
import LogsPage from '@/pages/LogsPage';
import TerminalPage from '@/pages/TerminalPage';
import DockerComposePage from '@/pages/DockerComposePage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/LoginPage';
import { NotificationBell } from '@/components/Notifications';
import { useNotifications } from '@/hooks/useNotifications';

type View = 'dashboard' | 'files' | 'shares' | 'storage' | 'backup' | 'active-backup' | 'services' | 'stacks' | 'network' | 'logs' | 'terminal' | 'system' | 'settings' | 'users';

const navItems: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'files', label: 'Files', icon: '📂' },
  { id: 'shares', label: 'Shares', icon: '🔗' },
  { id: 'storage', label: 'Storage', icon: '💾' },
  { id: 'backup', label: 'Backup', icon: '📦' },
  { id: 'active-backup', label: 'Active Backup', icon: '🖥️' },
  { id: 'services', label: 'Services', icon: '🐳' },
  { id: 'stacks', label: 'Stacks', icon: '🏗️' },
  { id: 'network', label: 'Network', icon: '🌐' },
  { id: 'logs', label: 'Logs', icon: '📋' },
  { id: 'terminal', label: 'Terminal', icon: '🖥️' },
  { id: 'system', label: 'System', icon: '⚙️' },
  { id: 'settings', label: 'Settings', icon: '🔧' },
  { id: 'users', label: 'Users', icon: '👤' },
];

const viewSubtitles: Record<View, string> = {
  dashboard: 'System overview & metrics',
  files: 'Browse & manage files',
  shares: 'Samba & NFS shared folders',
  storage: 'Disk health & capacity',
  backup: 'Backup jobs & restore points',
  'active-backup': 'Remote PC backup & restore',
  services: 'Docker & systemd management',
  network: 'Network interfaces & traffic',
  stacks: 'Docker Compose stacks',
  logs: 'System & service log viewer',
  terminal: 'Web terminal access',
  system: 'Hardware, OS & system settings',
  settings: 'NAS configuration',
  users: 'User accounts & access control',
};

const viewComponents: Record<View, React.FC> = {
  dashboard: DashboardPage,
  files: FilesPage,
  shares: SharesPage,
  storage: StoragePage,
  backup: BackupPage,
  'active-backup': ActiveBackupPage,
  services: ServicesPage,
  network: NetworkPage,
  stacks: DockerComposePage,
  logs: LogsPage,
  terminal: TerminalPage,
  system: SystemPage,
  settings: SettingsPage,
  users: UsersPage,
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const { notifications, markRead, clearAll } = useNotifications();
  const ViewComponent = viewComponents[currentView];

  const navigate = useCallback((view: View) => {
    setCurrentView(view);
    setSidebarOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setCurrentView('dashboard');
  }, []);

  // Show login if not authenticated
  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 z-40 h-screen w-60 bg-surface-low flex flex-col
        transition-transform duration-200
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 mb-2">
          <h1 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">
            HomePiNAS
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">Luminous Obsidian</p>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
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

        {/* User + logout */}
        <div className="p-4 border-t border-[var(--outline-variant)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-teal/20 flex items-center justify-center text-xs font-bold text-teal">
                {user[0].toUpperCase()}
              </div>
              <span className="text-sm text-[var(--text-primary)]">{user}</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-[var(--text-disabled)] hover:text-[var(--error)]">
              Logout
            </button>
          </div>
          <p className="text-xs text-[var(--text-disabled)]">v3.5.0 · Stitch</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-60 flex-1 min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-lg border-b border-[var(--outline-variant)] px-4 py-3 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-surface-void"
                aria-label="Open menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <div>
                <h2 className="font-display text-xl lg:text-2xl font-bold tracking-tight text-[var(--text-primary)] capitalize">
                  {currentView}
                </h2>
                <p className="text-xs lg:text-sm text-[var(--text-secondary)]">
                  {viewSubtitles[currentView]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-3">
              <NotificationBell notifications={notifications} onMarkRead={markRead} onClearAll={clearAll} />
              <GlowPill status="healthy" label="All Systems" />
              <StitchButton size="sm" className="hidden sm:inline-flex" onClick={() => navigate('settings')}>
                Settings
              </StitchButton>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-8">
          <ViewComponent />
        </div>

        <footer className="py-4 text-center text-xs text-[var(--text-disabled)]">
          HomePiNAS v3.5.0 · Luminous Obsidian · Stitch Design System
        </footer>
      </main>
    </div>
  );
}

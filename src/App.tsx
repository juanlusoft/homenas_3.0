import { useState, useCallback, useEffect } from 'react';
import { GlowPill, StitchButton } from '@/components/UI';
import { t, setLanguage } from '@/i18n';
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
import VpnPage from '@/pages/VpnPage';
import SchedulerPage from '@/pages/SchedulerPage';
import DockerComposePage from '@/pages/DockerComposePage';
import HomeStorePage from '@/pages/HomeStorePage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/LoginPage';
import SetupWizard from '@/pages/SetupWizard';
import { NotificationBell } from '@/components/Notifications';
import { useNotifications } from '@/hooks/useNotifications';

type View = 'dashboard' | 'files' | 'shares' | 'storage' | 'backup' | 'active-backup' | 'services' | 'stacks' | 'homestore' | 'network' | 'logs' | 'terminal' | 'vpn' | 'scheduler' | 'system' | 'settings' | 'users';

function getNavItems(role: 'admin' | 'user' | 'readonly'): { id: View; label: string; icon: string }[] {
  const items: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: t('nav.dashboard'), icon: '📊' },
  { id: 'files', label: t('nav.files'), icon: '📂' },
  { id: 'shares', label: t('nav.shares'), icon: '🔗' },
  { id: 'storage', label: t('nav.storage'), icon: '💾' },
  { id: 'backup', label: t('nav.backup'), icon: '📦' },
  { id: 'active-backup', label: t('nav.active-backup'), icon: '🖥️' },
  { id: 'services', label: t('nav.services'), icon: '🐳' },
  { id: 'stacks', label: t('nav.stacks'), icon: '🏗️' },
  { id: 'homestore', label: t('nav.homestore'), icon: '🏪' },
  { id: 'network', label: t('nav.network'), icon: '🌐' },
  { id: 'logs', label: t('nav.logs'), icon: '📋' },
  { id: 'terminal', label: t('nav.terminal'), icon: '🖥️' },
  { id: 'vpn', label: 'VPN', icon: '🔐' },
  { id: 'scheduler', label: t('sched.title'), icon: '⏰' },
  { id: 'system', label: t('nav.system'), icon: '⚙️' },
  ];

  // Terminal and Users only visible for admin role
  if (role === 'admin') {
    items.push({ id: 'terminal', label: t('nav.terminal'), icon: '💻' });
    items.push({ id: 'users', label: t('nav.users'), icon: '👤' });
  }

  return items;
}

function getSubtitles(): Record<View, string> {
  return {
  dashboard: t('sub.dashboard'),
  files: t('sub.files'),
  shares: t('sub.shares'),
  storage: t('sub.storage'),
  backup: t('sub.backup'),
  'active-backup': t('sub.active-backup'),
  services: t('sub.services'),
  network: t('sub.network'),
  stacks: t('sub.stacks'),
  homestore: t('sub.homestore'),
  logs: t('sub.logs'),
  terminal: t('sub.terminal'),
  vpn: t('vpn.title'),
  scheduler: t('sched.title'),
  system: t('sub.system'),
  settings: t('sub.settings'),
  users: t('sub.users'),
};
}

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
  homestore: HomeStorePage,
  logs: LogsPage,
  terminal: TerminalPage,
  vpn: VpnPage,
  scheduler: SchedulerPage,
  system: SystemPage,
  settings: SettingsPage,
  users: UsersPage,
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [setupDone, setSetupDone] = useState(() => localStorage.getItem('homepinas-setup') === 'done');
  const [user, setUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | 'readonly'>('admin');
  const { notifications, markRead, clearAll } = useNotifications();
  const ViewComponent = viewComponents[currentView];

  const navigate = useCallback((view: View) => {
    setCurrentView(view);
    setSidebarOpen(false);
  }, []);

  // Allow child pages to navigate via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent<View>).detail;
      if (view) navigate(view);
    };
    window.addEventListener('homepinas:navigate', handler);
    return () => window.removeEventListener('homepinas:navigate', handler);
  }, [navigate]);

  const handleLogout = useCallback(() => {
    setUser(null);
    setCurrentView('dashboard');
  }, []);

  // Show setup wizard on first run
  if (!setupDone) {
    return <SetupWizard onComplete={(data) => {
      localStorage.setItem('homepinas-setup', 'done');
      localStorage.setItem('homepinas-hostname', data.hostname);
      setLanguage(data.language);
      setSetupDone(true);
      setUser(data.username);
      setUserRole('admin'); // wizard creates admin
    }} />;
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginPage onLogin={(username: string, role?: 'admin' | 'user') => {
      setUser(username);
      setUserRole(role || 'admin');
    }} />;
  }

  // Prevent non-admin access to admin-only views
  if (userRole !== 'admin' && (currentView === 'terminal' || currentView === 'users')) {
    setCurrentView('dashboard');
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
          <p className="text-xs text-[var(--text-secondary)]">{t('common.luminousObsidian')}</p>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          {getNavItems(userRole).filter(item => {
            // Hide admin-only pages from non-admin users
            const adminOnly = ['terminal', 'stacks', 'vpn', 'scheduler', 'users', 'settings'];
            if (userRole !== 'admin' && adminOnly.includes(item.id)) return false;
            return true;
          }).map((item) => (
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
                aria-label={t("common.openMenu")}
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
                  {getSubtitles()[currentView]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-3">
              <NotificationBell notifications={notifications} onMarkRead={markRead} onClearAll={clearAll} />
              <GlowPill status="healthy" label={t('header.allSystems')} />
              <StitchButton size="sm" className="hidden sm:inline-flex" onClick={() => navigate('settings')}>
                Settings
              </StitchButton>
            </div>
          </div>
        </header>

        <div className="flex-1 p-5 lg:p-10">
          <ViewComponent />
        </div>

        <footer className="py-4 text-center text-xs text-[var(--text-disabled)]">
          HomePiNAS v3.5.0 · Luminous Obsidian · Stitch Design System
        </footer>
      </main>
    </div>
  );
}

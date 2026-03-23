import { useState, useMemo, useCallback } from 'react';
import { GlassCard } from '@/components/UI';
import { AppCard } from '@/components/HomeStore';
import type { StoreApp, AppCategory } from '@/components/HomeStore';

const CATEGORIES: { id: AppCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🏪' },
  { id: 'media', label: 'Media', icon: '🎬' },
  { id: 'productivity', label: 'Productivity', icon: '📝' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'development', label: 'Dev Tools', icon: '💻' },
  { id: 'network', label: 'Network', icon: '🌐' },
  { id: 'backup', label: 'Backup', icon: '📦' },
  { id: 'monitoring', label: 'Monitoring', icon: '📊' },
];

const INITIAL_APPS: StoreApp[] = [
  // Media
  { id: 'plex', name: 'Plex Media Server', icon: '🎬', author: 'Plex Inc.', description: 'Stream your media anywhere. Organize movies, TV shows, music, and photos.', version: '1.41.0', category: 'media', port: 32400, official: true, installed: true, running: true, image: 'plexinc/pms-docker', size: '350 MB' },
  { id: 'jellyfin', name: 'Jellyfin', icon: '🪼', author: 'Jellyfin Project', description: 'Free software media system. No premium features behind paywalls.', version: '10.9.0', category: 'media', port: 8096, official: true, installed: false, running: false, image: 'jellyfin/jellyfin', size: '300 MB' },
  { id: 'sonarr', name: 'Sonarr', icon: '📺', author: 'Sonarr Team', description: 'TV show management and automated downloads. PVR for Usenet and BitTorrent.', version: '4.0.5', category: 'media', port: 8989, official: true, installed: true, running: true, image: 'linuxserver/sonarr', size: '250 MB' },
  { id: 'radarr', name: 'Radarr', icon: '🎥', author: 'Radarr Team', description: 'Movie collection manager for Usenet and BitTorrent users.', version: '5.6.0', category: 'media', port: 7878, official: true, installed: false, running: false, image: 'linuxserver/radarr', size: '250 MB' },
  { id: 'transmission', name: 'Transmission', icon: '⬇️', author: 'Transmission Project', description: 'Lightweight BitTorrent client with web interface.', version: '4.0.6', category: 'media', port: 9091, official: true, installed: true, running: true, image: 'linuxserver/transmission', size: '120 MB' },

  // Productivity
  { id: 'nextcloud', name: 'Nextcloud', icon: '☁️', author: 'Nextcloud GmbH', description: 'Self-hosted cloud storage, calendar, contacts, and more.', version: '29.0', category: 'productivity', port: 8080, official: true, installed: false, running: false, image: 'nextcloud', size: '800 MB' },
  { id: 'vaultwarden', name: 'Vaultwarden', icon: '🔑', author: 'dani-garcia', description: 'Bitwarden-compatible password manager server. Lightweight Rust implementation.', version: '1.32.0', category: 'security', port: 8888, official: false, installed: true, running: true, image: 'vaultwarden/server', size: '50 MB' },
  { id: 'syncthing', name: 'Syncthing', icon: '🔄', author: 'Syncthing Foundation', description: 'Continuous file synchronization between devices. No cloud required.', version: '1.27.0', category: 'backup', port: 8384, official: true, installed: false, running: false, image: 'syncthing/syncthing', size: '40 MB' },

  // Development
  { id: 'gitea', name: 'Gitea', icon: '🐙', author: 'Gitea', description: 'Lightweight self-hosted Git service. Fork of Gogs.', version: '1.22.0', category: 'development', port: 3000, official: true, installed: true, running: true, image: 'gitea/gitea', size: '100 MB' },
  { id: 'postgres', name: 'PostgreSQL', icon: '🐘', author: 'PostgreSQL Global', description: 'Powerful open-source relational database system.', version: '16.3', category: 'development', port: 5432, official: true, installed: false, running: false, image: 'postgres:16', size: '200 MB' },
  { id: 'redis', name: 'Redis', icon: '🔴', author: 'Redis Ltd.', description: 'In-memory data store for caching, queues, and real-time analytics.', version: '7.4', category: 'development', port: 6379, official: true, installed: false, running: false, image: 'redis:7-alpine', size: '15 MB' },

  // Monitoring
  { id: 'grafana', name: 'Grafana', icon: '📈', author: 'Grafana Labs', description: 'Analytics and monitoring dashboards. Visualize metrics from any source.', version: '11.1', category: 'monitoring', port: 3001, official: true, installed: false, running: false, image: 'grafana/grafana', size: '150 MB' },
  { id: 'uptime-kuma', name: 'Uptime Kuma', icon: '📡', author: 'Louis Lam', description: 'Self-hosted monitoring tool. Check HTTP, TCP, DNS, and more.', version: '1.23.0', category: 'monitoring', port: 3002, official: false, installed: true, running: true, image: 'louislam/uptime-kuma', size: '120 MB' },

  // Network
  { id: 'pihole', name: 'Pi-hole', icon: '🕳️', author: 'Pi-hole', description: 'Network-wide ad blocking. DNS sinkhole for your entire network.', version: '2024.07', category: 'network', port: 8053, official: true, installed: false, running: false, image: 'pihole/pihole', size: '200 MB' },
  { id: 'wireguard', name: 'WireGuard', icon: '🔐', author: 'WireGuard', description: 'Modern VPN. Simple, fast, and secure. Access your NAS from anywhere.', version: '1.0.20210914', category: 'network', port: 51820, official: true, installed: false, running: false, image: 'linuxserver/wireguard', size: '80 MB' },
  { id: 'nginx-proxy', name: 'Nginx Proxy Manager', icon: '🔀', author: 'NginxProxyManager', description: 'Reverse proxy with Let\'s Encrypt SSL. Easy GUI management.', version: '2.11.3', category: 'network', port: 81, official: false, installed: false, running: false, image: 'jc21/nginx-proxy-manager', size: '180 MB' },
];

export default function HomeStorePage() {
  const [apps, setApps] = useState(INITIAL_APPS);
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');

  const filtered = useMemo(() => {
    return apps.filter(app => {
      if (category !== 'all' && app.category !== category) return false;
      if (filter === 'installed' && !app.installed) return false;
      if (filter === 'available' && app.installed) return false;
      if (search && !app.name.toLowerCase().includes(search.toLowerCase()) &&
          !app.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [apps, category, search, filter]);

  const handleInstall = useCallback((id: string) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, installed: true, running: true } : a));
  }, []);

  const handleUninstall = useCallback((id: string) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, installed: false, running: false } : a));
  }, []);

  const handleOpen = useCallback((id: string) => {
    const app = apps.find(a => a.id === id);
    if (app?.port) window.open(`http://${window.location.hostname}:${app.port}`, '_blank');
  }, [apps]);

  const installedCount = apps.filter(a => a.installed).length;
  const runningCount = apps.filter(a => a.running).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Installed</p>
          <p className="font-display text-2xl font-bold text-teal">{installedCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">{runningCount} running</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Available</p>
          <p className="font-display text-2xl font-bold text-teal">{apps.length - installedCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">ready to install</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Search</p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search apps..."
            className="stitch-input rounded-lg px-3 py-1.5 text-sm w-full text-[var(--text-primary)] mt-1"
          />
        </GlassCard>
      </div>

      {/* Categories + filter */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              category === cat.id ? 'bg-teal/10 text-teal' : 'text-[var(--text-secondary)] hover:bg-surface-void'
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}

        <span className="mx-2 text-[var(--outline)]">|</span>

        {(['all', 'installed', 'available'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-teal/10 text-teal' : 'text-[var(--text-secondary)] hover:bg-surface-void'
            }`}
          >
            {f === 'all' ? 'All' : f === 'installed' ? '✓ Installed' : '+ Available'}
          </button>
        ))}

        <span className="ml-auto text-xs text-[var(--text-disabled)]">{filtered.length} apps</span>
      </div>

      {/* App grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map(app => (
          <AppCard
            key={app.id}
            app={app}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onOpen={handleOpen}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-disabled)]">
          <p className="text-3xl mb-2">🔍</p>
          <p>No apps match your search</p>
        </div>
      )}
    </div>
  );
}

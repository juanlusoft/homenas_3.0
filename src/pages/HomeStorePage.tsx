import { useState, useMemo, useCallback, useEffect } from 'react';
import { t } from '@/i18n';
import { authFetch } from '@/api/authFetch';
import { GlassCard, StitchButton, Modal } from '@/components/UI';
import { AppCard } from '@/components/HomeStore';
import type { StoreApp, AppCategory } from '@/components/HomeStore';

function getCategories(): { id: AppCategory | 'all'; label: string; icon: string }[] {
  return [
    { id: 'all', label: t('store.all'), icon: '🏪' },
    { id: 'media', label: t('store.media'), icon: '🎬' },
    { id: 'productivity', label: t('store.productivity'), icon: '📝' },
    { id: 'security', label: t('store.security'), icon: '🔒' },
    { id: 'development', label: t('store.development'), icon: '💻' },
    { id: 'network', label: t('store.network'), icon: '🌐' },
    { id: 'backup', label: t('store.backup'), icon: '📦' },
    { id: 'monitoring', label: t('store.monitoring'), icon: '📊' },
  ];
}

const INITIAL_APPS: StoreApp[] = [
  // Media
  { id: 'plex', name: 'Plex Media Server', icon: '🎬', iconUrl: 'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/plex-icon.png', author: 'Plex Inc.', description: 'Stream your media anywhere. Organize movies, TV shows, music, and photos.', version: '1.41.0', category: 'media', port: 32400, official: true, installed: false, running: false, image: 'plexinc/pms-docker', size: '350 MB' },
  { id: 'jellyfin', name: 'Jellyfin', icon: '🪼', iconUrl: 'https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg', author: 'Jellyfin Project', description: 'Free software media system. No premium features behind paywalls.', version: '10.9.0', category: 'media', port: 8096, official: true, installed: false, running: false, image: 'jellyfin/jellyfin', size: '300 MB' },
  { id: 'sonarr', name: 'Sonarr', icon: '📺', iconUrl: 'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/sonarr-icon.png', author: 'Sonarr Team', description: 'TV show management and automated downloads. PVR for Usenet and BitTorrent.', version: '4.0.5', category: 'media', port: 8989, official: true, installed: false, running: false, image: 'linuxserver/sonarr', size: '250 MB' },
  { id: 'radarr', name: 'Radarr', icon: '🎥', iconUrl: 'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/radarr-icon.png', author: 'Radarr Team', description: 'Movie collection manager for Usenet and BitTorrent users.', version: '5.6.0', category: 'media', port: 7878, official: true, installed: false, running: false, image: 'linuxserver/radarr', size: '250 MB' },
  { id: 'transmission', name: 'Transmission', icon: '⬇️', iconUrl: 'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/transmission-icon.png', author: 'Transmission Project', description: 'Lightweight BitTorrent client with web interface.', version: '4.0.6', category: 'media', port: 9091, official: true, installed: false, running: false, image: 'linuxserver/transmission', size: '120 MB' },

  // Productivity
  { id: 'nextcloud', name: 'Nextcloud', icon: '☁️', iconUrl: 'https://raw.githubusercontent.com/nextcloud/promo/master/nextcloud-icon.svg', author: 'Nextcloud GmbH', description: 'Self-hosted cloud storage, calendar, contacts, and more.', version: '29.0', category: 'productivity', port: 8080, official: true, installed: false, running: false, image: 'nextcloud', size: '800 MB' },
  { id: 'vaultwarden', name: 'Vaultwarden', icon: '🔑', iconUrl: 'https://raw.githubusercontent.com/dani-garcia/vaultwarden/main/resources/vaultwarden-icon.svg', author: 'dani-garcia', description: 'Bitwarden-compatible password manager server. Lightweight Rust implementation.', version: '1.32.0', category: 'security', port: 8888, official: false, installed: false, running: false, image: 'vaultwarden/server', size: '50 MB' },
  { id: 'syncthing', name: 'Syncthing', icon: '🔄', author: 'Syncthing Foundation', description: 'Continuous file synchronization between devices. No cloud required.', version: '1.27.0', category: 'backup', port: 8384, official: true, installed: false, running: false, image: 'syncthing/syncthing', size: '40 MB' },

  // Development
  { id: 'gitea', name: 'Gitea', icon: '🐙', iconUrl: 'https://raw.githubusercontent.com/go-gitea/gitea/main/assets/logo.svg', author: 'Gitea', description: 'Lightweight self-hosted Git service. Fork of Gogs.', version: '1.22.0', category: 'development', port: 3000, official: true, installed: false, running: false, image: 'gitea/gitea', size: '100 MB' },
  { id: 'postgres', name: 'PostgreSQL', icon: '🐘', author: 'PostgreSQL Global', description: 'Powerful open-source relational database system.', version: '16.3', category: 'development', port: 5432, official: true, installed: false, running: false, image: 'postgres:16', size: '200 MB' },
  { id: 'redis', name: 'Redis', icon: '🔴', author: 'Redis Ltd.', description: 'In-memory data store for caching, queues, and real-time analytics.', version: '7.4', category: 'development', port: 6379, official: true, installed: false, running: false, image: 'redis:7-alpine', size: '15 MB' },

  // Monitoring
  { id: 'grafana', name: 'Grafana', icon: '📈', iconUrl: 'https://raw.githubusercontent.com/grafana/grafana/main/public/img/grafana_icon.svg', author: 'Grafana Labs', description: 'Analytics and monitoring dashboards. Visualize metrics from any source.', version: '11.1', category: 'monitoring', port: 3001, official: true, installed: false, running: false, image: 'grafana/grafana', size: '150 MB' },
  { id: 'uptime-kuma', name: 'Uptime Kuma', icon: '📡', author: 'Louis Lam', description: 'Self-hosted monitoring tool. Check HTTP, TCP, DNS, and more.', version: '1.23.0', category: 'monitoring', port: 3002, official: false, installed: false, running: false, image: 'louislam/uptime-kuma', size: '120 MB' },

  // Network
  { id: 'pihole', name: 'Pi-hole', icon: '🕳️', iconUrl: 'https://raw.githubusercontent.com/pi-hole/graphics/master/Vortex/Vortex_Vertical.svg', author: 'Pi-hole', description: 'Network-wide ad blocking. DNS sinkhole for your entire network.', version: '2024.07', category: 'network', port: 8053, official: true, installed: false, running: false, image: 'pihole/pihole', size: '200 MB' },
  { id: 'wireguard', name: 'WireGuard', icon: '🔐', author: 'WireGuard', description: 'Modern VPN. Simple, fast, and secure. Access your NAS from anywhere.', version: '1.0.20210914', category: 'network', port: 51820, official: true, installed: false, running: false, image: 'linuxserver/wireguard', size: '80 MB' },
  { id: 'nginx-proxy', name: 'Nginx Proxy Manager', icon: '🔀', author: 'NginxProxyManager', description: 'Reverse proxy with Let\'s Encrypt SSL. Easy GUI management.', version: '2.11.3', category: 'network', port: 81, official: false, installed: false, running: false, image: 'jc21/nginx-proxy-manager', size: '180 MB' },
  { id: 'bazarr', name: 'Bazarr', icon: '💬', author: 'morpheus65535', description: 'Companion app for Sonarr/Radarr. Manages and downloads subtitles automatically.', version: '1.4.3', category: 'media', port: 6767, official: false, installed: false, running: false, image: 'linuxserver/bazarr', size: '180 MB' },
  { id: 'prowlarr', name: 'Prowlarr', icon: '🔎', author: 'Prowlarr Team', description: 'Indexer manager for Sonarr, Radarr, and other *arr apps. Integrates with all trackers.', version: '1.21.0', category: 'media', port: 9696, official: true, installed: false, running: false, image: 'linuxserver/prowlarr', size: '200 MB' },
  { id: 'lidarr', name: 'Lidarr', icon: '🎵', author: 'Lidarr Team', description: 'Music collection manager for Usenet and BitTorrent users. Like Sonarr but for music.', version: '2.4.0', category: 'media', port: 8686, official: true, installed: false, running: false, image: 'linuxserver/lidarr', size: '250 MB' },
  { id: 'readarr', name: 'Readarr', icon: '📚', author: 'Readarr Team', description: 'Book and audiobook collection manager. Automated ebook management.', version: '0.3.28', category: 'media', port: 8787, official: true, installed: false, running: false, image: 'linuxserver/readarr', size: '220 MB' },
  { id: 'navidrome', name: 'Navidrome', icon: '🎶', author: 'Navidrome', description: 'Modern music server and streamer. Compatible with Subsonic API clients.', version: '0.52.5', category: 'media', port: 4533, official: true, installed: false, running: false, image: 'deluan/navidrome', size: '30 MB' },
  { id: 'photoprism', name: 'PhotoPrism', icon: '📸', author: 'PhotoPrism UG', description: 'AI-powered photo management. Browse, organize, and share your photos.', version: '240711', category: 'media', port: 2342, official: true, installed: false, running: false, image: 'photoprism/photoprism', size: '1.2 GB' },
  { id: 'immich', name: 'Immich', icon: '🖼️', author: 'Immich', description: 'High-performance self-hosted photo and video management. Google Photos alternative.', version: '1.111.0', category: 'media', port: 2283, official: true, installed: false, running: false, image: 'ghcr.io/immich-app/immich-server', size: '800 MB' },
  { id: 'stash', name: 'Stash', icon: '🎞️', author: 'Stash App', description: 'Organizer for your media. Tag, filter, and browse your collection.', version: '0.26.2', category: 'media', port: 9999, official: false, installed: false, running: false, image: 'stashapp/stash', size: '100 MB' },
  { id: 'emby', name: 'Emby Server', icon: '🟢', author: 'Emby LLC', description: 'Media server to organize video, music, and photos. Stream to any device.', version: '4.8.8', category: 'media', port: 8096, official: true, installed: false, running: false, image: 'emby/embyserver', size: '400 MB' },
  { id: 'tautulli', name: 'Tautulli', icon: '📊', author: 'Tautulli', description: 'Monitoring and tracking tool for Plex. Detailed playback statistics.', version: '2.14.3', category: 'media', port: 8181, official: false, installed: false, running: false, image: 'linuxserver/tautulli', size: '120 MB' },
  { id: 'overseerr', name: 'Overseerr', icon: '🎟️', author: 'Overseerr', description: 'Request management and media discovery for Plex. Beautiful UI for users to request content.', version: '1.33.2', category: 'media', port: 5055, official: true, installed: false, running: false, image: 'linuxserver/overseerr', size: '150 MB' },
  { id: 'onlyoffice', name: 'ONLYOFFICE Docs', icon: '📄', author: 'Ascensio System', description: 'Online document editor. Compatible with MS Office formats. Integrate with Nextcloud.', version: '8.1', category: 'productivity', port: 8088, official: true, installed: false, running: false, image: 'onlyoffice/documentserver', size: '2.5 GB' },
  { id: 'bookstack', name: 'BookStack', icon: '📖', author: 'BookStack', description: 'Simple wiki-style documentation platform. Organize information with books, chapters, and pages.', version: '24.05', category: 'productivity', port: 6875, official: false, installed: false, running: false, image: 'linuxserver/bookstack', size: '200 MB' },
  { id: 'paperless', name: 'Paperless-ngx', icon: '🗃️', author: 'Paperless-ngx', description: 'Document management system. Scan, index, and archive your physical documents digitally.', version: '2.11.0', category: 'productivity', port: 8010, official: true, installed: false, running: false, image: 'ghcr.io/paperless-ngx/paperless-ngx', size: '500 MB' },
  { id: 'wikijs', name: 'Wiki.js', icon: '📝', author: 'Requarks', description: 'Powerful wiki engine with Markdown, visual editor, and Git sync. Beautiful and fast.', version: '2.5.303', category: 'productivity', port: 3000, official: true, installed: false, running: false, image: 'requarks/wiki', size: '300 MB' },
  { id: 'vikunja', name: 'Vikunja', icon: '✅', author: 'Vikunja', description: 'Open-source to-do app and task manager. Kanban boards, lists, and team collaboration.', version: '0.24.1', category: 'productivity', port: 3456, official: true, installed: false, running: false, image: 'vikunja/vikunja', size: '50 MB' },
  { id: 'mealie', name: 'Mealie', icon: '🍳', author: 'Mealie', description: 'Recipe management app. Import from any URL, meal planning, and shopping lists.', version: '1.12.0', category: 'productivity', port: 9925, official: false, installed: false, running: false, image: 'hkotel/mealie', size: '200 MB' },
  { id: 'crowdsec', name: 'CrowdSec', icon: '🛡️', author: 'CrowdSec', description: 'Collaborative security engine. Detect and block malicious IPs using crowd intelligence.', version: '1.6.3', category: 'security', port: 8082, official: true, installed: false, running: false, image: 'crowdsecurity/crowdsec', size: '100 MB' },
  { id: 'authelia', name: 'Authelia', icon: '🔏', author: 'Authelia', description: 'SSO and 2FA portal. Protect your apps with authentication and authorization.', version: '4.38.9', category: 'security', port: 9091, official: true, installed: false, running: false, image: 'authelia/authelia', size: '50 MB' },
  { id: 'fail2ban', name: 'Fail2Ban', icon: '🚫', author: 'Fail2Ban', description: 'Intrusion prevention. Bans IPs with too many failed login attempts.', version: '1.1.0', category: 'security', official: true, installed: false, running: false, image: 'linuxserver/fail2ban', size: '30 MB' },
  { id: 'portainer', name: 'Portainer', icon: '🐳', iconUrl: 'https://raw.githubusercontent.com/portainer/portainer/develop/app/assets/ico/favicon.svg', author: 'Portainer.io', description: 'Docker management UI. Manage containers, images, volumes, and networks visually.', version: '2.21.0', category: 'development', port: 9443, official: true, installed: false, running: false, image: 'portainer/portainer-ce', size: '100 MB' },
  { id: 'code-server', name: 'Code Server', icon: '💻', author: 'Coder', description: 'VS Code in the browser. Full IDE running on your NAS, accessible from anywhere.', version: '4.91.1', category: 'development', port: 8443, official: true, installed: false, running: false, image: 'linuxserver/code-server', size: '500 MB' },
  { id: 'drone', name: 'Drone CI', icon: '🤖', author: 'Harness', description: 'Self-service CI/CD platform. Automate testing and deployment with pipelines.', version: '2.24.0', category: 'development', port: 8085, official: true, installed: false, running: false, image: 'drone/drone', size: '80 MB' },
  { id: 'registry', name: 'Docker Registry', icon: '📦', author: 'Docker', description: 'Private Docker image registry. Store and distribute your container images locally.', version: '2.8.3', category: 'development', port: 5000, official: true, installed: false, running: false, image: 'registry:2', size: '25 MB' },
  { id: 'mariadb', name: 'MariaDB', icon: '🐬', author: 'MariaDB Foundation', description: 'MySQL-compatible relational database. Fast, scalable, and robust.', version: '11.4', category: 'development', port: 3306, official: true, installed: false, running: false, image: 'mariadb:11', size: '150 MB' },
  { id: 'mongo', name: 'MongoDB', icon: '🍃', author: 'MongoDB Inc.', description: 'NoSQL document database. Flexible schema, horizontal scaling.', version: '7.0', category: 'development', port: 27017, official: true, installed: false, running: false, image: 'mongo:7', size: '600 MB' },
  { id: 'adminer', name: 'Adminer', icon: '🗄️', author: 'Adminer', description: 'Database management in a single PHP file. MySQL, PostgreSQL, SQLite, Oracle, and more.', version: '4.8.1', category: 'development', port: 8081, official: false, installed: false, running: false, image: 'adminer', size: '20 MB' },
  { id: 'prometheus', name: 'Prometheus', icon: '🔥', author: 'Prometheus', description: 'Monitoring system and time series database. Pull-based metrics collection.', version: '2.53.0', category: 'monitoring', port: 9090, official: true, installed: false, running: false, image: 'prom/prometheus', size: '100 MB' },
  { id: 'netdata', name: 'Netdata', icon: '📉', author: 'Netdata', description: 'Real-time performance monitoring. Zero configuration, beautiful dashboards.', version: '1.46.3', category: 'monitoring', port: 19999, official: true, installed: false, running: false, image: 'netdata/netdata', size: '300 MB' },
  { id: 'glances', name: 'Glances', icon: '👁️', author: 'Nicolargo', description: 'Cross-platform system monitoring tool. Written in Python, web UI included.', version: '4.1.2', category: 'monitoring', port: 61208, official: false, installed: false, running: false, image: 'nicolargo/glances', size: '80 MB' },
  { id: 'dozzle', name: 'Dozzle', icon: '📜', author: 'Dozzle', description: 'Real-time Docker log viewer. Lightweight, no database needed.', version: '8.5.0', category: 'monitoring', port: 8080, official: true, installed: false, running: false, image: 'amir20/dozzle', size: '15 MB' },
  { id: 'homepage', name: 'Homepage', icon: '🏠', author: 'benphelps', description: 'Application dashboard. Organize your services with widgets and bookmarks.', version: '0.9.5', category: 'monitoring', port: 3030, official: false, installed: false, running: false, image: 'ghcr.io/gethomepage/homepage', size: '200 MB' },
  { id: 'adguard', name: 'AdGuard Home', icon: '🛡️', author: 'AdGuard', description: 'Network-wide ad and tracker blocking DNS server. Privacy-focused alternative to Pi-hole.', version: '0.107.52', category: 'network', port: 3000, official: true, installed: false, running: false, image: 'adguard/adguardhome', size: '50 MB' },
  { id: 'traefik', name: 'Traefik', icon: '🔀', author: 'Traefik Labs', description: 'Cloud-native reverse proxy and load balancer. Auto SSL, auto service discovery.', version: '3.1.0', category: 'network', port: 8080, official: true, installed: false, running: false, image: 'traefik:3', size: '100 MB' },
  { id: 'tailscale', name: 'Tailscale', icon: '🔗', author: 'Tailscale Inc.', description: 'Zero-config VPN built on WireGuard. Connect your devices securely without port forwarding.', version: '1.68.1', category: 'network', official: true, installed: false, running: false, image: 'tailscale/tailscale', size: '50 MB' },
  { id: 'cloudflared', name: 'Cloudflare Tunnel', icon: '☁️', author: 'Cloudflare', description: 'Expose your NAS to the internet securely without opening ports. Free Cloudflare tunnel.', version: '2024.6.1', category: 'network', official: true, installed: false, running: false, image: 'cloudflare/cloudflared', size: '30 MB' },
  { id: 'speedtest', name: 'Speedtest Tracker', icon: '⚡', author: 'alexjustesen', description: 'Internet speed test tracker. Scheduled tests with historical data and charts.', version: '0.20.6', category: 'network', port: 8765, official: false, installed: false, running: false, image: 'linuxserver/speedtest-tracker', size: '200 MB' },
  { id: 'duplicati', name: 'Duplicati', icon: '📦', author: 'Duplicati', description: 'Free backup software. Encrypted, incremental, cloud-compatible backups.', version: '2.0.8', category: 'backup', port: 8200, official: true, installed: false, running: false, image: 'linuxserver/duplicati', size: '200 MB' },
  { id: 'restic', name: 'Restic REST Server', icon: '🗄️', author: 'Restic', description: 'REST backend for Restic backup tool. Fast, secure, deduplicated backups.', version: '0.13.0', category: 'backup', port: 8000, official: true, installed: false, running: false, image: 'restic/rest-server', size: '15 MB' },
  { id: 'borgmatic', name: 'Borgmatic', icon: '📼', author: 'Borgmatic', description: 'Simple wrapper for BorgBackup. Deduplicating, compressing, encrypted backups.', version: '1.9.1', category: 'backup', official: true, installed: false, running: false, image: 'ghcr.io/borgmatic-collective/borgmatic', size: '100 MB' },
  { id: 'kopia', name: 'Kopia', icon: '📁', author: 'Kopia', description: 'Fast and secure backup tool. Snapshots, encryption, deduplication, compression.', version: '0.17.0', category: 'backup', port: 51515, official: true, installed: false, running: false, image: 'kopia/kopia', size: '60 MB' },
];

export default function HomeStorePage() {
  const [apps, setApps] = useState(INITIAL_APPS);
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');
  const [busy, setBusy] = useState<Record<string, 'installing' | 'uninstalling'>>({});

  // Sync installed/running state from real Docker containers on mount
  useEffect(() => {
    authFetch('/store/status').then(r => r.json()).then(data => {
      if (data.running && Array.isArray(data.running)) {
        setApps(prev => prev.map(app => {
          const isRunning = data.running.some((name: string) => name === app.id || name.includes(app.id));
          return isRunning ? { ...app, installed: true, running: true } : app;
        }));
      }
    }).catch(() => {});
  }, []);

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

  const handleUninstall = useCallback(async (id: string) => {
    if (!confirm(t('store.uninstall') + '?') || busy[id]) return;
    setBusy(prev => ({ ...prev, [id]: 'uninstalling' }));
    try {
      const res = await authFetch(`/store/uninstall/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: id }),
      });
      if (res.ok) {
        setApps(prev => prev.map(a => a.id === id ? { ...a, installed: false, running: false } : a));
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        alert(`${t('store.uninstall')} error: ${err.error}`);
      }
    } catch {
      alert(`${t('store.uninstall')} error: no se pudo conectar con el servidor`);
    } finally {
      setBusy(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }, [busy]);

  const handleOpen = useCallback((id: string) => {
    const app = apps.find(a => a.id === id);
    if (app?.port) window.open(`http://${window.location.hostname}:${app.port}`, '_blank');
  }, [apps]);

  // Configure modal state
  const [configApp, setConfigApp] = useState<StoreApp | null>(null);
  const [configForm, setConfigForm] = useState({ image: '', port: '', env: '', volumes: '' });

  const handleConfigure = useCallback((id: string) => {
    const app = apps.find(a => a.id === id);
    if (!app) return;
    setConfigForm({
      image: app.image,
      port: app.port ? String(app.port) : '',
      env: '',
      volumes: '',
    });
    setConfigApp(app);
  }, [apps]);

  const handleConfigSave = useCallback(async () => {
    if (!configApp) return;
    const id = configApp.id;
    const port = parseInt(configForm.port) || configApp.port;

    // Update app data with custom config
    setApps(prev => prev.map(a => a.id === id ? { ...a, image: configForm.image, port } : a));

    if (!configApp.installed) {
      // New install — close modal and trigger install
      setConfigApp(null);
      setBusy(prev => ({ ...prev, [id]: 'installing' }));
      try {
        const envPairs = configForm.env.split('\n').filter(Boolean);
        const volumePairs = configForm.volumes.split('\n').filter(Boolean);
        const res = await authFetch(`/store/install/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: configForm.image,
            port,
            name: id,
            env: envPairs,
            volumes: volumePairs,
          }),
        });
        if (res.ok) {
          setApps(prev => prev.map(a => a.id === id ? { ...a, installed: true, running: true } : a));
        } else {
          const err = await res.json().catch(() => ({ error: 'Error' }));
          alert(`${t('store.install')} error: ${err.error}`);
        }
      } catch {
        alert(`${t('store.install')} error: no se pudo conectar`);
      } finally {
        setBusy(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    } else {
      // Edit existing — just update config on server
      try {
        await authFetch(`/store/update/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: configForm.image,
            port,
            env: configForm.env.split('\n').filter(Boolean),
            volumes: configForm.volumes.split('\n').filter(Boolean),
          }),
        });
      } catch { /* ignore */ }
      setConfigApp(null);
    }
  }, [configApp, configForm]);

  const installedCount = apps.filter(a => a.installed).length;
  const runningCount = apps.filter(a => a.running).length;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('store.installed')}</p>
          <p className="font-display text-2xl font-bold text-teal">{installedCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">{runningCount} {t('store.running')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('store.available')}</p>
          <p className="font-display text-2xl font-bold text-teal">{apps.length - installedCount}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t('store.readyToInstall')}</p>
        </GlassCard>
        <GlassCard elevation="mid">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{t('store.searchLabel')}</p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("store.search")}
            className="stitch-input rounded-lg px-3 py-1.5 text-sm w-full text-[var(--text-primary)] mt-1"
          />
        </GlassCard>
      </div>

      {/* Categories + filter */}
      <div className="flex flex-wrap items-center gap-2">
        {getCategories().map(cat => (
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
            {f === 'all' ? t('store.all') : f === 'installed' ? `✓ ${t('store.installed')}` : `+ ${t('store.available')}`}
          </button>
        ))}

        <span className="ml-auto text-xs text-[var(--text-disabled)]">{filtered.length} apps</span>
      </div>

      {/* App grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map(app => (
          <AppCard
            key={app.id}
            app={app}
            busy={busy[app.id]}
            onUninstall={handleUninstall}
            onOpen={handleOpen}
            onConfigure={handleConfigure}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-disabled)]">
          <p className="text-3xl mb-2">🔍</p>
          <p>{t('store.noResults')}</p>
        </div>
      )}

      {/* Configure / Install modal */}
      <Modal
        open={!!configApp}
        onClose={() => setConfigApp(null)}
        title={configApp ? `${configApp.installed ? t('store.edit') : t('store.install')}: ${configApp.name}` : ''}
        actions={<>
          <StitchButton size="sm" variant="ghost" onClick={() => setConfigApp(null)}>{t('common.cancel')}</StitchButton>
          <StitchButton size="sm" onClick={handleConfigSave}>
            {configApp?.installed ? t('common.save') : t('store.install')}
          </StitchButton>
        </>}
      >
        {configApp && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('store.dockerImage')}</label>
              <input value={configForm.image} onChange={e => setConfigForm(f => ({ ...f, image: e.target.value }))}
                className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('store.port')}</label>
              <input value={configForm.port} onChange={e => setConfigForm(f => ({ ...f, port: e.target.value }))}
                placeholder="8080" type="number"
                className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('store.envVars')}</label>
              <textarea value={configForm.env} onChange={e => setConfigForm(f => ({ ...f, env: e.target.value }))}
                placeholder="PUID=1000&#10;PGID=1000&#10;TZ=Europe/Madrid" rows={3}
                className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)] resize-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('store.volumes')}</label>
              <textarea value={configForm.volumes} onChange={e => setConfigForm(f => ({ ...f, volumes: e.target.value }))}
                placeholder="/mnt/storage/media:/data&#10;/opt/config:/config" rows={3}
                className="stitch-input w-full rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)] resize-none" />
            </div>
            <p className="text-xs text-[var(--text-disabled)]">{t('store.configHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

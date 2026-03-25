# HomePiNAS v6

**Dashboard NAS de nueva generación · Diseño Stitch "Luminous Obsidian"**

## Instalación

```bash
curl -sL https://raw.githubusercontent.com/juanlusoft/homenas_3.0/main/install.sh | sudo bash
```

El instalador:
- Actualiza el sistema (`apt update && upgrade`)
- Instala Node.js 22, pnpm, nginx, git
- Configura HTTPS con certificado self-signed (puerto 443)
- Crea servicio systemd con auto-arranque

Accede por: `https://<IP-del-NAS>`

## Stack

| Componente | Tecnología |
|-----------|------------|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| UI | shadcn/ui + Stitch "Luminous Obsidian" |
| Backend | Express 5 + Socket.io 4 |
| Auth | JWT + bcrypt + TOTP 2FA |
| Monitorización | systeminformation + lsblk (real-time) |
| Base de datos | JSON files (data/) + better-sqlite3 |
| Charts | Recharts 3 (lazy-loaded) |
| Notificaciones | Telegram + SMTP |
| i18n | Español + English (430+ claves) |
| PWA | Service Worker + manifest.json |

## Vistas (19 + Login + Wizard)

| Vista | Descripción |
|-------|-------------|
| 🔐 Login | Auth JWT real con control de roles |
| 📊 Panel | Métricas real-time (CPU/Mem/Uptime/Disco) + 4 gráficos |
| 📂 Archivos | Gestor de archivos (upload/mkdir/delete/rename) |
| 🔗 Compartidos | Samba + NFS (CRUD + toggle + config real) |
| 💾 Almacenamiento | Discos SMART real + dedup + badges rol |
| 📦 Copias de seguridad | rsync/btrfs real + CRUD + run |
| 🖥️ Active Backup | Backup de PCs remotos (Win/Mac/Linux) |
| 🐳 Servicios | Docker (logs/restart/stop) + systemd (start/stop) |
| 🏗️ Stacks | Docker Compose real (up/down/edit/create) |
| 🏪 Tienda | 57 apps, install/uninstall Docker real |
| 🌐 Red | Interfaces reales + editor nmcli + chart |
| 📋 Registros | journalctl real + filtros nivel/unidad |
| 🖥️ Terminal | Ejecución real (30+ comandos whitelisted) |
| 🔐 VPN | WireGuard (setup/peers/config) |
| ⏰ Tareas | Cron editor real (CRUD + crontab sync) |
| ⚙️ Sistema | Diagnóstico + updates + reboot/shutdown + factory reset |
| 🔧 Ajustes | SSH + HTTPS + Fan + Telegram + SMTP + DDNS |
| 👤 Usuarios | CRUD + roles + 2FA TOTP |
| 🔔 Notificaciones | Historial real + alertas automáticas |

## Wizard de Primer Inicio

6 pasos: Idioma → Cuenta Admin → Nombre NAS → Red → Pool de Discos → Resumen

- Detección de discos via `lsblk` (JMB585, NVMe, SATA, USB)
- SnapRAID + MergerFS / Mirror / Basic
- Asignación de roles: Paridad / Datos / Caché
- Formateo en paralelo (todos los discos a la vez)
- Panel de progreso en tiempo real
- Marca disco del SO como "Sistema"

## Alertas Automáticas (Telegram)

| Evento | Ejemplo |
|--------|---------|
| Disco lleno (>95%) | `/mnt/storage al 96%` |
| Temperatura alta (>70°C) | `CPU: 72°C` |
| Backup completado/fallido | `System Backup — 4.2 GB` |
| Login fallido | `admin desde 192.168.1.10` |
| Servicio reiniciado | `nginx se ha reiniciado` |

## Desarrollo

```bash
pnpm install
pnpm dev          # Vite + backend concurrently
pnpm build        # producción
pnpm lint         # ESLint 10
```

## Backup Agent

App Electron para backup automático de PCs al NAS.
- Windows (.exe) / macOS (.dmg) / Linux (.AppImage)
- Auto-descubrimiento del NAS en la red
- Backup incremental o imagen completa
- Descarga: [GitHub Releases](https://github.com/juanlusoft/homenas_3.0/releases)

## 📋 Changelog

### v6.2.0 (25 Marzo 2026)
- Auth JWT real en todas las páginas
- CORS abierto para LAN
- lsblk para detección completa de discos
- nginx obligatorio en instalador
- apt update+upgrade automático
- Formateo paralelo de discos
- Panel de progreso en wizard
- Factory reset desde UI
- Alertas Telegram automáticas
- VPN + Scheduler + DDNS + SMTP
- 19 rutas backend, 430+ i18n keys

### v3.0.0 (21 Marzo 2026) - Release Inicial

---

**Equipo**: Vision 👁️ (HomeLabs Avengers)

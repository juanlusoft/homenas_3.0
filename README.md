# HomePiNAS v6.4.1

**Dashboard NAS completo · Diseño Stitch "Luminous Obsidian"**

## Instalación

```bash
curl -sL https://raw.githubusercontent.com/juanlusoft/homenas_3.0/main/install.sh | sudo bash
```

El instalador automáticamente:
- Actualiza el sistema (`apt update && upgrade`)
- Instala Node.js 22, pnpm, nginx, git
- Configura HTTPS con certificado self-signed (puerto 443)
- Crea servicio systemd con auto-arranque
- Configura sudoers para smartctl

Accede por: `https://<IP-del-NAS>`

## Stack

| Componente | Tecnología |
|-----------|------------|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| UI | shadcn/ui + Stitch "Luminous Obsidian" |
| Backend | Express 5 + Socket.io 4 |
| Auth | JWT + bcrypt + TOTP 2FA + roles |
| Monitorización | systeminformation + lsblk (real-time) |
| Storage | MergerFS + SnapRAID + SMART (smartctl) |
| Charts | Recharts 3 (lazy-loaded) |
| Notificaciones | Telegram + SMTP automáticas |
| i18n | Español + English (430+ claves) |
| PWA | Service Worker + manifest.json |

## 19 Vistas + Login + Wizard

| Vista | Descripción |
|-------|-------------|
| 🔐 Login | Auth JWT real con control de roles |
| 📊 Panel | Métricas real-time + 4 gráficos + uptime + disco |
| 📂 Archivos | Upload, mkdir, download, rename, delete |
| 🔗 Compartidos | Samba + NFS (CRUD + toggle + config real) |
| 💾 Almacenamiento | SMART real + dedup + badges rol |
| 📦 Backup | rsync/btrfs real + CRUD + run |
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
- Formateo en paralelo (todos los discos a la vez)
- Panel de progreso en tiempo real
- Desmonta discos + crea partición GPT automáticamente

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

## 📋 Changelog

### v6.4.1 (30 Marzo 2026)
- Actualización desde git: botón "Buscar actualizaciones" comprueba commits pendientes en origin/main
- Botón "Aplicar actualización" hace git pull + pnpm install + reinicio del servicio
- Badge pulsante en sidebar encima del usuario cuando hay actualización disponible
- Comprobación automática de updates al login y cada hora

### v6.3.0 (26 Marzo 2026)
- File actions: download, rename, delete per file
- MergerFS mount fix (ProtectSystem removed)
- authFetch double /api prefix fixed globally
- Theme + language toggles in header
- Upload to correct directory
- Password min 6 chars
- Disk format: unmount + GPT partition
- Wizard progress panel real-time
- Factory reset button
- Network throughput integer display
- MergerFS dedup (no /mnt/storage duplicate)

### v6.0.0 (25 Marzo 2026)
- VPN + Scheduler pages
- Reboot/shutdown from UI
- Notification history
- Config export/import
- DDNS + SMTP + Telegram alerts
- Health monitor (disk/temp)

### v3.0.0 (21 Marzo 2026) - Release Inicial

---

**Equipo**: Vision 👁️ (HomeLabs Avengers)
**Repo**: https://github.com/juanlusoft/homenas_3.0

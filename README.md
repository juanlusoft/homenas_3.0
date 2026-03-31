# HomePiNAS v6.5.7

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

## Active Backup — Cómo funciona

### Flujo

1. **Generar agente** — En el dashboard ve a *Active Backup → Descargar Agente*, elige tipo de backup y SO. El NAS genera un token único y muestra un comando de instalación.
2. **Ejecutar en el equipo remoto** — El admin copia el comando y lo ejecuta con permisos de administrador. El agente binario (compilado en Go) se descarga del NAS y se instala como servicio del sistema de forma silenciosa.
3. **Aprobar dispositivo** — El equipo aparece en *Pendientes* en el dashboard. El admin lo aprueba.
4. **Backup automático** — A partir de ese momento el agente hace backup diario a las 02:00 y reporta el resultado al NAS.

El agente es invisible: no aparece en la barra de tareas, ni en el Dock, ni en ningún menú. Se ejecuta al arrancar el sistema aunque no haya sesión de usuario abierta.

### Tipos de backup

| Tipo | Qué copia | Primera ejecución | Siguientes ejecuciones |
|------|-----------|-------------------|------------------------|
| **Disco completo** | Todos los ficheros del sistema (`/` o `C:\`) | Copia todo lo que está ocupado en disco | Solo ficheros nuevos o modificados |
| **Incremental** | Directorio home (`$HOME` / `%USERPROFILE%`) | Copia todo el home | Solo cambios desde el último backup |
| **Carpetas** | Documentos, Escritorio, Imágenes | Copia el contenido de esas carpetas | Solo cambios en esas carpetas |

**Sobre el tamaño del backup:**

El agente trabaja a nivel de fichero (rsync / robocopy), **no** crea imágenes de disco.

- El tamaño ocupado en el NAS es el del **espacio real utilizado**, nunca el tamaño total del disco.
- Ejemplo: disco de 2 TB con 400 GB de datos → backup ocupa ~400 GB.
- No es restaurable a metal desnudo (no sustituye a clonezilla o dd). Es un backup de ficheros.

### Plataformas del agente

| SO | Mecanismo de backup | Servicio del sistema | Binario |
|----|--------------------|--------------------|---------|
| Windows 10/11 | robocopy → SMB share | Tarea Programada (SYSTEM) | `agent-windows-amd64.exe` |
| macOS 12+ | rsync → SSH | LaunchDaemon (root) | `agent-darwin-arm64` / `agent-darwin-amd64` |
| Linux | rsync → SSH | systemd service | `agent-linux-arm64` / `agent-linux-amd64` |

Para recompilar los binarios (requiere Go 1.22+ en Mac Studio):

```bash
bash agent/build.sh
```

---

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

### v6.4.7 (30 Marzo 2026)
- Instalador: añade ntfs-3g, exfat-fuse, exfatprogs, smartmontools, parted, gdisk, badblocks, rsync, snapraid, mergerfs
- Instalador: sudoers completo para todos los comandos NAS (mount, umount, blkid, sgdisk, mkfs, badblocks, rsync, snapraid, nmcli, systemctl...)

### v6.4.6 (30 Marzo 2026)
- Badblocks: escaneo de superficie no destructivo por disco con progreso en tiempo real y cancelación
- Cache Mover: mueve archivos de discos caché al pool MergerFS via rsync con salida en vivo
- GET /storage/iostats: estadísticas de I/O por disco
- GET/POST /storage/cache/status|move: gestión del cache mover
- POST/GET/DELETE /storage/badblocks/:device: control completo del escaneo

### v6.4.5 (30 Marzo 2026)
- Almacenamiento: botón "Quitar del pool" en discos de datos/caché con hot-remove MergerFS
- SnapRAID: sección con estado del pool, sync y scrub con salida en tiempo real
- POST /storage/remove-from-pool: hot-remove + unmount + limpieza fstab

### v6.4.4 (30 Marzo 2026)
- Almacenamiento: sección "Discos disponibles" con detección de discos sin usar
- Hot-plug: añadir disco al pool MergerFS en caliente (POST /storage/add-to-pool)
- Volumen individual: formatear y montar disco independiente (POST /storage/mount-standalone)
- Montar externo: NTFS/FAT32/exFAT/ext4 sin formatear para recuperar datos (POST /storage/mount-external)
- Desmontar: endpoint POST /storage/unmount

### v6.4.3 (30 Marzo 2026)
- git-check: usa ruta absoluta del repo en lugar de process.cwd() (fix en producción)
- git-check: devuelve el error real al frontend en lugar de mensaje genérico

### v6.5.7 (31 Marzo 2026)
- Active Backup: renombrar dispositivo desde DeviceDetail (icono lápiz junto al nombre)
- Active Backup: barra de progreso en DeviceCard y DeviceDetail durante backup activo
- Active Backup: botón "Backup Now" envía señal al agente (triggerBackup) en lugar de solo cambiar estado
- Active Backup: agente Go reporta progreso por ruta (0→90%) y al finalizar (100%) via POST /agent/:id/progress
- Active Backup: timeout automático — si el agente lleva >30 min sin heartbeat, estado vuelve a offline
- Backend: PUT /devices/:id para renombrar + POST /agent/:id/progress para progreso en tiempo real
- Agente Go recompilado con soporte de trigger manual y reporte de progreso

### v6.5.6 (31 Marzo 2026)
- security: protect metrics routes, unify frontend fetch, remove shell in network.ts

### v6.5.5 (31 Marzo 2026)
- Active Backup: mejor manejo de errores en la generación del agente (muestra el error real del servidor)

### v6.5.4 (31 Marzo 2026)
- Active Backup: botón "Descargar binario" en el modal (descarga directa desde el NAS)

### v6.5.3 (31 Marzo 2026)
- Active Backup: agente Go compilado para Win/Mac/Linux (reemplaza los scripts .ps1/.sh)
- El agente se instala como servicio silencioso del sistema (sin ventanas, sin scripts visibles)
- Windows: Windows Task Scheduler (SYSTEM) · macOS: LaunchDaemon · Linux: systemd
- Flujo plug & play: admin genera comando de una línea → cliente lo ejecuta como admin → listo
- Binarios precompilados en `agent/dist/` (arm64 + amd64 para cada plataforma)
- Backend: endpoints `/agent/activate`, `/agent/:id/config`, `/agent/:id/report` para el protocolo Go
- Backend: `/agent/binary/:platform` sirve el binario directamente desde el NAS

### v6.5.2 (30 Marzo 2026)
- Active Backup: generación de agentes para Windows (.ps1), macOS (.sh) y Linux (.sh)
- Agentes con token único preconfigurado y registro automático en el NAS
- 3 tipos de backup: disco completo, incremental y carpetas específicas
- Windows: robocopy + Tarea Programada · macOS: rsync + launchd · Linux: rsync + cron

### v6.5.1 (30 Marzo 2026)
- Tienda: descripciones de todas las apps traducidas al español/inglés según idioma seleccionado
- Tienda: añadidos Threadfin, Dispatcharr y Aircd con iconos originales
- Tienda: búsqueda funciona en ambos idiomas

### v6.5.0 (30 Marzo 2026)
- OTA: actualización incluye ahora pnpm build para reconstruir el frontend
- OTA: pnpm install usa CI=true para evitar el error de no TTY
- Almacenamiento: fix error TS (DiskInfo.mount → mountpoint) que impedía el build

### v6.4.9 (30 Marzo 2026)
- Gráficos: eje X muestra hora real completa (HH:MM:SS) en lugar de solo minutos:segundos

### v6.4.8 (30 Marzo 2026)
- Red: fix guardar IP estática — nmcli resuelve el nombre de conexión por dispositivo (no asume que coincide con el nombre de interfaz)
- Red: feedback visual en modal de configuración (spinner, mensaje de error si falla)

### v6.4.2 (30 Marzo 2026)
- Red: fix botón Guardar IP (URL incorrecta /interfaces/:id → /:id/config)
- Tienda: botones de ordenación A→Z, Z→A y orden de integración (Default)

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

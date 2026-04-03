# HomePiNAS v6.6.2

**Dashboard NAS completo · Diseño Stitch "Luminous Obsidian"**

## Instalación

```bash
curl -sSL https://raw.githubusercontent.com/juanlusoft/homenas_3.0/main/install.sh | sudo bash
```

El instalador automáticamente:
- Actualiza el sistema (`apt update && upgrade`)
- Instala Node.js 22, pnpm, nginx, git, Docker
- Instala herramientas de almacenamiento (mergerfs, snapraid, smartmontools, parted, ntfs-3g...)
- Configura HTTPS con certificado self-signed (puerto 443)
- Crea servicio systemd con auto-arranque
- Configura sudoers para todos los comandos NAS

Accede por: `https://<IP-del-NAS>`

## Desinstalación

```bash
curl -sSL https://raw.githubusercontent.com/juanlusoft/homenas_3.0/main/uninstall.sh | sudo bash
```

El desinstalador elimina:
- Servicio systemd + configuración nginx + sudoers
- Directorio `/opt/homepinas-v3` (código + base de datos)
- Entradas de `/etc/fstab` creadas por el wizard
- Puntos de montaje gestionados (`/mnt/storage`, `/mnt/cache`, `/mnt/parity`)

**No toca:** Node.js, nginx, Docker, Git, ni los datos en los discos físicos.

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

Notas actuales del flujo:
- El host del NAS para Active Backup ya no está fijado a una IP concreta: se deriva dinámicamente del host/URL del panel.
- Las credenciales SMB ya no están hardcodeadas en el agente: se introducen al generar el instalador.
- macOS y Linux montan el share SMB real del NAS antes de ejecutar `rsync`.
- La descarga manual del agente desde la UI permite elegir arquitectura en macOS y Linux (`amd64` / `arm64`).
- El comando de instalación silenciosa de macOS y Linux autodetecta la arquitectura del cliente remoto antes de descargar el binario.

Para recompilar los binarios (requiere Go 1.22+). Opciones:

```bash
# Opción A: en el Mac Studio
bash agent/build.sh

# Opción B: en el NAS (Go instalado en /usr/local/go)
ssh juanlu@192.168.1.81
export PATH=$PATH:/usr/local/go/bin
cd /opt/homepinas-v3/agent
bash build.sh
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

### v6.6.4 (31 Marzo 2026)
- Active Backup: creado `active-backup-core/` como servicio aislado para desarrollar y depurar el modulo fuera del dashboard principal
- Active Backup: desplegado `active-backup-core` en el NAS de pruebas `192.168.1.81` escuchando en `http://192.168.1.81:3011`
- Active Backup: validado el flujo aislado de Windows hasta copia real en NAS: token `v1.` correcto, activacion correcta, credenciales SMB persistidas y escritura real en `/mnt/storage/active-backup/m1pro-core`
- Active Backup: velocidad medida en la prueba real por Wi-Fi de portatil Windows: ~`4.53 MB/s`; se decide no usar esa prueba para validar rendimiento ni esperar al final de un backup de muchas horas
- Active Backup: prueba posterior con Windows por cable confirma que el flujo de instalacion/aprobacion ya esta cerrado; el bloqueo actual queda en `robocopy` sobre `C:\` contra Samba (`ERROR 87`) y en el solapamiento entre backup manual y programado
- Active Backup: manana toca corregir en el agente la exclusion de ficheros/rutas conflictivos de Windows y la guarda para no lanzar dos backups simultaneos

### v6.6.3 (31 Marzo 2026)
- Active Backup: añadidos endpoints `GET /devices/:id/browse` y `GET /devices/:id/download` para explorar y descargar contenido real del backup desde el dashboard
- Active Backup: `DeviceDetail` ya permite abrir carpetas del backup y descargar archivos individuales
- Active Backup: portados los scripts de `recovery-usb/` desde el repo antiguo al proyecto actual
- Active Backup: añadidos endpoints `GET /recovery/status`, `POST /recovery/build`, `GET /recovery/download` y `GET /recovery/scripts`
- Active Backup: tarjeta nueva de `USB Recovery` en la UI con estado de ISO, descarga de scripts y trigger de build

### v6.6.2 (31 Marzo 2026)
- Active Backup: tokens de instalación firmados (`v1.`) con `backupHost`, `backupShare`, `backupUsername`, `backupPassword` y `backupType`, para que el agente no pierda credenciales SMB si el backend reinicia entre "generar" y "activar"
- Active Backup: incidencia detectada en el NAS de pruebas `192.168.1.81` — el endpoint `/api/active-backup/agent/generate/windows` seguía devolviendo tokens hexadecimales viejos hasta forzar el restart del proceso Node en memoria
- Active Backup: eliminados los hardcodes de entorno en Windows — usuario SMB, contraseña y host del NAS ahora se configuran dinámicamente al generar el agente
- Active Backup: macOS y Linux dejan de usar una ruta local falsa (`/mnt/storage/...`) y montan el share SMB real del NAS antes de ejecutar `rsync`
- Active Backup: selector de arquitectura en la UI para descarga manual de agentes macOS/Linux (`amd64` / `arm64`)
- Active Backup: el comando de instalación silenciosa de macOS/Linux autodetecta la arquitectura del cliente remoto
- Active Backup: binarios recompilados de nuevo para Windows amd64, Linux amd64/arm64 y macOS amd64/arm64

### v6.6.2 (2 Abril 2026)
- Installer: detección de arquitectura al arrancar (arm64/armhf/amd64) y versión de Debian/Ubuntu
- Installer: función `pkg_installed` + `install_pkg` — cada paquete se verifica individualmente antes de instalar; ya no falla silenciosamente si uno no existe
- Installer: paquetes comunes instalados uno a uno en bucle para diagnóstico claro por paquete
- Installer: `snapraid` tiene manejo propio — intenta apt, warn con URL si no está en repos
- Installer: `mergerfs` ya no usa apt (no está en repos Debian estándar) — descarga .deb desde GitHub Releases detectando arquitectura y codename de Debian automáticamente

### v6.6.1 (31 Marzo 2026)
- Active Backup: fix crítico — robocopy en Windows usaba `C:` como nombre de directorio destino en la ruta UNC, provocando que Windows interpretara el segmento como referencia a unidad (no como carpeta). `filepath.Base("C:\\")` devuelve `"C:"` → ahora se sanitiza a `"C"` → ruta correcta `\\NAS\active-backup\device\C\`
- Active Backup: todos los binarios del agente recompilados (Windows amd64, Linux amd64/arm64, macOS amd64/arm64)

### v6.6.0 (31 Marzo 2026)
- Active Backup: fix crítico de token — `approve` ahora actualiza el dispositivo existente (approved=true) en lugar de crear uno nuevo con token distinto. El bucle infinito de re-activación está corregido
- Active Backup: agente Go detecta IP real de salida via TCP dial al NAS (evita capturar 127.0.0.1 del proxy Nginx)
- Active Backup: deduplicación de dispositivos por hostname (no por hostname+IP) — evita duplicados cuando IP cambia
- Active Backup: fallback de rutas por defecto usa el OS real del dispositivo (no siempre Linux)
- Active Backup: `saveData()` correctamente llamado tras resetear `pendingBackup` en config poll
- Active Backup: PUT /devices/:id acepta `backupPaths` y `schedule` para edición posterior
- Active Backup: UI de edición de rutas de backup en DeviceDetail (añadir/editar/eliminar por ruta)
- Active Backup: tipos de backup Windows corregidos (C:\\Users para incremental, carpetas reales para folders)
- Active Backup: argumento `net use` en orden correcto (`\\share password /user:juanlu`)
- Active Backup: schtasks /TR sin comillas manuales (causaban error de parámetro)

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

### v6.5.9 (31 Marzo 2026)
- Active Backup: agente Windows monta el share SMB con `net use` antes de robocopy (autenticación como SYSTEM)
- Active Backup: backend detecta OS Windows y envía ruta UNC `\\NAS\active-backup\folder` en lugar de ruta Linux
- Active Backup: agente Go calcula el tamaño real del backup con `dirSize()` y lo reporta al completar
- Active Backup: progreso reporta tiempo transcurrido por carpeta
- Go instalado en NAS (`/usr/local/go`) — se puede compilar allí sin el Mac Studio

### v6.5.8 (31 Marzo 2026)
- Active Backup: persistencia de dispositivos en disco (`data/active-backup.json`) — los registros sobreviven a reinicios del servicio
- Active Backup: agente Go detecta 401/404 en poll de config y se reactiva automáticamente sin reinstalar
- Active Backup: agente Go ignora certificado TLS autofirmado del NAS (`InsecureSkipVerify`)
- Active Backup: binarios recompilados con todas las correcciones de conectividad

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

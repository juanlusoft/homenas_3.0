# HomePiNAS – Estado y Pendientes

> Actualizado: 31 Marzo 2026 · v6.6.1

---

## ✅ COMPLETADO

### Active Backup (módulo principal — en fase de pruebas)
- [x] Agente Go compilado para Win/Mac/Linux (arm64 + amd64)
- [x] Agente se instala como servicio silencioso del sistema (schtasks SYSTEM / LaunchDaemon / systemd)
- [x] Flujo plug & play: nombre del dispositivo obligatorio antes de generar comando
- [x] Dispositivo pendiente aparece solo cuando el agente conecta (no al generar)
- [x] Persistencia de dispositivos en disco (`data/active-backup.json`)
- [x] Agente se reactiva automáticamente si el NAS reinicia (detecta 401/404)
- [x] Agente ignora TLS autofirmado del NAS
- [x] Renombrar dispositivo (icono lápiz inline en DeviceDetail)
- [x] Barra de progreso en tiempo real (0→100% + archivo actual + velocidad)
- [x] Botón "Backup Now" envía triggerBackup al agente via poll de config
- [x] Windows: agente monta el share SMB con `net use juanlu/mimora` antes de robocopy
- [x] Windows: ruta de destino UNC (`\\NAS\active-backup\folder`) via Samba
- [x] Windows: argumento `net use` en orden correcto (`\\share password /user:juanlu`)
- [x] Windows: schtasks /TR sin comillas manuales
- [x] Tamaño real del backup reportado al completar (`dirSize`)
- [x] Timeout automático: dispositivos en backing-up >30 min vuelven a offline
- [x] Share Samba `[active-backup]` configurado en el NAS (`/mnt/storage/active-backup`)
- [x] Go instalado en NAS para compilar binarios sin Mac Studio
- [x] **BUG 10 (CRÍTICO)**: `approve` actualiza el dispositivo existente (approved=true) — ya no crea nuevo token que rompía la auth del agente → bucle infinito de re-activación CORREGIDO
- [x] **BUG 1**: fallback de rutas por defecto usa OS real del dispositivo (no siempre Linux)
- [x] **BUG 3**: deduplicación por hostname (no hostname+IP) — evita duplicados al cambiar IP
- [x] **BUG 2/8**: agente detecta IP real de salida via TCP dial al NAS (evita 127.0.0.1 del proxy)
- [x] **BUG 5**: orden correcto de argumentos en `net use`
- [x] **BUG 4**: `saveData()` llamado tras resetear pendingBackup en config poll
- [x] PUT /devices/:id acepta `backupPaths` y `schedule` para edición desde DeviceDetail
- [x] UI de edición de rutas de backup en DeviceDetail (añadir/editar/eliminar per-ruta)
- [x] **BUG C: (CRÍTICO)**: `filepath.Base("C:\\")` devolvía `"C:"` → sanitizado a `"C"` → ruta UNC correcta `\\NAS\active-backup\device\C\` — robocopy ya no copia 0 bytes en backup full

---

## 🔴 PENDIENTE URGENTE

### Active Backup — pendientes de prueba
- [ ] **Verificar backup real en Windows**: comprobar que después del fix `C:` el backup full copia ficheros reales a `/mnt/storage/active-backup/`
- [ ] **Reinstalar agente Windows**: el equipo `Minisforum-M1Pro` tiene el binario viejo sin el fix de `C:`
  - Pasos: `schtasks /Delete /TN "HomePiNASAgent" /F` → borrar `C:\Program Files\HomePiNAS\` → nuevo install desde dashboard
- [ ] **Schtasks SYSTEM falla (-2147024894)**: la tarea programada falla al ejecutarse como SYSTEM pero funciona manualmente
  - Hipótesis: PATH o variables de entorno distintas como SYSTEM
  - Workaround temporal: ejecutar manualmente con `& "C:\Program Files\HomePiNAS\agent.exe" --run`

---

## 🟡 PENDIENTE (resto del dashboard)

### 1. Panel
- [ ] Filtrar particiones eMMC (`mmcblk*`) del Array de Discos
- [ ] Eliminar tarjetas duplicadas (Temperatura + Red ya tienen gráfico abajo)

### 2. Almacenamiento
- [ ] Filtrar dispositivos eMMC
- [ ] Deduplicar disco sdc (aparece como `/mnt/disks/data-sdc` y `/mnt/storage`)

### 3. Backup clásico
- [ ] Botones `+ Nueva Tarea`, `Ejecutar Todo`, `Ejecutar Ahora`, `Configurar` — conectar a API

### 4. Active Backup (mejoras futuras)
- [ ] Historial de backups por dispositivo (versiones + fechas + tamaños)
- [ ] Configurar schedule personalizado desde la UI (no solo 02:00 hardcoded)
- [ ] Notificación Telegram/SMTP al completar/fallar backup

### 5. Servicios
- [ ] Traducir estados: `running` → `en ejecución`, `dead` → `detenido`

### 6. Ajustes
- [ ] Toggle SSH con efecto real (systemctl)

---

## Estado del servidor real (192.168.1.81)

| Componente | Estado |
|-----------|--------|
| Servicio homepinas-v3 | ✅ activo (v6.6.1) |
| Samba `[active-backup]` | ✅ activo, `/mnt/storage/active-backup` |
| Go 1.23.4 | ✅ instalado en `/usr/local/go` |
| Binarios agente | ✅ recompilados con fix C: (31 Mar 17:34) |
| Dispositivo Minisforum-M1Pro | ⚠️ necesita reinstalar agente (binario viejo) |
| Schtasks SYSTEM | ⚠️ falla -2147024894 (workaround: ejecutar manual) |

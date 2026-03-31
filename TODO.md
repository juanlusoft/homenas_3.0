# HomePiNAS â€“ Estado y Pendientes

> Actualizado: 31 Marzo 2026 Â· v6.6.2

---

## âœ… COMPLETADO

### Active Backup (mÃ³dulo principal â€” en fase de pruebas)
- [x] Agente Go compilado para Win/Mac/Linux (arm64 + amd64)
- [x] Agente se instala como servicio silencioso del sistema (schtasks SYSTEM / LaunchDaemon / systemd)
- [x] Flujo plug & play: nombre del dispositivo obligatorio antes de generar comando
- [x] Dispositivo pendiente aparece solo cuando el agente conecta (no al generar)
- [x] Persistencia de dispositivos en disco (`data/active-backup.json`)
- [x] Agente se reactiva automÃ¡ticamente si el NAS reinicia (detecta 401/404)
- [x] Agente ignora TLS autofirmado del NAS
- [x] Renombrar dispositivo (icono lÃ¡piz inline en DeviceDetail)
- [x] Barra de progreso en tiempo real (0â†’100% + archivo actual + velocidad)
- [x] BotÃ³n "Backup Now" envÃ­a triggerBackup al agente via poll de config
- [x] Windows: agente monta el share SMB antes de robocopy
- [x] Windows: ruta de destino UNC via Samba
- [x] Windows: argumento `net use` en orden correcto (`\\share password /user:usuario`)
- [x] Windows: schtasks /TR sin comillas manuales
- [x] TamaÃ±o real del backup reportado al completar (`dirSize`)
- [x] Timeout automÃ¡tico: dispositivos en backing-up >30 min vuelven a offline
- [x] Share Samba `[active-backup]` configurado en el NAS (`/mnt/storage/active-backup`)
- [x] Go instalado en NAS para compilar binarios sin Mac Studio
- [x] **BUG 10 (CRÃTICO)**: `approve` actualiza el dispositivo existente (approved=true) â€” ya no crea nuevo token que rompÃ­a la auth del agente â†’ bucle infinito de re-activaciÃ³n CORREGIDO
- [x] **BUG 1**: fallback de rutas por defecto usa OS real del dispositivo (no siempre Linux)
- [x] **BUG 3**: deduplicaciÃ³n por hostname (no hostname+IP) â€” evita duplicados al cambiar IP
- [x] **BUG 2/8**: agente detecta IP real de salida via TCP dial al NAS (evita 127.0.0.1 del proxy)
- [x] **BUG 5**: orden correcto de argumentos en `net use`
- [x] **BUG 4**: `saveData()` llamado tras resetear pendingBackup en config poll
- [x] PUT /devices/:id acepta `backupPaths` y `schedule` para ediciÃ³n desde DeviceDetail
- [x] UI de ediciÃ³n de rutas de backup en DeviceDetail (aÃ±adir/editar/eliminar per-ruta)
- [x] **BUG C: (CRÃTICO)**: `filepath.Base("C:\\")` devolvÃ­a `"C:"` â†’ sanitizado a `"C"` â†’ ruta UNC correcta `\\NAS\active-backup\device\C\` â€” robocopy ya no copia 0 bytes en backup full
- [x] Eliminados hardcodes de entorno en Active Backup: usuario SMB, contraseÃ±a e IP del NAS ya no estÃ¡n fijados a `juanlu`, `mimora` y `192.168.1.81`
- [x] macOS y Linux usan el share SMB real del NAS para backup (montaje temporal + `rsync`) en lugar de una ruta local falsa `/mnt/storage/...`
- [x] UI de generaciÃ³n del agente pide credenciales SMB y share al crear el instalador
- [x] UI de descarga manual permite elegir arquitectura en macOS y Linux (`amd64` / `arm64`)
- [x] InstalaciÃ³n silenciosa de macOS/Linux autodetecta la arquitectura del cliente remoto antes de descargar el binario
- [x] Binarios del agente recompilados de nuevo en Mac Studio (Windows amd64, Linux amd64/arm64, macOS amd64/arm64)

---

## ðŸ”´ PENDIENTE URGENTE

### Active Backup â€” pendientes de prueba
- [ ] **Verificar backup real en Windows**: comprobar que despuÃ©s del fix `C:` y de la eliminaciÃ³n de hardcodes el backup full copia ficheros reales a `/mnt/storage/active-backup/`
- [ ] **Reinstalar agente Windows**: cualquier equipo que tuviera un binario anterior necesita reinstalar desde el dashboard para recibir los cambios de credenciales/IP dinÃ¡micas
  - Pasos: `schtasks /Delete /TN "HomePiNASAgent" /F` â†’ borrar `C:\Program Files\HomePiNAS\` â†’ nuevo install desde dashboard
- [ ] **Validar cliente macOS real**: comprobar montaje SMB + `rsync` con binario correcto (`amd64` o `arm64`)
- [ ] **Validar cliente Linux real**: comprobar montaje SMB + `rsync` con binario correcto (`amd64` o `arm64`)
- [ ] **Schtasks SYSTEM falla (-2147024894)**: la tarea programada falla al ejecutarse como SYSTEM pero funciona manualmente
  - HipÃ³tesis: PATH o variables de entorno distintas como SYSTEM
  - Workaround temporal: ejecutar manualmente con `& "C:\Program Files\HomePiNAS\agent.exe" --run`

---

## ðŸŸ¡ PENDIENTE (resto del dashboard)

### 1. Panel
- [ ] Filtrar particiones eMMC (`mmcblk*`) del Array de Discos
- [ ] Eliminar tarjetas duplicadas (Temperatura + Red ya tienen grÃ¡fico abajo)

### 2. Almacenamiento
- [ ] Filtrar dispositivos eMMC
- [ ] Deduplicar disco sdc (aparece como `/mnt/disks/data-sdc` y `/mnt/storage`)

### 3. Backup clÃ¡sico
- [ ] Botones `+ Nueva Tarea`, `Ejecutar Todo`, `Ejecutar Ahora`, `Configurar` â€” conectar a API

### 4. Active Backup (mejoras futuras)
- [ ] Historial de backups por dispositivo (versiones + fechas + tamaÃ±os)
- [ ] Configurar schedule personalizado desde la UI (no solo 02:00 hardcoded)
- [ ] NotificaciÃ³n Telegram/SMTP al completar/fallar backup

### 5. Servicios
- [ ] Traducir estados: `running` â†’ `en ejecuciÃ³n`, `dead` â†’ `detenido`

### 6. Ajustes
- [ ] Toggle SSH con efecto real (systemctl)

---

## Estado del servidor real (192.168.1.81)

| Componente | Estado |
|-----------|--------|
| Servicio homepinas-v3 | âœ… activo (v6.6.2) |
| Samba `[active-backup]` | âœ… activo, `/mnt/storage/active-backup` |
| Go 1.23.4 | âœ… instalado en `/usr/local/go` |
| Binarios agente | âœ… recompilados con credenciales/IP dinÃ¡micas y soporte multiarquitectura (31 Mar 18:11) |
| Clientes Windows antiguos | âš ï¸ necesitan reinstalar agente |
| Clientes macOS/Linux | âš ï¸ pendiente validar flujo SMB real en equipo remoto |
| Schtasks SYSTEM | âš ï¸ falla -2147024894 (workaround: ejecutar manual) |

# HomePiNAS Ã¢â‚¬â€œ Estado y Pendientes

> Actualizado: 31 Marzo 2026 Ã‚Â· v6.6.2

---

## Ã¢Å“â€¦ COMPLETADO

### Active Backup (mÃƒÂ³dulo principal Ã¢â‚¬â€ en fase de pruebas)

- [x] **Backend del NAS de pruebas serv?a un proceso viejo**: el archivo `server/routes/active-backup.ts` ya estaba actualizado, pero el endpoint `/agent/generate/windows` segu?a devolviendo tokens hexadecimales porque el proceso Node en memoria no se hab?a recargado
  - Estado: corregido con restart forzado del backend en `192.168.1.81`
- [x] **Tokens de instalaci?n fr?giles ante reinicios**: `pendingTokens` solo viv?a en memoria y pod?a dejar al agente sin `backupUsername` / `backupPassword`
  - Estado: corregido con token firmado `v1.` autosuficiente
- [x] Agente Go compilado para Win/Mac/Linux (arm64 + amd64)
- [x] Agente se instala como servicio silencioso del sistema (schtasks SYSTEM / LaunchDaemon / systemd)
- [x] Flujo plug & play: nombre del dispositivo obligatorio antes de generar comando
- [x] Dispositivo pendiente aparece solo cuando el agente conecta (no al generar)
- [x] Persistencia de dispositivos en disco (`data/active-backup.json`)
- [x] Agente se reactiva automÃƒÂ¡ticamente si el NAS reinicia (detecta 401/404)
- [x] Agente ignora TLS autofirmado del NAS
- [x] Renombrar dispositivo (icono lÃƒÂ¡piz inline en DeviceDetail)
- [x] Barra de progreso en tiempo real (0Ã¢â€ â€™100% + archivo actual + velocidad)
- [x] BotÃƒÂ³n "Backup Now" envÃƒÂ­a triggerBackup al agente via poll de config
- [x] Windows: agente monta el share SMB antes de robocopy
- [x] Windows: ruta de destino UNC via Samba
- [x] Windows: argumento `net use` en orden correcto (`\\share password /user:usuario`)
- [x] Windows: schtasks /TR sin comillas manuales
- [x] TamaÃƒÂ±o real del backup reportado al completar (`dirSize`)
- [x] Timeout automÃƒÂ¡tico: dispositivos en backing-up >30 min vuelven a offline
- [x] Share Samba `[active-backup]` configurado en el NAS (`/mnt/storage/active-backup`)
- [x] Go instalado en NAS para compilar binarios sin Mac Studio
- [x] **BUG 10 (CRÃƒÂTICO)**: `approve` actualiza el dispositivo existente (approved=true) Ã¢â‚¬â€ ya no crea nuevo token que rompÃƒÂ­a la auth del agente Ã¢â€ â€™ bucle infinito de re-activaciÃƒÂ³n CORREGIDO
- [x] **BUG 1**: fallback de rutas por defecto usa OS real del dispositivo (no siempre Linux)
- [x] **BUG 3**: deduplicaciÃƒÂ³n por hostname (no hostname+IP) Ã¢â‚¬â€ evita duplicados al cambiar IP
- [x] **BUG 2/8**: agente detecta IP real de salida via TCP dial al NAS (evita 127.0.0.1 del proxy)
- [x] **BUG 5**: orden correcto de argumentos en `net use`
- [x] **BUG 4**: `saveData()` llamado tras resetear pendingBackup en config poll
- [x] PUT /devices/:id acepta `backupPaths` y `schedule` para ediciÃƒÂ³n desde DeviceDetail
- [x] UI de ediciÃƒÂ³n de rutas de backup en DeviceDetail (aÃƒÂ±adir/editar/eliminar per-ruta)
- [x] **BUG C: (CRÃƒÂTICO)**: `filepath.Base("C:\\")` devolvÃƒÂ­a `"C:"` Ã¢â€ â€™ sanitizado a `"C"` Ã¢â€ â€™ ruta UNC correcta `\\NAS\active-backup\device\C\` Ã¢â‚¬â€ robocopy ya no copia 0 bytes en backup full
- [x] Eliminados hardcodes de entorno en Active Backup: usuario SMB, contraseÃƒÂ±a e IP del NAS ya no estÃƒÂ¡n fijados a `juanlu`, `mimora` y `192.168.1.81`
- [x] macOS y Linux usan el share SMB real del NAS para backup (montaje temporal + `rsync`) en lugar de una ruta local falsa `/mnt/storage/...`
- [x] UI de generaciÃƒÂ³n del agente pide credenciales SMB y share al crear el instalador
- [x] UI de descarga manual permite elegir arquitectura en macOS y Linux (`amd64` / `arm64`)
- [x] InstalaciÃƒÂ³n silenciosa de macOS/Linux autodetecta la arquitectura del cliente remoto antes de descargar el binario
- [x] Binarios del agente recompilados de nuevo en Mac Studio (Windows amd64, Linux amd64/arm64, macOS amd64/arm64)
- [x] Fase 2 base: endpoints rowse y download a?adidos al backend nuevo para explorar el ?rbol real del backup desde el dashboard
- [x] Fase 2 base: DeviceDetail ya permite abrir carpetas del backup y descargar archivos individuales
- [x] Fase 3 base: carpeta ecovery-usb/ portada desde el repo dashboard`r
- [x] Fase 3 base: endpoints ecovery/status, ecovery/build, ecovery/download y ecovery/scripts a?adidos al backend nuevo
- [x] Fase 3 base: tarjeta USB Recovery a?adida a ActiveBackupPage`r


---

## Ã°Å¸â€Â´ PENDIENTE URGENTE

### Active Backup Ã¢â‚¬â€ pendientes de prueba
- [ ] **Verificar backup real en Windows**: comprobar que despuÃƒÂ©s del fix `C:` y de la eliminaciÃƒÂ³n de hardcodes el backup full copia ficheros reales a `/mnt/storage/active-backup/`
- [ ] **Reinstalar agente Windows**: cualquier equipo que tuviera un binario anterior necesita reinstalar desde el dashboard para recibir los cambios de credenciales/IP dinÃƒÂ¡micas
  - Pasos: `schtasks /Delete /TN "HomePiNASAgent" /F` Ã¢â€ â€™ borrar `C:\Program Files\HomePiNAS\` Ã¢â€ â€™ nuevo install desde dashboard
- [ ] **Validar cliente macOS real**: comprobar montaje SMB + `rsync` con binario correcto (`amd64` o `arm64`)
- [ ] **Validar cliente Linux real**: comprobar montaje SMB + `rsync` con binario correcto (`amd64` o `arm64`)
- [ ] **Schtasks SYSTEM falla (-2147024894)**: la tarea programada falla al ejecutarse como SYSTEM pero funciona manualmente
  - DiagnÃƒÂ³stico actual: `/TR` queda sin comillas alrededor de `C:\Program Files\HomePiNAS\agent.exe --run` y Task Scheduler interpreta mal una ruta con espacios
  - Workaround temporal: ejecutar manualmente con `& "C:\Program Files\HomePiNAS\agent.exe" --run`

---

## Ã°Å¸Å¸Â¡ PENDIENTE (resto del dashboard)

### 1. Panel
- [ ] Filtrar particiones eMMC (`mmcblk*`) del Array de Discos
- [ ] Eliminar tarjetas duplicadas (Temperatura + Red ya tienen grÃƒÂ¡fico abajo)

### 2. Almacenamiento
- [ ] Filtrar dispositivos eMMC
- [ ] Deduplicar disco sdc (aparece como `/mnt/disks/data-sdc` y `/mnt/storage`)

### 3. Backup clÃƒÂ¡sico
- [ ] Botones `+ Nueva Tarea`, `Ejecutar Todo`, `Ejecutar Ahora`, `Configurar` Ã¢â‚¬â€ conectar a API

### 4. Active Backup (mejoras futuras)
- [ ] Historial de backups por dispositivo (versiones + fechas + tamaÃƒÂ±os)
- [ ] Configurar schedule personalizado desde la UI (no solo 02:00 hardcoded)
- [ ] NotificaciÃƒÂ³n Telegram/SMTP al completar/fallar backup

### 5. Servicios
- [ ] Traducir estados: `running` Ã¢â€ â€™ `en ejecuciÃƒÂ³n`, `dead` Ã¢â€ â€™ `detenido`

### 6. Ajustes
- [ ] Toggle SSH con efecto real (systemctl)

---

## Estado del servidor real (192.168.1.81)

| Componente | Estado |
|-----------|--------|
| Servicio homepinas-v3 | Ã¢Å“â€¦ activo (v6.6.2) |
| Samba `[active-backup]` | Ã¢Å“â€¦ activo, `/mnt/storage/active-backup` |
| Go 1.23.4 | Ã¢Å“â€¦ instalado en `/usr/local/go` |
| Binarios agente | Ã¢Å“â€¦ recompilados con credenciales/IP dinÃƒÂ¡micas y soporte multiarquitectura (31 Mar 18:11) |
| Clientes Windows antiguos | Ã¢Å¡Â Ã¯Â¸Â necesitan reinstalar agente |
| Clientes macOS/Linux | Ã¢Å¡Â Ã¯Â¸Â pendiente validar flujo SMB real en equipo remoto |
| Schtasks SYSTEM | Ã¢Å¡Â Ã¯Â¸Â falla -2147024894 (workaround: ejecutar manual) |


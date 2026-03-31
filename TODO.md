# HomePiNAS – Estado y Pendientes

> Actualizado: 31 Marzo 2026 · v6.5.9

---

## ✅ COMPLETADO

### Active Backup (módulo principal en desarrollo)
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
- [x] Windows: ruta de destino UNC (`\\NAS\active-backup\folder`) via Samba
- [x] Windows: agente monta el share SMB con `net use juanlu/mimora` antes de robocopy
- [x] Tamaño real del backup reportado al completar (`dirSize`)
- [x] Timeout automático: dispositivos en backing-up >30 min vuelven a offline
- [x] Share Samba `[active-backup]` configurado en el NAS (`/mnt/storage/active-backup`)
- [x] Go instalado en NAS para compilar binarios sin Mac Studio

---

## 🔴 PENDIENTE URGENTE

### Active Backup
- [ ] **backupPaths vacío**: el dispositivo actual tiene `backupPaths: []` — no se copiará nada
  - Necesita UI para configurar las carpetas a hacer backup antes de aprobar
  - O configurarlas desde DeviceDetail después de aprobar
- [ ] **IP del agente aparece como 127.0.0.1**: revisar cómo detecta la IP en el agente Go
  - Probablemente necesita detectar la IP de la interfaz real (no loopback)
- [ ] **Reinstalar agente Windows**: el equipo `Minisforum-M1Pro` tiene el binario viejo sin SMB
  - Pasos: `schtasks /Delete /TN "HomePiNAS Agent" /F` + borrar config + nuevo install

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

### 4. Active Backup (UI mejoras)
- [ ] Pantalla de configuración de rutas de backup por dispositivo (antes de aprobar o desde DeviceDetail)
- [ ] Mostrar IP real del agente (no 127.0.0.1)
- [ ] Historial de backups por dispositivo (versiones)

### 5. Servicios
- [ ] Traducir estados: `running` → `en ejecución`, `dead` → `detenido`
- [ ] Botón start/stop por cada servicio del sistema

### 6. Tienda (Homestore)
- [ ] Traducir estados y filtros al español

### 7. Ajustes
- [ ] Toggle SSH con efecto real (systemctl)

---

## Estado del servidor real (192.168.1.81)

| Componente | Estado |
|-----------|--------|
| Servicio homepinas-v3 | ✅ activo (v6.5.9) |
| Samba `[active-backup]` | ✅ activo, `/mnt/storage/active-backup` |
| Go 1.23.4 | ✅ instalado en `/usr/local/go` |
| Dispositivo Minisforum-M1Pro | ⚠️ agente viejo, backupPaths vacío |

---

## Notas técnicas

- **Compilar binarios en NAS**: `ssh juanlu@192.168.1.81` → `export PATH=$PATH:/usr/local/go/bin` → `cd /opt/homepinas-v3/agent && bash build.sh`
- **Actualizar NAS**: `ssh juanlu@192.168.1.81 "cd /opt/homepinas-v3 && git pull && pnpm run build && sudo systemctl restart homepinas-v3"`
- **Ver logs en vivo**: `ssh juanlu@192.168.1.81 "sudo journalctl -u homepinas-v3 -f"`
- **Ver datos Active Backup**: `ssh juanlu@192.168.1.81 "cat /opt/homepinas-v3/data/active-backup.json"`
- **Agente Windows instala en**: `C:\Windows\Temp\hp-agent.exe` → config en `C:\ProgramData\HomePiNAS\config.json`
- **Agente Windows log**: `C:\ProgramData\HomePiNAS\agent.log`

# Active Backup Core

Servicio aislado para desarrollar y depurar `Active Backup` sin depender del dashboard principal.

## Objetivo

Separar estas piezas del resto de HomePiNAS:
- generacion de agentes
- activacion de dispositivos
- polling de config
- progreso y reporte de backup
- browse y download de backups
- recovery USB

## Estado actual

Primera base creada en `2026-03-31`:
- servidor Express independiente
- persistencia propia en JSON
- token de instalacion firmado `v1.`
- endpoints minimos para agente
- endpoints minimos de administracion
- browse y download del arbol de backup
- estado de `recovery-usb`

Validado en NAS de pruebas `192.168.1.81`:
- desplegado como servicio `active-backup-core` en `http://192.168.1.81:3011`
- genera tokens firmados `v1.`
- sirve el binario Windows desde `agent/dist`
- el agente Windows ya activa correctamente contra este servicio aislado
- las credenciales SMB quedan persistidas bien en el estado aislado
- el backup `full` de Windows ya copia contenido real a `/mnt/storage/active-backup/m1pro-core`
- prueba de velocidad real sobre Wi-Fi: ~`4.53 MB/s`

Limitacion de la prueba actual:
- el equipo Windows usado era un portatil por Wi-Fi
- con ese caudal, un backup `full` grande puede tardar muchas horas
- por eso la prueba se detuvo tras validar activacion + copia real, sin esperar al cierre completo del `report`

Actualizacion de fin de jornada (`2026-03-31` noche):
- se repitio la prueba en un Windows por cable contra `active-backup-core`
- flujo validado: limpieza local, generacion de token `v1.`, activacion correcta, aprobacion correcta y disparo de backup manual correcto
- el agente nuevo limpio entro como `41108b5e` y recibio bien `backupHost`, `backupShare`, `backupUsername` y `backupPassword`
- problema real aislado: el backup `full` de `C:\` sigue fallando con `robocopy` contra el share Samba
- error observado en log: `ERROR 87 (0x00000057) Obteniendo acceso al directorio de destino \\\\192.168.1.81\\active-backup\\windows-41108b5e\\C\\`
- errores adicionales esperables por archivos bloqueados: `pagefile.sys`, `swapfile.sys`, `DumpStack.log.tmp`, `swapfile.sys`
- tambien se confirmo otro bug del agente: si coincide un backup manual con el ciclo programado, puede lanzar un segundo `robocopy` solapado sobre el mismo destino

Pendiente inmediato actualizado:
- impedir backups solapados si ya hay uno en curso
- excluir ficheros y rutas problematicas de Windows en backup `full` (`pagefile.sys`, `swapfile.sys`, `hiberfil.sys`, `DumpStack.log.tmp`, reciclaje, etc.)
- revisar el uso de `robocopy /MIR` sobre la raiz `C:\` contra Samba para eliminar el `ERROR 87`
- repetir la prueba limpia manana con estas correcciones antes de volver a integrar nada en el dashboard

## Estructura

- `src/server.ts`: arranque del servicio
- `src/config.ts`: variables y rutas
- `src/state.ts`: persistencia JSON
- `src/routes/active-backup.ts`: API principal
- `src/types.ts`: contratos internos

## Variables de entorno

- `AB_PORT`: puerto HTTP del servicio, por defecto `3011`
- `AB_HOST`: host bind, por defecto `127.0.0.1`
- `AB_DATA_DIR`: carpeta de estado, por defecto `./data`
- `AB_BACKUP_DIR`: raiz de backups, por defecto `/mnt/storage/active-backup`
- `AB_RECOVERY_DIR`: carpeta recovery, por defecto `../recovery-usb`
- `AB_AGENT_BIN_DIR`: carpeta de binarios del agente, por defecto `../agent/dist`
- `AB_ADMIN_TOKEN`: token simple para endpoints admin
- `AB_PUBLIC_BASE_URL`: URL externa que recibirán los agentes

## Flujo previsto

1. Probar agente contra este servicio aislado.
2. Validar Windows hasta tener instalacion y backup fiables.
3. Añadir versionado fisico real por backup.
4. Integrar de nuevo el mismo contrato API dentro del dashboard.

## Pendiente inmediato

- autenticacion admin mejor que un token plano
- versionado fisico real por backup
- restore real
- empaquetado y despliegue
- probar el cierre completo de `report` con un Windows por cable o con un dataset pequeno y controlado

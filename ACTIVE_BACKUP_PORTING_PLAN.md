# Active Backup Porting Plan

Fecha: 2026-03-31
Rama de trabajo: `active-backup-porting`

## Objetivo

Portar a `homenas_3.0` las capacidades utiles de `juanlusoft/dashboard` sin volver a la arquitectura antigua del agente Node/Electron.

Base a conservar:
- Backend nuevo en `server/routes/active-backup.ts`
- Agente Go unificado en `agent/main.go`
- UI nueva en `src/pages/ActiveBackupPage.tsx`

## Decision de arquitectura

Se mantiene la arquitectura nueva y solo se portan:
- flujos funcionales
- logica de negocio
- utilidades de restore y recovery
- comportamiento operativo ya probado

No se porta tal cual:
- agente Windows Node/Electron
- agente Linux shell
- flujo legacy `register / poll / report` con `X-Agent-Token`

## Mapa de origen

Funciones relevantes del repo viejo:
- `backend/routes/active-backup.js`
- `agent/src/backup.js`
- `agent/workers/backup-worker.ps1`
- `agent-linux/homepinas-agent.sh`
- `frontend/main.js`
- `docs/active-backup-agent-install.md`
- `docs/active-backup-restore.md`
- `recovery-usb/homepinas-restore.sh`

## Fases

### Fase 1. Estabilizar flujo actual

Objetivo:
- cerrar instalacion, aprobacion y backup real de Windows con el agente Go

Trabajo:
- validar activacion con token firmado `v1.`
- validar persistencia de credenciales SMB
- terminar fix de `robocopy` sobre Samba
- verificar que `backupSize`, `versions` y estado UI se actualizan bien

Archivos principales:
- `server/routes/active-backup.ts`
- `agent/main.go`
- `src/pages/ActiveBackupPage.tsx`

Estado:
- en curso
- ya existe un servicio aislado `active-backup-core` en el NAS de pruebas para depurar el agente sin depender del dashboard
- validado contra Windows: activacion correcta, credenciales SMB correctas y copia real al NAS
- actualizacion `2026-03-31` noche: la prueba con un Windows por cable confirma que token, activacion, aprobacion y disparo manual ya funcionan; el bloqueo real queda reducido a `robocopy` sobre `C:\` contra Samba y al solapamiento entre backup manual y programado
- errores concretos vistos en log: `ERROR 87` sobre el directorio destino UNC y `ERROR 32` en archivos bloqueados del sistema (`pagefile.sys`, `swapfile.sys`, `DumpStack.log.tmp`)
- pendiente de Fase 1: anadir guardas para no lanzar dos backups a la vez, excluir ficheros/rutas conflictivos de Windows y repetir la prueba cableada hasta cerrar un backup limpio de `C:\`

### Fase 2. Restore y browsing de backups

Objetivo:
- recuperar capacidad de explorar versiones, descargar archivos y preparar restore desde el dashboard

Origen viejo:
- `backend/routes/active-backup.js`
- `frontend/main.js`

Trabajo:
- anadir endpoints nuevos para listar versiones y navegar contenido
- definir layout estable del backup por dispositivo/version
- anadir acciones de browse/download en la UI nueva

Entregables:
- API `versions`
- API `browse`
- API `download`
- vista de historial y exploracion en `DeviceDetail`

Estado:
- base implementada en `active-backup-porting`
- `DeviceDetail` ya puede explorar y descargar ficheros del backup actual del dispositivo
- pendiente siguiente: separar versiones fisicas reales en disco para que cada backup tenga arbol propio

### Fase 3. Recovery USB

Objetivo:
- recuperar el flujo de restauracion offline desde USB

Origen viejo:
- `recovery-usb/homepinas-restore.sh`
- `docs/active-backup-restore.md`

Trabajo:
- portar scripts de recovery a carpeta propia en este repo
- exponer endpoints de build/download si merece la pena
- adaptar documentacion al layout nuevo

Entregables:
- carpeta `recovery-usb/`
- guia de uso
- integracion minima desde Active Backup

Estado:
- carpeta `recovery-usb/` ya portada desde `dashboard`
- endpoints nuevos: `GET /recovery/status`, `POST /recovery/build`, `GET /recovery/download`, `GET /recovery/scripts`
- UI minima anadida en `ActiveBackupPage`
- pendiente siguiente: validar `build-recovery-iso.sh` en NAS Linux real y adaptar la documentacion de restore al formato de respuestas nuevo

### Fase 4. Backup imagen Windows

Objetivo:
- recuperar la funcion de imagen completa real de Windows

Origen viejo:
- `agent/src/backup.js`
- `agent/workers/backup-worker.ps1`

Trabajo:
- reutilizar la logica funcional de VSS, WIM y metadatos
- decidir implementacion:
  - opcion A: reescritura Go
  - opcion B: wrapper Go que invoque PowerShell controlado

Recomendacion:
- empezar con wrapper controlado a PowerShell desde Go
- reescribir en Go solo si luego compensa

Entregables:
- modo `image` real
- manifiesto de backup
- rutas de restore para imagen

### Fase 5. Pulido de producto

Objetivo:
- cerrar Active Backup como modulo completo

Trabajo:
- retencion configurable
- notificaciones Telegram/SMTP
- schedule editable en UI
- logs por dispositivo
- limpieza de UX y documentacion final

## Prioridad recomendada

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5

## Riesgos conocidos

- Windows SMB contra Samba sigue siendo el punto mas fragil del flujo actual
- el repo viejo mezcla backup de archivos e imagen con bastante logica Windows especifica
- recovery y restore del repo viejo asumen estructuras de directorios que no coinciden aun con el layout nuevo
- hay deuda de codificacion UTF-8 y mojibake en documentacion heredada

## Criterio de porting

Portar casi tal cual:
- recovery USB
- documentacion operativa
- ideas de browse/restore

Portar adaptando:
- modelo de versiones
- layout de backups
- flujos de UI

Reescribir:
- autenticacion/agente
- instalacion silenciosa
- polling/config/progreso
- backup imagen integrado con el agente Go

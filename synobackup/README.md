# SynoBackup

`synobackup/` es una linea nueva de trabajo para replicar el enfoque de Synology Active Backup en lugar del enfoque actual basado en SMB + `robocopy`.

Objetivo de esta fase:

- snapshot consistente en Windows via VSS
- lectura desde snapshot, no desde `C:\` vivo
- subida al NAS por HTTP a un core propio
- versionado por backup en el servidor
- browse y descarga file-level desde versiones publicadas

No cubre aun:

- CBT real
- deduplicacion avanzada cross-version
- restore bare-metal
- compresion o resume avanzado

## Estado actual

- `agent` Windows ya usa `VSS -> HTTP -> core`
- el core guarda sesiones y versiones separadas
- las subidas toleran rutas con espacios y reenvios idempotentes con `sha256`
- el agente ya excluye basura de sistema basica y tolera `Access denied` sin abortar toda la sesion
- el core ya puede reutilizar una sesion `uploading` existente para reanudar trabajo
- el core ya expone endpoints admin para listar versiones, navegar carpetas y descargar archivos restaurables
- el core ya mantiene un inventario por version para manifiesto y busqueda de archivos
- el agente ya guarda `progress.json` local para checkpoint operativo de la sesion activa
- el core ya materializa archivos desde blobs hashados para deduplicacion real en disco
- el core ya persiste chunks hashados en `.chunks/`
- para archivos grandes, el agente ya usa `probe -> upload missing chunks -> commit`
- el core ya reconoce chunks existentes y puede pedir solo los bloques que faltan
- el core ya expone reconciliacion de referencias y GC de blobs/chunks huerfanos
- el restore file-level ya puede servir contenido desde blob/chunks aunque falte el fichero materializado de la version
- los manifiestos de version ya incluyen resumen de storage logico vs almacenado
- el core ya puede disparar GC automatico tras `complete/fail` con cooldown configurable
- el core ya permite borrar versiones publicadas de forma segura y reescribe `latest.json`
- el core ya soporta politica de retencion por dispositivo y poda automatica al completar
- el core ya expone progreso de sesiones activas para observabilidad en tiempo real
- el progreso de sesion ya incluye rate reciente y deteccion de estancamiento
- los ficheros grandes ya usan chunking content-defined calibrado para trabajo diferencial

## Endpoints admin actuales

- `GET /api/synobackup/admin/devices`
- `GET /api/synobackup/admin/storage/refs`
- `PUT /api/synobackup/admin/devices/:id/retention-policy`
- `POST /api/synobackup/admin/devices/:id/retention/run?dryRun=true|false`
- `GET /api/synobackup/admin/devices/:id/versions`
- `GET /api/synobackup/admin/devices/:id/versions/:sessionId/manifest`
- `GET /api/synobackup/admin/devices/:id/versions/:sessionId/diff?compareTo=...`
- `GET /api/synobackup/admin/devices/:id/sessions/:sessionId/progress`
- `GET /api/synobackup/admin/devices/:id/versions/:sessionId/files?path=...`
- `GET /api/synobackup/admin/devices/:id/versions/:sessionId/search?q=...`
- `GET /api/synobackup/admin/devices/:id/versions/:sessionId/download?path=...`
- `DELETE /api/synobackup/admin/devices/:id/versions/:sessionId`
- `POST /api/synobackup/admin/storage/gc?dryRun=true|false`

## Estructura

- `core/`: servicio HTTP receptor de backups
- `agent/`: agente Windows prototipo en Go
- `scripts/`: utilidades de despliegue desde el Mac Studio

## Smoke test

Prueba automatizada de API contra un core vivo:

```bash
cd synobackup/core
SB_BASE_URL=http://192.168.1.81:3021 \
SB_ADMIN_TOKEN=synobackup-test-token \
pnpm run smoke
```

El smoke actual valida:

- health
- generate/activate/approve
- dos versiones publicadas
- manifest
- diff entre versiones
- download file-level
- preview de retencion

## Campana CDC

Prueba dura contra el core vivo para comparar chunking fijo frente al CDC experimental:

```bash
cd synobackup/core
SB_BASE_URL=http://192.168.1.81:3021 \
SB_ADMIN_TOKEN=synobackup-test-token \
pnpm run campaign:cdc
```

Estado real a `2026-04-01`:

- la campana ya esta aislada de la dedupe global del core usando seeds distintas por modo
- el CDC actual ya mejora al chunking fijo en la campana sintetica dura de `prepend/insert/modify/append`
- la ganancia observada es de `2097152` bytes menos subidos en `prepend64k`, `insert128k` y `modify128k`
- el perfil actual queda calibrado en `128 KiB / 512 KiB / 2 MiB`

## Flujo previsto

1. El admin genera un token de instalacion para un agente.
2. El agente se activa contra el core.
3. El core publica un job pendiente.
4. El agente crea un snapshot VSS.
5. El agente recorre ficheros dentro del snapshot y sube cada archivo al core.
6. El core cierra la sesion y la publica como una version nueva.

## Limitaciones actuales

- el agente esta centrado en Windows
- el chunking CDC actual ya mejora al chunking fijo en la campana sintetica dura, pero aun falta validarlo con backups largos del agente real
- el uploader diferencial solo se activa en ficheros grandes
- el GC automatico actual es simple: cooldown temporal, no planificador ni prioridades
- la retencion ya soporta `keepLast`, `keepDaily`, `keepWeekly`, `keepMonthly`, pero aun no tiene scheduler aparte ni calendarios avanzados
- el diff entre versiones ya existe a nivel API, pero aun no esta conectado a UI
- la telemetria de progreso ya existe a nivel API, pero aun no esta conectada a UI
- la telemetria actual usa una ventana corta de muestras, no historico largo ni ETA sofisticada
- el siguiente salto tecnico pendiente es validar este CDC en backups largos reales y, despues, estudiar CBT real
- el storage usa una carpeta por version en `stage/` y `versions/`

## Flujo Mac Studio -> NAS

Compilacion recomendada:

```bash
cd synobackup/agent
bash build.sh
```

Despliegue recomendado desde el Mac Studio:

```bash
bash synobackup/scripts/deploy-from-mac.sh /ruta/al/repo juanlu@192.168.1.81
```

Arranque del core en el NAS:

```bash
cd /opt/synobackup/core
pnpm install
SB_HOST=0.0.0.0 \
SB_PORT=3021 \
SB_ADMIN_TOKEN=change-me \
SB_PUBLIC_BASE_URL=http://192.168.1.81:3021 \
pnpm start
```

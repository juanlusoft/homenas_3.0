# HomePiNAS v3 — Active Backup: HTTPS Redesign

**Fecha:** 2026-04-03  
**Rama:** active-backup-porting  
**Reemplaza:** SMB + robocopy approach

---

## Contexto

El sistema actual usa SMB share + robocopy. Esto requiere configuración de red avanzada, falla en entornos con firewalls corporativos, y no ofrece deduplicación ni retención estructurada de snapshots. El rediseño usa HTTPS directo al NAS con deduplicación por contenido (content-addressed chunks), hardlinks entre snapshots, y soporte de restore a nivel de fichero y bare-metal.

---

## Sección 1: Protocolo (3 fases)

### Fase 1 — Negociación de sesión

El agente Go calcula SHA256 de cada chunk de cada fichero del árbol seleccionado y envía la lista de hashes al servidor.

```
POST /api/active-backup/upload/session/start
Authorization: Bearer <device-token>
Body: {
  "device_name": "DESKTOP-ABC123",
  "snapshot_label": "2026-04-03_10-30-00",
  "files": [
    {
      "path": "C:\\Users\\Juan\\Documents\\report.docx",
      "size": 45678,
      "mtime": "2026-04-01T09:00:00Z",
      "attrs": 32,
      "chunks": ["sha256a", "sha256b"]
    }
  ]
}
Response: {
  "session_id": "uuid",
  "needed": ["sha256b"]   // chunks que el servidor NO tiene aún
}
```

El servidor compara los hashes recibidos contra el chunk store. Solo devuelve los que faltan (`needed`). Los chunks ya presentes se deduplicarán automáticamente en el manifest.

### Fase 2 — Upload de chunks

El agente sube únicamente los chunks de la lista `needed`, en paralelo (máx. 4 conexiones concurrentes).

```
POST /api/active-backup/upload/chunk/:sha256
Authorization: Bearer <device-token>
Content-Type: application/octet-stream
X-Session-Id: <session_id>
Body: <raw chunk bytes>
```

- Tamaño de chunk: 4 MB (equilibrio entre overhead de red y granularidad de dedup)
- El servidor verifica SHA256 del payload al recibirlo. Si no coincide, responde 400.
- Estado de sesión persiste en SQLite: el agente puede reanudar desde el último chunk confirmado si la conexión se pierde.

### Fase 3 — Cierre de sesión

```
POST /api/active-backup/upload/session/complete
Authorization: Bearer <device-token>
Body: { "session_id": "uuid" }
Response: { "snapshot_id": "2026-04-03_10-30-00", "stats": {...} }
```

El servidor construye el manifest del snapshot (incluyendo chunks deduplicados de sesiones anteriores), actualiza `status.json` a `complete` y registra las estadísticas.

---

## Sección 2: Agente Go (cliente Windows)

El agente se refactoriza en ficheros con responsabilidad única:

| Fichero | Responsabilidad |
|---|---|
| `main.go` | Entry point, CLI flags, config loading |
| `vss.go` | VSS snapshot (Volume Shadow Copy) para ficheros en uso |
| `walker.go` | Walk del árbol de directorios, aplicar exclusiones |
| `chunker.go` | División de ficheros en chunks de 4 MB, SHA256 por chunk |
| `uploader.go` | HTTP client: session/start, upload chunks, session/complete |
| `session.go` | Persistencia local de estado de sesión (resume tras corte) |
| `exclude.go` | Reglas de exclusión (pagefile.sys, hiberfil.sys, Temp, etc.) |
| `progress.go` | Reporting de progreso vía polling endpoint o WebSocket |

### VSS (Volume Shadow Copy Service)

Para ficheros bloqueados por el SO (hiberfil.sys, NTDS.dit, registry hives), el agente crea un snapshot VSS al inicio del backup y lee los ficheros desde la shadow copy. Requiere ejecución como Administrador.

### Estado de sesión local

El agente guarda `%APPDATA%\HomePiNAS\session.json`:
```json
{
  "session_id": "uuid",
  "snapshot_label": "2026-04-03_10-30-00",
  "uploaded_chunks": ["sha256a", "sha256c"],
  "pending_chunks": ["sha256b"]
}
```

En caso de corte, el agente reanuda desde los chunks pendientes sin rehacer los confirmados.

---

## Sección 3: Backend (servidor Node/Express)

### Ficheros

**`server/routes/active-backup.ts`** — endpoints existentes (dispositivos, schedules, jobs):
- `GET /devices`
- `POST /devices/:id/approve`
- `GET /jobs`
- `POST /trigger`
- `GET /status`

**`server/routes/active-backup-upload.ts`** — nuevos endpoints de upload:
- `POST /upload/session/start`
- `POST /upload/chunk/:sha256`
- `POST /upload/session/complete`
- `GET /upload/session/:id/status` (polling de progreso)

Ambos routers se montan en `app.ts` bajo el mismo prefijo `/api/active-backup`:
```typescript
app.use('/api/active-backup', activeBackupRouter);
app.use('/api/active-backup', activeBackupUploadRouter);
```

### Autenticación de dispositivo

Los dispositivos usan un token propio (distinto del JWT de usuario). El token se genera al aprobar el dispositivo y se envía al agente. El middleware `requireDeviceAuth` valida este token en todos los endpoints de upload.

---

## Sección 4: Almacenamiento

### Estructura en disco

```
/mnt/backups/
  chunks/
    ab/
      abcdef1234...sha256    ← raw chunk bytes, sin extensión
    cd/
      cdef5678...sha256
  snapshots/
    DESKTOP-ABC123/
      2026-04-03_10-30-00/
        manifest.json         ← lista completa de ficheros y sus chunks
        status.json           ← estado del snapshot (in_progress / complete / failed)
    LAPTOP-XYZ/
      ...
```

### Chunk store (content-addressed)

- Ruta: `chunks/<primeros-2-chars-del-hash>/<hash-completo>`
- El prefijo de 2 chars evita directorios con millones de ficheros (mismo patrón que Git objects)
- Un chunk nunca se sobreescribe; su presencia implica que el contenido es correcto
- **Deduplicación automática**: si dos dispositivos suben el mismo fichero, el chunk existe una sola vez en disco

### Manifest por snapshot

`manifest.json`:
```json
{
  "version": 2,
  "device": "DESKTOP-ABC123",
  "started_at": "2026-04-03T10:00:00Z",
  "completed_at": "2026-04-03T11:00:00Z",
  "files": [
    {
      "path": "C:\\Users\\Juan\\Documents\\report.docx",
      "size": 45678,
      "mtime": "2026-04-01T09:00:00Z",
      "attrs": 32,
      "chunks": ["abcdef...", "1234ab..."]
    }
  ],
  "stats": {
    "files_total": 12450,
    "bytes_total": 187456789,
    "chunks_new": 3421,
    "chunks_deduped": 9029,
    "bytes_saved": 1540000000
  }
}
```

`status.json`:
```json
{
  "state": "complete",
  "session_id": "uuid",
  "progress": { "files_done": 12450, "chunks_done": 12450, "bytes_done": 187456789 }
}
```

### Retención

La retención se gestiona por dispositivo: N snapshots diarios, M semanales. Al eliminar un snapshot, el servidor realiza GC de chunks: elimina únicamente los chunks que ya no están referenciados por ningún manifest activo.

---

## Sección 5: Restore

### Restore a nivel de fichero (File-Level Recovery)

La UI muestra un explorador de snapshots:
1. Usuario selecciona dispositivo → snapshot → navega el árbol de directorios (construido desde `manifest.json`)
2. Click en fichero → servidor reconstruye el fichero concatenando sus chunks y lo envía como download
3. Click en directorio → servidor crea un ZIP en streaming con todos los ficheros del subtree
4. "Descargar snapshot completo" → ZIP streaming de todos los ficheros

El servidor nunca almacena los ficheros ensamblados en disco; los reconstruye en memoria/streaming directamente desde el chunk store.

### Restore bare-metal (Full Machine Recovery)

El agente Go incluye un modo restore activado por flag `--restore`:

```
agent.exe --restore \
  --nas https://192.168.1.81:3001 \
  --device DESKTOP-ABC123 \
  --snapshot 2026-04-03_10-30-00 \
  --target C:\
```

El agente en modo restore:
1. Autentica con el NAS usando el token de dispositivo
2. Descarga `manifest.json` del snapshot seleccionado
3. Para cada fichero: solicita chunks al servidor, reconstruye el fichero en la ruta destino
4. Restaura atributos NTFS (timestamps, attrs)
5. Muestra progreso en consola

**Uso bare-metal**: el usuario arranca desde un USB con Windows PE (o la instalación de Windows de recuperación), ejecuta `agent.exe --restore`, y recupera todos sus ficheros. No requiere software adicional ni herramientas de Synology.

**Flujo recomendado para restauración completa:**
1. Instalar Windows mínimo (o arrancar WinPE desde USB)
2. Conectar a la red
3. Descargar `agent.exe` desde el NAS (`https://192.168.1.81:3001/agent/download`)
4. Ejecutar con flag `--restore` + credenciales
5. El agente restaura todos los ficheros al path destino

---

## Sección 6: UI (Dashboard)

### Cambios en ActiveBackupPage

- **Panel de dispositivos**: igual que ahora, pero muestra último snapshot y estadísticas de dedup
- **Nuevo: Explorador de snapshots**: árbol de ficheros/directorios con botones de download
- **Indicador de progreso en tiempo real**: polling a `GET /upload/session/:id/status` cada 2s mientras hay backup activo
- **Historial de snapshots**: lista por dispositivo con fecha, tamaño total, ahorro por dedup

---

## Criterios de éxito

- Backup completo de un PC Windows sin configurar SMB
- Segunda backup con >80% de dedup en ficheros sin cambios
- Restore de un fichero individual desde la UI
- Restore completo desde agent.exe --restore en WinPE
- Conexión interrumpida → agente reanuda sin resubir chunks ya confirmados
- Ficheros bloqueados (registry, pagefile) respaldados correctamente vía VSS

---

## Orden de implementación (para el plan)

1. Backend: chunk store + session endpoints (upload router)
2. Agente Go: refactoring en módulos, chunker + uploader
3. VSS support en agente
4. Session resume (estado local)
5. Backend: manifest + snapshot listing API
6. UI: explorador de snapshots + file download
7. Backend: restore streaming (file + ZIP)
8. Agente Go: modo --restore
9. Backend: GC de chunks en retención
10. UI: progreso en tiempo real

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `server/routes/active-backup-upload.ts` | Nuevo — upload endpoints |
| `server/routes/active-backup.ts` | Modificar — añadir snapshot listing endpoints |
| `agent/main.go` | Refactorizar entry point, añadir --restore flag |
| `agent/vss.go` | Nuevo — VSS integration |
| `agent/walker.go` | Nuevo — directory walker con exclusiones |
| `agent/chunker.go` | Nuevo — 4MB chunker + SHA256 |
| `agent/uploader.go` | Nuevo — HTTP upload client |
| `agent/session.go` | Nuevo — local session state |
| `agent/exclude.go` | Nuevo — exclusion rules |
| `agent/progress.go` | Nuevo — progress reporting |
| `src/pages/ActiveBackupPage.tsx` | Modificar — snapshot explorer, progress polling |
| `src/components/ActiveBackup/SnapshotExplorer.tsx` | Nuevo — file tree + download UI |

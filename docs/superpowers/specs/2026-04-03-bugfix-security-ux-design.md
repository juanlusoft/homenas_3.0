# HomePiNAS v3 — Bug Fixes: Security, Features & UX

**Fecha:** 2026-04-03  
**Rama:** active-backup-porting  
**Bloques:** A (Seguridad) · C (Features rotas) · D (UX Polish)

---

## Contexto

Tras revisión exhaustiva del código fuente, el análisis inicial sobreestimó los problemas de seguridad. La mayoría ya estaban implementados (bcrypt, JWT, migración SHA256→bcrypt, Socket.io auth, secrets redaction). Las correcciones reales son 6 puntos concretos.

---

## Bloque A — Seguridad

### A1: `server/routes/files.ts` sin autenticación

**Problema:** Todos los endpoints de gestión de archivos (`/list`, `/mkdir`, `/upload`, `/download`, `/delete`, `/rename`) son accesibles sin token JWT. Cualquier cliente en la red puede leer, subir o borrar archivos del NAS sin autenticarse.

**Solución:** Añadir `requireAuth` como primer middleware en todos los endpoints de `files.ts`. El endpoint `/download` puede quedar con `requireAuth` también (la descarga directa desde browser ya usa el token via query o header).

**Archivos afectados:**
- `server/routes/files.ts` — añadir `requireAuth` a los 6 endpoints

---

## Bloque C — Features rotas

### C1: Rename y Delete en FilesPage no funcionan

**Problema:** En `src/pages/FilesPage.tsx` (líneas ~211 y ~216), las llamadas a `authFetch('/files/rename', ...)` y `authFetch('/files/delete', ...)` no incluyen `Content-Type: application/json`. Express no parsea el body → el endpoint recibe `{}` → falla silenciosamente sin feedback al usuario.

**Solución:**
1. Añadir `headers: { 'Content-Type': 'application/json' }` a las llamadas de rename y delete.
2. Añadir feedback visual (toast/alert) cuando la operación falla.

**Archivos afectados:**
- `src/pages/FilesPage.tsx` — líneas ~211 y ~216

---

## Bloque D — UX Polish

### D1: Traducciones de estados de servicios

**Problema:** `ServicesPage.tsx` usa `ts(service.state ?? service.status)` donde `state` puede ser `'running'`, `'dead'`, `'inactive'`, `'activating'`. La función `ts()` no tiene claves para estos valores → muestra el string en inglés.

**Solución:** Añadir claves i18n para los valores que devuelve systemd: `running`, `dead`, `inactive`, `activating`, `deactivating`, `failed`, `active`. También para los estados de Docker que puedan no estar traducidos.

**Archivos afectados:**
- `src/i18n/` — archivo(s) de traducción ES e EN

### D2: Filtrar particiones eMMC

**Problema:** En el Dashboard y StoragePage aparecen dispositivos `mmcblk*` (particiones eMMC internas del SBC) mezclados con los discos de datos reales.

**Solución:** En la ruta `/api/storage` (o en `StoragePage.tsx`), filtrar los dispositivos cuyo nombre empiece por `mmcblk` antes de devolver/mostrar la lista.

**Archivos afectados:**
- `server/routes/storage.ts` — filtrar en el backend (preferido sobre filtrar en UI)

### D3: Deduplicar disco sdc

**Problema:** El disco sdc aparece dos veces: una como `/mnt/disks/data-sdc` y otra como `/mnt/storage`. Probablemente es el mismo dispositivo montado en dos puntos de montaje diferentes.

**Solución:** En la ruta `/api/storage`, deduplicar por nombre de dispositivo base (ej: `sdc`, sin partición). Si el mismo dispositivo aparece en múltiples puntos de montaje, conservar el que coincida con `/mnt/storage` o el de mayor uso. Si ninguno coincide, conservar el primero.

**Archivos afectados:**
- `server/routes/storage.ts` — deduplicación por device name

---

## Orden de implementación

1. **A1** — Auth en files.ts (mayor impacto de seguridad, cambio mínimo)
2. **C1** — Fix rename/delete en FilesPage (bug de usuario visible)
3. **D1** — Traducciones de servicios (cosmético pero frecuente)
4. **D2** — Filtrar eMMC (requiere ver storage route)
5. **D3** — Deduplicar disco (requiere ver storage route, va junto con D2)

---

## Criterios de éxito

- `GET /api/files/list` sin token devuelve 401
- Rename y Delete en la UI de Archivos funcionan correctamente
- Los estados de servicios systemd se muestran en español
- `mmcblk*` no aparece en la lista de discos
- El disco sdc aparece una sola vez

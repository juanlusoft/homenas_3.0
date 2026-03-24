# HomePiNAS v3 — Security Remediation Plan

Fecha: 2026-03-24

Este documento resume los hallazgos de la auditoría y traduce cada problema en acciones concretas para remediación. Está pensado para pasárselo a Claude Code Opus u otro agente de implementación.

## Resumen ejecutivo

El repositorio expone operaciones privilegiadas sin autenticación real, tiene superficies de ejecución de comandos y escritura de sistema, y maneja credenciales/secrets de forma insegura. El frontend también presenta inconsistencias: guarda un token pero no lo usa, y puede marcar el setup como completado aunque el backend falle.

Prioridad máxima:
1. Autenticación/autorización real en backend.
2. Eliminar hashing débil y token “falso”.
3. Cerrar terminal, scheduler, setup y shares a operaciones peligrosas.
4. Unificar el frontend para que la sesión sea real y los errores no se oculten.

---

## P0 — Bloqueos críticos inmediatos

### 1) server/index.ts

Problema:
- Monta todas las rutas sin middleware de auth.
- CORS abierto.
- Socket.io abierto con origin `*`.

Cambio exacto:
- Añadir middleware global de autenticación para rutas sensibles.
- Separar rutas públicas de privadas.
- Restringir CORS a orígenes permitidos.
- Validar sesión/token también en el handshake de Socket.io.
- Aplicar checks por rol antes de montar routers administrativos.

Riesgo que elimina:
- Acceso no autorizado a todo el backend.

Criterio de aceptación:
- Ninguna ruta mutadora o privilegiada responde sin sesión válida.
- Socket.io rechaza clientes no autenticados.

---

### 2) server/routes/users.ts

Problemas:
- `sha256` con salt estático para passwords.
- Fallback de `admin/admin` si no existe `users.json`.
- Login devuelve un token aleatorio no persistido ni validado.
- El secreto TOTP se expone y se guarda en claro.
- No hay rate limit ni lockout útil.

Cambio exacto:
- Sustituir `sha256` por Argon2id o bcrypt.
- Eliminar la creación automática de `admin/admin`.
- Implementar sesiones reales o JWT firmados y validados por backend.
- No devolver `totpSecret` salvo en enrolamiento autenticado y explícito.
- Añadir rate limit al login.
- Exigir rol admin para CRUD de usuarios y 2FA global.

Riesgo que elimina:
- Auth débil, backdoor por defecto, filtración de 2FA, sesión falsa.

Criterio de aceptación:
- No existe login por defecto.
- El token emitido se valida en cada request protegida.
- 2FA no expone el secreto en respuestas normales.

---

### 3) server/routes/settings.ts

Problemas:
- `/import` escribe archivos usando claves del body.
- `/export` devuelve todo lo que haya en `data/*.json`, incluidos secretos.
- `/ssh` y `/fan` ejecutan cambios de sistema sin auth visible.
- `test-email` y `test-telegram` reciben secretos directamente por request.

Cambio exacto:
- Proteger todas las rutas con auth admin.
- `/import`: usar allowlist cerrada de claves/ficheros permitidos.
- `/export`: redactar secretos antes de responder.
- `/ssh` y `/fan`: exigir autorización y registrar auditoría.
- Test de email/Telegram: no aceptar secretos innecesarios sin auth admin.

Riesgo que elimina:
- Escritura arbitraria en disco, filtración de secretos, control indebido del sistema.

Criterio de aceptación:
- No se pueden escribir archivos arbitrarios desde `/import`.
- `export` no filtra hashes, tokens ni secretos.

---

### 4) server/routes/terminal.ts

Problemas:
- Exposición de ejecución de comandos por HTTP.
- Whitelist demasiado amplia para un “terminal”.
- Permite `cd`, `env`, `ps`, `top`, `docker`, `systemctl`, `journalctl`, `curl`, `wget`, etc.

Cambio exacto:
- Si la prioridad es seguridad, eliminar el endpoint o dejarlo deshabilitado por defecto.
- Si se conserva, convertirlo en acciones predefinidas del backend.
- Exigir auth admin.
- Añadir auditoría completa de cada ejecución.
- Reducir al mínimo la whitelist y quitar utilidades de descarga/administración no imprescindibles.

Riesgo que elimina:
- Consola remota casi completa por HTTP.

Criterio de aceptación:
- No hay ejecución libre de comandos por HTTP.
- Toda acción queda auditada.

---

### 5) server/routes/scheduler.ts

Problemas:
- `command` libre guardado en tareas.
- `syncCrontab` mete `command` directamente en crontab.
- `run now` ejecuta `task.command`.

Cambio exacto:
- Eliminar `command` libre.
- Reemplazarlo por `actionId` o tipo de tarea de una allowlist.
- Validar `schedule` con parser estricto.
- No escribir texto del usuario en crontab.
- Exigir auth admin.

Riesgo que elimina:
- Persistencia maliciosa y ejecución arbitraria vía cron.

Criterio de aceptación:
- No se puede persistir un comando arbitrario en cron.
- `run now` ejecuta solo acciones permitidas.

---

### 6) server/routes/setup.ts

Problemas:
- Endpoint destructivo.
- Formatea discos.
- Monta volúmenes.
- Modifica hostname y red.
- Escribe `/etc/fstab` usando `bash -c + echo`.
- Puede dejar el host en estado inconsistente.

Cambio exacto:
- Exigir auth admin y confirmación explícita.
- Evitar `bash -c + echo` al escribir `fstab`.
- Escribir `fstab` con I/O directo o archivo temporal seguro.
- No marcar `setupCompleted` si falla un paso crítico.
- Registrar exactamente qué pasos se ejecutaron y cuáles fallaron.
- Considerar rollback parcial o al menos persistir un estado de error.

Riesgo que elimina:
- Destrucción de datos, shell injection, setup falso.

Criterio de aceptación:
- No hay shell injection al modificar `fstab`.
- El setup no puede quedar “completo” si falló.

---

### 7) server/routes/shares.ts

Problemas:
- `name` va directo a `smb.conf`.
- `sharePath` se acepta libremente.
- `allowedUsers` se concatena en la config.
- Se crea el directorio sin limitar base.

Cambio exacto:
- Exigir auth admin.
- Restringir `sharePath` a rutas permitidas.
- Sanitizar el nombre del share.
- Validar `allowedUsers` con allowlist/regex estricta.
- No escribir configuración Samba sin validación previa.

Riesgo que elimina:
- Inyección en Samba y exposición arbitraria del filesystem.

Criterio de aceptación:
- No se pueden crear shares fuera de la raíz permitida.
- No se puede inyectar configuración Samba.

---

### 8) Rutas privilegiadas adicionales

Revisar y proteger igual:
- `server/routes/backup.ts`
- `server/routes/stacks.ts`
- `server/routes/vpn.ts`
- `server/routes/services.ts`
- `server/routes/logs.ts`
- `server/routes/network.ts`
- `server/routes/storage.ts`
- `server/routes/active-backup.ts`
- `server/routes/store.ts`
- `server/routes/ddns.ts`

Acciones:
- auth global
- role checks
- no devolver secretos
- no ejecutar shell salvo necesidad estricta
- auditoría de cambios

Criterio de aceptación:
- Ninguna acción privilegiada queda expuesta sin auth.

---

## P1 — Frontend y sesión

### 9) src/api/client.ts

Problema:
- `fetchAPI` no manda `Authorization`.
- No centraliza errores.
- No maneja token.
- Hay llamadas directas por toda la app.

Cambio exacto:
- Convertirlo en cliente único para requests.
- Leer token de forma segura y adjuntar `Authorization: Bearer <token>`.
- Manejar `401/403` uniformemente.
- Usarlo en todas las páginas.

Criterio de aceptación:
- Todas las llamadas protegidas pasan por un único cliente.
- La sesión se envía correctamente al backend.

---

### 10) src/pages/LoginPage.tsx

Problema:
- Guarda `homepinas-token` en `localStorage`.
- El token no se usa luego.
- No hay rehidratación de sesión.

Cambio exacto:
- Usar token solo si el backend lo valida de verdad.
- Si se usa sesión, rehidratar estado al arrancar.
- Si se usa JWT, pasarlo al cliente API.
- Borrar token al logout.
- Mostrar errores reales si el login falla.

Criterio de aceptación:
- Logout limpia la sesión de verdad.
- La página no guarda credenciales huérfanas.

---

### 11) src/App.tsx

Problemas:
- `setupDone` se marca aunque el backend falle.
- `logout` no borra token.
- `setCurrentView` se llama durante render para expulsar no-admins.
- Terminal duplicado en el menú.

Cambio exacto:
- No marcar `setupDone` si `/setup/apply` falla.
- Borrar token en logout.
- Mover el redirect de autorización a `useEffect`.
- Quitar el duplicado de terminal.
- Si el backend devuelve 401, volver a login.

Criterio de aceptación:
- La UI no miente sobre setup.
- No hay duplicados de navegación.
- No hay state changes dentro de render.

---

### 12) src/hooks/useSocket.ts y src/contexts/SocketContext.tsx

Problema:
- `useSocket` crea una conexión nueva por hook.
- `SocketProvider` existe pero no se usa correctamente.
- Hay conexiones duplicadas.

Cambio exacto:
- Envolver `App` en `SocketProvider`.
- Consumir la conexión compartida desde contexto.
- Eliminar `forceNew` salvo necesidad real.
- Evitar duplicar sockets y eventos.

Criterio de aceptación:
- Hay una sola conexión compartida por app.
- No se duplican eventos ni reconexiones.

---

## P1 — Endurecimiento adicional

### 13) Auditoría

Añadir logs para:
- login exitoso/fallido
- cambios de usuario
- cambios de red
- setup
- terminal
- scheduler
- shares
- export/import

Regla:
- no loggear secretos.

---

### 14) Rate limiting

Aplicar rate limit a:
- `/login`
- terminal
- setup
- scheduler
- acciones de red/sistema

---

### 15) Validación de entradas

Validar con máxima rigidez:
- hostname
- IPs
- nombres de share
- usernames
- rutas de archivos
- expresiones cron
- IDs de usuarios y dispositivos

---

### 16) Manejo de errores en frontend

- No asumir que `fetch` fue exitoso.
- No cerrar modales ni refrescar vistas si la respuesta no fue 2xx.
- Mostrar toast/error visible en acciones sensibles.

---

### 17) Secret handling

- No guardar secretos en JSON plano si no es estrictamente necesario.
- Separar configuración pública y sensible.
- Redactar secretos en exportaciones.

---

## Orden recomendado de implementación

### Fase 1 — bloqueo inmediato
1. auth global backend
2. quitar admin por defecto
3. arreglar hashing
4. bloquear terminal
5. bloquear scheduler libre
6. proteger setup y shares
7. cerrar import/export sensible

### Fase 2 — frontend
8. cliente API con Authorization
9. logout real
10. rehidratación de sesión
11. corregir setupDone
12. sockets compartidos

### Fase 3 — endurecimiento
13. rate limiting
14. auditoría
15. redacción de secretos
16. validaciones adicionales

---

## Resumen final

Este repositorio funciona como demo, pero no como sistema seguro para un host real. La prioridad es cerrar la exposición de poder de sistema, después unificar la auth y por último corregir la UX/estado del frontend.

Si vas a pasar esto a Claude Code Opus, dale primero la Fase 1. Si hace falta, la mejor siguiente tarea es aplicar auth global y desactivar terminal/setup/scheduler hasta que haya sesiones reales.

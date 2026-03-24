# HomePiNAS v3 — Re-audit after claimed fixes

Fecha: 2026-03-24

## Contexto
Volví a auditar el repositorio actual en `/root/homenas_3.0` para verificar si los cambios ya corrigieron los problemas reportados en la primera auditoría.

Resultado corto: en este checkout no hay cambios de código respecto a la auditoría anterior. El árbol está limpio y solo aparece el documento `homepinas_security_audit_plan.md` creado durante la revisión. Aun así, el código actual sigue teniendo varios problemas críticos y algunos fallos nuevos/pendientes de corrección.

---

## Estado del repositorio

- `git status --short` muestra solo:
  - `?? homepinas_security_audit_plan.md`
- No hay diffs de código en el working tree.
- La rama actual apunta a `origin/main`.
- Por tanto, esta re-auditoría evalúa el HEAD actual del repo, no un patch nuevo local.

---

## Hallazgos críticos que siguen abiertos

### 1) No existe autenticación/autorización real en el backend

Archivo: `server/index.ts:41-63`

Problema:
- Todos los routers se montan directamente con `app.use(...)`.
- No hay middleware global de auth.
- No hay validación de token/sesión/rol en el backend visible.
- Socket.io tampoco valida identidad en el handshake.

Impacto:
- Cualquier cliente que llegue al backend puede acceder a rutas administrativas y destructivas.
- La UI puede “parecer” protegida, pero la API sigue abierta.

Riesgo:
- Crítico.

Qué falta:
- Middleware de autenticación real.
- Control de roles por endpoint.
- Protección también para WebSocket.

---

### 2) Login, hash de contraseñas y 2FA siguen siendo inseguros

Archivo: `server/routes/users.ts:26-27, 30-39, 117-138, 196-209`

Problemas:
- `hashPassword()` usa `sha256` con salt estático.
- Si no existe `users.json`, se crea un usuario `admin/admin`.
- El login devuelve un token aleatorio que no se valida en ningún sitio.
- El secreto TOTP se devuelve en la respuesta y se guarda en claro.

Impacto:
- Autenticación débil.
- Backdoor por defecto.
- 2FA potencialmente filtrable.
- El token es simbólico, no una sesión real.

Riesgo:
- Crítico.

Qué falta:
- Argon2id o bcrypt.
- Eliminar el admin por defecto.
- Sesiones reales/JWT validados por backend.
- No devolver secretos TOTP salvo enrolamiento autenticado.

---

### 3) Settings sigue permitiendo import/export peligrosos y acciones privilegiadas sin control visible

Archivo: `server/routes/settings.ts:40-169`

Problemas:
- `/import` escribe archivos usando claves arbitrarias del body.
- `/export` devuelve todos los JSON de `data/` sin redacción.
- `/ssh` ejecuta `systemctl`.
- `/fan` escribe en `/sys/class/thermal`.
- `test-email` y `test-telegram` aceptan secretos por request y hacen acciones externas.

Impacto:
- Escritura arbitraria de configuración.
- Fuga de secretos.
- Control de servicios del sistema sin auth visible.

Riesgo:
- Crítico.

Qué falta:
- Allowlist de archivos exportables/importables.
- Redacción de secretos.
- Auth admin obligatoria en todo el módulo.

---

### 4) Terminal expone ejecución de comandos por HTTP

Archivo: `server/routes/terminal.ts:23-79`

Problemas:
- Sigue existiendo un endpoint de ejecución remota de comandos.
- La whitelist incluye utilidades potentes como `docker`, `systemctl`, `journalctl`, `curl`, `wget`, `env`, `ps`, `top`, etc.
- El comando `cd` usa `require()` dentro de un módulo ESM.

Impacto:
- Consola remota casi completa sobre el host.
- Riesgo de abuso y persistencia.
- Posible fallo en runtime por uso de `require` en ESM.

Riesgo:
- Crítico.

Qué falta:
- Eliminar este endpoint o convertirlo en acciones predefinidas.
- Auth admin obligatoria.
- Auditoría de cada ejecución.
- Revisar el uso de `require()`.

---

### 5) Scheduler sigue permitiendo comandos arbitrarios y persistencia en crontab

Archivo: `server/routes/scheduler.ts:37-121`

Problemas:
- La tarea almacena `command` libre.
- `syncCrontab()` escribe `${schedule} ${command}` en crontab.
- `run now` ejecuta `task.command` con `execFile`.

Impacto:
- Persistencia maliciosa.
- Ejecución remota arbitraria.
- Riesgo muy alto en host con privilegios.

Riesgo:
- Crítico.

Qué falta:
- Reemplazar `command` por una lista cerrada de acciones.
- Validación estricta de cron.
- Auth admin obligatoria.

---

### 6) Setup inicial sigue siendo destructivo y tiene shell-injection risk

Archivo: `server/routes/setup.ts:145-426`

Problemas:
- Puede cambiar hostname y red.
- Puede formatear discos.
- Puede montar volúmenes.
- Escribe `/etc/fstab` usando `bash -c` con `echo` interpolado:
  - `server/routes/setup.ts:298-300`
- Marca el setup como completado incluso si fallan pasos posteriores en la UI.

Impacto:
- Destrucción de datos.
- Riesgo de shell injection.
- Estado inconsistente entre backend y frontend.

Riesgo:
- Crítico.

Qué falta:
- Auth y confirmación explícita.
- Escritura segura de fstab sin shell.
- No marcar setup completo si falla.

---

### 7) Shares/Samba siguen aceptando entradas peligrosas

Archivo: `server/routes/shares.ts:42-145`

Problemas:
- `sharePath` se crea libremente.
- `name` va directo a la sección Samba `[${s.name}]`.
- `allowedUsers` se concatena en `valid users = ...`.
- La configuración se escribe en `/etc/samba/smb.conf`.

Impacto:
- Inyección de configuración Samba.
- Exposición de rutas arbitrarias.
- Configuración del sistema alterable por entrada no controlada.

Riesgo:
- Alto / Crítico.

Qué falta:
- Restricción de rutas a una raíz permitida.
- Sanitización estricta de nombres y usuarios.
- Auth admin obligatoria.

---

### 8) Varias rutas privilegiadas siguen sin auth visible

Archivos:
- `server/routes/backup.ts`
- `server/routes/network.ts`
- `server/routes/storage.ts`
- `server/routes/services.ts`
- `server/routes/logs.ts`
- `server/routes/vpn.ts`
- `server/routes/stacks.ts`
- `server/routes/store.ts`
- `server/routes/ddns.ts`
- `server/routes/active-backup.ts`

Problemas comunes observados:
- Exponen datos del sistema o permiten cambios de sistema.
- Ejecutan `docker`, `systemctl`, `wg`, `nmcli`, `journalctl`, `rsync`, `smartctl` y similares.
- No se ve control de acceso efectivo.

Impacto:
- Acceso amplio a funciones de administración del host.
- Fuga de datos sensibles.
- Escalada operacional si cualquier cliente puede llamar la API.

Riesgo:
- Alto / Crítico según el endpoint.

Qué falta:
- Auth global.
- Role checks.
- Auditoría.
- Bloqueo explícito de acciones destructivas.

---

## Hallazgos de corrección incompleta o roturas funcionales

### 9) Frontend guarda token pero no lo usa

Archivos:
- `src/pages/LoginPage.tsx:20-28`
- `src/api/client.ts:7-10`

Problemas:
- Se guarda `homepinas-token` en `localStorage`.
- El cliente API no envía `Authorization`.
- Muchas páginas siguen haciendo `fetch` directo.

Impacto:
- Auth frontend/backend desconectada.
- Sesión no real.

Riesgo:
- Alto.

Qué falta:
- Cliente único con auth.
- Rehidratación de sesión.
- Manejo uniforme de 401/403.

---

### 10) Logout y bootstrap de sesión siguen incompletos

Archivo: `src/App.tsx:149-180`

Problemas:
- Logout solo limpia estado React, no `localStorage`.
- El wizard marca `homepinas-setup = done` incluso si `/setup/apply` falla.
- Si `/setup/status` falla, se confía en `localStorage`.

Impacto:
- Sesión residual.
- Setup puede verse “completo” cuando no lo está.

Riesgo:
- Alto.

Qué falta:
- Limpiar token al logout.
- No avanzar setup si falla el backend.
- Validar sesión al iniciar.

---

### 11) WebSockets duplicados

Archivos:
- `src/App.tsx:106-107`
- `src/hooks/useNotifications.ts:34-53`
- `src/hooks/useLiveMetrics.ts:25-46`
- `src/contexts/SocketContext.tsx:21-40`
- `src/main.tsx:6-9`

Problema:
- `useNotifications` y `useLiveMetrics` llaman a `useSocket()` por separado.
- Existe `SocketProvider`, pero App no lo usa.

Impacto:
- Doble conexión.
- Estado fragmentado.
- Más reconexiones y listeners duplicados.

Riesgo:
- Medio.

Qué falta:
- Un socket compartido por árbol.
- Usar `SocketProvider` en `main.tsx`.

---

### 12) Uso de `require()` en módulos ESM en el backend

Archivos:
- `server/routes/storage.ts:79-82`
- `server/routes/terminal.ts:47-51`

Problema:
- Se usa `require('fs')` y `require('path')` en archivos ESM.
- `package.json` tiene `"type": "module"`.
- `server/tsconfig.json` usa `module: "ESNext"`.

Impacto:
- Posibles fallos en runtime cuando se ejecutan esas ramas.
- En especial el `cd` del terminal y la lógica de roles de disco.

Riesgo:
- Alto de correctness/runtime.

Qué falta:
- Usar imports ESM consistentes.
- Eliminar `require()` en rutas ESM.

---

### 13) Debug output en frontend

Archivo: `src/main.tsx:11`

Problema:
- Quedó un `console.log('🚨 EMERGENCY: ...')` en producción.

Impacto:
- Ruido en consola.
- Señal de código no limpiado.

Riesgo:
- Bajo, pero indica falta de limpieza.

---

## Hallazgos adicionales que elevan el riesgo general

### 14) DDNS y VPN siguen manejando secretos delicados sin control visible

Archivos:
- `server/routes/ddns.ts:38-80`
- `server/routes/vpn.ts:45-139`

Problemas:
- Se guardan tokens y claves privadas.
- Se escriben configs del sistema.
- En `vpn.ts` sigue habiendo `bash -c` para derivar la clave pública.
- No se ve auth efectiva.

Impacto:
- Fuga o manipulación de secretos.
- Riesgo de configuración remota no autorizada.

Riesgo:
- Alto.

---

### 15) Active Backup expone registro y aprobación de agentes sin control visible

Archivo: `server/routes/active-backup.ts:51-190`

Problemas:
- Registro de agentes sin auth visible.
- Aprobación/rechazo de pending agents sin auth visible.
- Devuelve tokens de agentes.

Impacto:
- Cualquiera podría manipular el sistema de backups si llega a la API.

Riesgo:
- Alto.

---

## Conclusión

La conclusión de la re-auditoría es clara:

- El repositorio no ha aplicado todavía las correcciones de seguridad que deberían cerrar el riesgo principal.
- Las superficies críticas siguen abiertas: auth, terminal, scheduler, setup, shares, y varias rutas de sistema.
- Además, hay fallos de runtime/correctness por uso de `require()` en ESM y por estado de frontend mal sincronizado.

## Prioridad de arreglo sugerida

P0:
1. auth global backend
2. eliminar admin por defecto y hashing débil
3. cerrar terminal/scheduler/setup/shares
4. proteger settings/import-export
5. eliminar `bash -c` para fstab y WireGuard

P1:
6. cliente API con Authorization
7. logout y setup bootstrap correctos
8. socket compartido
9. redacción de secretos
10. rate limiting y auditoría

P2:
11. limpiar `console.log` de debug
12. eliminar `require()` en ESM

---

## Veredicto final

No está listo todavía. Hay mejoras parciales, pero los problemas de diseño que más importan siguen presentes.

## Resumen corto: lo que sigue roto

1. No hay auth real en el backend, así que las rutas críticas siguen expuestas.
2. Terminal y scheduler siguen permitiendo ejecución persistente o semipersistente de acciones peligrosas.
3. Setup, shares y settings todavía pueden tocar el sistema de forma destructiva o filtrar secretos.
4. Frontend y backend siguen desincronizados en sesión, logout y manejo de errores.
5. Hay problemas de runtime/correctness por usar require() dentro de módulos ESM.

Si quieres, el siguiente paso sería convertir este informe en una lista de tareas exactas para implementar por archivo, o en un checklist de PR para Claude Code Opus.

# Active Backup Status (2026-04-03)

## Estado actual
- El dashboard ya integra Active Backup con el engine adapter (trigger/progress) y la UI muestra progreso del engine.
- El core `synobackup-v2` tiene servidor HTTP + servidor TCP de ingestión.
- Se añadió manejo de sesiones colgadas en TCP:
  - timeout configurable `SBV2_TCP_IDLE_TIMEOUT_MS` (default 300000 ms)
  - al cerrar/error/timeout del socket, la sesión en `uploading` pasa a `failed` para evitar bloqueos indefinidos
- El endpoint de versiones en dashboard (`/active-backup/devices/:id/versions`) ahora marca disponibilidad por versión física en disco (`backupAvailable` por versión).

## Cambios clave aplicados hoy
- `synobackup-v2/core/src/state.ts`
  - nueva config: `tcpIdleTimeoutMs`
- `synobackup-v2/core/src/tcp-server.ts`
  - `markSessionFailed()` y `clearSessionContext()`
  - listeners `timeout`, `close`, `error` para cerrar sesiones huérfanas
  - limpieza de detalles de lint locales en este archivo
- `server/routes/active-backup.ts`
  - `getVersionDirectory()`
  - `/devices/:id/versions` devuelve `backupAvailable` calculado por versión

## Pendientes reales
1. Validar en VM/NAS que un backup ya no queda eternamente en `uploading` tras corte o cuelgue.
2. Confirmar layout final de versiones físicas para browse/download en `DeviceDetail`.
3. Reducir deuda de lint global (actualmente `pnpm lint` falla por múltiples módulos fuera de Active Backup).

## Reinicio y continuación
Se documenta que hubo reinicio de entorno y se retoma desde este punto.

### Verificación post-reinicio (2026-04-03)
- NAS accesible por SSH: `192.168.1.81`.
- Core `synobackup-v2` activo en:
  - HTTP `192.168.1.81:4021`
  - TCP `192.168.1.81:4567`
- Token admin real en runtime:
  - `SBV2_ADMIN_TOKEN=admin-v2-local`
- Dispositivo activo en v2:
  - `id=704659e2`, `name=w11-test-v2`, `hostname=w11-test`
- Última sesión registrada en `core/data/state.json`:
  - `sessionId=fb4d720f`
  - `status=failed`
  - `error=write tcp 192.168.1.127:58226->192.168.1.81:4567: i/o timeout`
- Trigger manual post-reinicio:
  - `POST /api/v2/admin/devices/704659e2/trigger` => `{"success":true,"mode":"adapter"}`
  - progreso observado: `running` -> `idle` (adapter), sin bytes reportados por el script de progreso.
- Cambio de modo ejecutado:
  - `SBV2_ENGINE_PROVIDER=native` aplicado y core reiniciado.
  - trigger nuevo en native: `{"success":true,"mode":"agent"}`.
  - estado actual device: `pendingJob=true` sin sesión nueva, lo que indica que el agente de VM no está haciendo poll.
  - conectividad VM `192.168.1.127` no responde (SSH/ping timeout).

Orden recomendado para continuar:
1. Arrancar core v2 en NAS con envs correctos (`SBV2_*`, especialmente `SBV2_TCP_IDLE_TIMEOUT_MS`).
2. Verificar salud:
   - `GET /api/v2/admin/devices`
   - `GET /api/v2/admin/devices/:id/progress`
3. Lanzar trigger de backup de VM.
4. Monitorear:
   - `synobackup-v2/monitor-progress.ps1`
   - `core/data/state.json` (sesión debe cerrar en `completed` o `failed`, nunca quedarse fija en `uploading`)
5. Si vuelve a fallar:
   - capturar `sessionId`
   - revisar `error` en `state.json`
   - revisar carpeta `stage/<sessionId>` para detectar último archivo consistente

Nota: en este momento el core está en modo `adapter` (`SBV2_ENGINE_PROVIDER=urbackup`), por lo que el trigger usa el wrapper del engine y no crea sesión TCP nueva salvo que se cambie el proveedor o se dispare por el flujo de agente.

## Referencias
- `synobackup/HANDOFF-VM-W11-2026-04-02.md`
- `synobackup-v2/WHITE_LABEL_ENGINE.md`
- `ACTIVE_BACKUP_PORTING_PLAN.md`

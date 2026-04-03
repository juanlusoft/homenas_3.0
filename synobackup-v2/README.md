# SynoBackup V2 (WIP)

Nuevo enfoque limpio:

- Control plane: HTTP (`/api/v2/...`)
- Data plane: TCP binario con framing explícito

## Framing TCP

Cada frame de control se envía como:

1. `uint32_be` longitud del JSON header
2. bytes del JSON header (UTF-8)

Para `op=file`, justo después del header se envían `size` bytes crudos del archivo.

## Flujo

1. Agent recibe trabajo por HTTP poll.
2. Agent `POST /api/v2/agent/:id/sessions/start` y obtiene `sessionId`, `tcpHost`, `tcpPort`.
3. Agent abre socket TCP y envía:
   - `hello` (`agentToken`, `deviceId`, `sessionId`, `backupType`, `totalFiles`)
4. Por cada archivo:
   - frame `file` (`path`, `size`, `sha256`, `modifiedAt`)
   - bytes del archivo
5. Finaliza con frame `finish`.
6. Agent reporta cierre por HTTP:
   - `.../complete` o `.../fail`

## Objetivo inmediato

Cerrar de forma robusta la primera copia completa en VM Windows sin depender de SMB/REST para el canal de datos.

## White-Label Engine

- Configuracion y reglas: `WHITE_LABEL_ENGINE.md`
- Avisos legales de terceros: `LEGAL/THIRD_PARTY_NOTICES.md`

# White-Label Engine Setup

Objetivo: usar un motor externo (por ejemplo UrBackup) sin exponer su nombre en la experiencia de usuario.

## Principio

- La UI y APIs publicas hablan de `Backup Engine`.
- El proveedor real queda interno en el adapter.
- Los avisos de terceros van a canal legal/documental, no a pantallas operativas.

## Variables de entorno (`core`)

- `SBV2_ENGINE_PUBLIC_NAME`: etiqueta publica. Ejemplo: `HomeNAS Backup Engine`.
- `SBV2_ENGINE_PROVIDER`: proveedor interno (`urbackup` o `native`).
- `SBV2_ENGINE_EXPOSE_PROVIDER`: por defecto `false`.
- `SBV2_URBACKUP_START_CMD`: comando para lanzar backup del dispositivo.
- `SBV2_URBACKUP_PROGRESS_CMD`: comando para leer progreso.
- `SBV2_ENGINE_CMD_TIMEOUT_MS`: timeout de comandos del adapter.

Ejemplo:

```bash
SBV2_ENGINE_PUBLIC_NAME="HomeNAS Backup Engine" \
SBV2_ENGINE_PROVIDER=urbackup \
SBV2_ENGINE_EXPOSE_PROVIDER=false \
SBV2_URBACKUP_START_CMD="/opt/homenas/engine/start-backup.sh {deviceId}" \
SBV2_URBACKUP_PROGRESS_CMD="/opt/homenas/engine/progress-backup.sh {deviceId}"
```

Recomendado: usar wrappers (`start-backup.sh`, `progress-backup.sh`) para encapsular comandos reales de UrBackup y poder cambiarlos sin tocar la API.

## Endpoint neutro

- `GET /api/v2/admin/engine`
- Devuelve nombre y capacidades publicas.
- Solo devuelve `provider` si `SBV2_ENGINE_EXPOSE_PROVIDER=true`.

- `POST /api/v2/admin/devices/:id/trigger`
  - En modo `urbackup`, dispara `SBV2_URBACKUP_START_CMD`.
- `GET /api/v2/admin/devices/:id/progress`
  - En modo `urbackup`, consulta `SBV2_URBACKUP_PROGRESS_CMD`.

## Reglas para no exponer marca en producto

- No mostrar `provider` en UI.
- No incluir nombre del proveedor en mensajes de error al usuario final.
- Mantener logs tecnicos con detalle solo en backend/ops.

## Cumplimiento legal

- Mantener avisos/licencias de terceros en `LEGAL/THIRD_PARTY_NOTICES.md`.
- Si hay distribucion de binarios modificados, publicar codigo fuente correspondiente segun licencia aplicable.

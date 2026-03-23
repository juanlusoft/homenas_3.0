# HomePiNAS – Lista de Cambios y Correcciones

> Documento generado a partir de revisión visual completa de la interfaz.
> Cada sección corresponde a una página/módulo de la aplicación.

---

## 1. Panel (Dashboard)

### 1.1 Array de Discos – Filtrar dispositivos
- **Problema:** Se muestran las particiones de la eMMC interna de la Raspberry Pi (`/dev/mmcblk0p1` → `/boot/firmware` y `/dev/mmcblk0p2` → `/`).
- **Solución:** Filtrar el listado para excluir dispositivos `mmcblk*`. Solo mostrar discos físicos realmente montados (rutas bajo `/mnt/`).
- **Criterio de exclusión sugerido:** Si el dispositivo comienza por `mmcblk` → no mostrar en el Array de Discos del panel.

### 1.2 Tarjetas superiores – Eliminar duplicados
- **Problema:** La tarjeta de **Temperatura** ya tiene su propio gráfico debajo → información repetida. Igual con **Red E/S** (tarjeta + gráfico "Network Throughput").
- **Solución:** Sustituir las 2 tarjetas duplicadas por 2 métricas nuevas útiles. Propuestas:
  - **Uptime del sistema** (tiempo activo desde último arranque, leído de `/proc/uptime`)
  - **Uso de disco principal** (% de uso del volumen de datos principal, ej. `/mnt/storage`)
- Las tarjetas de CPU y Memoria pueden permanecer ya que sus gráficos muestran historial (complementario, no duplicado).

---

## 2. Archivos (Files)

### 2.1 Botones no funcionales
- **Afectados:** `Subir` y `Nueva Carpeta`
- **Problema:** Al hacer clic no ocurre nada (no abren modal, no llaman a la API).
- **Solución:**
  - `Subir`: Debe abrir un selector de archivos (`<input type="file">`) y hacer POST a `/api/files/upload` con el path actual como parámetro.
  - `Nueva Carpeta`: Debe abrir un modal/prompt pidiendo nombre y hacer POST a `/api/files/mkdir` con el path actual + nombre.
- Verificar que el endpoint de la API exista y esté correctamente ruteado. Revisar el handler de eventos `onClick` de ambos botones.

---

## 3. Compartidos (Shares)

### 3.1 Todos los botones no funcionales
- **Afectados:** `+ Nuevo Compartido`, `Editar`, `Disable` / `Enable`
- **Solución:**
  - `+ Nuevo Compartido`: Abrir modal con formulario (nombre, ruta, protocolo SMB/NFS, acceso, usuarios).
  - `Editar`: Abrir modal pre-relleno con los datos del compartido seleccionado. PUT a `/api/shares/:id`.
  - `Disable` / `Enable`: Llamar a `/api/shares/:id/toggle` y refrescar el estado.
- Revisar binding de eventos y que las llamadas a la API incluyan autenticación.

### 3.2 Textos sin traducir
- **Problema:** Textos en inglés dentro de las tarjetas de compartidos.
- **Afectados identificados:**
  - `active` → `activo`
  - `inactive` → `inactivo`
  - `read-only` → `solo lectura`
  - `read-write` → `lectura y escritura`
  - `clients` → `clientes`
  - `everyone` → `todos`
  - `guest` → `invitado`
- Aplicar traducción en el componente de tarjeta de compartido o en el sistema i18n existente.

---

## 4. Almacenamiento (Storage)

### 4.1 Filtrar dispositivos eMMC
- **Problema:** Se muestran `/` (`/dev/mmcblk0p2`) y `/boot/firmware` (`/dev/mmcblk0p1`) — particiones internas de la Raspberry.
- **Solución:** Igual que en el Panel: excluir dispositivos `mmcblk*` del listado de almacenamiento.

### 4.2 Disco sdc aparece duplicado
- **Problema:** `/mnt/disks/data-sdc` y `/mnt/storage` apuntan al mismo disco físico (`/dev/sdc1`) y se muestran como dos entradas separadas.
- **Solución:** Deduplicar por dispositivo físico (`/dev/sdc1`). Si un disco tiene múltiples puntos de montaje, mostrar el principal o agruparlos bajo una sola tarjeta indicando todos los mountpoints.

### 4.3 Diferenciación visual por tipo de disco
- **Solución:** Añadir un indicador de tipo (badge o color de borde) a cada tarjeta de disco:
  - 🔵 **Caché** (ej. `/mnt/cache/`) → borde/badge azul
  - 🟢 **Datos / Pool** (ej. `/mnt/storage`, `/mnt/disks/`) → borde/badge verde
  - 🟡 **Paridad** (si aplica) → borde/badge amarillo
- El tipo debe determinarse por la ruta de montaje o por una configuración definida en el backend.

### 4.4 Datos reales de temperatura, uptime y estado
- **Problema:** Temperatura, horas de encendido y sectores malos muestran `0°C`, `0d` y `0` — valores no reales o sin fuente.
- **Solución:**
  - **Temperatura:** Leer de `smartctl -A /dev/sdX` → campo `Temperature_Celsius` o `Airflow_Temperature_Cel`. Requiere `smartmontools` instalado y el daemon con permisos.
  - **Horas de encendido:** Leer de `smartctl -A /dev/sdX` → campo `Power_On_Hours`.
  - **Sectores malos:** Leer de `smartctl -A /dev/sdX` → campo `Reallocated_Sector_Ct` o `Current_Pending_Sector`.
  - Endpoint sugerido: `/api/storage/smart/:device` que devuelva estos valores en tiempo real (no cacheados o con caché máx. 60s).
  - Si `smartctl` devuelve error para un disco (ej. NVMe o disco sin soporte SMART), mostrar `N/A` en lugar de `0`.

### 4.5 Botones no funcionales
- **Afectados:** `Chequeo SMART` y `Actualizar`
- **Solución:**
  - `Chequeo SMART`: Ejecutar `smartctl -t short /dev/sdX` via backend y mostrar resultado en modal. POST a `/api/storage/smart-test/:device`.
  - `Actualizar`: Re-fetch de los datos de todos los discos. Llamar al endpoint de listado de discos y re-renderizar.

---

## 5. Copias de Seguridad (Backup)

### 5.1 Todos los botones no funcionales
- **Afectados:** `+ Nueva Tarea`, `Ejecutar Todo`, `Ejecutar Ahora`, `Configurar`
- **Solución:**
  - `+ Nueva Tarea`: Modal con campos (nombre, tipo full/incremental/snapshot, destino, programación cron).
  - `Ejecutar Todo`: POST a `/api/backup/run-all`.
  - `Ejecutar Ahora` (por tarea): POST a `/api/backup/run/:id`.
  - `Configurar` (por tarea): Modal pre-relleno con configuración de la tarea. PUT a `/api/backup/:id`.

### 5.2 Textos sin traducir
- **Afectados:**
  - `successful` → `exitoso`
  - `scheduled` → `programado`
  - `full` → `completo`
  - `incremental` → `incremental` *(igual en español, ok)*
  - `snapshot` → `instantánea`
  - `Daily 02:00` → `Diario 02:00`
  - `Every 6h` → `Cada 6h`
  - `Weekly Sun 03:00` → `Semanal Dom 03:00`
  - `BACKUP ACTIONS` → `ACCIONES DE BACKUP`
  - `2 successful` → `2 exitosas`

---

## 6. Active Backup

### 6.1 Botón "Descargar Agente" no funcional
- **Problema:** El botón no descarga nada ni redirige.
- **Solución:** El botón debe iniciar la descarga del instalador del agente. Opciones:
  - Redirigir a una URL de descarga directa (ej. GitHub Releases del proyecto).
  - O hacer GET a `/api/active-backup/agent/download` que sirva el fichero binario del agente.
- Añadir el atributo `download` al elemento o manejar el blob en el frontend.

---

## 7. Servicios

### 7.1 Estado de servicios en inglés
- **Afectados:** `running`, `dead`, `enabled`, `disabled`, `active`, `inactive`
- **Traducciones:**
  - `running` → `en ejecución`
  - `dead` → `detenido`
  - `enabled` → `habilitado`
  - `disabled` → `deshabilitado`
  - `active` → `activo`
  - `inactive` → `inactivo`
- También traducir las cabeceras `Contenedores Docker` y `Servicios del Sistema` si aún están en inglés en el código.

### 7.2 Botón Iniciar/Parar por servicio
- **Problema:** No existe botón de control por cada servicio del sistema.
- **Solución:** Añadir un botón `Iniciar` / `Parar` (toggle según estado actual) en cada fila de servicio.
  - Si el servicio está `running` → mostrar botón `Parar` → POST a `/api/services/stop/:name`
  - Si el servicio está `dead` / `inactive` → mostrar botón `Iniciar` → POST a `/api/services/start/:name`
- Después de la acción, refrescar el estado del servicio afectado.
- **Precaución:** El servicio `homepinas` (el propio NAS) debe mostrar advertencia antes de permitir pararlo.

---

## 8. Tienda (Homestore)

### 8.1 Textos de aplicaciones en inglés
- **Problema:** Nombres de empresa, descripciones y estados de apps están en inglés.
- **Solución:**
  - Traducir los estados: `Running` → `En ejecución`, `Stopped` → `Detenido`
  - Las **descripciones** de las apps (ej. "Stream your media anywhere...") pueden mantenerse en inglés si son datos de catálogo externos, pero los elementos de UI propios (botones, estados, filtros) deben estar en español.
  - Traducir los filtros: `All` → `Todos`, `Installed` → `Instalado`, `Available` → `Disponible`
  - Traducir `SEARCH` → `BUSCAR` en la tarjeta de búsqueda.

### 8.2 Iconos de aplicaciones incorrectos
- **Problema:** Los iconos mostrados no son los oficiales de cada aplicación.
- **Solución:** Cargar los iconos desde una fuente fiable:
  - Opción A: Usar la URL del icono definida en el catálogo de apps (campo `icon` del JSON de cada app).
  - Opción B: Construir la URL desde Docker Hub: `https://hub.docker.com/v2/repositories/<namespace>/<repo>/` y usar el campo `logo_url`.
  - Opción C: Mantener un directorio local `/public/icons/` con los logos oficiales descargados.
- Si no se encuentra icono, mostrar un fallback genérico con la inicial de la app.

### 8.3 Botones Instalar/Desinstalar/Abrir no funcionales
- **Afectados:** `Instalar`, `Desinstalar`, `Abrir`
- **Solución:**
  - `Instalar`: POST a `/api/store/install/:appId` → mostrar progreso (barra o spinner) → refrescar estado.
  - `Desinstalar`: POST a `/api/store/uninstall/:appId` → confirmar con modal de advertencia antes de ejecutar.
  - `Abrir`: Redirigir a `http://<nas-ip>:<puerto>` donde el puerto es el expuesto por el contenedor (ya visible en la tarjeta, ej. `:32400`).

---

## 9. Red (Network)

### 9.1 Edición de interfaz de red
- **Problema:** No existe opción para configurar la interfaz de red desde la UI.
- **Solución:** Añadir un botón `Editar` o icono de configuración en la tarjeta de cada interfaz que abra un modal con:
  - **Modo:** selector DHCP / IP Estática
  - Si **IP Estática**:
    - Campo `Dirección IP` (validación formato IPv4)
    - Campo `Máscara de subred` (ej. `255.255.255.0`)
    - Campo `Puerta de enlace` (gateway)
    - Campo `DNS primario`
    - Campo `DNS secundario` (opcional)
  - Botones `Guardar` y `Cancelar`
  - Al guardar: PUT a `/api/network/:interface/config` → aplicar cambios con `nmcli` o editando `/etc/dhcpcd.conf` según el sistema.
  - Mostrar advertencia: "Cambiar la configuración de red puede desconectarte temporalmente."

### 9.2 Detección automática de nuevas interfaces
- **Solución:** El endpoint `/api/network/interfaces` debe leer dinámicamente todas las interfaces activas del sistema (ej. `ip link show` o leyendo `/sys/class/net/`), no usar una lista estática.
- El frontend debe re-consultar este endpoint periódicamente (ej. cada 30s) o al cargar la página.

### 9.3 Traducciones pendientes
- `Connected` → `Conectada`
- `UP` → `ACTIVA`
- `DOWN` → `INACTIVA`

---

## 10. Sistema (System)

### 10.1 Todos los botones no funcionales
- **Afectados:** `Diagnóstico Completo`, `Buscar Actualizaciones`, `Ver Registros`, `Configuración`
- **Solución:**
  - `Diagnóstico Completo`: Ejecutar script de diagnóstico en backend y mostrar resultado en modal o panel expandible. GET a `/api/system/diagnostics`.
  - `Buscar Actualizaciones`: GET a `/api/system/updates` → mostrar lista de paquetes con actualización disponible y botón para instalar.
  - `Ver Registros`: Redirigir a la sección de Registros (`/logs`) o abrir panel con tail de `/var/log/syslog` o journald.
  - `Configuración`: Redirigir a la sección de Ajustes (`/settings`).

---

## 11. Ajustes (Settings)

### 11.1 Botón "Save Settings" no funcional
- **Problema:** Al pulsar `Save Settings` no se guardan los cambios.
- **Solución:** El botón debe recopilar todos los valores del formulario y hacer PUT/POST a `/api/settings`. Verificar que el handler del evento `onClick` esté correctamente conectado y que el endpoint exista.

### 11.2 Toggle SSH no tiene efecto real
- **Problema:** Desactivar el toggle de SSH no detiene el servicio `sshd`.
- **Solución:** Al cambiar el toggle de SSH, llamar al backend:
  - Activar: `systemctl enable --now sshd` (o el equivalente via API)
  - Desactivar: `systemctl disable --now sshd`
  - Endpoint: POST a `/api/settings/ssh` con body `{ "enabled": true/false, "port": 22 }`
- Verificar que el backend tenga permisos para ejecutar `systemctl`.

### 11.3 Notificaciones – Añadir soporte Telegram
- **Problema:** Solo existe campo de email para alertas.
- **Solución:** Añadir sección "Telegram" en Notificaciones con:
  - Campo `Token del Bot` (ej. `123456:ABC-DEF...`)
  - Campo `Chat ID` (ID del usuario o grupo destino)
  - Toggle `Activar notificaciones Telegram`
  - Botón `Probar` → POST a `/api/settings/notifications/test-telegram`
- Al guardar, el backend debe usar la API de Telegram (`https://api.telegram.org/bot<token>/sendMessage`) para enviar alertas.

### 11.4 Control de ventiladores no funcional
- **Problema:** Seleccionar `auto`, `manual` o `quiet` no cambia el comportamiento del ventilador.
- **Solución:** Al cambiar el modo, POST a `/api/settings/fan` con body `{ "mode": "auto" | "manual" | "quiet" }`.
  - El backend debe controlar el ventilador via GPIO o el driver correspondiente de la Raspberry Pi (ej. escribiendo en `/sys/class/thermal/cooling_device*/cur_state` o usando `pigpio`/`lgpio`).
  - Si el modo es `manual`, añadir un slider de velocidad (0-100%).

---

## 12. Usuarios (Users)

### 12.1 Botón "+ Añadir Usuario" no funcional
- **Solución:** Abrir modal con campos:
  - `Nombre de usuario` (requerido)
  - `Contraseña` (requerido, con confirmación)
  - `Rol` (selector: `admin` / `user`)
  - `2FA` (toggle opcional)
  - Botones `Crear` y `Cancelar`
  - POST a `/api/users` con los datos del formulario.

### 12.2 Gestión de usuarios existentes
- **Problema:** No hay opciones para editar permisos ni eliminar usuarios desde la lista.
- **Solución:** Añadir acciones en cada fila de usuario:
  - Botón/icono `Editar` → Modal para cambiar contraseña, rol y estado. PUT a `/api/users/:id`.
  - Botón/icono `Eliminar` → Confirmación modal + DELETE a `/api/users/:id`.
  - Protección: El usuario actualmente autenticado no puede eliminarse a sí mismo. Mostrar error si se intenta.

### 12.3 Activar 2FA no funcional
- **Problema:** La sección "Requerir 2FA para todos" tiene botón `Activar` que no hace nada.
- **Solución:**
  - `Activar`: POST a `/api/users/security/2fa-required` con `{ "enabled": true }` → marcar en BD/config que todos los usuarios deben tener 2FA.
  - Para el 2FA individual: Al editar un usuario, ofrecer la opción de generar un QR TOTP (usando una librería como `speakeasy` o `otplib`) que el usuario escanea con Google Authenticator / Authy.
  - Endpoint de verificación: POST a `/api/users/:id/2fa/setup` → devolver QR code en base64 y secret.

---

## Resumen de Endpoints de API necesarios/a verificar

| Módulo | Método | Endpoint | Descripción |
|---|---|---|---|
| Archivos | POST | `/api/files/upload` | Subir archivo |
| Archivos | POST | `/api/files/mkdir` | Crear carpeta |
| Compartidos | POST | `/api/shares` | Nuevo compartido |
| Compartidos | PUT | `/api/shares/:id` | Editar compartido |
| Compartidos | POST | `/api/shares/:id/toggle` | Activar/desactivar |
| Almacenamiento | GET | `/api/storage/smart/:device` | Datos SMART reales |
| Almacenamiento | POST | `/api/storage/smart-test/:device` | Lanzar test SMART |
| Backup | POST | `/api/backup/run-all` | Ejecutar todas las tareas |
| Backup | POST | `/api/backup/run/:id` | Ejecutar tarea concreta |
| Backup | PUT | `/api/backup/:id` | Configurar tarea |
| Backup | POST | `/api/backup` | Nueva tarea |
| Active Backup | GET | `/api/active-backup/agent/download` | Descargar agente |
| Servicios | POST | `/api/services/start/:name` | Iniciar servicio |
| Servicios | POST | `/api/services/stop/:name` | Parar servicio |
| Tienda | POST | `/api/store/install/:appId` | Instalar app |
| Tienda | POST | `/api/store/uninstall/:appId` | Desinstalar app |
| Red | GET | `/api/network/interfaces` | Listar interfaces (dinámico) |
| Red | PUT | `/api/network/:interface/config` | Configurar interfaz |
| Sistema | GET | `/api/system/diagnostics` | Diagnóstico completo |
| Sistema | GET | `/api/system/updates` | Buscar actualizaciones |
| Ajustes | PUT/POST | `/api/settings` | Guardar ajustes |
| Ajustes | POST | `/api/settings/ssh` | Control SSH |
| Ajustes | POST | `/api/settings/fan` | Control ventilador |
| Ajustes | POST | `/api/settings/notifications/test-telegram` | Probar Telegram |
| Usuarios | POST | `/api/users` | Crear usuario |
| Usuarios | PUT | `/api/users/:id` | Editar usuario |
| Usuarios | DELETE | `/api/users/:id` | Eliminar usuario |
| Usuarios | POST | `/api/users/security/2fa-required` | Forzar 2FA global |
| Usuarios | POST | `/api/users/:id/2fa/setup` | Setup 2FA individual |

---

## Notas Generales

- **Filtro eMMC global:** Aplicar en todos los módulos que listen discos. Criterio: excluir dispositivos cuyo nombre de dispositivo empiece por `mmcblk`.
- **Deduplicación de discos:** Si dos mountpoints apuntan al mismo dispositivo físico, mostrar solo una entrada.
- **Autenticación en API:** Verificar que todas las llamadas a la API incluyen el token de sesión en la cabecera `Authorization`. Muchos botones pueden fallar silenciosamente por error 401/403.
- **Feedback al usuario:** Todos los botones de acción deben mostrar estado de carga (spinner) mientras la petición está en curso y feedback de éxito/error al completarse (toast o notificación).
- **Datos en tiempo real:** Los valores de SMART (temperatura, uptime, sectores malos) deben ser consultados al backend, nunca estimados o hardcodeados a `0`.

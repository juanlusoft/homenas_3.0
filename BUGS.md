# HomePiNAS – Bugs y mejoras pendientes
> Recopilación de fallos detectados · 2026-03-24

---

## 1. Archivos

- **Botones "Subir" y "Nueva Carpeta" no responden** al hacer clic. No se ejecuta ninguna acción.

---

## 2. Compartidos (SMB)

- **Solicitud de certificado digital al conectar desde otro PC** — tras introducir usuario y contraseña correctamente, el sistema solicita un certificado digital en lugar de autenticar con las credenciales. La carpeta compartida (`compartida`, SMB, `/mnt/storage/`, lectura y escritura) está activa pero es inaccesible desde clientes externos por este motivo.

---

## 3. Almacenamiento

- **Disco duplicado** — `/mnt/disks/data-sdc` y `/mnt/storage` apuntan al mismo dispositivo físico (`/dev/sdc1`) y muestran los mismos datos de uso. Solo debería aparecer una entrada.
- **Temperatura y horas de encendido incompletas** — únicamente `/mnt/storage` muestra temperatura (58 °C). Los otros discos muestran `N/A` en Temp y en Encendido.
- **Etiqueta incorrecta en sda** — el disco `/mnt/cache/cache-sda` fue seleccionado como disco de **Datos** en el wizard de configuración, pero aparece etiquetado como **Caché**.

---

## 4. Active Backup

- **Dispositivos de ejemplo no eliminados** — siguen apareciendo en el listado los siguientes dispositivos de prueba que deben quitarse:
  - `Juanlu Desktop` (Windows 11 Pro · 192.168.1.10)
  - `MacBook Pro` (macOS Sonoma 15.3 · 192.168.1.15)
  - `Dev Server` (Ubuntu 24.04 LTS · 192.168.1.20)
- Revisar también si `LAPTOP-MARIA` (en estado Pending Approval) es un dispositivo de ejemplo o real.

---

## 5. Contenedores Docker (Servicios)

- **Memoria no se muestra** — el campo Memoria aparece como `—` en todos los contenedores (Plex, Jellyfin).
- **Ver Logs abre un `alert()` nativo del navegador** — debería mostrarse en un panel/modal con estilo terminal (fondo oscuro, fuente monospace, scroll). Actualmente abre un `window.alert` del sistema.
- **Falta botón "Detener"** — solo aparecen "Ver Logs" y "Reiniciar". Falta la acción para parar el contenedor.
- **Puertos duplicados en bucle (Plex)** — la lista de puertos crece continuamente repitiendo `32400/tcp` decenas de veces. Parece que en cada actualización de estado se añaden entradas en lugar de deduplicar. Se deben mostrar solo los puertos únicos.

---

## 6. Red

- **Interfaces virtuales de Docker visibles** — se muestran `docker0`, `veth5f24882` y `vethf8638f9` junto a `eth1`. Solo deben mostrarse interfaces físicas activas.
- **Tamaño de tarjeta desproporcionado** — las cards de interfaz ocupan demasiado espacio vertical.
- **Máscara y Puerta de enlace vacías** en las interfaces virtuales (consecuencia directa del punto anterior).
- **Falta opción para cambiar entre DHCP e IP estática** — no existe ningún control para configurar el modo de asignación de IP en las interfaces.

---

## 7. Terminal

- **Admin sin acceso completo al sistema** — el usuario administrador no puede navegar fuera del home (`cd ..` devuelve error). El admin debe tener acceso total a la terminal sin restricciones de ruta.
- **Terminal visible para todos los roles** — la sección Terminal solo debe ser accesible para usuarios con rol `admin`. Los usuarios con rol `user` no deben verla ni acceder a ella.

---

## 8. VPN (WireGuard)

- **Botón "Configurar WireGuard" no hace nada** — al hacer clic no se abre ningún panel ni se ejecuta ninguna acción.

---

## 9. Tareas Programadas

- **Sin log de ejecución** — cuando una tarea falla (estado "fallido"), no hay forma de consultar el motivo del error. Debe añadirse un acceso al log de cada ejecución.
- **Sin botón de editar** — solo existen los botones ejecutar (▶), pausar (⏸) y eliminar (🗑). Falta un botón para **editar** la tarea.

---

## 10. Sistema

- **Diagnóstico Completo sin feedback** — el botón ejecuta algo pero no muestra ningún resultado, progreso ni informe de lo realizado.
- **Buscar Actualizaciones sin indicación de estado** — no se muestra si está buscando, qué encontró, ni qué alcance tiene (¿SO?, ¿dashboard?, ¿contenedores?).
- **Redundancia en el menú lateral** — "Registros" y "Ajustes" del menú lateral llevan exactamente al mismo lugar que "Ver Registros" y "Configuración" dentro de Sistema. Propuesta: eliminar ambas entradas del menú lateral y conservar solo los botones dentro de la sección Sistema.

---

## 11. Usuarios

- **Roles sin efecto** — cualquier usuario tiene acceso completo a todas las secciones del dashboard independientemente de si su rol es `admin` o `user`. El control de acceso por rol no está implementado.
- **2FA no funciona** — al activar "Requerir 2FA para todos" (TOTP), la opción no tiene ningún efecto real. No se solicita segundo factor al iniciar sesión.

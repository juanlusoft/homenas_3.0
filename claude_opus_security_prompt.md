Necesito que audites y remedies el repositorio HomePiNAS v3 en modo seguro y conservador.

Contexto:
- Repo: /root/homenas_3.0
- Hay un informe de re-auditoría en:
  /root/homenas_3.0/homepinas_security_reaudit_2026-03-24.md
- Tu objetivo es corregir los fallos críticos y no romper el resto del sistema.

Prioridad de trabajo:
1. Backend auth real
2. Cerrar rutas peligrosas
3. Corregir sesiones/frontend
4. Evitar roturas de runtime
5. Dejar todo verificado

Hallazgos que debes tratar como prioridad máxima:
- No hay autenticación/autorización real en backend.
- users.ts sigue usando sha256 + salt estático, crea admin/admin si no hay users.json, y expone 2FA secret.
- settings.ts sigue permitiendo import/export peligrosos y acciones privilegiadas sin control visible.
- terminal.ts sigue permitiendo ejecución de comandos por HTTP.
- scheduler.ts sigue permitiendo command libre y persistencia en cron.
- setup.ts sigue siendo destructivo y usa bash -c + echo para /etc/fstab.
- shares.ts sigue permitiendo inyección/exposición de rutas.
- varias rutas privilegiadas siguen sin auth visible: backup, network, storage, services, logs, vpn, stacks, store, ddns, active-backup.
- frontend guarda token pero no lo usa, logout no limpia sesión, setup puede marcarse como completo aunque falle backend.
- hay uso de require() dentro de módulos ESM en server/routes/storage.ts y server/routes/terminal.ts.
- hay un console.log de debug en src/main.tsx.

Qué quiero que hagas:
- Corrige primero los problemas críticos.
- Mantén el comportamiento funcional si es posible, pero prioriza seguridad.
- Si una ruta peligrosa no puede hacerse segura rápidamente, desactívala o limita su alcance temporalmente.
- No introduzcas cambios cosméticos innecesarios.
- No rompas el build.

Criterios mínimos:
- Todas las rutas privilegiadas deben requerir auth real.
- No debe existir login por defecto admin/admin.
- No debe haber ejecución libre de comandos desde HTTP.
- No debe poder escribirse en config/FS del sistema sin validación estricta.
- El frontend debe tratar bien sesión, logout y errores.
- El build debe seguir pasando.

Entrega:
1. Resume qué has cambiado.
2. Lista archivos tocados.
3. Indica si quedó algo pendiente o riesgoso.
4. Si encuentras algo que no puedas arreglar sin ambigüedad, detente y explícame el tradeoff antes de seguir.

Si detectas que una corrección ya está hecha, no la vuelvas a tocar.

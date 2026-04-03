#!/bin/bash
# ═══════════════════════════════════════════════════════════
# HomePiNAS v3 — Uninstaller
# Elimina el dashboard y toda la configuración del sistema.
# NO toca los discos de datos ni el almacenamiento montado.
# ═══════════════════════════════════════════════════════════

set -euo pipefail

INSTALL_DIR="/opt/homepinas-v3"
SERVICE_NAME="homepinas-v3"
SUDOERS_FILE="/etc/sudoers.d/homepinas"
NGINX_CONF="/etc/nginx/sites-available/homepinas-v3"
NGINX_LINK="/etc/nginx/sites-enabled/homepinas-v3"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

[ "$(id -u)" -ne 0 ] && echo -e "${RED}[ERROR]${NC} Ejecuta como root: sudo bash uninstall.sh" && exit 1

echo -e "${RED}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   HomePiNAS v3 — Desinstalador           ║"
echo "  ║   Elimina archivos y configuración       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

read -rp "¿Continuar con la desinstalación? (escribe 'si' para confirmar): " confirm
[ "$confirm" != "si" ] && echo "Cancelado." && exit 0

# ── Parar servicio ─────────────────────────────────────────
info "Parando servicio..."
systemctl stop "$SERVICE_NAME"   2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
pkill -9 mergerfs 2>/dev/null || true
ok "Servicio parado"

# ── Limpiar /etc/fstab ─────────────────────────────────────
info "Limpiando /etc/fstab..."
if grep -q "# HomePiNAS" /etc/fstab 2>/dev/null; then
    # Elimina el bloque completo desde el comentario hasta la siguiente línea vacía
    perl -i -0pe 's/# HomePiNAS Storage Configuration\n(UUID=[^\n]+\n)*(\n)?//g' /etc/fstab
    ok "/etc/fstab limpiado"
else
    ok "/etc/fstab — sin entradas HomePiNAS"
fi

# ── Desmontar mounts gestionados ──────────────────────────
info "Desmontando puntos de montaje HomePiNAS..."
for mnt in /mnt/storage /mnt/cache /mnt/parity; do
    if mountpoint -q "$mnt" 2>/dev/null; then
        umount -f -l "$mnt" 2>/dev/null && ok "Desmontado $mnt" || warn "No se pudo desmontar $mnt"
    fi
done

# Desmontar discos individuales
for mnt in /mnt/disks/*; do
    [ -d "$mnt" ] && mountpoint -q "$mnt" 2>/dev/null && umount -f -l "$mnt" 2>/dev/null || true
done

# ── Eliminar servicio systemd ─────────────────────────────
info "Eliminando servicio systemd..."
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
ok "Servicio systemd eliminado"

# ── Eliminar configuración nginx ──────────────────────────
info "Eliminando configuración nginx..."
rm -f "$NGINX_LINK" "$NGINX_CONF"
# Restaurar el sitio por defecto de nginx si fue eliminado
if [ -f /etc/nginx/sites-available/default ] && [ ! -L /etc/nginx/sites-enabled/default ]; then
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
fi
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
ok "Nginx limpiado"

# ── Eliminar sudoers ──────────────────────────────────────
rm -f "$SUDOERS_FILE"
ok "Sudoers eliminado"

# ── Eliminar directorio de instalación ───────────────────
info "Eliminando $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"
ok "$INSTALL_DIR eliminado"

# ── Resumen ───────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   HomePiNAS desinstalado correctamente       ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}   Lo que NO se ha tocado:"
echo -e "${GREEN}║${NC}     · Node.js, pnpm, nginx, Docker, Git"
echo -e "${GREEN}║${NC}     · Los datos en /mnt/storage"
echo -e "${GREEN}║${NC}     · Los discos físicos"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

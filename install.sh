#!/bin/bash
# ═══════════════════════════════════════════════════════════
# HomePiNAS v3 — Installer
# Installs the dashboard on Raspberry Pi / Debian / Ubuntu
# ═══════════════════════════════════════════════════════════

set -euo pipefail

APP_VERSION="6.6.0"
REPO_URL="https://github.com/juanlusoft/homenas_3.0.git"
BRANCH="main"
INSTALL_DIR="/opt/homepinas-v3"
SERVICE_NAME="homepinas-v3"
PORT=3001  # Backend API port (internal)
NODE_MIN="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Pre-checks ──────────────────────────────────────────────

echo -e "${GREEN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   HomePiNAS v${APP_VERSION} Installer              ║"
echo "  ║   Dashboard + Real-time Monitoring       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

[ "$(id -u)" -ne 0 ] && error "Run as root: sudo bash install.sh"

# ── System update ──────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
ok "System updated"

# Detect real user (for ownership)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
info "Installing as user: $REAL_USER"

# ── Node.js check/install ──────────────────────────────────

check_node() {
    if command -v node &>/dev/null; then
        NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$NODE_VER" -ge "$NODE_MIN" ]; then
            ok "Node.js $(node -v) found"
            return 0
        fi
        warn "Node.js $(node -v) too old (need v${NODE_MIN}+)"
    fi
    return 1
}

install_node() {
    info "Installing Node.js v22 LTS..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
        dnf install -y nodejs
    else
        error "Unsupported package manager. Install Node.js v22+ manually."
    fi
    ok "Node.js $(node -v) installed"
}

check_node || install_node

# ── pnpm check/install ─────────────────────────────────────

if ! command -v pnpm &>/dev/null; then
    info "Installing pnpm..."
    npm install -g pnpm@latest
    ok "pnpm $(pnpm -v) installed"
else
    ok "pnpm $(pnpm -v) found"
fi

# ── Nginx install ──────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    info "Installing nginx..."
    apt-get install -y nginx 2>/dev/null || dnf install -y nginx 2>/dev/null
    systemctl enable nginx
    ok "Nginx installed"
else
    ok "Nginx $(nginx -v 2>&1 | grep -o '[0-9.]*') found"
fi

# ── Git check ──────────────────────────────────────────────

if ! command -v git &>/dev/null; then
    info "Installing git..."
    apt-get install -y git 2>/dev/null || dnf install -y git 2>/dev/null
fi

# ── Docker + Docker Compose ───────────────────────────────

if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    ok "Docker $(docker --version | awk '{print $3}') installed"
else
    ok "Docker $(docker --version | awk '{print $3}') found"
fi

# Ensure Docker is running and enabled
systemctl enable --now docker

# Add user to docker group (no sudo needed for docker commands)
if ! id -nG "$REAL_USER" | grep -qw docker; then
    usermod -aG docker "$REAL_USER"
    ok "User $REAL_USER added to docker group"
fi

# Install Docker Compose plugin if not present
if ! docker compose version &>/dev/null; then
    info "Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin 2>/dev/null || {
        # Fallback: install from GitHub
        COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
        ARCH=$(uname -m)
        mkdir -p /usr/local/lib/docker/cli-plugins
        curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
        chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    }
    ok "Docker Compose $(docker compose version --short 2>/dev/null || echo 'installed')"
else
    ok "Docker Compose $(docker compose version --short) found"
fi

# ── Clone/Update repo ─────────────────────────────────────

STAGING_DIR="${INSTALL_DIR}.staging"

if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    ok "Updated to latest"
else
    info "Cloning repository..."
    rm -rf "$STAGING_DIR"
    git clone -b "$BRANCH" --depth 1 "$REPO_URL" "$STAGING_DIR"

    # Preserve config if upgrading
    if [ -d "$INSTALL_DIR/data" ]; then
        info "Preserving existing data..."
        cp -a "$INSTALL_DIR/data" "$STAGING_DIR/data" 2>/dev/null || true
    fi

    # Swap
    [ -d "$INSTALL_DIR" ] && mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%s)"
    mv "$STAGING_DIR" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Install dependencies ──────────────────────────────────

info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ── Build frontend ─────────────────────────────────────────

info "Building frontend..."
pnpm run build
ok "Frontend built"

# ── Create data directory ──────────────────────────────────

mkdir -p "$INSTALL_DIR/data"
chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR/data"
# Ensure storage directories are writable
for dir in /mnt/storage /mnt/cache /mnt/parity /mnt/disks; do
    [ -d "$dir" ] && chown -R "$REAL_USER:$REAL_USER" "$dir" 2>/dev/null || true
done
ok "Data directory ready"

# ── Set ownership ──────────────────────────────────────────

chown -R "$REAL_USER:$REAL_USER" "$INSTALL_DIR"

# ── Create systemd service ─────────────────────────────────

info "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=HomePiNAS v3 Dashboard
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$REAL_USER
Group=$REAL_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) ${INSTALL_DIR}/node_modules/tsx/dist/cli.mjs server/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT

# Security hardening (NoNewPrivileges omitted — sudo smartctl needs privilege escalation)

[Install]
WantedBy=multi-user.target
EOF

# ── Storage tools ─────────────────────────────────────────

info "Installing storage tools (ntfs-3g, exfat, smartmontools, parted, badblocks)..."
apt-get install -y \
    ntfs-3g \
    exfat-fuse \
    exfatprogs \
    smartmontools \
    parted \
    gdisk \
    e2fsprogs \
    util-linux \
    rsync \
    snapraid \
    mergerfs 2>/dev/null || {
    warn "Some storage tools could not be installed (non-critical). Install manually if needed."
}
ok "Storage tools ready"

# ── Sudoers for smartctl ──────────────────────────────────

SUDOERS_FILE="/etc/sudoers.d/homepinas"
cat > "$SUDOERS_FILE" << SUDOERS
# HomePiNAS — allow passwordless sudo for NAS management tools
$REAL_USER ALL=(ALL) NOPASSWD: /usr/sbin/smartctl
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/sgdisk
$REAL_USER ALL=(ALL) NOPASSWD: /usr/sbin/parted
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/mkfs.ext4
$REAL_USER ALL=(ALL) NOPASSWD: /bin/mount
$REAL_USER ALL=(ALL) NOPASSWD: /bin/umount
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/blkid
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/partprobe
$REAL_USER ALL=(ALL) NOPASSWD: /usr/sbin/badblocks
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/rsync
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/snapraid
$REAL_USER ALL=(ALL) NOPASSWD: /bin/cp
$REAL_USER ALL=(ALL) NOPASSWD: /bin/mkdir
$REAL_USER ALL=(ALL) NOPASSWD: /usr/sbin/nmcli
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/reboot
$REAL_USER ALL=(ALL) NOPASSWD: /sbin/shutdown
$REAL_USER ALL=(ALL) NOPASSWD: /usr/bin/apt
SUDOERS
chmod 0440 "$SUDOERS_FILE"
ok "Sudoers entries created for all NAS tools"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# Wait for startup
sleep 3
if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Service started"
else
    warn "Service may not have started. Check: journalctl -u $SERVICE_NAME -f"
fi

# ── Configure nginx (required for HTTPS) ──────────────────

info "Configuring nginx reverse proxy (80 + 443)..."
if command -v nginx &>/dev/null; then

    # Generate self-signed cert if not exists
    CERT_DIR="${INSTALL_DIR}/certs"
    if [ ! -f "$CERT_DIR/server.crt" ]; then
        info "Generating self-signed SSL certificate..."
        bash "${INSTALL_DIR}/scripts/setup-ssl.sh"
    fi

    cat > /etc/nginx/sites-available/homepinas-v3 << NGINX
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name _;
    return 301 https://\$host\$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     ${CERT_DIR}/server.crt;
    ssl_certificate_key ${CERT_DIR}/server.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        root ${INSTALL_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/homepinas-v3 /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t && systemctl reload nginx
    ok "Nginx configured: HTTP→HTTPS redirect, SSL on port 443"
fi

# ── Summary ────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   HomePiNAS v${APP_VERSION} installed!               ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo -e "${GREEN}║${NC}   HTTPS:     https://${LOCAL_IP:-localhost}"
echo -e "${GREEN}║${NC}   HTTP:      http://${LOCAL_IP:-localhost} (→ HTTPS)"

echo -e "${GREEN}║${NC}   Service:   sudo systemctl status ${SERVICE_NAME}"
echo -e "${GREEN}║${NC}   Logs:      sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "${GREEN}║${NC}   Data:      ${INSTALL_DIR}/data/"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

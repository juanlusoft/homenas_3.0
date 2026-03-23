#!/bin/bash
# ═══════════════════════════════════════════════════════════
# HomePiNAS v3 — Installer
# Installs the dashboard on Raspberry Pi / Debian / Ubuntu
# ═══════════════════════════════════════════════════════════

set -euo pipefail

APP_VERSION="3.10.0"
REPO_URL="https://github.com/juanlusoft/homenas_3.0.git"
BRANCH="main"
INSTALL_DIR="/opt/homepinas-v3"
SERVICE_NAME="homepinas-v3"
PORT=3001
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

# ── Git check ──────────────────────────────────────────────

if ! command -v git &>/dev/null; then
    info "Installing git..."
    apt-get install -y git 2>/dev/null || dnf install -y git 2>/dev/null
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
ExecStart=$(command -v npx) tsx server/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

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

# ── Configure nginx (optional) ─────────────────────────────

if command -v nginx &>/dev/null; then
    info "Configuring nginx reverse proxy..."
    cat > /etc/nginx/sites-available/homepinas-v3 << NGINX
server {
    listen 80;
    server_name _;

    location / {
        root ${INSTALL_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

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
    nginx -t && systemctl reload nginx
    ok "Nginx configured (port 80 → dashboard)"
fi

# ── Summary ────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   HomePiNAS v${APP_VERSION} installed!               ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo -e "${GREEN}║${NC}   Dashboard: http://${LOCAL_IP:-localhost}:${PORT}"

if command -v nginx &>/dev/null; then
    echo -e "${GREEN}║${NC}   Via nginx: http://${LOCAL_IP:-localhost}"
fi

echo -e "${GREEN}║${NC}   Service:   sudo systemctl status ${SERVICE_NAME}"
echo -e "${GREEN}║${NC}   Logs:      sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "${GREEN}║${NC}   Data:      ${INSTALL_DIR}/data/"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

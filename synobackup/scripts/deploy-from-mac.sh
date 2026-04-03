#!/bin/bash
# Run this from the Mac Studio after building synobackup artifacts locally.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: bash synobackup/scripts/deploy-from-mac.sh <local-repo-root> <nas-host>"
  exit 1
fi

REPO_ROOT="$1"
NAS_HOST="$2"
NAS_DIR="/opt/synobackup"

echo "Syncing SynoBackup core to ${NAS_HOST}:${NAS_DIR}..."
ssh "$NAS_HOST" "mkdir -p ${NAS_DIR}"
rsync -av --delete \
  --exclude node_modules \
  --exclude data \
  "${REPO_ROOT}/synobackup/core/" "${NAS_HOST}:${NAS_DIR}/core/"

echo "Syncing SynoBackup agent artifacts..."
ssh "$NAS_HOST" "mkdir -p ${NAS_DIR}/agent/dist"
rsync -av \
  "${REPO_ROOT}/synobackup/agent/dist/" "${NAS_HOST}:${NAS_DIR}/agent/dist/"

echo ""
echo "Next on NAS:"
echo "  cd ${NAS_DIR}/core"
echo "  pnpm install"
echo "  SB_HOST=0.0.0.0 SB_PORT=3021 SB_PUBLIC_BASE_URL=http://<NAS_IP>:3021 pnpm start"

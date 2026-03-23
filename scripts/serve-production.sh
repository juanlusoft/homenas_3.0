#!/bin/bash
# Serve HomePiNAS v3 in production mode
# Uses the Express server to serve both API + built frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Ensure built
if [ ! -d "dist" ]; then
    echo "Building frontend..."
    pnpm run build
fi

echo "Starting HomePiNAS v3 server..."
echo "  API:       http://localhost:${PORT:-3001}/api"
echo "  Dashboard: http://localhost:${PORT:-3001}"
echo ""

NODE_ENV=production npx tsx server/index.ts

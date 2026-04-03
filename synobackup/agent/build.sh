#!/bin/bash
# Build SynoBackup Agent for Mac Studio
set -euo pipefail

cd "$(dirname "$0")"

GO="${GO:-/opt/homebrew/bin/go}"
OUT="dist"

mkdir -p "$OUT"

echo "Building SynoBackup agent..."

echo "  -> windows/amd64"
GOOS=windows GOARCH=amd64 "$GO" build -ldflags="-s -w" -o "$OUT/synobackup-agent-windows-amd64.exe" .

echo "  -> darwin/arm64"
GOOS=darwin GOARCH=arm64 "$GO" build -ldflags="-s -w" -o "$OUT/synobackup-agent-darwin-arm64" .

echo "  -> linux/amd64"
GOOS=linux GOARCH=amd64 "$GO" build -ldflags="-s -w" -o "$OUT/synobackup-agent-linux-amd64" .

echo ""
echo "Build complete:"
ls -lh "$OUT"/

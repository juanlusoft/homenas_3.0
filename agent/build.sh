#!/bin/bash
# Build HomePiNAS Agent for all platforms
# Run this on the Mac Studio: bash agent/build.sh
set -euo pipefail

cd "$(dirname "$0")"

GO=/opt/homebrew/bin/go
OUT=dist
mkdir -p "$OUT"

echo "Building HomePiNAS Agent for all platforms..."

# macOS arm64 (Apple Silicon)
echo "  -> darwin/arm64"
GOOS=darwin  GOARCH=arm64  "$GO" build -ldflags="-s -w" -o "$OUT/agent-darwin-arm64"   .

# macOS amd64 (Intel)
echo "  -> darwin/amd64"
GOOS=darwin  GOARCH=amd64  "$GO" build -ldflags="-s -w" -o "$OUT/agent-darwin-amd64"   .

# Linux arm64 (Raspberry Pi 4/5)
echo "  -> linux/arm64"
GOOS=linux   GOARCH=arm64  "$GO" build -ldflags="-s -w" -o "$OUT/agent-linux-arm64"    .

# Linux amd64
echo "  -> linux/amd64"
GOOS=linux   GOARCH=amd64  "$GO" build -ldflags="-s -w" -o "$OUT/agent-linux-amd64"    .

# Windows amd64
echo "  -> windows/amd64"
GOOS=windows GOARCH=amd64  "$GO" build -ldflags="-s -w" -o "$OUT/agent-windows-amd64.exe" .

echo ""
echo "Build complete:"
ls -lh "$OUT"/

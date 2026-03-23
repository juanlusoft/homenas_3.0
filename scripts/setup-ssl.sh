#!/bin/bash
# Generate self-signed SSL cert for HomePiNAS

set -euo pipefail

CERT_DIR="/opt/homepinas-v3/certs"
DAYS=3650  # 10 years

mkdir -p "$CERT_DIR"

# Get NAS IP for SAN
NAS_IP=$(hostname -I | awk '{print $1}')
HOSTNAME=$(hostname)

echo "Generating self-signed certificate..."
echo "  IP: $NAS_IP"
echo "  Hostname: $HOSTNAME"

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -days "$DAYS" \
  -subj "/CN=$HOSTNAME/O=HomePiNAS" \
  -addext "subjectAltName=DNS:$HOSTNAME,DNS:localhost,IP:$NAS_IP,IP:127.0.0.1"

chmod 600 "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/server.crt"

echo "✅ Certificate generated at $CERT_DIR/"

#!/usr/bin/env bash
#
# A self-signed certificate for localhost, so the local stack can speak TLS.
#
# Why it is needed at all: Enable Banking only accepts an `https://` redirect,
# and a page served over https may not call an API served over http — the
# browser blocks it as mixed content. So the moment the bank sync has a button,
# the frontend, the backend and Supabase all have to be reachable over TLS.
# Supabase already is, on Kong's 8443; this covers the other two.
#
# The certificate is self-signed, so browsers warn once per origin and the two
# origins must each be visited and accepted. That is the whole cost, and it
# buys not having to run a tunnel.
#
# Usage:
#   scripts/make-local-cert.sh
#
# Output lands in certs/, which `.gitignore` already excludes through *.pem —
# a private key is a private key even when it protects nothing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${CERT_DIR:-$REPO_ROOT/certs}"
DAYS="${DAYS:-825}"

command -v openssl >/dev/null 2>&1 || {
  echo "openssl not found" >&2
  exit 1
}

mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/localhost.pem" && -f "$CERT_DIR/localhost-key.pem" ]]; then
  echo "Already there: $CERT_DIR/localhost.pem"
  echo "Delete it to make a new one."
  exit 0
fi

# subjectAltName rather than only CN: browsers have ignored the common name
# for years, and a certificate without the SAN is rejected before the warning
# a user could click through.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/localhost-key.pem" \
  -out "$CERT_DIR/localhost.pem" \
  -days "$DAYS" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  2>/dev/null

chmod 600 "$CERT_DIR/localhost-key.pem"

echo "Wrote $CERT_DIR/localhost.pem (valid $DAYS days)"
echo
echo "Then, in two terminals:"
echo "  cd backend  && BACKEND_HTTPS=1 pnpm dev"
echo "  cd frontend && VITE_HTTPS=1 VITE_PORT=5174 pnpm dev"
echo
echo "Visit https://localhost:3443 once and accept the certificate, otherwise"
echo "the frontend's calls to it fail without a prompt of their own."

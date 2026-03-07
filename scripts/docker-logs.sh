#!/bin/bash

cd "$(dirname "$0")/.."

SERVICE=${1:-""}

if [ -z "$SERVICE" ]; then
    echo "📋 Following all logs (Ctrl+C to exit)..."
    podman-compose logs -f
else
    echo "📋 Following logs for $SERVICE (Ctrl+C to exit)..."
    podman-compose logs -f "$SERVICE"
fi

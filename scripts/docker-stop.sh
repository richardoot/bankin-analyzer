#!/bin/bash

cd "$(dirname "$0")/.."

echo "🛑 Stopping Bankin Analyzer..."

podman-compose down

echo "✅ All services stopped!"
echo ""
echo "💡 To also remove volumes (database data), run:"
echo "   podman-compose down -v"

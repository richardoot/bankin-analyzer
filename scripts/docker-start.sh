#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "🚀 Starting Bankin Analyzer with Podman..."

# Charger les variables d'environnement
if [ -f .env.docker ]; then
    set -a
    source .env.docker
    set +a
fi

# Builder et démarrer
podman-compose --env-file .env.docker up --build -d

echo "⏳ Waiting for database to be ready..."
sleep 15

# Vérifier que la base de données est prête
until podman exec bankin-db pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done

echo "✅ Database is ready!"

# Exécuter les migrations Prisma
echo "🔧 Running database migrations..."
podman exec bankin-backend npx prisma migrate deploy || echo "⚠️  Migrations may have already been applied"

echo ""
echo "============================================"
echo "✅ All services started!"
echo "============================================"
echo ""
echo "📝 Access URLs:"
echo "   Frontend:        http://localhost:5173"
echo "   Backend API:     http://localhost:3000"
echo "   Backend Swagger: http://localhost:3000/api/docs"
echo "   Supabase API:    http://localhost:8000"
echo "   Supabase Studio: http://localhost:3001"
echo "   PostgreSQL:      localhost:5432"
echo ""
echo "📋 Useful commands:"
echo "   podman-compose logs -f           # View all logs"
echo "   podman-compose logs -f backend   # View backend logs"
echo "   podman-compose ps                # List containers"
echo "   ./scripts/docker-stop.sh         # Stop all services"
echo ""

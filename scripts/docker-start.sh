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
# The datasource lives in prisma/prisma.config.ts, so a bare `migrate deploy`
# has nowhere to connect and fails — quietly, because of the `||` below.
podman exec bankin-backend npx prisma migrate deploy --config prisma/prisma.config.ts \
    || echo "⚠️  Migrations failed (see above)"

# Seed de données de démo (opt-in via SEED_ON_START=true dans .env.docker).
# ⚠️  Destructif : efface puis régénère les données de l'utilisateur de démo.
if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "🌱 Seeding demo data..."
    podman exec \
        -e SEED_DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/postgres" \
        -e SEED_CREATE_USER="true" \
        -e SEED_SUPABASE_URL="http://kong:8000" \
        -e SEED_ANON_KEY="${ANON_KEY}" \
        -e SEED_EMAIL="${SEED_EMAIL:-demo@bankin.local}" \
        -e SEED_PASSWORD="${SEED_PASSWORD:-Password123!}" \
        bankin-backend node prisma/seed.mjs || echo "⚠️  Seed failed (see logs above)"
fi

echo ""
echo "============================================"
echo "✅ All services started!"
echo "============================================"
echo ""
echo "📝 Access URLs:"
echo "   Frontend:        http://localhost:5173"
echo "   Backend API:     http://localhost:3001"
echo "   Backend Swagger: http://localhost:3001/api/docs"
echo "   Supabase API:    http://localhost:54321"
echo "   Supabase Studio: http://localhost:54322"
echo "   PostgreSQL:      localhost:5432"
echo ""
echo "📋 Useful commands:"
echo "   podman-compose logs -f           # View all logs"
echo "   podman-compose logs -f backend   # View backend logs"
echo "   podman-compose ps                # List containers"
echo "   ./scripts/docker-stop.sh         # Stop all services"
echo ""

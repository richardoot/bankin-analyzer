#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Jeu de données à charger après le démarrage.
#
#   (rien)   on ne touche pas aux données déjà présentes
#   --demo   régénère le jeu de démonstration
#   --prod   dump la production maintenant et la restaure ici
#
# --prod écrase le schéma `app`, donc tout ce que la synchro bancaire y a écrit
# disparaît. C'est voulu : ces données se refabriquent, un dump frais non.
DATASET="none"
for arg in "$@"; do
  case "$arg" in
    --demo) DATASET="demo" ;;
    --prod) DATASET="prod" ;;
    *) echo "Option inconnue : $arg (attendu --demo ou --prod)" >&2; exit 1 ;;
  esac
done

if [ "$DATASET" = "prod" ] && [ ! -f backend/.env.production.local ]; then
    echo "❌ --prod exige backend/.env.production.local" >&2
    exit 1
fi

echo "🚀 Starting Bankin Analyzer with Podman..."

# Charger les variables d'environnement
if [ -f .env.docker ]; then
    set -a
    source .env.docker
    set +a
fi

# Builder et démarrer.
#
# --force-recreate est indispensable : sans lui, `up --build` reconstruit bien
# l'image mais laisse tourner le conteneur existant, qui continue de servir
# l'ancienne couche. Le symptôme est déroutant — du code à jour sur le disque,
# une image à jour, et une application qui exécute autre chose.
podman-compose --env-file .env.docker up --build -d --force-recreate

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

# Restauration depuis la production, à la demande.
#
# L'ordre compte : la restauration remplace le schéma `app` ET la table des
# migrations de Prisma, donc les migrations se rejouent APRÈS — ce qui fait de
# cette commande une répétition du déploiement autant qu'une copie de données.
if [ "$DATASET" = "prod" ]; then
    echo "📥 Restoring production data..."
    ./scripts/restore-prod-to-local.sh

    echo "🔧 Applying migrations production has not seen..."
    podman exec bankin-backend npx prisma migrate deploy --config prisma/prisma.config.ts \
        || echo "⚠️  Migrations failed (see above)"

    # Le pool du backend tient des connexions vers un schéma qui vient d'être
    # supprimé puis recréé ; sans redémarrage il sert des erreurs jusqu'à ce
    # qu'elles expirent.
    echo "♻️  Restarting backend..."
    podman restart bankin-backend >/dev/null
fi

# Raccorde chaque utilisateur applicatif à son identité GoTrue locale.
#
# Indispensable après --prod, qui ramène les identifiants de production dans
# une base dont le GoTrue ne les connaît pas : la connexion échoue alors en 409
# devant des données pourtant présentes. Sans effet le reste du temps.
echo "🔗 Linking local identities..."
node scripts/link-local-identities.mjs || echo "⚠️  Linking failed (see above)"

# Seed de données de démo : --demo, ou SEED_ON_START=true dans .env.docker.
#
# --prod l'exclut explicitement : SEED_ON_START vaut true dans .env.docker, et
# sans cette garde une restauration de production se faisait écraser par le jeu
# de démonstration dans la foulée.
#
# ⚠️  Destructif : efface puis régénère les données de l'utilisateur de démo.
if [ "$DATASET" = "demo" ] ||
   { [ "$DATASET" = "none" ] && [ "${SEED_ON_START:-false}" = "true" ]; }; then
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
echo "🗃  Jeux de données :"
echo "   ./scripts/docker-start.sh --demo  # données de démonstration"
echo "   ./scripts/docker-start.sh --prod  # dump de la production, à l'instant"
echo ""

#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Jeu de données à charger après le démarrage.
#
#   none   on ne touche pas aux données déjà présentes
#   demo   régénère le jeu de démonstration
#   prod   dump la production maintenant et la restaure ici
#
# Se règle par DATASET dans .env.docker, et se force ponctuellement par
# --demo / --prod, qui l'emportent sur le fichier.
#
# `prod` écrase le schéma `app`, donc tout ce que la synchro bancaire y a écrit
# disparaît. C'est voulu : ces données se refabriquent, un dump frais non.
DATASET_ARG=""
for arg in "$@"; do
  case "$arg" in
    --demo) DATASET_ARG="demo" ;;
    --prod) DATASET_ARG="prod" ;;
    --none) DATASET_ARG="none" ;;
    *) echo "Option inconnue : $arg (attendu --demo, --prod ou --none)" >&2; exit 1 ;;
  esac
done

echo "🚀 Starting Bankin Analyzer with Podman..."

# Charger les variables d'environnement
if [ -f .env.docker ]; then
    set -a
    source .env.docker
    set +a
fi

# Précédence : l'option de la ligne de commande, puis DATASET du fichier, puis
# l'ancien SEED_ON_START — conservé pour que les .env.docker existants gardent
# leur comportement sans être touchés.
if [ -n "$DATASET_ARG" ]; then
    DATASET="$DATASET_ARG"
elif [ -n "${DATASET:-}" ]; then
    :
elif [ "${SEED_ON_START:-false}" = "true" ]; then
    DATASET="demo"
else
    DATASET="none"
fi

case "$DATASET" in
  none|demo|prod) ;;
  *) echo "DATASET=\"$DATASET\" invalide (attendu none, demo ou prod)" >&2; exit 1 ;;
esac

echo "🗃  Jeu de données : $DATASET"

# TLS de bout en bout dans la stack, via STACK_HTTPS=true dans .env.docker.
#
# C'est tout ou rien, délibérément : servir la page en https et laisser ses
# appels en http est précisément l'échec que ça évite — le navigateur les
# bloque en contenu mixte, sans rien dire d'utile. Alors le frontend, le
# backend et Supabase basculent ensemble.
#
# Les URLs sont compilées dans le bundle au build, donc elles doivent être
# connues ici, avant podman-compose.
if [ "${STACK_HTTPS:-false}" = "true" ]; then
    if [ ! -f certs/localhost.pem ]; then
        echo "🔐 Génération du certificat local…"
        ./scripts/make-local-cert.sh >/dev/null
    fi
    BACKEND_HTTPS=1
    VITE_API_URL="${VITE_API_URL_HTTPS:-https://localhost:${BACKEND_HTTPS_PORT:-3443}}"
    VITE_SUPABASE_URL="${VITE_SUPABASE_URL_HTTPS:-https://localhost:8443}"
    # Ce que le backend doit accepter en CORS : l'origine du conteneur nginx.
    FRONTEND_URL="${FRONTEND_URL},https://localhost:${FRONTEND_HTTPS_PORT:-5174}"

    # Les valeurs passent par une copie du fichier, pas par l'environnement.
    #
    # `podman-compose --env-file` résout `${VAR}` depuis le fichier, qui
    # l'emporte sur une variable exportée. Un export suffisait pour ce qui est
    # passé en `environment:` — le backend voyait bien FRONTEND_URL — mais pas
    # pour les `build.args`, qui décident des URLs compilées dans le bundle.
    # Le symptôme était une page en https appelant une API en http.
    COMPOSE_ENV_FILE="$(mktemp -t bankin-compose-env)"
    trap 'rm -f "$COMPOSE_ENV_FILE"' EXIT
    sed -e "s|^VITE_API_URL=.*|VITE_API_URL=$VITE_API_URL|" \
        -e "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$VITE_SUPABASE_URL|" \
        -e "s|^FRONTEND_URL=.*|FRONTEND_URL=$FRONTEND_URL|" \
        .env.docker >"$COMPOSE_ENV_FILE"
    echo "BACKEND_HTTPS=1" >>"$COMPOSE_ENV_FILE"

    echo "🔒 TLS : https://localhost:${FRONTEND_HTTPS_PORT:-5174} → API ${VITE_API_URL}"
fi

if [ "$DATASET" = "prod" ] && [ ! -f backend/.env.production.local ]; then
    echo "❌ DATASET=prod exige backend/.env.production.local" >&2
    exit 1
fi

# Builder et démarrer.
#
# --force-recreate est indispensable : sans lui, `up --build` reconstruit bien
# l'image mais laisse tourner le conteneur existant, qui continue de servir
# l'ancienne couche. Le symptôme est déroutant — du code à jour sur le disque,
# une image à jour, et une application qui exécute autre chose.
podman-compose --env-file "${COMPOSE_ENV_FILE:-.env.docker}" up --build -d --force-recreate

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

# ⚠️  Destructif : efface puis régénère les données de l'utilisateur de démo.
if [ "$DATASET" = "demo" ]; then
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

# Le bundle est construit, pas configuré au démarrage : une couche de build en
# cache peut servir des URLs qu'on croit avoir remplacées, et l'application
# échoue alors en CORS sur une API qu'elle n'aurait pas dû appeler. On vérifie
# donc ce qui est réellement servi plutôt que ce qu'on a demandé.
if [ "${STACK_HTTPS:-false}" = "true" ]; then
    served="$(podman exec bankin-frontend sh -c \
        'f=$(grep -oE "assets/index-[A-Za-z0-9_-]+\.js" /usr/share/nginx/html/index.html); \
         grep -oE "https?://localhost:[0-9]+/?" "/usr/share/nginx/html/$f" 2>/dev/null | sort -u' \
        2>/dev/null || true)"
    if ! echo "$served" | grep -q "^${VITE_API_URL}"; then
        echo ""
        echo "⚠️  Le bundle servi n'appelle pas ${VITE_API_URL}."
        echo "    URLs trouvées : $(echo "$served" | tr '\n' ' ')"
        echo "    L'image a été réutilisée depuis le cache. Forcez la reconstruction :"
        echo "      podman rmi -f localhost/bankin-analyzer_frontend:latest"
        echo "      ./scripts/docker-start.sh"
        echo ""
    fi
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
echo "🗃  Jeu de données : DATASET=none|demo|prod dans .env.docker"
echo "🔒 TLS            : STACK_HTTPS=true dans .env.docker"
echo "   ./scripts/docker-start.sh --demo  # forcer les données de démonstration"
echo "   ./scripts/docker-start.sh --prod  # forcer un dump de la production"
echo ""

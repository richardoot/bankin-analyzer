#!/usr/bin/env bash
#
# Dump the production database to a local, compressed file.
#
# The Supabase free plan takes no backups at all — the Backups page is a Pro
# feature — so the only copy of the ledger is the one this script makes.
#
# Two details this script exists to get right:
#
#   * It connects on port 5432, the *session* pooler, not the 6543 transaction
#     pooler the application uses. pg_dump needs a session it can hold open and
#     set parameters on; the transaction pooler hands out a different backend
#     per statement and the dump fails. Same host, same credentials.
#
#   * It runs pg_dump inside a container pinned to the server's major version.
#     pg_dump refuses to dump a server newer than itself, and macOS ships no
#     client at all, so a container is both the shortest path and the one that
#     will not silently drift when Supabase upgrades.
#
# Usage:
#   scripts/backup-prod-db.sh            # dump to backups/
#   BACKUP_DIR=/somewhere scripts/backup-prod-db.sh
#
# Restore into a fresh database:
#   gunzip -c backups/<file>.sql.gz | psql "$TARGET_URL"
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env.production.local}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
# Server major version. pg_dump from an older client refuses outright.
PG_IMAGE="${PG_IMAGE:-docker.io/library/postgres:17}"
# How many dumps to keep. At ~1 MB compressed, a year of dailies is trivial.
KEEP="${KEEP:-30}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No env file at $ENV_FILE" >&2
  exit 1
fi

runtime=""
for candidate in podman docker; do
  if command -v "$candidate" >/dev/null 2>&1; then
    runtime="$candidate"
    break
  fi
done
if [[ -z "$runtime" ]]; then
  echo "Needs podman or docker to run pg_dump $PG_IMAGE" >&2
  exit 1
fi

# Read the URL without printing it, and move it to the session pooler.
DUMP_URL="$(
  ENV_FILE="$ENV_FILE" node -e '
    const fs = require("fs")
    const line = fs
      .readFileSync(process.env.ENV_FILE, "utf8")
      .split("\n")
      .find(l => l.startsWith("DATABASE_URL="))
    if (!line) throw new Error("DATABASE_URL missing from " + process.env.ENV_FILE)
    const url = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^["\x27]|["\x27]$/g, ""))
    url.port = "5432"
    // pgbouncer=true is a Prisma hint and not a libpq parameter: psql and
    // pg_dump reject the connection string outright if it survives.
    url.search = ""
    process.stdout.write(url.toString())
  '
)"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/bankin-$stamp.sql.gz"

echo "Dumping to $target"

# --schema: app holds the ledger, auth holds the accounts its rows point at
# through User.supabaseId. Restoring one without the other leaves the data
# orphaned, so all three travel together — public carries _prisma_migrations,
# without which a restored database looks unmigrated to Prisma and the next
# deploy tries to replay every migration over tables that already exist.
#
# The URL goes in as an environment variable rather than an argument: process
# arguments are world-readable in the container.
"$runtime" run --rm --network host \
  --env "PGURL=$DUMP_URL" \
  "$PG_IMAGE" \
  sh -c 'pg_dump "$PGURL" --schema=app --schema=auth --schema=public --no-owner --no-privileges --clean --if-exists' \
  | gzip -9 >"$target"

# A dump that fails halfway still leaves a plausible-looking gzip, so check the
# marker pg_dump only writes once the whole dump succeeded.
if ! gunzip -c "$target" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "Dump did not complete — keeping $target for inspection" >&2
  exit 1
fi

rows="$(gunzip -c "$target" | grep -c '^COPY ' || true)"
echo "OK — $(du -h "$target" | cut -f1), $rows tables with data"

# Prune, newest kept.
ls -1t "$BACKUP_DIR"/bankin-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "Pruning $(basename "$old")"
  rm -f "$old"
done

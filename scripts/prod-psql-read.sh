#!/usr/bin/env bash
#
# Run read-only SQL against the production database.
#
#   scripts/prod-psql-read.sh "SELECT count(*) FROM app.users;" ["SELECT …"]
#
# Guarantees, in order of who enforces them:
#
#   * PostgreSQL enforces the read-only: the session opens with
#     `default_transaction_read_only=on` (via PGOPTIONS), so any INSERT,
#     UPDATE, DELETE or DDL fails with "cannot execute ... in a read-only
#     transaction" instead of touching anything. Honest-mistake protection,
#     not a security boundary — the URL it connects with could always be
#     used directly by someone determined.
#
#   * The URL is read from backend/.env.production.local and never printed;
#     it travels into the container as an environment variable, not an
#     argument, exactly like scripts/backup-prod-db.sh.
#
#   * Same session pooler (port 5432) and pinned postgres:17 image as the
#     backup script, for the same measured reasons documented there.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env.production.local}"
PG_IMAGE="${PG_IMAGE:-docker.io/library/postgres:17}"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 \"SELECT …;\" [\"SELECT …;\" …]" >&2
  exit 1
fi
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
  echo "Needs podman or docker to run psql $PG_IMAGE" >&2
  exit 1
fi

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
    url.search = ""
    process.stdout.write(url.toString())
  '
)"

# Each argument becomes one -c statement, in order.
args=(--no-psqlrc -v ON_ERROR_STOP=1)
for sql in "$@"; do
  args+=(-c "$sql")
done

# `$PGURL` must expand inside the container, not here — hence the sh -c
# indirection, the same one backup-prod-db.sh uses for pg_dump.
"$runtime" run --rm --network host \
  --env "PGURL=$DUMP_URL" \
  --env "PGOPTIONS=-c default_transaction_read_only=on" \
  "$PG_IMAGE" \
  sh -c 'exec psql "$PGURL" "$@"' psql "${args[@]}"

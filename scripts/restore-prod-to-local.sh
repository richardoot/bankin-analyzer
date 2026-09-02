#!/usr/bin/env bash
#
# Replace the local ledger with a copy of production's, to test against data
# that actually exists.
#
# Seeded data does not exercise the interesting cases. The bank sync in
# particular can only be judged against the real ledger: how many fetched
# transactions already exist, how many are genuinely new, how often two of them
# are indistinguishable. On the local seed those numbers mean nothing.
#
# Three deliberate choices:
#
#   * `auth` stays behind. It belongs to the local GoTrue and carries its own
#     users and JWT secret; overwriting it would break local login to fix
#     nothing, since `User.supabaseId` is a plain string with no foreign key
#     into it. `app` and `public` do travel — the latter for the one table it
#     holds, Prisma's `_prisma_migrations`.
#
#   * The dump is taken fresh rather than reusing backups/. A dump made for
#     safekeeping is a different artefact from one made to be restored, and
#     silently restoring a week-old file is how someone concludes a bug is
#     fixed when it is only absent from that copy.
#
#   * It refuses to run against anything but localhost. The dump restores with
#     DROP ... IF EXISTS ahead of every object; pointed at production it would
#     destroy the ledger it just copied. The guard is the whole reason this is
#     a script and not a pipeline someone retypes.
#
# Usage:
#   scripts/restore-prod-to-local.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_ENV="${PROD_ENV:-$REPO_ROOT/backend/.env.production.local}"
LOCAL_ENV="${LOCAL_ENV:-$REPO_ROOT/backend/.env}"
PG_IMAGE="${PG_IMAGE:-docker.io/library/postgres:17}"

for f in "$PROD_ENV" "$LOCAL_ENV"; do
  [[ -f "$f" ]] || { echo "No env file at $f" >&2; exit 1; }
done

runtime=""
for candidate in podman docker; do
  if command -v "$candidate" >/dev/null 2>&1; then runtime="$candidate"; break; fi
done
[[ -n "$runtime" ]] || { echo "Needs podman or docker to run $PG_IMAGE" >&2; exit 1; }

# Read a URL out of an env file without printing it. `which` selects the
# variable; the session pooler (5432) is forced for the source because pg_dump
# needs a session it can hold open, which the 6543 transaction pooler will not
# give it.
read_url() {
  ENV_FILE="$1" VAR="$2" FORCE_PORT="${3:-}" node -e '
    const fs = require("fs")
    const prefix = process.env.VAR + "="
    const line = fs.readFileSync(process.env.ENV_FILE, "utf8")
      .split("\n").find(l => l.startsWith(prefix))
    if (!line) throw new Error(prefix + " missing from " + process.env.ENV_FILE)
    const url = new URL(line.slice(prefix.length).trim().replace(/^["\x27]|["\x27]$/g, ""))
    if (process.env.FORCE_PORT) url.port = process.env.FORCE_PORT
    // pgbouncer=true is a Prisma hint, not a libpq parameter: psql and pg_dump
    // reject the connection string outright if it survives.
    url.search = ""
    process.stdout.write(url.toString())
  '
}

host_of() {
  URL="$1" node -e 'process.stdout.write(new URL(process.env.URL).hostname)'
}

SOURCE_URL="$(read_url "$PROD_ENV" DATABASE_URL 5432)"
TARGET_URL="$(read_url "$LOCAL_ENV" DIRECT_URL)"

TARGET_HOST="$(host_of "$TARGET_URL")"
case "$TARGET_HOST" in
  localhost|127.0.0.1|::1|host.containers.internal|host.docker.internal) ;;
  *)
    echo "Refusing to restore into '$TARGET_HOST'." >&2
    echo "This dump drops every object before recreating it; the target must be local." >&2
    exit 1
    ;;
esac

SOURCE_HOST="$(host_of "$SOURCE_URL")"
if [[ "$SOURCE_HOST" == "$TARGET_HOST" ]]; then
  echo "Source and target are the same host ($SOURCE_HOST). Refusing." >&2
  exit 1
fi

echo "Source : $SOURCE_HOST (schema app only)"
echo "Target : $TARGET_HOST — its app schema will be replaced"
echo

tmp="$(mktemp -t bankin-prod-app-XXXXXX.sql)"
trap 'rm -f "$tmp"' EXIT

echo "Dumping…"
# `public` travels too, for the one table it holds: Prisma's `_prisma_migrations`.
# Restoring production's copy is what makes the next `migrate deploy` apply
# exactly the migrations production has not seen — which turns this into a
# rehearsal of the deployment against real data, not just a data copy.
"$runtime" run --rm --network host --env "PGURL=$SOURCE_URL" "$PG_IMAGE" \
  sh -c 'pg_dump "$PGURL" --schema=app --schema=public --no-owner --no-privileges' \
  >"$tmp"

# A dump that dies halfway still leaves a plausible file, and restoring half a
# ledger is worse than restoring none.
if ! tail -5 "$tmp" | grep -q "PostgreSQL database dump complete"; then
  echo "Dump did not complete — nothing was restored" >&2
  exit 1
fi
echo "Dumped $(wc -l <"$tmp" | tr -d ' ') lines"

# Production runs PostgreSQL 17, the local container 15, and pg_dump writes a
# preamble for the server it dumped: `transaction_timeout` arrived in 17 and
# PG 15 rejects the line outright, taking the whole restore with it under
# ON_ERROR_STOP. Dropping the SET is safe — it configures the dumping session,
# not the data.
#
# `CREATE SCHEMA public` goes for a duller reason: the schema already exists in
# any Postgres, and unlike `app` it is not dropped beforehand — dropping it
# would take extensions and grants the local stack relies on.
sed -i.bak \
  -e '/^SET transaction_timeout = /d' \
  -e '/^CREATE SCHEMA public;$/d' \
  "$tmp" && rm -f "$tmp.bak"

echo "Clearing the local schema…"
# The schema is dropped wholesale rather than relying on the dump's own
# `--clean`. The local database is ahead of production — it carries the tables
# of migrations not yet deployed — and those tables hold foreign keys into
# `app.users`, so the dump's DROPs fail on dependencies it never knew existed.
# Starting from nothing sidesteps the ordering entirely. The schema is not
# recreated here — the dump carries its own CREATE SCHEMA, and issuing a second
# one makes the restore fail on the object it was about to build.
"$runtime" run --rm --network host --env "PGURL=$TARGET_URL" "$PG_IMAGE" \
  sh -c 'psql "$PGURL" --quiet --set ON_ERROR_STOP=1 -c "
    DROP SCHEMA IF EXISTS app CASCADE;
    DROP TABLE IF EXISTS public._prisma_migrations;
  "'

echo "Restoring…"
# ON_ERROR_STOP so a failure surfaces instead of leaving a half-restored
# schema that looks fine until a query hits the missing half.
"$runtime" run --rm --network host --env "PGURL=$TARGET_URL" -i "$PG_IMAGE" \
  sh -c 'psql "$PGURL" --quiet --set ON_ERROR_STOP=1 -f -' <"$tmp"

echo
echo "Local database now matches production, migrations included."
echo "Run the pending ones with:  cd backend && pnpm prisma:deploy"
echo "Local auth is untouched, so the demo login still works — but its user"
echo "will not match any production row, which are keyed by their own"
echo "supabase_id. Query by email instead."

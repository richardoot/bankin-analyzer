-- Close public._prisma_migrations to the Supabase API roles — as a migration,
-- so it replays wherever the schema does.
--
-- This used to live only in scripts/harden-prisma-migrations.sql, run by hand
-- in the Supabase SQL editor. Applied in production, verified — and one
-- `prisma migrate reset` or one fresh environment away from silently undone,
-- because Supabase's ALTER DEFAULT PRIVILEGES re-grants every table created
-- in `public` to `anon` and `authenticated`, and `public` is the one schema
-- PostgREST exposes. The anon key ships in the frontend bundle; anyone
-- holding it could read — and DELETE from — the migrations ledger, after
-- which the next `prisma migrate deploy` believes nothing was ever applied.
--
-- Everything is guarded, twice over, because this file runs in three very
-- different places:
--
--   * `prisma migrate deploy` (prod, local Docker): the table exists — Prisma
--     creates it before applying anything — and the Supabase roles exist.
--   * replayed on top of the manual script (prod): every statement is a
--     no-op, which is the point.
--   * the e2e harness (test/e2e-database.ts): it replays each migration.sql
--     directly into a scratch database where neither the table nor the
--     Supabase roles exist. There is nothing to harden there, and this file
--     must say "fine" rather than fail the suite.

DO $$
BEGIN
  -- No ledger table means no Prisma-managed deployment — a scratch database.
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RETURN;
  END IF;

  -- RLS governs SELECT/INSERT/UPDATE/DELETE but never TRUNCATE, so the
  -- grants have to go regardless. Owner (`postgres`, BYPASSRLS) keeps
  -- everything.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
  END IF;

  -- With no policy attached, enabling RLS denies every row to every role
  -- that does not bypass it. Prisma connects as the owner and is unaffected.
  ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
END
$$;

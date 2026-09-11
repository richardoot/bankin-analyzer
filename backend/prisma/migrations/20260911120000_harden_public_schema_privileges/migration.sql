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
-- Idempotent throughout, because production has already run the manual
-- script and will replay this on top of it. Guarded on role existence,
-- because a bare CI database has no `anon` or `authenticated` to revoke
-- from, and an unguarded REVOKE would fail the whole deploy there.

-- RLS governs SELECT/INSERT/UPDATE/DELETE but never TRUNCATE, so the grant
-- has to go regardless. Owner (`postgres`, BYPASSRLS) is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
  END IF;
END
$$;

-- With no policy attached, enabling RLS denies every row to every role that
-- does not bypass it. Prisma connects as the owner and is unaffected.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

-- Close public._prisma_migrations to the API roles.
--
-- Run in the Supabase SQL editor (it connects as `postgres`, which owns the
-- table). Safe to run twice.
--
-- What the advisor found: Prisma creates its bookkeeping table in `public`,
-- the one schema Supabase exposes through PostgREST, and Supabase's default
-- privileges on that schema grant every table to `anon` and `authenticated`.
-- The anon key ships in the frontend bundle, so anyone holding it can read the
-- table — and, more to the point, DELETE from it. Losing those rows makes the
-- next `prisma migrate deploy` believe nothing has ever been applied.
--
-- No application data is at risk: the ledger lives in the `app` schema, which
-- neither role has USAGE on. This table is the only one in `public`.

-- The part that actually protects the table. RLS governs SELECT/INSERT/UPDATE/
-- DELETE but never TRUNCATE, so the grant has to go regardless.
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;

-- And the part the advisor checks for. With no policy attached this denies
-- every row to every role that does not bypass RLS. Prisma is unaffected twice
-- over: it connects as `postgres`, which owns the table and carries BYPASSRLS.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

-- Stop the grant coming back on its own. Supabase's ALTER DEFAULT PRIVILEGES
-- re-grants every table created in `public`, so a future `prisma migrate
-- reset` would reopen exactly what the two statements above just closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Verify: expect rls_enabled = true and no rows for anon/authenticated.
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = '_prisma_migrations'
  AND grantee IN ('anon', 'authenticated');

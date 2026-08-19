/**
 * Runs before every e2e spec, via `setupFiles` in vitest.config.e2e.ts.
 *
 * E2E specs run against a throwaway PostgreSQL started per spec file by
 * `@prisma/dev` (see e2e-database.ts). Nothing here should reach the developer
 * database or a hosted one, so
 * DATABASE_URL is replaced by a deliberately dead address *before* the .env
 * file is read: dotenv does not override variables that are already set.
 *
 * The point is failure mode. A spec that bypasses the harness and builds its
 * own PrismaService would otherwise connect to whatever `backend/.env` names —
 * a development database, or a hosted one. Now it fails to connect instead,
 * loudly and immediately.
 */
import { config } from 'dotenv'
import path from 'node:path'

process.env.DATABASE_URL =
  'postgresql://e2e:e2e@127.0.0.1:1/use-createE2eDatabase-instead'
process.env.DIRECT_URL = process.env.DATABASE_URL

// Other variables (Supabase URL, keys) still come from .env; DATABASE_URL is
// already set above and dotenv leaves existing values alone.
config({ path: path.join(__dirname, '..', '.env') })

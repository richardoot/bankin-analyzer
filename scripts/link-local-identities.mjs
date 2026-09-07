// @ts-check
/**
 * Point each application user at its LOCAL GoTrue identity.
 *
 * ## Why this is needed
 *
 * `app.users.supabase_id` is a plain string, not a foreign key into `auth`. A
 * production restore therefore brings production's identifiers into a database
 * whose GoTrue knows nothing about them, and the two halves of the same person
 * stop referring to each other.
 *
 * What that looks like from the app: you log in, `SupabaseGuard` looks for your
 * local identity, finds no matching row, tries to create one — and the email is
 * unique, so it collides with the restored row. A 409, in front of data that is
 * sitting right there.
 *
 * Matching on the email is sound here precisely because it is unique on both
 * sides, and because this only ever runs against a local database.
 *
 * ## Safety
 *
 * Refuses any host that is not local. It rewrites identifiers, which on a real
 * database would hand one person's ledger to another.
 *
 * Usage:
 *   node scripts/link-local-identities.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Read one variable out of an env file without loading the whole thing. */
function readEnv(file, name) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find(l => l.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '')
}

const envFile = path.join(repoRoot, 'backend', '.env')
const connectionString =
  readEnv(envFile, 'DIRECT_URL') ?? readEnv(envFile, 'DATABASE_URL')

if (!connectionString) {
  console.error(`No DATABASE_URL or DIRECT_URL in ${envFile}`)
  process.exit(1)
}

const host = new URL(connectionString).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to rewrite identities on "${host}" — local only.`)
  process.exit(1)
}

const pool = new Pool({ connectionString })

const { rows } = await pool.query(`
  UPDATE app.users a
     SET supabase_id = u.id::text
    FROM auth.users u
   WHERE u.email = a.email
     AND a.supabase_id IS DISTINCT FROM u.id::text
  RETURNING a.email, a.supabase_id
`)

for (const row of rows) {
  console.log(`   relinked ${row.email} → ${row.supabase_id}`)
}

// Said out loud rather than left to inference: an application user with no
// local identity cannot log in, and the reason is not obvious from a login
// screen that simply refuses.
const { rows: orphans } = await pool.query(`
  SELECT a.email FROM app.users a
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = a.email)
   ORDER BY a.email
`)

if (rows.length === 0 && orphans.length === 0) {
  console.log('   every user already points at its local identity')
}

for (const row of orphans) {
  console.log(
    `   ⚠  ${row.email} has no local login — sign in once with that address to create one`
  )
}

await pool.end()

/**
 * A throwaway PostgreSQL for each e2e spec file, started in this process by
 * `@prisma/dev` — the same local server `prisma dev` runs, driven through its
 * documented programmatic entry point. Nothing external: no Docker, no service
 * to start beforehand.
 *
 * Why not SQLite: the schema leans on array columns, `@@schema("app")`, native
 * enums and Decimal, and the raw queries use TO_CHAR and ::numeric casts.
 * SQLite would need a second Prisma schema, and the specs would then validate
 * something other than what production runs.
 *
 * The client is built on `@prisma/adapter-pg`, the very adapter PrismaService
 * uses in production, so the specs travel the same connection path as the app.
 *
 * The schema is provisioned by replaying prisma/migrations in order, which
 * exercises the migration chain on every run.
 */
import { readFileSync, readdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { startPrismaDevServer } from '@prisma/dev'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../src/generated/prisma'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')

/** Migration directories in application order (their names are timestamps). */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map(name => path.join(MIGRATIONS_DIR, name, 'migration.sql'))
}

/**
 * Ask the OS for a free port. The server's default ports are fixed, so spec
 * files running side by side would fight over them.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

export interface E2eDatabase {
  prisma: PrismaClient
  close: () => Promise<void>
}

export async function createE2eDatabase(): Promise<E2eDatabase> {
  const [serverPort, databasePort, shadowDatabasePort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
  ])

  const server = await startPrismaDevServer({
    name: `e2e-${process.pid}-${databasePort}`,
    // Nothing is kept between runs: every file starts from an empty database.
    persistenceMode: 'stateless',
    port: serverPort,
    databasePort,
    shadowDatabasePort,
  })

  const pool = new Pool({ connectionString: server.database.connectionString })

  for (const file of migrationFiles()) {
    const sql = readFileSync(file, 'utf8')
    try {
      await pool.query(sql)
    } catch (error) {
      // Name the migration that broke: without it the failure surfaces as an
      // opaque SQL error with no clue where it came from.
      throw new Error(
        `Migration ${path.basename(path.dirname(file))} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  return {
    prisma,
    close: async () => {
      await prisma.$disconnect()
      await pool.end()
      await server.close()
    },
  }
}

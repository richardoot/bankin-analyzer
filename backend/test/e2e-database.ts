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

/** How long a server may take to come up before we assume its port was stolen. */
const START_TIMEOUT_MS = 20_000

/** Fresh ports are drawn on each attempt, so a repeat collision is unlikely. */
const MAX_START_ATTEMPTS = 5

/** Hold a probe socket open on an OS-assigned port. */
function openProbe(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => resolve(probe))
  })
}

function closeProbe(probe: net.Server): Promise<void> {
  return new Promise(resolve => probe.close(() => resolve()))
}

/**
 * Ask the OS for `count` free ports. The server's default ports are fixed, so
 * spec files running side by side would fight over them.
 *
 * Every probe is held open until the last one has been assigned, so the batch
 * cannot collide with itself. That already held before — the previous version
 * bound its three probes concurrently, and 3000 rounds produced no duplicate —
 * but it held by accident of scheduling rather than by construction.
 *
 * The collision this cannot prevent is the one between spec files: two
 * processes probing at the same moment are perfectly free to be handed the same
 * port, since each has let go of it by the time the other looks. That is what
 * the retry below is for.
 */
export async function reservePorts(count: number): Promise<number[]> {
  const probes: net.Server[] = []
  try {
    for (let i = 0; i < count; i++) {
      probes.push(await openProbe())
    }
    return probes.map(probe => (probe.address() as net.AddressInfo).port)
  } finally {
    await Promise.all(probes.map(closeProbe))
  }
}

/** Marks a start that never completed, so the retry can tell it apart. */
class StartTimeoutError extends Error {}

/**
 * A reserved port is only a port nobody held a moment ago — the probe has to let
 * go before the server can bind, and another spec file can slip into that gap.
 * The three ports then fail in three different ways, measured against
 * @prisma/dev rather than assumed: the control port is silently tolerated, the
 * shadow port raises PortNotAvailableError, and the database port waits forever.
 * That last one is why the retry needs a deadline and not just a catch — the
 * symptom was a spec file timing out with nothing having failed.
 */
function isPortConflict(error: unknown): boolean {
  if (error instanceof StartTimeoutError) return true
  if (!(error instanceof Error)) return false
  return (
    error.name === 'PortNotAvailableError' ||
    /not available/i.test(error.message)
  )
}

type DevServer = Awaited<ReturnType<typeof startPrismaDevServer>>

export interface E2eDatabaseOptions {
  /** Test seam: how the three ports are drawn. Defaults to asking the OS. */
  reserve?: (count: number) => Promise<number[]>
  /** Test seam: shortens the deadline so the retry can be exercised quickly. */
  startTimeoutMs?: number
}

async function startServerOnFreePorts(
  options: E2eDatabaseOptions
): Promise<DevServer> {
  const reserve = options.reserve ?? reservePorts
  const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const [serverPort, databasePort, shadowDatabasePort] = await reserve(3)

    const starting = startPrismaDevServer({
      name: `e2e-${process.pid}-${databasePort}`,
      // Nothing is kept between runs: every file starts from an empty database.
      persistenceMode: 'stateless',
      port: serverPort,
      databasePort,
      shadowDatabasePort,
    })

    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        starting,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new StartTimeoutError(
                  `database server did not start within ${startTimeoutMs}ms on port ${databasePort}`
                )
              ),
            startTimeoutMs
          )
        }),
      ])
    } catch (error) {
      lastError = error
      if (!isPortConflict(error)) throw error
      // A start we gave up on may still succeed later; shut it down rather than
      // leaving a stray postgres holding a port for the rest of the run.
      void starting.then(
        server => server.close(),
        () => undefined
      )
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(
    `Could not start a test database after ${MAX_START_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

export interface E2eDatabase {
  prisma: PrismaClient
  close: () => Promise<void>
}

export async function createE2eDatabase(
  options: E2eDatabaseOptions = {}
): Promise<E2eDatabase> {
  const server = await startServerOnFreePorts(options)

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

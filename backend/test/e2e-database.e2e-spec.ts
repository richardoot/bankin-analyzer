/**
 * Covers the harness itself. The port race it guards against showed up as an
 * occasional spec file timing out with no failing assertion, so the only way to
 * hold the fix in place is to stage the collision on purpose.
 */
import { describe, it, expect, afterEach } from 'vitest'
import net from 'node:net'
import {
  createE2eDatabase,
  reservePorts,
  type E2eDatabase,
} from './e2e-database'

/** Take a port and keep it, the way a neighbouring spec file would. */
function occupy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function release(server: net.Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()))
}

describe('e2e database harness', () => {
  let database: E2eDatabase | undefined
  let held: net.Server | undefined

  afterEach(async () => {
    await database?.close()
    database = undefined
    if (held) await release(held)
    held = undefined
  })

  it('never hands out the same port twice in one batch', async () => {
    // Not a reproduction: the previous version never collided with itself
    // either. This pins the property down so a future rewrite that releases
    // each probe before drawing the next one gets caught.
    for (let round = 0; round < 20; round++) {
      const ports = await reservePorts(3)
      expect(new Set(ports).size).toBe(3)
    }
  })

  it('recovers when the database port is taken between reserving and binding', async () => {
    const [busy] = await reservePorts(1)
    if (busy === undefined) throw new Error('no port reserved')
    held = await occupy(busy)

    // First attempt is handed the port we are sitting on. @prisma/dev does not
    // report that as an error: it waits forever, which is what the deadline is
    // there to cut short.
    let attempts = 0
    const reserve = async (count: number): Promise<number[]> => {
      attempts++
      const ports = await reservePorts(count)
      if (attempts > 1) return ports
      const [serverPort, , shadowPort] = ports
      if (serverPort === undefined || shadowPort === undefined) {
        throw new Error('not enough ports reserved')
      }
      return [serverPort, busy, shadowPort]
    }

    database = await createE2eDatabase({ reserve, startTimeoutMs: 4000 })

    expect(attempts).toBe(2)
    // The retry produced a working database, not just a resolved promise.
    await expect(database.prisma.user.count()).resolves.toBe(0)
  }, 90000)

  it('recovers when the shadow port is taken, which fails loudly instead', async () => {
    const [busy] = await reservePorts(1)
    if (busy === undefined) throw new Error('no port reserved')
    held = await occupy(busy)

    let attempts = 0
    const reserve = async (count: number): Promise<number[]> => {
      attempts++
      const ports = await reservePorts(count)
      if (attempts > 1) return ports
      const [serverPort, databasePort] = ports
      if (serverPort === undefined || databasePort === undefined) {
        throw new Error('not enough ports reserved')
      }
      return [serverPort, databasePort, busy]
    }

    database = await createE2eDatabase({ reserve })

    expect(attempts).toBe(2)
    await expect(database.prisma.user.count()).resolves.toBe(0)
  }, 90000)

  it('gives up with a useful message rather than hanging forever', async () => {
    const [busy] = await reservePorts(1)
    if (busy === undefined) throw new Error('no port reserved')
    held = await occupy(busy)

    // Every attempt lands on the occupied port, so the retries run out.
    const reserve = async (count: number): Promise<number[]> => {
      const ports = await reservePorts(count)
      const [serverPort, databasePort] = ports
      if (serverPort === undefined || databasePort === undefined) {
        throw new Error('not enough ports reserved')
      }
      return [serverPort, databasePort, busy]
    }

    await expect(createE2eDatabase({ reserve })).rejects.toThrow(
      /Could not start a test database after 5 attempts/
    )
  }, 120000)
})

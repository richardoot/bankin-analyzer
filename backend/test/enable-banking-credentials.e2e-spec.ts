/**
 * The credential routes over real HTTP — multipart, interceptor, encryption.
 *
 * The unit specs cover each brick; what only this file exercises is the
 * assembly a browser actually talks to: FileInterceptor parsing a multipart
 * body, the size ceiling refusing an oversized upload, the ValidationPipe on
 * the form field beside the file, and the row landing encrypted in PostgreSQL
 * rather than as the PEM that was sent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { generateKeyPairSync } from 'node:crypto'
import type { PrismaService } from '../src/prisma/prisma.service'
import { createE2eApp, e2eIdentity } from './e2e-app'
import type { E2eContext } from './e2e-app'

const owner = e2eIdentity('owner')
const stranger = e2eIdentity('stranger')

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

describe('Enable Banking credentials API (e2e)', () => {
  let ctx: E2eContext
  let prisma: PrismaService
  let ownerId: string

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from(
      'e2e-key-32-bytes-exactly-padded!'
    ).toString('base64')
    ctx = await createE2eApp([owner, stranger])
    prisma = ctx.prisma
  }, 60000)

  afterAll(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const me = await request(ctx.server).get('/users/me').set(ctx.auth(owner))
    ownerId = (me.body as { id: string }).id
    await request(ctx.server).get('/users/me').set(ctx.auth(stranger))
  })

  async function saveOwnerCredential(): Promise<request.Response> {
    return request(ctx.server)
      .put('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .field('applicationId', 'app-e2e')
      .attach('file', Buffer.from(privateKey), 'key.pem')
  }

  it('starts with nothing configured, and status says so', async () => {
    const credentials = await request(ctx.server)
      .get('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .expect(200)
    expect(credentials.body).toEqual({ applicationId: null })

    const status = await request(ctx.server)
      .get('/bank-sync/status')
      .set(ctx.auth(owner))
      .expect(200)
    expect(status.body).toEqual({ configured: false })
  })

  it('accepts a real .pem as multipart and stores it encrypted', async () => {
    const response = await saveOwnerCredential()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ applicationId: 'app-e2e' })

    const read = await request(ctx.server)
      .get('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .expect(200)
    expect(read.body).toEqual({ applicationId: 'app-e2e' })
    // The key itself never travels back, under any field name.
    expect(JSON.stringify(read.body)).not.toContain('PRIVATE KEY')

    const status = await request(ctx.server)
      .get('/bank-sync/status')
      .set(ctx.auth(owner))
      .expect(200)
    expect(status.body).toEqual({ configured: true })

    // What PostgreSQL holds is ciphertext, not the PEM that was uploaded.
    const row = await prisma.enableBankingCredential.findUnique({
      where: { userId: ownerId },
    })
    expect(row?.encryptedPrivateKey).toBeTruthy()
    expect(row?.encryptedPrivateKey).not.toContain('PRIVATE KEY')
  })

  it('keeps one user’s credential invisible to another', async () => {
    await saveOwnerCredential()

    const asStranger = await request(ctx.server)
      .get('/bank-sync/credentials')
      .set(ctx.auth(stranger))
      .expect(200)
    expect(asStranger.body).toEqual({ applicationId: null })

    const strangerStatus = await request(ctx.server)
      .get('/bank-sync/status')
      .set(ctx.auth(stranger))
      .expect(200)
    expect(strangerStatus.body).toEqual({ configured: false })
  })

  it('refuses a file that is not actually a signing key, storing nothing', async () => {
    const response = await request(ctx.server)
      .put('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .field('applicationId', 'app-e2e')
      .attach('file', Buffer.from('this is not a pem'), 'key.pem')

    expect(response.status).toBe(400)
    expect((response.body as { message: string }).message).toMatch(
      /private key/
    )
    expect(await prisma.enableBankingCredential.count()).toBe(0)
  })

  it('refuses a multipart body with no file attached', async () => {
    await request(ctx.server)
      .put('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .field('applicationId', 'app-e2e')
      .expect(400)
  })

  it('refuses an upload past the size ceiling instead of buffering it', async () => {
    const oversized = Buffer.alloc(64 * 1024, 'a')

    const response = await request(ctx.server)
      .put('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .field('applicationId', 'app-e2e')
      .attach('file', oversized, 'key.pem')

    expect(response.status).toBe(413)
    expect(await prisma.enableBankingCredential.count()).toBe(0)
  })

  it('replaces an existing credential rather than duplicating it', async () => {
    await saveOwnerCredential()

    const replaced = await request(ctx.server)
      .put('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .field('applicationId', 'app-e2e-2')
      .attach('file', Buffer.from(privateKey), 'key.pem')
    expect(replaced.status).toBe(200)

    expect(await prisma.enableBankingCredential.count()).toBe(1)
    const read = await request(ctx.server)
      .get('/bank-sync/credentials')
      .set(ctx.auth(owner))
    expect(read.body).toEqual({ applicationId: 'app-e2e-2' })
  })

  it('deletes a credential, and the sync capability with it', async () => {
    await saveOwnerCredential()

    await request(ctx.server)
      .delete('/bank-sync/credentials')
      .set(ctx.auth(owner))
      .expect(200)

    const status = await request(ctx.server)
      .get('/bank-sync/status')
      .set(ctx.auth(owner))
    expect(status.body).toEqual({ configured: false })
  })

  it('refuses to start a bank authorization while nothing is configured', async () => {
    const response = await request(ctx.server)
      .post('/bank-sync/connections')
      .set(ctx.auth(owner))
      .send({
        aspspName: 'CIC',
        redirectUrl: 'https://localhost:5174/bank-callback',
      })

    expect(response.status).toBe(503)
    expect((response.body as { message: string }).message).toMatch(
      /not configured/
    )
  })
})

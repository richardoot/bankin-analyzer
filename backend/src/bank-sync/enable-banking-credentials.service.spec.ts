import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  EnableBankingCredentialsService,
  InvalidEnableBankingCredentialsError,
} from './enable-banking-credentials.service'
import { EnableBankingError } from './enable-banking.client'
import { encryptSecret } from './credential-encryption'
import { generateKeyPairSync } from 'crypto'

function genPem(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey, privateKey }
}

describe('EnableBankingCredentialsService', () => {
  const mockPrisma = {
    enableBankingCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
  const mockClient = {
    getApplication: vi.fn(),
  }
  const savedEnv = {
    id: process.env.ENABLE_BANKING_APP_ID,
    key: process.env.ENABLE_BANKING_PRIVATE_KEY_PATH,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient.getApplication.mockResolvedValue({
      name: 'test-app',
      environment: 'PRODUCTION',
      redirect_urls: ['https://example.test/bank-callback'],
      active: true,
    })
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from(
      'a'.repeat(32)
    ).toString('base64')
  })

  afterEach(() => {
    if (savedEnv.id) process.env.ENABLE_BANKING_APP_ID = savedEnv.id
    else delete process.env.ENABLE_BANKING_APP_ID
    if (savedEnv.key) process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = savedEnv.key
    else delete process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
  })

  function buildService(): EnableBankingCredentialsService {
    return new EnableBankingCredentialsService(
      mockPrisma as never,
      mockClient as never
    )
  }

  describe('resolve', () => {
    it('decrypts and returns a stored credential', async () => {
      const { privateKey } = genPem()
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue({
        applicationId: 'app-1',
        encryptedPrivateKey: encryptSecret(privateKey),
      })

      const resolved = await buildService().resolve('user-1')

      expect(resolved).toEqual({ applicationId: 'app-1', privateKey })
    })

    it('resolves nothing for a user with no application of their own', async () => {
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue(null)

      expect(await buildService().resolve('user-1')).toBeNull()
    })

    it('never falls back to the server’s own Enable Banking env vars', async () => {
      // A regression here would mean anyone can sync using this server's own
      // application without ever configuring one of their own.
      process.env.ENABLE_BANKING_APP_ID = 'server-app'
      process.env.ENABLE_BANKING_PRIVATE_KEY_PATH = '/some/key.pem'
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue(null)

      expect(await buildService().resolve('user-1')).toBeNull()
    })
  })

  describe('isConfigured', () => {
    it('is true once a credential resolves', async () => {
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue({
        applicationId: 'app-1',
        encryptedPrivateKey: encryptSecret('anything'),
      })

      expect(await buildService().isConfigured('user-1')).toBe(true)
    })

    it('is false for a user with no application of their own', async () => {
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue(null)

      expect(await buildService().isConfigured('user-1')).toBe(false)
    })

    it('answers without ever touching the encryption key', async () => {
      // A missing CREDENTIALS_ENCRYPTION_KEY must break the one call that
      // actually signs, not every load of the settings page.
      delete process.env.CREDENTIALS_ENCRYPTION_KEY
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue({
        applicationId: 'app-1',
      })

      expect(await buildService().isConfigured('user-1')).toBe(true)
    })
  })

  describe('save', () => {
    it('rejects a key that cannot actually sign, before touching the database', async () => {
      await expect(
        buildService().save('user-1', 'app-1', 'not-a-pem')
      ).rejects.toThrow(InvalidEnableBankingCredentialsError)

      expect(mockClient.getApplication).not.toHaveBeenCalled()
      expect(mockPrisma.enableBankingCredential.upsert).not.toHaveBeenCalled()
    })

    it('encrypts a working key before storing it', async () => {
      const { privateKey } = genPem()

      await buildService().save('user-1', 'app-1', privateKey)

      expect(mockPrisma.enableBankingCredential.upsert).toHaveBeenCalledTimes(1)
      const call = mockPrisma.enableBankingCredential.upsert.mock.calls[0][0]
      expect(call.create.applicationId).toBe('app-1')
      expect(call.create.encryptedPrivateKey).not.toContain(privateKey)
    })

    it('asks Enable Banking about the pair, and reports the application state', async () => {
      const { privateKey } = genPem()
      mockClient.getApplication.mockResolvedValue({
        name: 'still-pending',
        environment: 'PRODUCTION',
        redirect_urls: [],
        active: false,
      })

      const saved = await buildService().save('user-1', 'app-1', privateKey)

      expect(mockClient.getApplication).toHaveBeenCalledWith({
        applicationId: 'app-1',
        privateKey,
      })
      expect(saved).toEqual({ active: false, environment: 'PRODUCTION' })
    })

    it('rejects a pair Enable Banking does not recognise, storing nothing', async () => {
      // A key that signs, for an application id that is not its own: locally
      // indistinguishable from a good pair, and a silent 401 at the first
      // sync if it were stored.
      const { privateKey } = genPem()
      mockClient.getApplication.mockRejectedValue(
        new EnableBankingError(
          401,
          '{"message":"Unauthorized"}',
          'GET /application → 401'
        )
      )

      await expect(
        buildService().save('user-1', 'app-1', privateKey)
      ).rejects.toThrow(InvalidEnableBankingCredentialsError)
      expect(mockPrisma.enableBankingCredential.upsert).not.toHaveBeenCalled()
    })

    it('lets an Enable Banking outage through unblamed, storing nothing', async () => {
      // A 500 from Enable Banking says nothing about the credentials — the
      // error keeps its identity so the filter answers 502, not 400.
      const { privateKey } = genPem()
      const outage = new EnableBankingError(
        503,
        'service unavailable',
        'GET /application → 503'
      )
      mockClient.getApplication.mockRejectedValue(outage)

      await expect(
        buildService().save('user-1', 'app-1', privateKey)
      ).rejects.toBe(outage)
      expect(mockPrisma.enableBankingCredential.upsert).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('deletes whatever credential this user had', async () => {
      await buildService().remove('user-1')

      expect(
        mockPrisma.enableBankingCredential.deleteMany
      ).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    })
  })

  describe('resolve with a foreign ciphertext', () => {
    it('says what happened instead of a 500 when the key cannot open it', async () => {
      // A production dump restored onto a machine with its own key: the row
      // exists, the auth tag never authenticates.
      mockPrisma.enableBankingCredential.findUnique.mockResolvedValue({
        userId: 'user-1',
        applicationId: 'app-1',
        encryptedPrivateKey: Buffer.from(
          'not-encrypted-with-this-key-at-all-0000000000',
          'utf8'
        ).toString('base64'),
      })

      const service = buildService()
      await expect(service.resolve('user-1')).rejects.toMatchObject({
        status: 409,
      })
      await expect(service.resolve('user-1')).rejects.toThrow(/déchiffrés/)
    })
  })
})

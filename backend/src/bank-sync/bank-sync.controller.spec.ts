import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { BankSyncController } from './bank-sync.controller'
import { BankSyncService } from './bank-sync.service'
import {
  EnableBankingCredentialsService,
  InvalidEnableBankingCredentialsError,
} from './enable-banking-credentials.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { User } from '../generated/prisma'
import type { Request } from 'express'

const mockUser = { id: 'user-1' } as User

const mockBankSync = {
  isConfigured: vi.fn(),
  listBanks: vi.fn(),
  sync: vi.fn(),
  completeAuthorization: vi.fn(),
}

const mockCredentials = {
  hasOwnCredentials: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}

describe('BankSyncController — credentials', () => {
  let controller: BankSyncController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankSyncController],
      providers: [
        { provide: BankSyncService, useValue: mockBankSync },
        { provide: EnableBankingCredentialsService, useValue: mockCredentials },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<BankSyncController>(BankSyncController)
  })

  describe('status', () => {
    it('asks per-user, not per-server', async () => {
      mockBankSync.isConfigured.mockResolvedValue(true)

      const result = await controller.status(mockUser)

      expect(result).toEqual({ configured: true })
      expect(mockBankSync.isConfigured).toHaveBeenCalledWith('user-1')
    })
  })

  describe('banks', () => {
    it('scopes the bank list to the caller', async () => {
      mockBankSync.listBanks.mockResolvedValue([])

      await controller.banks(mockUser, 'FR')

      expect(mockBankSync.listBanks).toHaveBeenCalledWith('user-1', 'FR')
    })

    it('defaults to France when no country is given', async () => {
      mockBankSync.listBanks.mockResolvedValue([])

      await controller.banks(mockUser, undefined)

      expect(mockBankSync.listBanks).toHaveBeenCalledWith('user-1', 'FR')
    })
  })

  describe('credentialStatus', () => {
    it('reports the application id, never the key', async () => {
      mockCredentials.hasOwnCredentials.mockResolvedValue({
        applicationId: 'app-1',
      })

      expect(await controller.credentialStatus(mockUser)).toEqual({
        applicationId: 'app-1',
      })
    })

    it('reports null when this user has no credentials of their own', async () => {
      mockCredentials.hasOwnCredentials.mockResolvedValue(null)

      expect(await controller.credentialStatus(mockUser)).toEqual({
        applicationId: null,
      })
    })
  })

  describe('saveCredentials', () => {
    const file = {
      buffer: Buffer.from('pem-content'),
      originalname: 'key.pem',
      size: 11,
    }

    it('refuses when no file was attached', async () => {
      await expect(
        controller.saveCredentials(mockUser, { applicationId: 'app-1' })
      ).rejects.toThrow(BadRequestException)
      expect(mockCredentials.save).not.toHaveBeenCalled()
    })

    it('saves the decoded file content against this user', async () => {
      mockCredentials.save.mockResolvedValue(undefined)

      const result = await controller.saveCredentials(
        mockUser,
        { applicationId: 'app-1' },
        file
      )

      expect(mockCredentials.save).toHaveBeenCalledWith(
        'user-1',
        'app-1',
        'pem-content'
      )
      expect(result).toEqual({ applicationId: 'app-1' })
    })

    it('turns an invalid key into a 400, not a 500', async () => {
      mockCredentials.save.mockRejectedValue(
        new InvalidEnableBankingCredentialsError('bad key')
      )

      await expect(
        controller.saveCredentials(mockUser, { applicationId: 'app-1' }, file)
      ).rejects.toThrow(BadRequestException)
    })

    it('lets an unrelated error through unchanged', async () => {
      mockCredentials.save.mockRejectedValue(new Error('db is down'))

      await expect(
        controller.saveCredentials(mockUser, { applicationId: 'app-1' }, file)
      ).rejects.toThrow('db is down')
    })
  })

  describe('PSU context — who is at the keyboard', () => {
    function fakeRequest(overrides: Partial<Request> = {}): Request {
      return {
        ip: '203.0.113.7',
        headers: { 'user-agent': 'Mozilla/5.0 (test)' },
        ...overrides,
      } as Request
    }

    it('forwards the caller’s IP and user agent into a sync', async () => {
      mockBankSync.sync.mockResolvedValue({})

      await controller.sync(mockUser, 'conn-1', fakeRequest())

      expect(mockBankSync.sync).toHaveBeenCalledWith('user-1', 'conn-1', {
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (test)',
      })
    })

    it('forwards it when finishing an authorization too', async () => {
      mockBankSync.completeAuthorization.mockResolvedValue({})

      await controller.complete(
        mockUser,
        { code: 'code-1', state: 'state-1' },
        fakeRequest()
      )

      expect(mockBankSync.completeAuthorization).toHaveBeenCalledWith(
        'user-1',
        'code-1',
        'state-1',
        { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' }
      )
    })

    it('sends an empty context rather than inventing one', async () => {
      // No IP, no user agent → the client will send no PSU headers at all,
      // the valid unattended shape — never a fabricated address.
      mockBankSync.sync.mockResolvedValue({})

      await controller.sync(
        mockUser,
        'conn-1',
        fakeRequest({ ip: undefined, headers: {} } as Partial<Request>)
      )

      expect(mockBankSync.sync).toHaveBeenCalledWith('user-1', 'conn-1', {})
    })
  })

  describe('removeCredentials', () => {
    it('removes this user’s credentials', async () => {
      mockCredentials.remove.mockResolvedValue(undefined)

      await controller.removeCredentials(mockUser)

      expect(mockCredentials.remove).toHaveBeenCalledWith('user-1')
    })
  })
})

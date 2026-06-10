import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException, ConflictException } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { PrismaService } from '../prisma/prisma.service'
import { AccountType, Prisma } from '../generated/prisma'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'
const mockAccountId = '550e8400-e29b-41d4-a716-446655440010'

const mockAccount = {
  id: mockAccountId,
  userId: mockUserId,
  name: 'Compte Joint',
  type: AccountType.JOINT,
  divisor: 2,
  isExcludedFromBudget: false,
  isExcludedFromStats: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
}

const mockPrismaService = {
  account: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}

describe('AccountsService', () => {
  let service: AccountsService

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    service = module.get<AccountsService>(AccountsService)
  })

  describe('update', () => {
    it('throws NotFoundException when the account does not exist', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(null)

      await expect(
        service.update(mockUserId, mockAccountId, { name: 'New name' })
      ).rejects.toThrow(NotFoundException)
      expect(mockPrismaService.account.update).not.toHaveBeenCalled()
    })

    it('renames the account when the new name is unique', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccount,
        name: 'Compte Joint Fixe',
      })

      const result = await service.update(mockUserId, mockAccountId, {
        name: 'Compte Joint Fixe',
      })

      expect(result.name).toBe('Compte Joint Fixe')
      expect(mockPrismaService.account.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: { name: 'Compte Joint Fixe' },
      })
    })

    it('throws ConflictException when the new name collides with another account', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`user_id`,`name`)',
        { code: 'P2002', clientVersion: 'test' }
      )
      mockPrismaService.account.update.mockRejectedValue(p2002)

      await expect(
        service.update(mockUserId, mockAccountId, { name: 'Compte Existant' })
      ).rejects.toThrow(ConflictException)
    })

    it('re-throws non-P2002 Prisma errors unchanged', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Some other error',
        { code: 'P2025', clientVersion: 'test' }
      )
      mockPrismaService.account.update.mockRejectedValue(otherError)

      await expect(
        service.update(mockUserId, mockAccountId, { name: 'Compte Whatever' })
      ).rejects.toBe(otherError)
    })

    it('does not treat P2002 as a name conflict when name is not part of the update', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      const p2002 = new Prisma.PrismaClientKnownRequestError('boom', {
        code: 'P2002',
        clientVersion: 'test',
      })
      mockPrismaService.account.update.mockRejectedValue(p2002)

      // No `name` in the DTO → the P2002 must not be re-mapped to ConflictException
      await expect(
        service.update(mockUserId, mockAccountId, {
          type: AccountType.STANDARD,
        })
      ).rejects.toBe(p2002)
    })

    it('updates name alongside other fields in the same call', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccount,
        name: 'Compte Joint Renamed',
        isExcludedFromStats: true,
      })

      await service.update(mockUserId, mockAccountId, {
        name: 'Compte Joint Renamed',
        isExcludedFromStats: true,
      })

      expect(mockPrismaService.account.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: {
          name: 'Compte Joint Renamed',
          isExcludedFromStats: true,
        },
      })
    })

    it('derives divisor=2 when type changes to JOINT without explicit divisor', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue({
        ...mockAccount,
        type: AccountType.STANDARD,
        divisor: 1,
      })
      mockPrismaService.account.update.mockResolvedValue(mockAccount)

      await service.update(mockUserId, mockAccountId, {
        type: AccountType.JOINT,
      })

      expect(mockPrismaService.account.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: { type: AccountType.JOINT, divisor: 2 },
      })
    })
  })
})

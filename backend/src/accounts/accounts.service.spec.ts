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
    delete: vi.fn(),
  },
  transaction: {
    aggregate: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  reimbursementRequest: {
    count: vi.fn(),
    update: vi.fn(),
  },
  settlement: {
    count: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  // The service runs the delete in one interactive transaction; handing the
  // callback the same mock keeps the assertions readable.
  $transaction: vi.fn((callback: (tx: typeof mockPrismaService) => unknown) =>
    callback(mockPrismaService)
  ),
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

  describe('getDeletionSummary', () => {
    it('throws NotFoundException when the account does not exist', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(null)

      await expect(
        service.getDeletionSummary(mockUserId, mockAccountId)
      ).rejects.toThrow(NotFoundException)
    })

    it('reports the transactions, dates and debts at stake', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      mockPrismaService.transaction.aggregate.mockResolvedValue({
        _count: { _all: 42 },
        _min: { date: new Date('2024-01-05T00:00:00.000Z') },
        _max: { date: new Date('2024-06-30T00:00:00.000Z') },
      })
      mockPrismaService.reimbursementRequest.count.mockResolvedValue(3)
      mockPrismaService.settlement.count.mockResolvedValue(1)

      const summary = await service.getDeletionSummary(
        mockUserId,
        mockAccountId
      )

      expect(summary).toEqual({
        accountId: mockAccountId,
        accountName: 'Compte Joint',
        transactionCount: 42,
        firstTransactionDate: new Date('2024-01-05T00:00:00.000Z'),
        lastTransactionDate: new Date('2024-06-30T00:00:00.000Z'),
        reimbursementCount: 3,
        settlementCount: 1,
      })
    })

    it('returns null dates for an empty account', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      mockPrismaService.transaction.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: { date: null },
        _max: { date: null },
      })
      mockPrismaService.reimbursementRequest.count.mockResolvedValue(0)
      mockPrismaService.settlement.count.mockResolvedValue(0)

      const summary = await service.getDeletionSummary(
        mockUserId,
        mockAccountId
      )

      expect(summary.transactionCount).toBe(0)
      expect(summary.firstTransactionDate).toBeNull()
      expect(summary.lastTransactionDate).toBeNull()
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      mockPrismaService.account.findFirst.mockResolvedValue(mockAccount)
      mockPrismaService.transaction.count.mockResolvedValue(0)
      mockPrismaService.settlement.findMany.mockResolvedValue([])
    })

    it('throws NotFoundException when the account does not exist', async () => {
      mockPrismaService.account.findFirst.mockResolvedValue(null)

      await expect(service.remove(mockUserId, mockAccountId)).rejects.toThrow(
        NotFoundException
      )
      expect(mockPrismaService.account.delete).not.toHaveBeenCalled()
    })

    it('deletes only the transactions of that account, then the account', async () => {
      mockPrismaService.transaction.count.mockResolvedValue(2)

      const result = await service.remove(mockUserId, mockAccountId)

      expect(result).toEqual({ deletedTransactions: 2 })
      expect(mockPrismaService.transaction.deleteMany).toHaveBeenCalledWith({
        where: { accountId: mockAccountId, userId: mockUserId },
      })
      expect(mockPrismaService.account.delete).toHaveBeenCalledWith({
        where: { id: mockAccountId },
      })
    })

    it('skips the transaction sweep when the account is empty', async () => {
      const result = await service.remove(mockUserId, mockAccountId)

      expect(result).toEqual({ deletedTransactions: 0 })
      expect(mockPrismaService.transaction.deleteMany).not.toHaveBeenCalled()
      expect(mockPrismaService.account.delete).toHaveBeenCalled()
    })

    it('gives surviving debts back the credits paid by a doomed income', async () => {
      mockPrismaService.transaction.count.mockResolvedValue(1)
      mockPrismaService.settlement.findMany
        // Settlements funded by the doomed income transaction…
        .mockResolvedValueOnce([
          {
            id: 'settlement-1',
            reimbursements: [
              {
                amountSettled: 30,
                reimbursement: {
                  id: 'debt-elsewhere',
                  transaction: { accountId: 'other-account' },
                  amount: 100,
                  amountReceived: 100,
                },
              },
              {
                amountSettled: 20,
                reimbursement: {
                  id: 'debt-doomed',
                  transaction: { accountId: mockAccountId },
                  amount: 20,
                  amountReceived: 20,
                },
              },
            ],
          },
        ])
        // …then the emptied-settlement lookup.
        .mockResolvedValueOnce([])

      await service.remove(mockUserId, mockAccountId)

      expect(
        mockPrismaService.reimbursementRequest.update
      ).toHaveBeenCalledTimes(1)
      expect(
        mockPrismaService.reimbursementRequest.update
      ).toHaveBeenCalledWith({
        where: { id: 'debt-elsewhere' },
        data: { amountReceived: 70, status: 'PARTIAL' },
      })
    })

    it('drops settlements whose every debt disappears with the account', async () => {
      mockPrismaService.transaction.count.mockResolvedValue(1)
      mockPrismaService.settlement.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'fully-orphaned',
            reimbursements: [
              { reimbursement: { transaction: { accountId: mockAccountId } } },
            ],
          },
          {
            id: 'partly-orphaned',
            reimbursements: [
              { reimbursement: { transaction: { accountId: mockAccountId } } },
              { reimbursement: { transaction: { accountId: 'other' } } },
            ],
          },
        ])

      await service.remove(mockUserId, mockAccountId)

      expect(mockPrismaService.settlement.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['fully-orphaned'] } },
      })
    })
  })
})

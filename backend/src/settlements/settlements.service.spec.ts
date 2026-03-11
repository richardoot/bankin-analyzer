import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { Decimal } from 'decimal.js'
import { SettlementsService } from './settlements.service'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus, TransactionType } from '../generated/prisma'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'

const mockPerson = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Alice Martin',
}

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  name: 'Alimentation',
}

const mockIncomeTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  userId: mockUserId,
  date: new Date('2024-01-20'),
  description: 'Virement Alice',
  amount: new Decimal(200),
  type: TransactionType.INCOME,
  settlementsAsIncome: [],
}

const mockExpenseTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440031',
  userId: mockUserId,
  date: new Date('2024-01-15'),
  description: 'Courses Carrefour',
  amount: new Decimal(-80),
  type: TransactionType.EXPENSE,
}

const mockReimbursement = {
  id: '550e8400-e29b-41d4-a716-446655440040',
  userId: mockUserId,
  transactionId: mockExpenseTransaction.id,
  personId: mockPerson.id,
  categoryId: mockCategory.id,
  amount: new Decimal(80),
  amountReceived: new Decimal(0),
  status: ReimbursementStatus.PENDING,
  note: null,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
  person: mockPerson,
  category: mockCategory,
  transaction: mockExpenseTransaction,
}

const mockSettlement = {
  id: '550e8400-e29b-41d4-a716-446655440050',
  userId: mockUserId,
  personId: mockPerson.id,
  incomeTransactionId: mockIncomeTransaction.id,
  amountUsed: new Decimal(80),
  note: null,
  createdAt: new Date('2024-01-20T14:00:00.000Z'),
  person: mockPerson,
  incomeTransaction: mockIncomeTransaction,
  reimbursements: [
    {
      id: '550e8400-e29b-41d4-a716-446655440060',
      amountSettled: new Decimal(80),
      reimbursement: {
        ...mockReimbursement,
        transaction: {
          id: mockExpenseTransaction.id,
          date: mockExpenseTransaction.date,
          description: mockExpenseTransaction.description,
        },
      },
    },
  ],
}

const mockPrismaService = {
  settlement: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    findFirst: vi.fn(),
  },
  person: {
    findFirst: vi.fn(),
  },
  reimbursementRequest: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}

describe('SettlementsService', () => {
  let service: SettlementsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<SettlementsService>(SettlementsService)

    vi.clearAllMocks()
  })

  describe('findAll', () => {
    it('should return all settlements for a user', async () => {
      mockPrismaService.settlement.findMany.mockResolvedValue([mockSettlement])

      const result = await service.findAll(mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockSettlement.id)
      expect(result[0].personName).toBe(mockPerson.name)
      expect(result[0].amountUsed).toBe(80)
    })

    it('should filter by personId', async () => {
      mockPrismaService.settlement.findMany.mockResolvedValue([mockSettlement])

      const result = await service.findAll(mockUserId, mockPerson.id)

      expect(result).toHaveLength(1)
      expect(mockPrismaService.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, personId: mockPerson.id },
        })
      )
    })

    it('should return empty array when no settlements', async () => {
      mockPrismaService.settlement.findMany.mockResolvedValue([])

      const result = await service.findAll('user-without-settlements')

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a settlement by id', async () => {
      mockPrismaService.settlement.findFirst.mockResolvedValue(mockSettlement)

      const result = await service.findOne(mockSettlement.id, mockUserId)

      expect(result.id).toBe(mockSettlement.id)
      expect(result.personName).toBe(mockPerson.name)
      expect(result.reimbursements).toHaveLength(1)
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.settlement.findFirst.mockResolvedValue(null)

      await expect(
        service.findOne('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('getAvailableAmount', () => {
    it('should return full amount when no settlements exist', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )

      const result = await service.getAvailableAmount(
        mockIncomeTransaction.id,
        mockUserId
      )

      expect(result.totalAmount).toBe(200)
      expect(result.usedAmount).toBe(0)
      expect(result.availableAmount).toBe(200)
    })

    it('should subtract used amounts from settlements', async () => {
      const transactionWithSettlements = {
        ...mockIncomeTransaction,
        settlementsAsIncome: [{ amountUsed: new Decimal(80) }],
      }
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        transactionWithSettlements
      )

      const result = await service.getAvailableAmount(
        mockIncomeTransaction.id,
        mockUserId
      )

      expect(result.totalAmount).toBe(200)
      expect(result.usedAmount).toBe(80)
      expect(result.availableAmount).toBe(120)
    })

    it('should throw NotFoundException when transaction not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.getAvailableAmount('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when transaction is not INCOME', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue({
        ...mockExpenseTransaction,
        settlementsAsIncome: [],
      })

      await expect(
        service.getAvailableAmount(mockExpenseTransaction.id, mockUserId)
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('create', () => {
    it('should create a settlement with exact match', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])
      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          settlement: {
            create: vi.fn().mockResolvedValue(mockSettlement),
          },
          reimbursementRequest: {
            update: vi.fn(),
          },
        })
      })

      const result = await service.create(mockUserId, {
        personId: mockPerson.id,
        incomeTransactionId: mockIncomeTransaction.id,
        reimbursements: [
          { reimbursementId: mockReimbursement.id, amountSettled: 80 },
        ],
      })

      expect(result.id).toBe(mockSettlement.id)
      expect(result.amountUsed).toBe(80)
    })

    it('should throw NotFoundException when income transaction not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.create(mockUserId, {
          personId: mockPerson.id,
          incomeTransactionId: 'non-existent',
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when transaction is not INCOME', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockExpenseTransaction
      )

      await expect(
        service.create(mockUserId, {
          personId: mockPerson.id,
          incomeTransactionId: mockExpenseTransaction.id,
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when person not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(null)

      await expect(
        service.create(mockUserId, {
          personId: 'non-existent',
          incomeTransactionId: mockIncomeTransaction.id,
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when some reimbursements not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([])

      await expect(
        service.create(mockUserId, {
          personId: mockPerson.id,
          incomeTransactionId: mockIncomeTransaction.id,
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when reimbursement belongs to different person', async () => {
      const differentPersonReimbursement = {
        ...mockReimbursement,
        personId: 'different-person-id',
      }
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        differentPersonReimbursement,
      ])

      await expect(
        service.create(mockUserId, {
          personId: mockPerson.id,
          incomeTransactionId: mockIncomeTransaction.id,
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when insufficient available amount', async () => {
      const transactionWithUsedAmount = {
        ...mockIncomeTransaction,
        settlementsAsIncome: [{ amountUsed: new Decimal(150) }],
      }
      mockPrismaService.transaction.findFirst
        .mockResolvedValueOnce(mockIncomeTransaction)
        .mockResolvedValueOnce(transactionWithUsedAmount)
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])

      await expect(
        service.create(mockUserId, {
          personId: mockPerson.id,
          incomeTransactionId: mockIncomeTransaction.id,
          reimbursements: [
            { reimbursementId: mockReimbursement.id, amountSettled: 80 },
          ],
        })
      ).rejects.toThrow(BadRequestException)
    })

    it('should mark reimbursement as COMPLETED when forceComplete is true', async () => {
      const mockUpdate = vi.fn()
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])
      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          settlement: {
            create: vi.fn().mockResolvedValue(mockSettlement),
          },
          reimbursementRequest: {
            update: mockUpdate,
          },
        })
      })

      await service.create(mockUserId, {
        personId: mockPerson.id,
        incomeTransactionId: mockIncomeTransaction.id,
        reimbursements: [
          { reimbursementId: mockReimbursement.id, amountSettled: 50 },
        ],
        forceComplete: true,
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: mockReimbursement.id },
        data: {
          amountReceived: 80, // Original full amount, not 50
          status: ReimbursementStatus.COMPLETED,
        },
      })
    })

    it('should mark reimbursement as PARTIAL when forceComplete is false and amount is partial', async () => {
      const mockUpdate = vi.fn()
      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockIncomeTransaction
      )
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])
      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          settlement: {
            create: vi.fn().mockResolvedValue(mockSettlement),
          },
          reimbursementRequest: {
            update: mockUpdate,
          },
        })
      })

      await service.create(mockUserId, {
        personId: mockPerson.id,
        incomeTransactionId: mockIncomeTransaction.id,
        reimbursements: [
          { reimbursementId: mockReimbursement.id, amountSettled: 50 },
        ],
        forceComplete: false,
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: mockReimbursement.id },
        data: {
          amountReceived: 50, // Partial amount
          status: ReimbursementStatus.PARTIAL,
        },
      })
    })
  })

  describe('delete', () => {
    it('should delete a settlement and reverse amounts', async () => {
      const settlementWithReimbursement = {
        ...mockSettlement,
        reimbursements: [
          {
            amountSettled: new Decimal(80),
            reimbursement: {
              ...mockReimbursement,
              amountReceived: new Decimal(80),
              status: ReimbursementStatus.COMPLETED,
            },
          },
        ],
      }
      mockPrismaService.settlement.findFirst.mockResolvedValue(
        settlementWithReimbursement
      )
      mockPrismaService.$transaction.mockImplementation(async callback => {
        return callback({
          reimbursementRequest: {
            update: vi.fn(),
          },
          settlement: {
            delete: vi.fn(),
          },
        })
      })

      await service.delete(mockSettlement.id, mockUserId)

      expect(mockPrismaService.$transaction).toHaveBeenCalled()
    })

    it('should throw NotFoundException when settlement not found', async () => {
      mockPrismaService.settlement.findFirst.mockResolvedValue(null)

      await expect(
        service.delete('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })
})

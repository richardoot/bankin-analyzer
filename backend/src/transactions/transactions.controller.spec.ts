import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { TransactionType } from '../generated/prisma'
import { Decimal } from 'decimal.js'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Alimentation',
}

const mockTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: mockUser.id,
  categoryId: mockCategory.id,
  hash: 'abc123hash',
  date: new Date('2024-01-15T10:30:00.000Z'),
  description: 'Restaurant',
  amount: new Decimal(-45.5),
  type: TransactionType.EXPENSE,
  account: 'Compte Courant',
  subcategory: 'Restaurant - Autres',
  note: null,
  isPointed: false,
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
  category: mockCategory,
}

const mockTransaction2 = {
  ...mockTransaction,
  id: '550e8400-e29b-41d4-a716-446655440002',
  hash: 'def456hash',
  description: 'Supermarché',
  amount: new Decimal(-85.0),
}

const mockTransactionsService = {
  previewImport: vi.fn(),
  importTransactions: vi.fn(),
  findAllByUser: vi.fn(),
  findAllByUserPaginated: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('TransactionsController', () => {
  let controller: TransactionsController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<TransactionsController>(TransactionsController)
  })

  describe('importTransactions', () => {
    it('should import transactions and return result', async () => {
      const importDto = {
        transactions: [
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
        ],
      }
      const importResult = { imported: 1, duplicates: 0, total: 1 }
      mockTransactionsService.importTransactions.mockResolvedValue(importResult)

      const result = await controller.importTransactions(mockUser, importDto)

      expect(result).toEqual(importResult)
      expect(mockTransactionsService.importTransactions).toHaveBeenCalledWith(
        mockUser.id,
        importDto.transactions,
        undefined
      )
    })

    it('should handle duplicates correctly', async () => {
      const importDto = {
        transactions: [
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Same transaction',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
        ],
      }
      const importResult = { imported: 1, duplicates: 1, total: 2 }
      mockTransactionsService.importTransactions.mockResolvedValue(importResult)

      const result = await controller.importTransactions(mockUser, importDto)

      expect(result.duplicates).toBe(1)
    })

    it('should pass forceImport flag to service', async () => {
      const importDto = {
        transactions: [
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
            forceImport: true,
          },
        ],
      }
      const importResult = { imported: 1, duplicates: 0, total: 1 }
      mockTransactionsService.importTransactions.mockResolvedValue(importResult)

      await controller.importTransactions(mockUser, importDto)

      expect(mockTransactionsService.importTransactions).toHaveBeenCalledWith(
        mockUser.id,
        expect.arrayContaining([
          expect.objectContaining({ forceImport: true }),
        ]),
        undefined
      )
    })
  })

  describe('previewImport', () => {
    const importDto = {
      transactions: [
        {
          date: '2024-01-15T10:30:00.000Z',
          description: 'Restaurant',
          amount: -45.5,
          category: 'Alimentation',
          account: 'Compte Courant',
          type: TransactionType.EXPENSE,
        },
      ],
    }

    it('should return preview result with no duplicates', async () => {
      const previewResult = {
        newCount: 1,
        internalDuplicateCount: 0,
        externalDuplicateCount: 0,
        total: 1,
        internalDuplicates: [],
        externalDuplicates: [],
      }
      mockTransactionsService.previewImport.mockResolvedValue(previewResult)

      const result = await controller.previewImport(mockUser, importDto)

      expect(result).toEqual(previewResult)
      expect(mockTransactionsService.previewImport).toHaveBeenCalledWith(
        mockUser.id,
        importDto.transactions
      )
    })

    it('should return preview result with internal duplicates', async () => {
      const duplicateDto = {
        transactions: [
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
        ],
      }
      const previewResult = {
        newCount: 0,
        internalDuplicateCount: 1,
        externalDuplicateCount: 0,
        total: 2,
        internalDuplicates: [
          {
            hash: 'abc123',
            indices: [0, 1],
            transactions: [
              {
                index: 0,
                date: '2024-01-15T10:30:00.000Z',
                description: 'Restaurant',
                amount: -45.5,
                account: 'Compte Courant',
                category: 'Alimentation',
                type: TransactionType.EXPENSE,
              },
              {
                index: 1,
                date: '2024-01-15T10:30:00.000Z',
                description: 'Restaurant',
                amount: -45.5,
                account: 'Compte Courant',
                category: 'Alimentation',
                type: TransactionType.EXPENSE,
              },
            ],
          },
        ],
        externalDuplicates: [],
      }
      mockTransactionsService.previewImport.mockResolvedValue(previewResult)

      const result = await controller.previewImport(mockUser, duplicateDto)

      expect(result.internalDuplicateCount).toBe(1)
      expect(result.internalDuplicates).toHaveLength(1)
      expect(result.internalDuplicates[0]?.indices).toEqual([0, 1])
    })

    it('should return preview result with external duplicates', async () => {
      const previewResult = {
        newCount: 0,
        internalDuplicateCount: 0,
        externalDuplicateCount: 1,
        total: 1,
        internalDuplicates: [],
        externalDuplicates: [
          {
            hash: 'abc123',
            uploaded: {
              index: 0,
              date: '2024-01-15T10:30:00.000Z',
              description: 'Restaurant',
              amount: -45.5,
              account: 'Compte Courant',
              category: 'Alimentation',
              type: TransactionType.EXPENSE,
            },
            existing: {
              id: mockTransaction.id,
              date: '2024-01-15T10:30:00.000Z',
              description: 'Restaurant',
              amount: -45.5,
              account: 'Compte Courant',
              categoryName: 'Alimentation',
              type: TransactionType.EXPENSE,
              createdAt: '2024-01-15T10:30:00.000Z',
            },
          },
        ],
      }
      mockTransactionsService.previewImport.mockResolvedValue(previewResult)

      const result = await controller.previewImport(mockUser, importDto)

      expect(result.externalDuplicateCount).toBe(1)
      expect(result.externalDuplicates).toHaveLength(1)
      expect(result.externalDuplicates[0]?.existing.id).toBe(mockTransaction.id)
    })

    it('should return preview result with mixed duplicates', async () => {
      const mixedDto = {
        transactions: [
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'New Restaurant',
            amount: -30,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
          {
            date: '2024-01-15T10:30:00.000Z',
            description: 'Restaurant',
            amount: -45.5,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
          {
            date: '2024-01-16T10:30:00.000Z',
            description: 'Supermarché',
            amount: -85,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
          {
            date: '2024-01-16T10:30:00.000Z',
            description: 'Supermarché',
            amount: -85,
            category: 'Alimentation',
            account: 'Compte Courant',
            type: TransactionType.EXPENSE,
          },
        ],
      }
      const previewResult = {
        newCount: 1,
        internalDuplicateCount: 1,
        externalDuplicateCount: 1,
        total: 4,
        internalDuplicates: [
          {
            hash: 'def456',
            indices: [2, 3],
            transactions: [],
          },
        ],
        externalDuplicates: [
          {
            hash: 'abc123',
            uploaded: { index: 1 },
            existing: { id: mockTransaction.id },
          },
        ],
      }
      mockTransactionsService.previewImport.mockResolvedValue(previewResult)

      const result = await controller.previewImport(mockUser, mixedDto)

      expect(result.newCount).toBe(1)
      expect(result.internalDuplicateCount).toBe(1)
      expect(result.externalDuplicateCount).toBe(1)
      expect(result.total).toBe(4)
    })
  })

  describe('findAll', () => {
    it('should return paginated transactions for current user', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [mockTransaction, mockTransaction2],
        total: 2,
      })

      const result = await controller.findAll(mockUser, 1, 20)

      expect(result.data).toHaveLength(2)
      expect(result.data[0]?.id).toBe(mockTransaction.id)
      expect(result.data[0]?.amount).toBe(-45.5)
      expect(result.data[0]?.categoryName).toBe('Alimentation')
      expect(result.meta.total).toBe(2)
      expect(result.meta.page).toBe(1)
      expect(result.meta.limit).toBe(20)
      expect(result.meta.totalPages).toBe(1)
      expect(result.meta.hasNextPage).toBe(false)
      expect(result.meta.hasPreviousPage).toBe(false)
    })

    it('should filter by type', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [mockTransaction],
        total: 1,
      })

      await controller.findAll(mockUser, 1, 20, TransactionType.EXPENSE)

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 20 },
        expect.objectContaining({ type: TransactionType.EXPENSE })
      )
    })

    it('should filter by date range', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [],
        total: 0,
      })

      await controller.findAll(
        mockUser,
        1,
        20,
        undefined,
        '2024-01-01',
        '2024-01-31'
      )

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 20 },
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      )
    })

    it('should return empty data when no transactions', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [],
        total: 0,
      })

      const result = await controller.findAll(mockUser, 1, 20)

      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
      expect(result.meta.totalPages).toBe(0)
    })

    it('should handle pagination correctly', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [mockTransaction],
        total: 50,
      })

      const result = await controller.findAll(mockUser, 2, 10)

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(mockUser.id, { page: 2, limit: 10 }, undefined)
      expect(result.meta.page).toBe(2)
      expect(result.meta.limit).toBe(10)
      expect(result.meta.totalPages).toBe(5)
      expect(result.meta.hasNextPage).toBe(true)
      expect(result.meta.hasPreviousPage).toBe(true)
    })

    it('should clamp limit to max 100', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [],
        total: 0,
      })

      await controller.findAll(mockUser, 1, 500)

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(mockUser.id, { page: 1, limit: 100 }, undefined)
    })
  })

  describe('findOne', () => {
    it('should return a single transaction', async () => {
      mockTransactionsService.findOne.mockResolvedValue(mockTransaction)

      const result = await controller.findOne(mockUser, mockTransaction.id)

      expect(result.id).toBe(mockTransaction.id)
      expect(result.description).toBe('Restaurant')
      expect(result.categoryName).toBe('Alimentation')
      expect(result.subcategory).toBe('Restaurant - Autres')
      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        mockTransaction.id,
        mockUser.id
      )
    })
  })

  describe('update', () => {
    it('should update transaction note', async () => {
      const updatedTransaction = { ...mockTransaction, note: 'Updated note' }
      mockTransactionsService.update.mockResolvedValue(updatedTransaction)

      const result = await controller.update(mockUser, mockTransaction.id, {
        note: 'Updated note',
      })

      expect(result.note).toBe('Updated note')
      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        mockTransaction.id,
        mockUser.id,
        { note: 'Updated note' }
      )
    })

    it('should update transaction categoryId', async () => {
      const newCategoryId = '550e8400-e29b-41d4-a716-446655440020'
      const updatedTransaction = {
        ...mockTransaction,
        categoryId: newCategoryId,
        category: { id: newCategoryId, name: 'Transport' },
      }
      mockTransactionsService.update.mockResolvedValue(updatedTransaction)

      const result = await controller.update(mockUser, mockTransaction.id, {
        categoryId: newCategoryId,
      })

      expect(result.categoryId).toBe(newCategoryId)
      expect(result.categoryName).toBe('Transport')
    })
  })

  describe('delete', () => {
    it('should delete a transaction', async () => {
      mockTransactionsService.delete.mockResolvedValue(mockTransaction)

      await controller.delete(mockUser, mockTransaction.id)

      expect(mockTransactionsService.delete).toHaveBeenCalledWith(
        mockTransaction.id,
        mockUser.id
      )
    })
  })
})

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
  importTransactions: vi.fn(),
  findAllByUser: vi.fn(),
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
        importDto.transactions
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
  })

  describe('findAll', () => {
    it('should return all transactions for current user', async () => {
      mockTransactionsService.findAllByUser.mockResolvedValue([
        mockTransaction,
        mockTransaction2,
      ])

      const result = await controller.findAll(mockUser)

      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe(mockTransaction.id)
      expect(result[0]?.amount).toBe(-45.5)
      expect(result[0]?.categoryName).toBe('Alimentation')
    })

    it('should filter by type', async () => {
      mockTransactionsService.findAllByUser.mockResolvedValue([mockTransaction])

      await controller.findAll(mockUser, TransactionType.EXPENSE)

      expect(mockTransactionsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ type: TransactionType.EXPENSE })
      )
    })

    it('should filter by date range', async () => {
      mockTransactionsService.findAllByUser.mockResolvedValue([])

      await controller.findAll(mockUser, undefined, '2024-01-01', '2024-01-31')

      expect(mockTransactionsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      )
    })

    it('should return empty array when no transactions', async () => {
      mockTransactionsService.findAllByUser.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
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

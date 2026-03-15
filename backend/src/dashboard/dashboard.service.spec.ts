import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Decimal } from 'decimal.js'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType } from '../generated/prisma'

describe('DashboardService', () => {
  let service: DashboardService

  const mockUserId = 'user-123'

  const createMockTransaction = (
    overrides: Partial<{
      id: string
      date: Date
      amount: number
      type: TransactionType
      account: string
      categoryName: string
    }>
  ) => ({
    id: overrides.id ?? '1',
    userId: mockUserId,
    date: overrides.date ?? new Date('2024-01-15'),
    description: 'Test transaction',
    amount: new Decimal(overrides.amount ?? -100),
    type: overrides.type ?? TransactionType.EXPENSE,
    account: overrides.account ?? 'Compte Courant',
    subcategory: null,
    note: null,
    isPointed: false,
    categoryId: 'cat-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { name: overrides.categoryName ?? 'Alimentation' },
  })

  const mockPrismaService = {
    transaction: {
      findMany: vi.fn(),
    },
    categoryAssociation: {
      findMany: vi.fn(),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<DashboardService>(DashboardService)

    vi.clearAllMocks()

    // Default mock: no category associations
    mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])
  })

  describe('getSummary', () => {
    it('should return empty data when no transactions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData).toEqual([])
      expect(result.expensesByCategory).toEqual([])
      expect(result.incomeByCategory).toEqual([])
      expect(result.totalExpenses).toBe(0)
      expect(result.totalIncome).toBe(0)
      expect(result.allExpenseCategories).toEqual([])
      expect(result.allIncomeCategories).toEqual([])
      expect(result.availableAccounts).toEqual([])
    })

    it('should aggregate expenses and income by month', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -100,
          type: TransactionType.EXPENSE,
          categoryName: 'Alimentation',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-20'),
          amount: -50,
          type: TransactionType.EXPENSE,
          categoryName: 'Transport',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-01-25'),
          amount: 2500,
          type: TransactionType.INCOME,
          categoryName: 'Salaire',
        }),
        createMockTransaction({
          id: '4',
          date: new Date('2024-02-10'),
          amount: -200,
          type: TransactionType.EXPENSE,
          categoryName: 'Alimentation',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData).toHaveLength(2)
      expect(result.monthlyData[0].month).toBe('2024-01')
      expect(result.monthlyData[0].expenses).toBe(150)
      expect(result.monthlyData[0].income).toBe(2500)
      expect(result.monthlyData[1].month).toBe('2024-02')
      expect(result.monthlyData[1].expenses).toBe(200)
      expect(result.monthlyData[1].income).toBe(0)
    })

    it('should aggregate expenses by category sorted by amount descending', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -100,
          categoryName: 'Alimentation',
        }),
        createMockTransaction({
          id: '2',
          amount: -500,
          categoryName: 'Loyer',
        }),
        createMockTransaction({
          id: '3',
          amount: -50,
          categoryName: 'Transport',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Loyer', amount: 500 },
        { category: 'Alimentation', amount: 100 },
        { category: 'Transport', amount: 50 },
      ])
    })

    it('should divide amounts by 2 for joint accounts', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -200,
          account: 'Compte Joint',
          categoryName: 'Loyer',
        }),
        createMockTransaction({
          id: '2',
          amount: -100,
          account: 'Compte Courant',
          categoryName: 'Alimentation',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {
        jointAccounts: ['Compte Joint'],
      })

      // Loyer: 200/2 = 100, Alimentation: 100
      // Both have same amount so order may vary
      expect(result.expensesByCategory).toHaveLength(2)
      expect(result.expensesByCategory).toContainEqual({
        category: 'Alimentation',
        amount: 100,
      })
      expect(result.expensesByCategory).toContainEqual({
        category: 'Loyer',
        amount: 100,
      })
      expect(result.totalExpenses).toBe(200)
    })

    it('should exclude hidden expense categories from aggregations', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -100,
          categoryName: 'Alimentation',
        }),
        createMockTransaction({
          id: '2',
          amount: -500,
          categoryName: 'Loisirs',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {
        hiddenExpenseCategories: ['Loisirs'],
      })

      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
      // But allExpenseCategories should still include hidden categories
      expect(result.allExpenseCategories).toContain('Loisirs')
      expect(result.allExpenseCategories).toContain('Alimentation')
    })

    it('should exclude hidden income categories from aggregations', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: 2500,
          type: TransactionType.INCOME,
          categoryName: 'Salaire',
        }),
        createMockTransaction({
          id: '2',
          amount: 1000,
          type: TransactionType.INCOME,
          categoryName: 'Prime',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {
        hiddenIncomeCategories: ['Prime'],
      })

      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 2500 },
      ])
      expect(result.totalIncome).toBe(2500)
      // But allIncomeCategories should still include hidden categories
      expect(result.allIncomeCategories).toContain('Prime')
    })

    it('should deduct reimbursements from expense categories', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -500,
          type: TransactionType.EXPENSE,
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          amount: 200,
          type: TransactionType.INCOME,
          categoryName: 'Remboursement Mutuelle',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Santé: 500 - 200 = 300
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 300 },
      ])
      // Remboursement should not appear in income
      expect(result.incomeByCategory).toEqual([])
      expect(result.totalIncome).toBe(0)
    })

    it('should handle reimbursements greater than expenses', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -100,
          type: TransactionType.EXPENSE,
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          amount: 200,
          type: TransactionType.INCOME,
          categoryName: 'Remboursement Mutuelle',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Should not go negative
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 0 },
      ])
    })

    it('should return all available accounts', async () => {
      const transactions = [
        createMockTransaction({ id: '1', account: 'Compte Courant' }),
        createMockTransaction({ id: '2', account: 'Compte Joint' }),
        createMockTransaction({ id: '3', account: 'Livret A' }),
        createMockTransaction({ id: '4', account: 'Compte Courant' }), // Duplicate
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.availableAccounts).toEqual([
        'Compte Courant',
        'Compte Joint',
        'Livret A',
      ])
    })

    it('should handle transactions without category (default to Autre)', async () => {
      const transactionWithoutCategory = {
        id: '1',
        userId: mockUserId,
        date: new Date('2024-01-15'),
        description: 'Test',
        amount: new Decimal(-100),
        type: TransactionType.EXPENSE,
        account: 'Compte Courant',
        subcategory: null,
        note: null,
        isPointed: false,
        categoryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
      }

      mockPrismaService.transaction.findMany.mockResolvedValue([
        transactionWithoutCategory,
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Autre', amount: 100 },
      ])
      expect(result.allExpenseCategories).toContain('Autre')
    })

    it('should format month labels correctly', async () => {
      const transactions = [
        createMockTransaction({ id: '1', date: new Date('2024-01-15') }),
        createMockTransaction({ id: '2', date: new Date('2024-06-15') }),
        createMockTransaction({ id: '3', date: new Date('2024-12-15') }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData.map(m => m.label)).toEqual([
        'Jan 2024',
        'Juin 2024',
        'Déc 2024',
      ])
    })

    it('should sort months chronologically', async () => {
      const transactions = [
        createMockTransaction({ id: '1', date: new Date('2024-03-15') }),
        createMockTransaction({ id: '2', date: new Date('2024-01-15') }),
        createMockTransaction({ id: '3', date: new Date('2024-02-15') }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData.map(m => m.month)).toEqual([
        '2024-01',
        '2024-02',
        '2024-03',
      ])
    })

    it('should distribute reimbursements proportionally across months', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -100,
          type: TransactionType.EXPENSE,
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-02-15'),
          amount: -300,
          type: TransactionType.EXPENSE,
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-01-20'),
          amount: 100,
          type: TransactionType.INCOME,
          categoryName: 'Remboursement',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Total expenses: 400, Total reimbursement: 100
      // Jan proportion: 100/400 = 0.25, deduction: 100 * 0.25 = 25, result: 100 - 25 = 75
      // Feb proportion: 300/400 = 0.75, deduction: 100 * 0.75 = 75, result: 300 - 75 = 225
      expect(result.monthlyData[0].expenses).toBe(75)
      expect(result.monthlyData[1].expenses).toBe(225)
    })

    it('should round amounts to 2 decimal places', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -33.333,
          categoryName: 'Test',
        }),
        createMockTransaction({
          id: '2',
          amount: -66.667,
          categoryName: 'Test',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getSummary(mockUserId, {})

      expect(result.totalExpenses).toBe(100)
      expect(result.expensesByCategory[0].amount).toBe(100)
    })
  })
})

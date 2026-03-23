import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Decimal } from 'decimal.js'
import { BudgetsService } from './budgets.service'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType, AccountType } from '../generated/prisma'

describe('BudgetsService', () => {
  let service: BudgetsService

  const mockUserId = 'user-123'

  const createMockTransaction = (
    overrides: Partial<{
      id: string
      date: Date
      amount: number
      type: TransactionType
      account: string
      categoryId: string
      categoryName: string
      subcategory: string | null
    }>
  ) => ({
    id: overrides.id ?? '1',
    userId: mockUserId,
    date: overrides.date ?? new Date('2024-01-15'),
    description: 'Test transaction',
    amount: new Decimal(overrides.amount ?? -100),
    type: overrides.type ?? TransactionType.EXPENSE,
    account: overrides.account ?? 'Compte Courant',
    subcategory: overrides.subcategory ?? null,
    note: null,
    isPointed: false,
    categoryId: overrides.categoryId ?? 'cat-1',
    importHistoryId: null,
    personId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: overrides.categoryId ?? 'cat-1',
      name: overrides.categoryName ?? 'Santé',
    },
  })

  const createMockAccount = (
    overrides: Partial<{
      id: string
      name: string
      type: AccountType
      divisor: number
      isExcludedFromBudget: boolean
    }>
  ) => ({
    id: overrides.id ?? 'acc-1',
    userId: mockUserId,
    name: overrides.name ?? 'Compte Courant',
    type: overrides.type ?? AccountType.STANDARD,
    divisor: overrides.divisor ?? 1,
    isExcludedFromBudget: overrides.isExcludedFromBudget ?? false,
    isExcludedFromStats: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const mockPrismaService = {
    budget: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    categoryAssociation: {
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<BudgetsService>(BudgetsService)

    vi.clearAllMocks()

    // Default mocks
    mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])
    mockPrismaService.account.findMany.mockResolvedValue([])
  })

  describe('getStatistics', () => {
    it('should calculate average per month correctly', async () => {
      // 3 months period: Jan, Feb, Mar 2024
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -300,
          categoryId: 'cat-1',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-02-15'),
          amount: -150,
          categoryId: 'cat-1',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-03-15'),
          amount: -150,
          categoryId: 'cat-1',
          categoryName: 'Santé',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      // Total: 300 + 150 + 150 = 600
      // Period: 3 months
      // Average: 600 / 3 = 200
      expect(result.periodMonths).toBe(3)
      expect(result.expensesByCategory[0].totalAmount).toBe(600)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(200)
    })

    it('should deduct reimbursements from category average', async () => {
      // 2 months period with expense and reimbursement
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -500,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-02-15'),
          amount: -300,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-02-20'),
          amount: 200,
          type: TransactionType.INCOME,
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement Mutuelle',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
      })

      // Total expenses: 500 + 300 = 800
      // Total reimbursements: 200
      // Net expenses: 800 - 200 = 600
      // Period: 2 months
      // Average: 600 / 2 = 300
      expect(result.periodMonths).toBe(2)
      expect(result.expensesByCategory[0].totalAmount).toBe(600)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(300)
    })

    it('should apply account divisor to expenses and reimbursements', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -400,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-20'),
          amount: 200,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement',
        }),
      ]

      const accounts = [
        createMockAccount({
          name: 'Compte Joint',
          type: AccountType.JOINT,
          divisor: 2,
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue(accounts)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Expense: 400 / 2 = 200
      // Reimbursement: 200 / 2 = 100
      // Net: 200 - 100 = 100
      // Period: 1 month
      // Average: 100 / 1 = 100
      expect(result.periodMonths).toBe(1)
      expect(result.expensesByCategory[0].totalAmount).toBe(100)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(100)
    })

    it('should handle reimbursement greater than expenses (cap at 0)', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -100,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-20'),
          amount: 300,
          type: TransactionType.INCOME,
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Expense: 100
      // Reimbursement: 300
      // Net: max(0, 100 - 300) = 0
      expect(result.expensesByCategory[0].totalAmount).toBe(0)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(0)
    })

    it('should exclude accounts marked as excludedFromBudget', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -200,
          account: 'Compte Investissement',
          categoryId: 'cat-1',
          categoryName: 'Investissement',
        }),
        createMockTransaction({
          id: '2',
          amount: -100,
          account: 'Compte Courant',
          categoryId: 'cat-2',
          categoryName: 'Alimentation',
        }),
      ]

      const accounts = [
        createMockAccount({
          name: 'Compte Investissement',
          isExcludedFromBudget: true,
        }),
        createMockAccount({
          name: 'Compte Courant',
          isExcludedFromBudget: false,
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue(accounts)

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Only Alimentation should be included
      expect(result.expensesByCategory).toHaveLength(1)
      expect(result.expensesByCategory[0].categoryName).toBe('Alimentation')
      expect(result.expensesByCategory[0].totalAmount).toBe(100)
    })

    it('should calculate correct average with mixed reimbursements from different accounts', async () => {
      // Scenario: Joint account expense, personal account reimbursement
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -600,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-02-15'),
          amount: -400,
          type: TransactionType.EXPENSE,
          account: 'Compte Courant',
          categoryId: 'cat-expense',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-02-20'),
          amount: 200,
          type: TransactionType.INCOME,
          account: 'Compte Courant',
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement',
        }),
      ]

      const accounts = [
        createMockAccount({
          name: 'Compte Joint',
          type: AccountType.JOINT,
          divisor: 2,
        }),
        createMockAccount({
          name: 'Compte Courant',
          type: AccountType.STANDARD,
          divisor: 1,
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue(accounts)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
      })

      // Joint expense: 600 / 2 = 300
      // Personal expense: 400 / 1 = 400
      // Total expenses: 300 + 400 = 700
      // Reimbursement: 200 / 1 = 200
      // Net: 700 - 200 = 500
      // Period: 2 months
      // Average: 500 / 2 = 250
      expect(result.periodMonths).toBe(2)
      expect(result.expensesByCategory[0].totalAmount).toBe(500)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(250)
    })

    it('should distribute reimbursements proportionally to subcategories', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -600,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
          subcategory: 'Médecin',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-20'),
          amount: -400,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
          subcategory: 'Pharmacie',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-01-25'),
          amount: 200,
          type: TransactionType.INCOME,
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement Mutuelle',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Gross totals: Médecin 600€ (60%), Pharmacie 400€ (40%)
      // Total reimbursement: 200€
      // Proportional distribution:
      //   Médecin: 600 - (200 * 0.6) = 600 - 120 = 480€
      //   Pharmacie: 400 - (200 * 0.4) = 400 - 80 = 320€
      // Category total: 480 + 320 = 800€

      expect(result.expensesByCategory[0].totalAmount).toBe(800)
      expect(result.expensesByCategory[0].subcategories).toHaveLength(2)

      // Subcategories sorted by amount descending
      const medecin = result.expensesByCategory[0].subcategories?.find(
        s => s.subcategory === 'Médecin'
      )
      const pharmacie = result.expensesByCategory[0].subcategories?.find(
        s => s.subcategory === 'Pharmacie'
      )

      expect(medecin?.totalAmount).toBe(480)
      expect(medecin?.averagePerMonth).toBe(480) // 1 month period
      expect(pharmacie?.totalAmount).toBe(320)
      expect(pharmacie?.averagePerMonth).toBe(320)
    })

    it('should handle subcategory reimbursement when reimbursement exceeds category total', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -60,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
          subcategory: 'Médecin',
        }),
        createMockTransaction({
          id: '2',
          amount: -40,
          type: TransactionType.EXPENSE,
          categoryId: 'cat-expense',
          categoryName: 'Santé',
          subcategory: 'Pharmacie',
        }),
        createMockTransaction({
          id: '3',
          amount: 200,
          type: TransactionType.INCOME,
          categoryId: 'cat-reimb',
          categoryName: 'Remboursement',
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Gross: 60 + 40 = 100€, Reimbursement: 200€
      // Category total capped at 0
      // Subcategories:
      //   Médecin: max(0, 60 - 200*0.6) = max(0, 60 - 120) = 0€
      //   Pharmacie: max(0, 40 - 200*0.4) = max(0, 40 - 80) = 0€

      expect(result.expensesByCategory[0].totalAmount).toBe(0)
      expect(result.expensesByCategory[0].subcategories?.[0].totalAmount).toBe(
        0
      )
      expect(result.expensesByCategory[0].subcategories?.[1].totalAmount).toBe(
        0
      )
    })
  })
})

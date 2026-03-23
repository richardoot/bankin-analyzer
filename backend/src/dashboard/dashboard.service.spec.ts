import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Decimal } from 'decimal.js'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionType, AccountType } from '../generated/prisma'

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

  const createMockAccount = (
    overrides: Partial<{
      id: string
      name: string
      type: AccountType
      divisor: number
      isExcludedFromStats: boolean
    }>
  ) => ({
    id: overrides.id ?? 'acc-1',
    userId: mockUserId,
    name: overrides.name ?? 'Compte Courant',
    type: overrides.type ?? AccountType.STANDARD,
    divisor: overrides.divisor ?? 1,
    isExcludedFromBudget: false,
    isExcludedFromStats: overrides.isExcludedFromStats ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const mockPrismaService = {
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
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<DashboardService>(DashboardService)

    vi.clearAllMocks()

    // Default mocks
    mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])
    mockPrismaService.account.findMany.mockResolvedValue([])
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

    it('should divide amounts by divisor for joint accounts (using Account model)', async () => {
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

      const result = await service.getSummary(mockUserId, {})

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

      // Category stays at 0 (capped) but monthly netExpenses can be negative
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 0 },
      ])
      // Monthly data shows negative netExpenses (reimbursement > expense)
      expect(result.monthlyData[0].netExpenses).toBe(-100)
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

    it('should deduct reimbursements from the month they occurred', async () => {
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

      // Jan: expenses = 100, reimbursement = 100 in same month, netExpenses = 0
      // Feb: expenses = 300, no reimbursement, netExpenses = 300
      expect(result.monthlyData[0].expenses).toBe(100)
      expect(result.monthlyData[0].netExpenses).toBe(0)
      expect(result.monthlyData[1].expenses).toBe(300)
      expect(result.monthlyData[1].netExpenses).toBe(300)

      // Total should be sum of netExpenses
      expect(result.totalExpenses).toBe(300)
    })

    it('should have consistent totals between monthly and category data when reimbursement is in different month', async () => {
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
          amount: 50,
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

      // Jan: expense = 100, no reimbursement -> netExpenses = 100
      // Feb: no expense, reimbursement = 50 -> netExpenses = -50
      // Monthly sum: 100 + (-50) = 50

      // Category total should match totalExpenses
      const categoryTotal = result.expensesByCategory.reduce(
        (sum, cat) => sum + cat.amount,
        0
      )
      expect(categoryTotal).toBe(result.totalExpenses)
      expect(result.totalExpenses).toBe(50)

      // Monthly data now shows negative values when reimbursements exceed expenses
      expect(result.monthlyData[0].netExpenses).toBe(100) // Jan: expense only
      expect(result.monthlyData[1].netExpenses).toBe(-50) // Feb: reimbursement only
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

    it('should exclude transactions from accounts marked as excludedFromStats', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -200,
          account: 'Compte Investissement',
          categoryName: 'Investissement',
        }),
        createMockTransaction({
          id: '2',
          amount: -100,
          account: 'Compte Courant',
          categoryName: 'Alimentation',
        }),
      ]

      const accounts = [
        createMockAccount({
          name: 'Compte Investissement',
          isExcludedFromStats: true,
        }),
        createMockAccount({
          name: 'Compte Courant',
          isExcludedFromStats: false,
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue(accounts)

      const result = await service.getSummary(mockUserId, {})

      // Should only include Alimentation, not Investissement
      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
    })
  })

  describe('Joint accounts with divisors - comprehensive tests', () => {
    it('should divide income by divisor for joint accounts', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: 3000,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Salaire',
        }),
        createMockTransaction({
          id: '2',
          amount: 2000,
          type: TransactionType.INCOME,
          account: 'Compte Courant',
          categoryName: 'Prime',
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

      const result = await service.getSummary(mockUserId, {})

      // Salaire: 3000/2 = 1500, Prime: 2000/1 = 2000
      expect(result.incomeByCategory).toContainEqual({
        category: 'Salaire',
        amount: 1500,
      })
      expect(result.incomeByCategory).toContainEqual({
        category: 'Prime',
        amount: 2000,
      })
      expect(result.totalIncome).toBe(3500)
    })

    it('should apply divisor to monthly data for expenses and income', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-15'),
          amount: -400,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Loyer',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-20'),
          amount: 4000,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Salaire',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-01-25'),
          amount: -100,
          type: TransactionType.EXPENSE,
          account: 'Compte Courant',
          categoryName: 'Alimentation',
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

      const result = await service.getSummary(mockUserId, {})

      // Jan: expenses = 400/2 + 100 = 300, income = 4000/2 = 2000
      expect(result.monthlyData).toHaveLength(1)
      expect(result.monthlyData[0].expenses).toBe(300)
      expect(result.monthlyData[0].income).toBe(2000)
    })

    it('should apply different divisors for multiple joint accounts', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -300,
          account: 'Compte Joint 50/50',
          categoryName: 'Loyer',
        }),
        createMockTransaction({
          id: '2',
          amount: -300,
          account: 'Compte Joint 70/30',
          categoryName: 'Electricité',
        }),
        createMockTransaction({
          id: '3',
          amount: -100,
          account: 'Compte Courant',
          categoryName: 'Alimentation',
        }),
      ]

      const accounts = [
        createMockAccount({
          name: 'Compte Joint 50/50',
          type: AccountType.JOINT,
          divisor: 2,
        }),
        createMockAccount({
          name: 'Compte Joint 70/30',
          type: AccountType.JOINT,
          divisor: 3, // Custom divisor
        }),
        createMockAccount({
          name: 'Compte Courant',
          type: AccountType.STANDARD,
          divisor: 1,
        }),
      ]

      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue(accounts)

      const result = await service.getSummary(mockUserId, {})

      // Loyer: 300/2 = 150, Electricité: 300/3 = 100, Alimentation: 100/1 = 100
      expect(result.expensesByCategory).toContainEqual({
        category: 'Loyer',
        amount: 150,
      })
      expect(result.expensesByCategory).toContainEqual({
        category: 'Electricité',
        amount: 100,
      })
      expect(result.expensesByCategory).toContainEqual({
        category: 'Alimentation',
        amount: 100,
      })
      expect(result.totalExpenses).toBe(350)
    })

    it('should default to divisor 1 for unknown accounts', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -200,
          account: 'Compte Inconnu',
          categoryName: 'Divers',
        }),
      ]

      // No accounts defined - should default to divisor 1
      mockPrismaService.transaction.findMany.mockResolvedValue(transactions)
      mockPrismaService.account.findMany.mockResolvedValue([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Divers', amount: 200 },
      ])
      expect(result.totalExpenses).toBe(200)
    })
  })

  describe('Category associations with joint accounts', () => {
    it('should divide reimbursements by account divisor and deduct from expenses', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -500,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          amount: 300,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Remboursement Mutuelle',
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
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Santé expense: 500/2 = 250
      // Reimbursement: 300/2 = 150
      // Net expense: 250 - 150 = 100
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
      // Reimbursement should not appear in income
      expect(result.incomeByCategory).toEqual([])
      expect(result.totalIncome).toBe(0)
    })

    it('should handle reimbursements from different accounts with different divisors', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -400,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          amount: 100,
          type: TransactionType.INCOME,
          account: 'Compte Courant', // Reimbursement on personal account
          categoryName: 'Remboursement Mutuelle',
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
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Santé expense: 400/2 = 200
      // Reimbursement: 100/1 = 100 (from personal account)
      // Net expense: 200 - 100 = 100
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
    })

    it('should apply divisors correctly in monthly net expenses with reimbursements', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          date: new Date('2024-01-10'),
          amount: -600,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          date: new Date('2024-01-15'),
          amount: 200,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Remboursement Mutuelle',
        }),
        createMockTransaction({
          id: '3',
          date: new Date('2024-02-10'),
          amount: -400,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
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
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Jan: expense = 600/2 = 300, reimbursement = 200/2 = 100, netExpense = 200
      // Feb: expense = 400/2 = 200, reimbursement = 0, netExpense = 200
      expect(result.monthlyData).toHaveLength(2)
      expect(result.monthlyData[0].expenses).toBe(300)
      expect(result.monthlyData[0].netExpenses).toBe(200)
      expect(result.monthlyData[1].expenses).toBe(200)
      expect(result.monthlyData[1].netExpenses).toBe(200)

      // Total net expenses = 200 + 200 = 400
      expect(result.totalExpenses).toBe(400)
    })

    it('should handle mixed expenses and reimbursements from joint and personal accounts', async () => {
      const transactions = [
        // Joint account expense
        createMockTransaction({
          id: '1',
          amount: -1000,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
        }),
        // Personal account expense (same category)
        createMockTransaction({
          id: '2',
          amount: -200,
          type: TransactionType.EXPENSE,
          account: 'Compte Courant',
          categoryName: 'Santé',
        }),
        // Reimbursement on joint account
        createMockTransaction({
          id: '3',
          amount: 400,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Remboursement Mutuelle',
        }),
        // Reimbursement on personal account
        createMockTransaction({
          id: '4',
          amount: 100,
          type: TransactionType.INCOME,
          account: 'Compte Courant',
          categoryName: 'Remboursement Mutuelle',
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
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Total Santé expenses: 1000/2 + 200/1 = 500 + 200 = 700
      // Total reimbursements: 400/2 + 100/1 = 200 + 100 = 300
      // Net Santé expense: 700 - 300 = 400
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 400 },
      ])
      expect(result.totalExpenses).toBe(400)
    })

    it('should not count associated income as regular income when from joint account', async () => {
      const transactions = [
        createMockTransaction({
          id: '1',
          amount: -200,
          type: TransactionType.EXPENSE,
          account: 'Compte Joint',
          categoryName: 'Santé',
        }),
        createMockTransaction({
          id: '2',
          amount: 100,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Remboursement Mutuelle',
        }),
        createMockTransaction({
          id: '3',
          amount: 3000,
          type: TransactionType.INCOME,
          account: 'Compte Joint',
          categoryName: 'Salaire',
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
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Only Salaire should appear in income (3000/2 = 1500)
      // Remboursement Mutuelle should NOT appear (it's associated with expense)
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 1500 },
      ])
      expect(result.totalIncome).toBe(1500)

      // Santé: 200/2 - 100/2 = 100 - 50 = 50
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 50 },
      ])
    })
  })
})

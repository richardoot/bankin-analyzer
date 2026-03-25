import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'

describe('DashboardService', () => {
  let service: DashboardService

  const mockUserId = 'user-123'

  const createRow = (
    overrides: Partial<{
      month_key: string
      category_name: string
      type: string
      total_amount: number
    }> = {}
  ) => ({
    month_key: overrides.month_key ?? '2024-01',
    category_name: overrides.category_name ?? 'Alimentation',
    type: overrides.type ?? 'EXPENSE',
    total_amount: overrides.total_amount ?? 100,
  })

  const mockPrismaService = {
    $queryRaw: vi.fn(),
    categoryAssociation: {
      findMany: vi.fn(),
    },
  }

  /** Setup mocks for the two $queryRaw calls: aggregation rows + account rows */
  function setupMocks(
    rows: ReturnType<typeof createRow>[],
    accounts: string[] = ['Compte Courant']
  ) {
    mockPrismaService.$queryRaw
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(accounts.map(account => ({ account })))
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
  })

  describe('getSummary', () => {
    it('should return empty data when no transactions', async () => {
      setupMocks([], [])

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
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 50,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 2500,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 200,
        }),
      ])

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
      setupMocks([
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Loyer',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 50,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Loyer', amount: 500 },
        { category: 'Alimentation', amount: 100 },
        { category: 'Transport', amount: 50 },
      ])
    })

    it('should divide amounts by divisor for joint accounts (using Account model)', async () => {
      // SQL already applies divisors: Loyer 200/2=100, Alimentation 100/1=100
      setupMocks(
        [
          createRow({
            category_name: 'Loyer',
            type: 'EXPENSE',
            total_amount: 100, // 200/2
          }),
          createRow({
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 100,
          }),
        ],
        ['Compte Joint', 'Compte Courant']
      )

      const result = await service.getSummary(mockUserId, {})

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
      setupMocks([
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Loisirs',
          type: 'EXPENSE',
          total_amount: 500,
        }),
      ])

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
      setupMocks([
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 2500,
        }),
        createRow({
          category_name: 'Prime',
          type: 'INCOME',
          total_amount: 1000,
        }),
      ])

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
      setupMocks([
        createRow({
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          category_name: 'Remboursement Mutuelle',
          type: 'INCOME',
          total_amount: 200,
        }),
      ])

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
      setupMocks([
        createRow({
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Remboursement Mutuelle',
          type: 'INCOME',
          total_amount: 200,
        }),
      ])

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
      setupMocks([createRow()], ['Compte Courant', 'Compte Joint', 'Livret A'])

      const result = await service.getSummary(mockUserId, {})

      expect(result.availableAccounts).toEqual([
        'Compte Courant',
        'Compte Joint',
        'Livret A',
      ])
    })

    it('should handle transactions without category (default to Autre)', async () => {
      setupMocks([
        createRow({
          category_name: 'Autre',
          type: 'EXPENSE',
          total_amount: 100,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Autre', amount: 100 },
      ])
      expect(result.allExpenseCategories).toContain('Autre')
    })

    it('should format month labels correctly', async () => {
      setupMocks([
        createRow({ month_key: '2024-01', total_amount: 100 }),
        createRow({ month_key: '2024-06', total_amount: 100 }),
        createRow({ month_key: '2024-12', total_amount: 100 }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData.map(m => m.label)).toEqual([
        'Jan 2024',
        'Juin 2024',
        'Déc 2024',
      ])
    })

    it('should sort months chronologically', async () => {
      setupMocks([
        createRow({ month_key: '2024-03', total_amount: 100 }),
        createRow({ month_key: '2024-01', total_amount: 100 }),
        createRow({ month_key: '2024-02', total_amount: 100 }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData.map(m => m.month)).toEqual([
        '2024-01',
        '2024-02',
        '2024-03',
      ])
    })

    it('should deduct reimbursements from the month they occurred', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 100,
        }),
      ])

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

      // Total should be sum of category amounts after deduction
      expect(result.totalExpenses).toBe(300)
    })

    it('should have consistent totals between monthly and category data when reimbursement is in different month', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 50,
        }),
      ])

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

      // Category total should match totalExpenses
      const categoryTotal = result.expensesByCategory.reduce(
        (sum, cat) => sum + cat.amount,
        0
      )
      expect(categoryTotal).toBe(result.totalExpenses)
      expect(result.totalExpenses).toBe(50)

      // Monthly data shows reimbursement in different month
      expect(result.monthlyData[0].netExpenses).toBe(100) // Jan: expense only
      expect(result.monthlyData[1].netExpenses).toBe(-50) // Feb: reimbursement only
    })

    it('should round amounts to 2 decimal places', async () => {
      // SQL returns pre-aggregated amounts, but rounding still applies
      setupMocks([
        createRow({
          category_name: 'Test',
          type: 'EXPENSE',
          total_amount: 33.333,
        }),
        createRow({
          category_name: 'Test',
          type: 'EXPENSE',
          total_amount: 66.667,
          month_key: '2024-02',
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.totalExpenses).toBe(100)
      expect(result.expensesByCategory[0].amount).toBe(100)
    })

    it('should exclude transactions from accounts marked as excludedFromStats', async () => {
      // SQL already filters excluded accounts, so only non-excluded rows returned
      setupMocks(
        [
          createRow({
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 100,
          }),
        ],
        ['Compte Investissement', 'Compte Courant']
      )

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
      // SQL already applies divisors: Salaire 3000/2=1500, Prime 2000/1=2000
      setupMocks(
        [
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 1500, // 3000/2
          }),
          createRow({
            category_name: 'Prime',
            type: 'INCOME',
            total_amount: 2000,
          }),
        ],
        ['Compte Joint', 'Compte Courant']
      )

      const result = await service.getSummary(mockUserId, {})

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
      // SQL already applies divisors:
      // Loyer: 400/2=200, Alimentation: 100/1=100, Salaire: 4000/2=2000
      setupMocks(
        [
          createRow({
            month_key: '2024-01',
            category_name: 'Loyer',
            type: 'EXPENSE',
            total_amount: 200, // 400/2
          }),
          createRow({
            month_key: '2024-01',
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 2000, // 4000/2
          }),
          createRow({
            month_key: '2024-01',
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 100,
          }),
        ],
        ['Compte Joint', 'Compte Courant']
      )

      const result = await service.getSummary(mockUserId, {})

      // Jan: expenses = 200 + 100 = 300, income = 2000
      expect(result.monthlyData).toHaveLength(1)
      expect(result.monthlyData[0].expenses).toBe(300)
      expect(result.monthlyData[0].income).toBe(2000)
    })

    it('should apply different divisors for multiple joint accounts', async () => {
      // SQL already applies divisors:
      // Loyer: 300/2=150, Electricité: 300/3=100, Alimentation: 100/1=100
      setupMocks(
        [
          createRow({
            category_name: 'Loyer',
            type: 'EXPENSE',
            total_amount: 150, // 300/2
          }),
          createRow({
            category_name: 'Electricité',
            type: 'EXPENSE',
            total_amount: 100, // 300/3
          }),
          createRow({
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 100,
          }),
        ],
        ['Compte Joint 50/50', 'Compte Joint 70/30', 'Compte Courant']
      )

      const result = await service.getSummary(mockUserId, {})

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
      // SQL defaults to COALESCE(a.divisor, 1) for unknown accounts
      setupMocks(
        [
          createRow({
            category_name: 'Divers',
            type: 'EXPENSE',
            total_amount: 200,
          }),
        ],
        ['Compte Inconnu']
      )

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        { category: 'Divers', amount: 200 },
      ])
      expect(result.totalExpenses).toBe(200)
    })
  })

  describe('Category associations with joint accounts', () => {
    it('should divide reimbursements by account divisor and deduct from expenses', async () => {
      // SQL already applies divisors: Santé 500/2=250, Reimb 300/2=150
      setupMocks(
        [
          createRow({
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 250, // 500/2
          }),
          createRow({
            category_name: 'Remboursement Mutuelle',
            type: 'INCOME',
            total_amount: 150, // 300/2
          }),
        ],
        ['Compte Joint']
      )

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

      // Santé: 250 - 150 = 100
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
      expect(result.incomeByCategory).toEqual([])
      expect(result.totalIncome).toBe(0)
    })

    it('should handle reimbursements from different accounts with different divisors', async () => {
      // SQL already applies divisors: Santé 400/2=200, Reimb 100/1=100
      setupMocks(
        [
          createRow({
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 200, // 400/2
          }),
          createRow({
            category_name: 'Remboursement Mutuelle',
            type: 'INCOME',
            total_amount: 100, // 100/1
          }),
        ],
        ['Compte Joint', 'Compte Courant']
      )

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

      // Santé: 200 - 100 = 100
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 100 },
      ])
      expect(result.totalExpenses).toBe(100)
    })

    it('should apply divisors correctly in monthly net expenses with reimbursements', async () => {
      // SQL already applies divisors:
      // Jan: Santé expense 600/2=300, Reimb 200/2=100
      // Feb: Santé expense 400/2=200
      setupMocks(
        [
          createRow({
            month_key: '2024-01',
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 300, // 600/2
          }),
          createRow({
            month_key: '2024-01',
            category_name: 'Remboursement Mutuelle',
            type: 'INCOME',
            total_amount: 100, // 200/2
          }),
          createRow({
            month_key: '2024-02',
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 200, // 400/2
          }),
        ],
        ['Compte Joint']
      )

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

      // Jan: expense = 300, reimbursement = 100, netExpense = 200
      // Feb: expense = 200, reimbursement = 0, netExpense = 200
      expect(result.monthlyData).toHaveLength(2)
      expect(result.monthlyData[0].expenses).toBe(300)
      expect(result.monthlyData[0].netExpenses).toBe(200)
      expect(result.monthlyData[1].expenses).toBe(200)
      expect(result.monthlyData[1].netExpenses).toBe(200)

      // Total net expenses = category total after deduction: 500 - 100 = 400
      expect(result.totalExpenses).toBe(400)
    })

    it('should handle mixed expenses and reimbursements from joint and personal accounts', async () => {
      // SQL already applies divisors:
      // Santé expenses: 1000/2 + 200/1 = 500 + 200 = 700
      // Reimb: 400/2 + 100/1 = 200 + 100 = 300
      setupMocks(
        [
          createRow({
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 700, // (1000/2) + (200/1)
          }),
          createRow({
            category_name: 'Remboursement Mutuelle',
            type: 'INCOME',
            total_amount: 300, // (400/2) + (100/1)
          }),
        ],
        ['Compte Joint', 'Compte Courant']
      )

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

      // Santé: 700 - 300 = 400
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 400 },
      ])
      expect(result.totalExpenses).toBe(400)
    })

    it('should not count associated income as regular income when from joint account', async () => {
      // SQL already applies divisors:
      // Santé: 200/2=100, Reimb: 100/2=50, Salaire: 3000/2=1500
      setupMocks(
        [
          createRow({
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 100, // 200/2
          }),
          createRow({
            category_name: 'Remboursement Mutuelle',
            type: 'INCOME',
            total_amount: 50, // 100/2
          }),
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 1500, // 3000/2
          }),
        ],
        ['Compte Joint']
      )

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

      // Only Salaire should appear in income
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 1500 },
      ])
      expect(result.totalIncome).toBe(1500)

      // Santé: 100 - 50 = 50
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 50 },
      ])
    })
  })

  describe('Additional scenarios', () => {
    it('should handle many categories across multiple months', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 400,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 150,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 350,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Loisirs',
          type: 'EXPENSE',
          total_amount: 200,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          month_key: '2024-03',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          month_key: '2024-03',
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          month_key: '2024-03',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3200,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      // Monthly totals
      expect(result.monthlyData).toHaveLength(3)
      expect(result.monthlyData[0].expenses).toBe(550)
      expect(result.monthlyData[0].income).toBe(3000)
      expect(result.monthlyData[1].expenses).toBe(550)
      expect(result.monthlyData[1].income).toBe(3000)
      expect(result.monthlyData[2].expenses).toBe(600)
      expect(result.monthlyData[2].income).toBe(3200)

      // Category totals (sorted desc)
      expect(result.expensesByCategory[0]).toEqual({
        category: 'Alimentation',
        amount: 1250,
      })
      expect(result.totalExpenses).toBe(1700)
      expect(result.totalIncome).toBe(9200)

      // All categories tracked
      expect(result.allExpenseCategories).toEqual([
        'Alimentation',
        'Loisirs',
        'Transport',
      ])
      expect(result.allIncomeCategories).toEqual(['Salaire'])
    })

    it('should hide multiple expense categories while keeping them in allExpenseCategories', async () => {
      setupMocks([
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          category_name: 'Loisirs',
          type: 'EXPENSE',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Loyer',
          type: 'EXPENSE',
          total_amount: 800,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        hiddenExpenseCategories: ['Loisirs', 'Transport'],
      })

      // Only non-hidden categories in aggregations
      expect(result.expensesByCategory).toEqual([
        { category: 'Loyer', amount: 800 },
        { category: 'Alimentation', amount: 300 },
      ])
      expect(result.totalExpenses).toBe(1100)

      // All categories still listed for filter panel
      expect(result.allExpenseCategories).toEqual(
        expect.arrayContaining([
          'Alimentation',
          'Loisirs',
          'Transport',
          'Loyer',
        ])
      )
    })

    it('should hide expense and income categories simultaneously', async () => {
      setupMocks([
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          category_name: 'Loisirs',
          type: 'EXPENSE',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          category_name: 'Prime',
          type: 'INCOME',
          total_amount: 500,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        hiddenExpenseCategories: ['Loisirs'],
        hiddenIncomeCategories: ['Prime'],
      })

      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 300 },
      ])
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 3000 },
      ])
      expect(result.totalExpenses).toBe(300)
      expect(result.totalIncome).toBe(3000)

      // Hidden categories still in allCategories
      expect(result.allExpenseCategories).toContain('Loisirs')
      expect(result.allIncomeCategories).toContain('Prime')
    })

    it('should not include reimbursement categories in allIncomeCategories exclusion', async () => {
      // Reimbursement categories should still appear in allIncomeCategories
      setupMocks([
        createRow({
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
      ])

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

      // Remboursement appears in allIncomeCategories but not in incomeByCategory
      expect(result.allIncomeCategories).toContain('Remboursement')
      expect(result.allIncomeCategories).toContain('Salaire')
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 3000 },
      ])
    })

    it('should handle only income transactions with no expenses', async () => {
      setupMocks([
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          category_name: 'Freelance',
          type: 'INCOME',
          total_amount: 1000,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([])
      expect(result.totalExpenses).toBe(0)
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 3000 },
        { category: 'Freelance', amount: 1000 },
      ])
      expect(result.totalIncome).toBe(4000)
      expect(result.monthlyData[0].expenses).toBe(0)
      expect(result.monthlyData[0].income).toBe(4000)
    })

    it('should handle only expense transactions with no income', async () => {
      setupMocks([
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 300,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.incomeByCategory).toEqual([])
      expect(result.totalIncome).toBe(0)
      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 300 },
      ])
      expect(result.totalExpenses).toBe(300)
    })

    it('should handle multiple reimbursement associations independently', async () => {
      setupMocks([
        createRow({
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 800,
        }),
        createRow({
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          category_name: 'Remb. Mutuelle',
          type: 'INCOME',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Remb. Transport',
          type: 'INCOME',
          total_amount: 50,
        }),
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
      ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-1',
          incomeCategoryId: 'cat-2',
          expenseCategory: { name: 'Santé' },
          incomeCategory: { name: 'Remb. Mutuelle' },
        },
        {
          id: 'assoc-2',
          userId: mockUserId,
          expenseCategoryId: 'cat-3',
          incomeCategoryId: 'cat-4',
          expenseCategory: { name: 'Transport' },
          incomeCategory: { name: 'Remb. Transport' },
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      // Santé: 800 - 200 = 600, Transport: 300 - 50 = 250
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 600 },
        { category: 'Transport', amount: 250 },
      ])
      expect(result.totalExpenses).toBe(850)

      // Only Salaire in income (reimbursements excluded)
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 3000 },
      ])
      expect(result.totalIncome).toBe(3000)
    })

    it('should handle reimbursement for a category that has no expenses', async () => {
      // Edge case: reimbursement income exists but no corresponding expense in the period
      setupMocks([
        createRow({
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
      ])

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

      // Santé appears with 0 amount (reimbursement deduction creates the entry)
      expect(result.expensesByCategory).toEqual([
        { category: 'Santé', amount: 0 },
      ])
      expect(result.totalExpenses).toBe(0)
      // Reimbursement still excluded from income
      expect(result.incomeByCategory).toEqual([
        { category: 'Salaire', amount: 3000 },
      ])
    })

    it('should handle same category appearing in different months correctly', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          month_key: '2024-02',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 400,
        }),
        createRow({
          month_key: '2024-03',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 350,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      // Category total should sum across months
      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 1050 },
      ])
      // Each month should have its own value
      expect(result.monthlyData[0].expenses).toBe(300)
      expect(result.monthlyData[1].expenses).toBe(400)
      expect(result.monthlyData[2].expenses).toBe(350)
    })

    it('should handle netExpenses correctly with no reimbursement association', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          month_key: '2024-01',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      // netExpenses should equal expenses when there are no reimbursements
      expect(result.monthlyData[0].expenses).toBe(500)
      expect(result.monthlyData[0].netExpenses).toBe(500)
      expect(result.monthlyData[0].income).toBe(3000)
    })

    it('should handle excluded accounts still appearing in availableAccounts', async () => {
      // Aggregation query excludes stats-excluded accounts
      // But accounts query returns all accounts
      setupMocks(
        [
          createRow({
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 100,
          }),
        ],
        ['Compte Courant', 'Compte Investissement', 'Livret A']
      )

      const result = await service.getSummary(mockUserId, {})

      // All accounts visible including excluded ones
      expect(result.availableAccounts).toEqual([
        'Compte Courant',
        'Compte Investissement',
        'Livret A',
      ])
      // But only non-excluded data in aggregations
      expect(result.expensesByCategory).toEqual([
        { category: 'Alimentation', amount: 100 },
      ])
    })

    it('should sort allExpenseCategories and allIncomeCategories alphabetically', async () => {
      setupMocks([
        createRow({
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 200,
        }),
        createRow({
          category_name: 'Loyer',
          type: 'EXPENSE',
          total_amount: 800,
        }),
        createRow({
          category_name: 'Prime',
          type: 'INCOME',
          total_amount: 500,
        }),
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          category_name: 'Freelance',
          type: 'INCOME',
          total_amount: 1000,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.allExpenseCategories).toEqual([
        'Alimentation',
        'Loyer',
        'Transport',
      ])
      expect(result.allIncomeCategories).toEqual([
        'Freelance',
        'Prime',
        'Salaire',
      ])
    })
  })
})

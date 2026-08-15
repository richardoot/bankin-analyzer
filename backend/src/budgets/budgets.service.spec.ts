import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BudgetsService } from './budgets.service'
import { PrismaService } from '../prisma/prisma.service'

describe('BudgetsService', () => {
  let service: BudgetsService

  const mockUserId = 'user-123'

  const createRow = (
    overrides: Partial<{
      category_id: string
      category_name: string
      category_icon: string | null
      type: string
      subcategory: string
      is_exceptional: boolean
      transaction_count: number
      total_amount: number
    }>
  ) => ({
    category_id: overrides.category_id ?? 'cat-1',
    category_name: overrides.category_name ?? 'Santé',
    category_icon: overrides.category_icon ?? null,
    type: overrides.type ?? 'EXPENSE',
    subcategory: overrides.subcategory ?? '',
    is_exceptional: overrides.is_exceptional ?? false,
    transaction_count: overrides.transaction_count ?? 1,
    total_amount: overrides.total_amount ?? 100,
  })

  const mockPrismaService = {
    $queryRaw: vi.fn(),
    categoryAssociation: {
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
    mockPrismaService.$queryRaw.mockResolvedValue([])
  })

  describe('getStatistics', () => {
    it('should calculate average per month correctly', async () => {
      // 3 months period: Jan, Feb, Mar 2024
      // 3 transactions totaling 600€ in one category
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Santé',
          type: 'EXPENSE',
          transaction_count: 3,
          total_amount: 600,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      // Total: 600, Period: 3 months, Average: 200
      expect(result.periodMonths).toBe(3)
      expect(result.expensesByCategory[0].totalAmount).toBe(600)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(200)
    })

    it('should deduct reimbursements from category average', async () => {
      // 2 months period with expense and reimbursement
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          transaction_count: 2,
          total_amount: 800,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement Mutuelle',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 200,
        }),
      ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: {
            id: 'cat-reimb',
            name: 'Remboursement Mutuelle',
          },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
      })

      // Total expenses: 800, Reimbursements: 200, Net: 600
      // Period: 2 months, Average: 300
      expect(result.periodMonths).toBe(2)
      expect(result.expensesByCategory[0].totalAmount).toBe(600)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(300)
    })

    it('should exclude budget-excluded categories at the SQL level', async () => {
      // The exclusion is a WHERE clause, so we assert the generated aggregate
      // query carries it (the mock cannot execute the filter itself).
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeMonthlyBreakdown: true,
      })

      const queries = mockPrismaService.$queryRaw.mock.calls.map(
        ([sql]: [{ strings: string[] }]) => sql.strings.join('')
      )
      // Both the aggregate and the monthly-breakdown queries join categories
      // and must filter out excluded ones.
      const categoryJoinQueries = queries.filter((q: string) =>
        q.includes('JOIN app.categories c')
      )
      expect(categoryJoinQueries.length).toBeGreaterThanOrEqual(2)
      for (const q of categoryJoinQueries) {
        expect(q).toContain('c.is_excluded_from_budget = false')
      }
    })

    it('should apply account divisor to expenses and reimbursements', async () => {
      // SQL already applies divisor: expense 400/2=200, reimbursement 200/2=100
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          transaction_count: 1,
          total_amount: 200, // 400 / divisor 2
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 100, // 200 / divisor 2
        }),
      ])

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

      // Expense: 200 (after divisor), Reimbursement: 100 (after divisor)
      // Net: 200 - 100 = 100, Period: 1 month, Average: 100
      expect(result.periodMonths).toBe(1)
      expect(result.expensesByCategory[0].totalAmount).toBe(100)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(100)
    })

    it('should handle reimbursement greater than expenses (cap at 0)', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          transaction_count: 1,
          total_amount: 100,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 300,
        }),
      ])

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

      // Expense: 100, Reimbursement: 300
      // Net: max(0, 100 - 300) = 0
      expect(result.expensesByCategory[0].totalAmount).toBe(0)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(0)
    })

    it('should exclude accounts marked as excludedFromBudget', async () => {
      // SQL already filters excluded accounts, so only non-excluded rows are returned
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-2',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          transaction_count: 1,
          total_amount: 100,
        }),
      ])

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
      // SQL aggregates and applies divisors:
      // Joint expense 600/2=300 + Personal expense 400/1=400 = 700 total
      // Personal reimbursement 200/1=200
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          transaction_count: 2,
          total_amount: 700, // (600/2) + (400/1)
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 200,
        }),
      ])

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

      // Total: 700, Reimbursement: 200, Net: 500
      // Period: 2 months, Average: 250
      expect(result.periodMonths).toBe(2)
      expect(result.expensesByCategory[0].totalAmount).toBe(500)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(250)
    })

    it('should distribute reimbursements proportionally to subcategories', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Médecin',
          transaction_count: 1,
          total_amount: 600,
        }),
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Pharmacie',
          transaction_count: 1,
          total_amount: 400,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement Mutuelle',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 200,
        }),
      ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Santé' },
          incomeCategory: {
            id: 'cat-reimb',
            name: 'Remboursement Mutuelle',
          },
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
      // Category total: 1000 - 200 = 800€

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
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Médecin',
          transaction_count: 1,
          total_amount: 60,
        }),
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Pharmacie',
          transaction_count: 1,
          total_amount: 40,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 200,
        }),
      ])

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

    it('should return empty arrays when no transactions exist', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      expect(result.periodMonths).toBe(3)
      expect(result.expensesByCategory).toEqual([])
      expect(result.incomeByCategory).toEqual([])
      expect(result.totalExpenses).toBe(0)
      expect(result.totalIncome).toBe(0)
      expect(result.averageMonthlyExpenses).toBe(0)
      expect(result.averageMonthlyIncome).toBe(0)
    })

    it('should sort expense categories by totalAmount descending', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 200,
        }),
        createRow({
          category_id: 'cat-2',
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          category_id: 'cat-3',
          category_name: 'Loisirs',
          type: 'EXPENSE',
          total_amount: 100,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.expensesByCategory).toHaveLength(3)
      expect(result.expensesByCategory[0].categoryName).toBe('Transport')
      expect(result.expensesByCategory[1].categoryName).toBe('Alimentation')
      expect(result.expensesByCategory[2].categoryName).toBe('Loisirs')
    })

    it('should separate income and expenses correctly', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          transaction_count: 5,
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-income',
          category_name: 'Salaire',
          type: 'INCOME',
          transaction_count: 1,
          total_amount: 2500,
        }),
        createRow({
          category_id: 'cat-income-2',
          category_name: 'Freelance',
          type: 'INCOME',
          transaction_count: 2,
          total_amount: 800,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.expensesByCategory).toHaveLength(1)
      expect(result.incomeByCategory).toHaveLength(2)
      expect(result.totalExpenses).toBe(300)
      expect(result.totalIncome).toBe(3300)
      expect(result.averageMonthlyExpenses).toBe(300)
      expect(result.averageMonthlyIncome).toBe(3300)
    })

    it('should calculate periodMonths correctly for 12 months', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 1200 }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      })

      expect(result.periodMonths).toBe(12)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(100)
    })

    it('should handle same month start and end (period = 1)', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 500 }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      })

      expect(result.periodMonths).toBe(1)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(500)
    })

    it('should round amounts to 2 decimal places', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          total_amount: 100,
          transaction_count: 3,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      // 100 / 3 = 33.333... → rounded to 33.33
      expect(result.expensesByCategory[0].averagePerMonth).toBe(33.33)
    })

    it('should handle multiple reimbursement associations independently', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-sante',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 1000,
        }),
        createRow({
          category_id: 'cat-transport',
          category_name: 'Transport',
          type: 'EXPENSE',
          total_amount: 400,
        }),
        createRow({
          category_id: 'cat-reimb-sante',
          category_name: 'Remb. Mutuelle',
          type: 'INCOME',
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-reimb-transport',
          category_name: 'Remb. Transport',
          type: 'INCOME',
          total_amount: 100,
        }),
      ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-sante',
          incomeCategoryId: 'cat-reimb-sante',
          expenseCategory: { id: 'cat-sante', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb-sante', name: 'Remb. Mutuelle' },
        },
        {
          id: 'assoc-2',
          userId: mockUserId,
          expenseCategoryId: 'cat-transport',
          incomeCategoryId: 'cat-reimb-transport',
          expenseCategory: { id: 'cat-transport', name: 'Transport' },
          incomeCategory: {
            id: 'cat-reimb-transport',
            name: 'Remb. Transport',
          },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Santé: 1000 - 300 = 700
      // Transport: 400 - 100 = 300
      expect(result.expensesByCategory).toHaveLength(2)
      const sante = result.expensesByCategory.find(
        c => c.categoryName === 'Santé'
      )
      const transport = result.expensesByCategory.find(
        c => c.categoryName === 'Transport'
      )
      expect(sante?.totalAmount).toBe(700)
      expect(transport?.totalAmount).toBe(300)
      // Reimbursement income should NOT appear in incomeByCategory
      expect(result.incomeByCategory).toHaveLength(0)
      // totalExpenses should reflect deductions
      expect(result.totalExpenses).toBe(1000)
    })

    it('should not deduct reimbursement from unassociated income', async () => {
      // Income category that is NOT a reimbursement association
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 500,
        }),
        createRow({
          category_id: 'cat-salary',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // No reimbursement association → expenses untouched
      expect(result.expensesByCategory[0].totalAmount).toBe(500)
      // Salary should appear in income
      expect(result.incomeByCategory).toHaveLength(1)
      expect(result.incomeByCategory[0].categoryName).toBe('Salaire')
      expect(result.totalIncome).toBe(3000)
    })

    it('should aggregate transaction counts across subcategories for a category', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Médecin',
          transaction_count: 3,
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-1',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Pharmacie',
          transaction_count: 7,
          total_amount: 200,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // Category total count = 3 + 7 = 10
      expect(result.expensesByCategory[0].transactionCount).toBe(10)
      expect(result.expensesByCategory[0].totalAmount).toBe(500)
      expect(result.expensesByCategory[0].subcategories).toHaveLength(2)
      expect(
        result.expensesByCategory[0].subcategories?.find(
          s => s.subcategory === 'Médecin'
        )?.transactionCount
      ).toBe(3)
      expect(
        result.expensesByCategory[0].subcategories?.find(
          s => s.subcategory === 'Pharmacie'
        )?.transactionCount
      ).toBe(7)
    })

    it('should include empty subcategory alongside named subcategories', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: '',
          transaction_count: 2,
          total_amount: 150,
        }),
        createRow({
          category_id: 'cat-1',
          category_name: 'Santé',
          type: 'EXPENSE',
          subcategory: 'Pharmacie',
          transaction_count: 1,
          total_amount: 50,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.expensesByCategory[0].totalAmount).toBe(200)
      expect(result.expensesByCategory[0].subcategories).toHaveLength(2)

      const noSubcat = result.expensesByCategory[0].subcategories?.find(
        s => s.subcategory === ''
      )
      const pharmacie = result.expensesByCategory[0].subcategories?.find(
        s => s.subcategory === 'Pharmacie'
      )
      expect(noSubcat?.totalAmount).toBe(150)
      expect(pharmacie?.totalAmount).toBe(50)
    })

    it('should sort income categories by totalAmount descending', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Freelance',
          type: 'INCOME',
          total_amount: 500,
        }),
        createRow({
          category_id: 'cat-2',
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 3000,
        }),
        createRow({
          category_id: 'cat-3',
          category_name: 'Dividendes',
          type: 'INCOME',
          total_amount: 100,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-06-30',
      })

      expect(result.incomeByCategory).toHaveLength(3)
      expect(result.incomeByCategory[0].categoryName).toBe('Salaire')
      expect(result.incomeByCategory[1].categoryName).toBe('Freelance')
      expect(result.incomeByCategory[2].categoryName).toBe('Dividendes')
      // Verify averages over 6 months
      expect(result.incomeByCategory[0].averagePerMonth).toBe(500)
      expect(result.incomeByCategory[1].averagePerMonth).toBe(83.33)
    })

    it('should handle income subcategories correctly', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-income',
          category_name: 'Freelance',
          type: 'INCOME',
          subcategory: 'Client A',
          transaction_count: 2,
          total_amount: 2000,
        }),
        createRow({
          category_id: 'cat-income',
          category_name: 'Freelance',
          type: 'INCOME',
          subcategory: 'Client B',
          transaction_count: 1,
          total_amount: 500,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.incomeByCategory).toHaveLength(1)
      expect(result.incomeByCategory[0].totalAmount).toBe(2500)
      expect(result.incomeByCategory[0].transactionCount).toBe(3)
      expect(result.incomeByCategory[0].subcategories).toHaveLength(2)
      expect(result.incomeByCategory[0].subcategories?.[0].subcategory).toBe(
        'Client A'
      )
      expect(result.incomeByCategory[0].subcategories?.[1].subcategory).toBe(
        'Client B'
      )
    })

    it('should handle expense category with no subcategory (no subcategories in result)', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          subcategory: '',
          transaction_count: 10,
          total_amount: 800,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-04-30',
      })

      // Single empty subcategory row still produces subcategories array
      expect(result.expensesByCategory[0].totalAmount).toBe(800)
      expect(result.expensesByCategory[0].averagePerMonth).toBe(200)
      expect(result.expensesByCategory[0].transactionCount).toBe(10)
    })

    it('should skip reimbursement deduction when deductReimbursements is false', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 800,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 200,
        }),
      ])

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
        deductReimbursements: false,
      })

      // No deduction — gross expenses preserved
      expect(result.expensesByCategory[0].totalAmount).toBe(800)
      expect(result.totalExpenses).toBe(800)
      // reimbursement field should not be set
      expect(result.expensesByCategory[0].reimbursement).toBeUndefined()
      // Reimbursement income is still excluded from incomeByCategory
      expect(result.incomeByCategory).toHaveLength(0)
    })

    it('should expose reimbursement amount on each category when deducting', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-expense',
          category_name: 'Santé',
          type: 'EXPENSE',
          total_amount: 1000,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement',
          type: 'INCOME',
          total_amount: 300,
        }),
      ])

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

      expect(result.expensesByCategory[0].totalAmount).toBe(700)
      expect(result.expensesByCategory[0].reimbursement).toBe(300)
      expect(result.totalReimbursements).toBe(300)
    })

    it('should deduct pending reimbursements when deductPendingReimbursements is true', async () => {
      // First call: aggregated transactions
      // Second call: pending reimbursements
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 1000,
          }),
        ])
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 400 },
        ])

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
        deductPendingReimbursements: true,
      })

      // Expense 1000, no received reimbursement, pending 400 → net 600
      expect(result.expensesByCategory[0].totalAmount).toBe(600)
      expect(result.expensesByCategory[0].pendingReimbursement).toBe(400)
      expect(result.totalExpenses).toBe(600)
      expect(result.totalPendingReimbursements).toBe(400)
    })

    it('should deduct both received and pending reimbursements', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 1000,
          }),
          createRow({
            category_id: 'cat-reimb',
            category_name: 'Remboursement',
            type: 'INCOME',
            total_amount: 200,
          }),
        ])
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 300 },
        ])

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
        deductPendingReimbursements: true,
      })

      // Expense 1000, received 200, pending 300 → net 500
      expect(result.expensesByCategory[0].totalAmount).toBe(500)
      expect(result.expensesByCategory[0].reimbursement).toBe(200)
      expect(result.expensesByCategory[0].pendingReimbursement).toBe(300)
      expect(result.totalExpenses).toBe(500)
      expect(result.totalReimbursements).toBe(200)
      expect(result.totalPendingReimbursements).toBe(300)
    })

    it('should cap pending reimbursement deduction at remaining expense total', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            category_name: 'Santé',
            type: 'EXPENSE',
            total_amount: 100,
          }),
          createRow({
            category_id: 'cat-reimb',
            category_name: 'Remboursement',
            type: 'INCOME',
            total_amount: 80,
          }),
        ])
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 50 },
        ])

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
        deductPendingReimbursements: true,
      })

      // Expense 100, received 80 → remaining 20, pending 50 → capped at 20 → net 0
      expect(result.expensesByCategory[0].totalAmount).toBe(0)
      expect(result.totalExpenses).toBe(0)
      // totalPendingReimbursements reflects what was actually deducted (20, not 50)
      expect(result.totalPendingReimbursements).toBe(20)
    })

    it('passes the includeAllPendingReimbursements flag through to the SQL', async () => {
      // First call: aggregated transactions (empty for simplicity)
      // Second call: pending query — we capture its strings to assert the
      //              date filter has been removed.
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 50 },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Restaurant' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      await service.getStatistics(mockUserId, {
        startDate: '2026-01-01',
        endDate: '2026-04-30',
        deductPendingReimbursements: true,
        includeAllPendingReimbursements: true,
      })

      // Inspect the second $queryRaw call (the pending query).
      const pendingCall = mockPrismaService.$queryRaw.mock.calls[1]
      const sqlString = pendingCall?.[0]?.strings?.join('') ?? ''
      // When includeAllPending is true, the t.date filter must NOT be added.
      expect(sqlString).not.toMatch(/AND\s+t\.date\s*>=/)
      expect(sqlString).not.toMatch(/AND\s+t\.date\s*<=/)
    })

    it('keeps the date filter on the pending query by default (back-compat)', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      await service.getStatistics(mockUserId, {
        startDate: '2026-01-01',
        endDate: '2026-04-30',
        deductPendingReimbursements: true,
        // includeAllPendingReimbursements not set
      })

      const pendingCall = mockPrismaService.$queryRaw.mock.calls[1]
      const sqlString = pendingCall?.[0]?.strings?.join('') ?? ''
      expect(sqlString).toMatch(/AND\s+t\.date\s*>=/)
      expect(sqlString).toMatch(/AND\s+t\.date\s*<=/)
    })

    it('does NOT deduct anything from "received" when there are only pending requests and no income transactions', async () => {
      // The user reported: with only pending reimbursement requests (no income)
      // the "déduire les remboursements reçus" toggle wrongly deducted amounts.
      // This guards against that regression.
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            category_name: 'Restaurant',
            type: 'EXPENSE',
            total_amount: 200,
          }),
          // NO income row at all
        ])
        // Pending query won't run since deductPendingReimbursements is false
        .mockResolvedValueOnce([])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Restaurant' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        deductReimbursements: true,
        deductPendingReimbursements: false,
      })

      expect(result.expensesByCategory[0].totalAmount).toBe(200)
      expect(result.expensesByCategory[0].reimbursement).toBeUndefined()
      expect(result.totalReimbursements).toBeUndefined()
    })

    it('should not run pending query when deductPendingReimbursements is not set', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 500 }),
      ])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      // $queryRaw should be called only once (aggregated transactions)
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('should not include totalReimbursements/totalPendingReimbursements when zero', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 500 }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.totalReimbursements).toBeUndefined()
      expect(result.totalPendingReimbursements).toBeUndefined()
    })

    it('should include monthlyAmounts when includeMonthlyBreakdown is true', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-1',
            category_name: 'Alimentation',
            type: 'EXPENSE',
            total_amount: 300,
          }),
        ])
        // monthly breakdown query
        .mockResolvedValueOnce([
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 100,
          },
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 80,
          },
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-03',
            monthly_amount: 120,
          },
        ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeMonthlyBreakdown: true,
      })

      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([
        100, 80, 120,
      ])
      expect(result.monthLabels).toEqual(['2024-01', '2024-02', '2024-03'])
    })

    it('should not include monthLabels when includeMonthlyBreakdown is false', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 500 }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      expect(result.monthLabels).toBeUndefined()
    })

    it('should return monthLabels covering all months in range including gaps', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([createRow({ total_amount: 100 })])
        .mockResolvedValueOnce([
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 100,
          },
        ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        includeMonthlyBreakdown: true,
      })

      expect(result.monthLabels).toEqual([
        '2024-01',
        '2024-02',
        '2024-03',
        '2024-04',
        '2024-05',
        '2024-06',
      ])
    })

    it('should fill missing months with 0 in monthlyAmounts', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-1',
            type: 'EXPENSE',
            total_amount: 200,
          }),
        ])
        .mockResolvedValueOnce([
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 200,
          },
          // February missing — should be 0
          // March missing — should be 0
        ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeMonthlyBreakdown: true,
      })

      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([200, 0, 0])
    })

    it('should deduct received reimbursements from monthlyAmounts per month', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            category_name: 'Sante',
            type: 'EXPENSE',
            total_amount: 600,
          }),
          createRow({
            category_id: 'cat-reimb',
            category_name: 'Remboursement',
            type: 'INCOME',
            total_amount: 150,
          }),
        ])
        .mockResolvedValueOnce([
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-03',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-01',
            monthly_amount: 50,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-03',
            monthly_amount: 100,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeMonthlyBreakdown: true,
      })

      // Jan: 200-50=150, Feb: 200-0=200, Mar: 200-100=100
      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([
        150, 200, 100,
      ])
    })

    it('should not deduct reimbursements from monthlyAmounts when deductReimbursements is false', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            type: 'EXPENSE',
            total_amount: 400,
          }),
          createRow({
            category_id: 'cat-reimb',
            type: 'INCOME',
            total_amount: 100,
          }),
        ])
        .mockResolvedValueOnce([
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-01',
            monthly_amount: 100,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeMonthlyBreakdown: true,
        deductReimbursements: false,
      })

      // No deduction: Jan: 200, Feb: 200
      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([200, 200])
    })

    it('should deduct pending reimbursements from monthlyAmounts per month', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            type: 'EXPENSE',
            total_amount: 500,
          }),
        ])
        // pending query (total)
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 150 },
        ])
        // monthly breakdown
        .mockResolvedValueOnce([
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 250,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 250,
          },
        ])
        // monthly pending
        .mockResolvedValueOnce([
          {
            category_id: 'cat-reimb',
            year_month: '2024-01',
            pending_amount: 80,
          },
          {
            category_id: 'cat-reimb',
            year_month: '2024-02',
            pending_amount: 70,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        deductPendingReimbursements: true,
        includeMonthlyBreakdown: true,
      })

      // Jan: 250-80=170, Feb: 250-70=180
      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([170, 180])
    })

    it('should deduct both received and pending from monthlyAmounts', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            type: 'EXPENSE',
            total_amount: 600,
          }),
          createRow({
            category_id: 'cat-reimb',
            type: 'INCOME',
            total_amount: 100,
          }),
        ])
        // pending total
        .mockResolvedValueOnce([
          { category_id: 'cat-reimb', pending_amount: 80 },
        ])
        // monthly breakdown
        .mockResolvedValueOnce([
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 300,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 300,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-01',
            monthly_amount: 60,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-02',
            monthly_amount: 40,
          },
        ])
        // monthly pending
        .mockResolvedValueOnce([
          {
            category_id: 'cat-reimb',
            year_month: '2024-01',
            pending_amount: 30,
          },
          {
            category_id: 'cat-reimb',
            year_month: '2024-02',
            pending_amount: 50,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        deductPendingReimbursements: true,
        includeMonthlyBreakdown: true,
      })

      // Jan: 300 - 60 (received) - 30 (pending) = 210
      // Feb: 300 - 40 (received) - 50 (pending) = 210
      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([210, 210])
    })

    it('should cap monthly deduction at 0 (never negative)', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-expense',
            type: 'EXPENSE',
            total_amount: 100,
          }),
          createRow({
            category_id: 'cat-reimb',
            type: 'INCOME',
            total_amount: 200,
          }),
        ])
        // monthly breakdown
        .mockResolvedValueOnce([
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 50,
          },
          {
            category_id: 'cat-expense',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 50,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-01',
            monthly_amount: 120,
          },
          {
            category_id: 'cat-reimb',
            type: 'INCOME',
            year_month: '2024-02',
            monthly_amount: 80,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-expense',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-expense', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeMonthlyBreakdown: true,
      })

      // Jan: max(0, 50-120) = 0, Feb: max(0, 50-80) = 0
      expect(result.expensesByCategory[0].monthlyAmounts).toEqual([0, 0])
    })

    it('should handle multiple expense categories with independent reimbursements in monthly', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_id: 'cat-sante',
            category_name: 'Sante',
            type: 'EXPENSE',
            total_amount: 400,
          }),
          createRow({
            category_id: 'cat-transport',
            category_name: 'Transport',
            type: 'EXPENSE',
            total_amount: 200,
          }),
          createRow({
            category_id: 'cat-reimb-sante',
            category_name: 'Remb Sante',
            type: 'INCOME',
            total_amount: 100,
          }),
          createRow({
            category_id: 'cat-reimb-transport',
            category_name: 'Remb Transport',
            type: 'INCOME',
            total_amount: 50,
          }),
        ])
        // monthly breakdown
        .mockResolvedValueOnce([
          {
            category_id: 'cat-sante',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-sante',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 200,
          },
          {
            category_id: 'cat-transport',
            type: 'EXPENSE',
            year_month: '2024-01',
            monthly_amount: 100,
          },
          {
            category_id: 'cat-transport',
            type: 'EXPENSE',
            year_month: '2024-02',
            monthly_amount: 100,
          },
          {
            category_id: 'cat-reimb-sante',
            type: 'INCOME',
            year_month: '2024-01',
            monthly_amount: 80,
          },
          {
            category_id: 'cat-reimb-sante',
            type: 'INCOME',
            year_month: '2024-02',
            monthly_amount: 20,
          },
          {
            category_id: 'cat-reimb-transport',
            type: 'INCOME',
            year_month: '2024-02',
            monthly_amount: 50,
          },
        ])

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'a1',
          userId: mockUserId,
          expenseCategoryId: 'cat-sante',
          incomeCategoryId: 'cat-reimb-sante',
          expenseCategory: { id: 'cat-sante', name: 'Sante' },
          incomeCategory: { id: 'cat-reimb-sante', name: 'Remb Sante' },
        },
        {
          id: 'a2',
          userId: mockUserId,
          expenseCategoryId: 'cat-transport',
          incomeCategoryId: 'cat-reimb-transport',
          expenseCategory: { id: 'cat-transport', name: 'Transport' },
          incomeCategory: { id: 'cat-reimb-transport', name: 'Remb Transport' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeMonthlyBreakdown: true,
      })

      const sante = result.expensesByCategory.find(
        c => c.categoryName === 'Sante'
      )
      const transport = result.expensesByCategory.find(
        c => c.categoryName === 'Transport'
      )

      // Sante: Jan 200-80=120, Feb 200-20=180
      expect(sante?.monthlyAmounts).toEqual([120, 180])
      // Transport: Jan 100-0=100, Feb 100-50=50
      expect(transport?.monthlyAmounts).toEqual([100, 50])
    })

    it('should not run monthly queries when includeMonthlyBreakdown is false', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ total_amount: 500 }),
      ])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        deductPendingReimbursements: true,
        includeMonthlyBreakdown: false,
      })

      // 1 = aggregated, 2 = pending total. No monthly queries.
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2)
    })

    it('should run 3 queries when monthly + pending both enabled', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([createRow({ total_amount: 100 })])
        .mockResolvedValueOnce([]) // pending total
        .mockResolvedValueOnce([]) // monthly breakdown
        .mockResolvedValueOnce([]) // monthly pending

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        deductPendingReimbursements: true,
        includeMonthlyBreakdown: true,
      })

      // 4 $queryRaw calls: aggregated + pending total + monthly + monthly pending
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(4)
    })

    it('should run 2 queries when monthly enabled without pending', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([createRow({ total_amount: 100 })])
        .mockResolvedValueOnce([]) // monthly breakdown

      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        includeMonthlyBreakdown: true,
      })

      // 2 $queryRaw calls: aggregated + monthly. No pending queries.
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2)
    })
  })

  // The everyday / exceptional split is what lets a budget plan be seeded on
  // the recurring lifestyle instead of an average inflated by a one-off trip.
  describe('everyday / exceptional split', () => {
    it('splits a category between everyday life and exceptional events', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-food',
          category_name: 'Alimentation',
          total_amount: 900,
          is_exceptional: false,
        }),
        createRow({
          category_id: 'cat-food',
          category_name: 'Alimentation',
          total_amount: 300,
          is_exceptional: true,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      const food = result.expensesByCategory[0]
      expect(food.totalAmount).toBe(1200)
      expect(food.everydayAmount).toBe(900)
      expect(food.exceptionalAmount).toBe(300)
      // 3 months → the envelope is sized on 300/month, not 400.
      expect(food.averagePerMonth).toBe(400)
      expect(food.everydayAveragePerMonth).toBe(300)
    })

    it('leaves a category untouched by any event identical in both modes', async () => {
      // Regression: the everyday figure must use the same divisor as
      // averagePerMonth. Correcting the denominator globally would move every
      // category, including those no event ever touched.
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-rent',
          category_name: 'Loyer',
          total_amount: 3000,
        }),
        createRow({
          category_id: 'cat-travel',
          category_name: 'Voyages',
          total_amount: 1200,
          is_exceptional: true,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      })

      const rent = result.expensesByCategory.find(
        c => c.categoryId === 'cat-rent'
      )!
      expect(rent.everydayAveragePerMonth).toBe(rent.averagePerMonth)
      expect(rent.everydayAmount).toBe(rent.totalAmount)
      expect(rent.exceptionalAmount).toBe(0)

      const travel = result.expensesByCategory.find(
        c => c.categoryId === 'cat-travel'
      )!
      expect(travel.everydayAveragePerMonth).toBe(0)
    })

    it('keeps everyday + exceptional equal to the category total', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ category_id: 'cat-1', total_amount: 733.33 }),
        createRow({
          category_id: 'cat-1',
          total_amount: 266.67,
          is_exceptional: true,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
      })

      const cat = result.expensesByCategory[0]
      expect(cat.everydayAmount! + cat.exceptionalAmount!).toBeCloseTo(
        cat.totalAmount,
        2
      )
    })

    it('shares a reimbursement pro-rata between the two shares', async () => {
      // 1000 gross = 600 everyday + 400 exceptional, minus 200 reimbursed.
      // The reimbursement must not be charged entirely to everyday life.
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-health',
          category_name: 'Santé',
          total_amount: 600,
        }),
        createRow({
          category_id: 'cat-health',
          category_name: 'Santé',
          total_amount: 400,
          is_exceptional: true,
        }),
        createRow({
          category_id: 'cat-reimb',
          category_name: 'Remboursement Mutuelle',
          type: 'INCOME',
          total_amount: 200,
        }),
      ])
      mockPrismaService.categoryAssociation.findMany.mockResolvedValue([
        {
          id: 'assoc-1',
          userId: mockUserId,
          expenseCategoryId: 'cat-health',
          incomeCategoryId: 'cat-reimb',
          expenseCategory: { id: 'cat-health', name: 'Santé' },
          incomeCategory: { id: 'cat-reimb', name: 'Remboursement Mutuelle' },
        },
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      const health = result.expensesByCategory[0]
      expect(health.totalAmount).toBe(800)
      // 40 % of the net follows the exceptional share.
      expect(health.exceptionalAmount).toBe(320)
      expect(health.everydayAmount).toBe(480)
    })

    it('accumulates subcategory totals across the exceptional split', async () => {
      // Regression: `is_exceptional` joined the GROUP BY, so the same
      // (category, subcategory) pair now comes back on two rows.
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({
          category_id: 'cat-food',
          subcategory: 'Courses',
          transaction_count: 8,
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-food',
          subcategory: 'Courses',
          transaction_count: 2,
          total_amount: 200,
          is_exceptional: true,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      const courses = result.expensesByCategory[0].subcategories!.find(
        s => s.subcategory === 'Courses'
      )!
      expect(courses.totalAmount).toBe(500)
      expect(courses.transactionCount).toBe(10)
    })

    it('reports the total exceptional expense over the period', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        createRow({ category_id: 'cat-1', total_amount: 500 }),
        createRow({
          category_id: 'cat-1',
          total_amount: 200,
          is_exceptional: true,
        }),
        createRow({
          category_id: 'cat-2',
          total_amount: 150,
          is_exceptional: true,
        }),
      ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      expect(result.totalExceptionalExpenses).toBe(350)
    })

    it('mirrors monthlyAmounts with an everyday counterpart', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({ category_id: 'cat-1', total_amount: 200 }),
          createRow({
            category_id: 'cat-1',
            total_amount: 100,
            is_exceptional: true,
          }),
        ])
        .mockResolvedValueOnce([
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-01',
            is_exceptional: false,
            monthly_amount: 100,
          },
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-02',
            is_exceptional: false,
            monthly_amount: 100,
          },
          {
            category_id: 'cat-1',
            type: 'EXPENSE',
            year_month: '2024-02',
            is_exceptional: true,
            monthly_amount: 100,
          },
        ])

      const result = await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeMonthlyBreakdown: true,
      })

      const cat = result.expensesByCategory[0]
      // February carries both shares, and only the everyday one survives.
      expect(cat.monthlyAmounts).toEqual([100, 200, 0])
      expect(cat.everydayMonthlyAmounts).toEqual([100, 100, 0])
    })

    it('scopes the exceptional CTE to the user', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([])

      await service.getStatistics(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })

      const sql = mockPrismaService.$queryRaw.mock.calls[0][0].strings.join('')
      expect(sql).toContain('exceptional_tx')
      expect(sql).toContain('app.transaction_tags')
      expect(sql).toContain('tg.is_exceptional = true')
    })
  })
})

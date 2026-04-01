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
      transaction_count: number
      total_amount: number
    }>
  ) => ({
    category_id: overrides.category_id ?? 'cat-1',
    category_name: overrides.category_name ?? 'Santé',
    category_icon: overrides.category_icon ?? null,
    type: overrides.type ?? 'EXPENSE',
    subcategory: overrides.subcategory ?? '',
    transaction_count: overrides.transaction_count ?? 1,
    total_amount: overrides.total_amount ?? 100,
  })

  const mockPrismaService = {
    budget: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
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
  })
})

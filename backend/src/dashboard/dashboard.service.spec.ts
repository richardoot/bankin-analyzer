import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'

describe('DashboardService', () => {
  let service: DashboardService

  const mockUserId = 'user-123'

  /** Stable fake id for a category name, so tests can name what they hide. */
  const categoryIdFor = (name: string) => `cat-${name}`

  /** Names of the category options returned for the filter panel. */
  const optionNames = (options: { id: string; name: string }[]) =>
    options.map(o => o.name)

  const createRow = (
    overrides: Partial<{
      month_key: string
      category_id: string | null
      category_name: string
      category_icon: string | null
      type: string
      subcategory: string
      is_exceptional: boolean
      transaction_count: number
      total_amount: number
      received_credit: number
      pending_credit: number
    }> = {}
  ) => ({
    month_key: overrides.month_key ?? '2024-01',
    // Rows are grouped and filtered by category id, so each name gets a
    // distinct one unless a test explicitly passes `category_id: null` to
    // stand for an uncategorized transaction.
    category_id:
      'category_id' in overrides
        ? overrides.category_id
        : categoryIdFor(overrides.category_name ?? 'Alimentation'),
    category_name: overrides.category_name ?? 'Alimentation',
    category_icon: overrides.category_icon ?? null,
    type: overrides.type ?? 'EXPENSE',
    subcategory: overrides.subcategory ?? '',
    is_exceptional: overrides.is_exceptional ?? false,
    // Since the deduction moved into SQL, `total_amount` arrives already net
    // and these two only report what was taken off. A row with no
    // reimbursement carries zeros.
    received_credit: overrides.received_credit ?? 0,
    pending_credit: overrides.pending_credit ?? 0,
    transaction_count: overrides.transaction_count ?? 1,
    total_amount: overrides.total_amount ?? 100,
  })

  const mockPrismaService = {
    $queryRaw: vi.fn(),
    categoryAssociation: {
      findMany: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
    },
  }

  /**
   * Setup the $queryRaw calls in order: aggregation rows, account rows and the
   * exceptional-events rows. The pending-reimbursement query is toggle-gated
   * and resolves without touching the mock when disabled.
   */
  function setupMocks(
    rows: ReturnType<typeof createRow>[],
    accounts: string[] = ['Compte Courant'],
    events: {
      id: string
      name: string
      color: string | null
      icon: string | null
      amount: number
    }[] = []
  ) {
    mockPrismaService.$queryRaw
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(accounts.map(account => ({ account })))
      .mockResolvedValueOnce(events)
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
    mockPrismaService.tag.findMany.mockResolvedValue([])
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
      expect(optionNames(result.allExpenseCategories)).toEqual([])
      expect(optionNames(result.allIncomeCategories)).toEqual([])
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
        { categoryId: 'cat-Loyer', category: 'Loyer', amount: 500, icon: null },
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 100,
          icon: null,
        },
        {
          categoryId: 'cat-Transport',
          category: 'Transport',
          amount: 50,
          icon: null,
        },
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
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 100,
        icon: null,
      })
      expect(result.expensesByCategory).toContainEqual({
        categoryId: 'cat-Loyer',
        category: 'Loyer',
        amount: 100,
        icon: null,
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
        hiddenExpenseCategoryIds: ['cat-Loisirs'],
      })

      expect(result.expensesByCategory).toEqual([
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 100,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(100)
      // But allExpenseCategories should still include hidden categories
      expect(optionNames(result.allExpenseCategories)).toContain('Loisirs')
      expect(optionNames(result.allExpenseCategories)).toContain('Alimentation')
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
        hiddenIncomeCategoryIds: ['cat-Prime'],
      })

      expect(result.incomeByCategory).toEqual([
        {
          categoryId: 'cat-Salaire',
          category: 'Salaire',
          amount: 2500,
          icon: null,
        },
      ])
      expect(result.totalIncome).toBe(2500)
      // But allIncomeCategories should still include hidden categories
      expect(optionNames(result.allIncomeCategories)).toContain('Prime')
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
          category_id: null,
          category_name: 'Autre',
          type: 'EXPENSE',
          total_amount: 100,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        {
          categoryId: '__uncategorized__',
          category: 'Autre',
          amount: 100,
          icon: null,
        },
      ])
      // Uncategorized transactions get the sentinel id so the filter panel can
      // still address that bucket.
      expect(result.allExpenseCategories).toEqual([
        { id: '__uncategorized__', name: 'Autre' },
      ])
    })

    it('should keep an expense and an income category sharing a name apart', async () => {
      // Names are unique per user *and per type*, so this pair is legal. Keyed
      // by name, the two collapsed into one bucket and each side could be
      // handed the other's id.
      setupMocks([
        createRow({
          category_id: 'cat-remb-expense',
          category_name: 'Remboursements',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-remb-income',
          category_name: 'Remboursements',
          type: 'INCOME',
          total_amount: 80,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory).toEqual([
        {
          categoryId: 'cat-remb-expense',
          category: 'Remboursements',
          amount: 300,
          icon: null,
        },
      ])
      expect(result.incomeByCategory).toEqual([
        {
          categoryId: 'cat-remb-income',
          category: 'Remboursements',
          amount: 80,
          icon: null,
        },
      ])
    })

    it('should hide only the expense side when both types share a hidden name', async () => {
      setupMocks([
        createRow({
          category_id: 'cat-remb-expense',
          category_name: 'Remboursements',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          category_id: 'cat-remb-income',
          category_name: 'Remboursements',
          type: 'INCOME',
          total_amount: 80,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        hiddenExpenseCategoryIds: ['cat-remb-expense'],
      })

      expect(result.expensesByCategory).toEqual([])
      expect(result.incomeByCategory).toHaveLength(1)
      expect(result.totalIncome).toBe(80)
    })

    it('should expose the category id even without the breakdown', async () => {
      setupMocks([
        createRow({ category_name: 'Alimentation', total_amount: 100 }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory[0]?.categoryId).toBe('cat-Alimentation')
    })

    it('should hide uncategorized transactions through the sentinel id', async () => {
      setupMocks([
        createRow({
          category_id: null,
          category_name: 'Autre',
          type: 'EXPENSE',
          total_amount: 100,
        }),
        createRow({
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 40,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        hiddenExpenseCategoryIds: ['__uncategorized__'],
      })

      expect(result.expensesByCategory).toEqual([
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 40,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(40)
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
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 100,
          icon: null,
        },
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
        categoryId: 'cat-Salaire',
        category: 'Salaire',
        amount: 1500,
        icon: null,
      })
      expect(result.incomeByCategory).toContainEqual({
        categoryId: 'cat-Prime',
        category: 'Prime',
        amount: 2000,
        icon: null,
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
        categoryId: 'cat-Loyer',
        category: 'Loyer',
        amount: 150,
        icon: null,
      })
      expect(result.expensesByCategory).toContainEqual({
        categoryId: 'cat-Electricité',
        category: 'Electricité',
        amount: 100,
        icon: null,
      })
      expect(result.expensesByCategory).toContainEqual({
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 100,
        icon: null,
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
        {
          categoryId: 'cat-Divers',
          category: 'Divers',
          amount: 200,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(200)
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
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 1250,
        icon: null,
      })
      expect(result.totalExpenses).toBe(1700)
      expect(result.totalIncome).toBe(9200)

      // All categories tracked
      expect(optionNames(result.allExpenseCategories)).toEqual([
        'Alimentation',
        'Loisirs',
        'Transport',
      ])
      expect(optionNames(result.allIncomeCategories)).toEqual(['Salaire'])
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
        hiddenExpenseCategoryIds: ['cat-Loisirs', 'cat-Transport'],
      })

      // Only non-hidden categories in aggregations
      expect(result.expensesByCategory).toEqual([
        { categoryId: 'cat-Loyer', category: 'Loyer', amount: 800, icon: null },
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 300,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(1100)

      // All categories still listed for filter panel
      expect(optionNames(result.allExpenseCategories)).toEqual(
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
        hiddenExpenseCategoryIds: ['cat-Loisirs'],
        hiddenIncomeCategoryIds: ['cat-Prime'],
      })

      expect(result.expensesByCategory).toEqual([
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 300,
          icon: null,
        },
      ])
      expect(result.incomeByCategory).toEqual([
        {
          categoryId: 'cat-Salaire',
          category: 'Salaire',
          amount: 3000,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(300)
      expect(result.totalIncome).toBe(3000)

      // Hidden categories still in allCategories
      expect(optionNames(result.allExpenseCategories)).toContain('Loisirs')
      expect(optionNames(result.allIncomeCategories)).toContain('Prime')
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
        {
          categoryId: 'cat-Salaire',
          category: 'Salaire',
          amount: 3000,
          icon: null,
        },
        {
          categoryId: 'cat-Freelance',
          category: 'Freelance',
          amount: 1000,
          icon: null,
        },
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
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 300,
          icon: null,
        },
      ])
      expect(result.totalExpenses).toBe(300)
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
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 1050,
          icon: null,
        },
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
        {
          categoryId: 'cat-Alimentation',
          category: 'Alimentation',
          amount: 100,
          icon: null,
        },
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

      expect(optionNames(result.allExpenseCategories)).toEqual([
        'Alimentation',
        'Loyer',
        'Transport',
      ])
      expect(optionNames(result.allIncomeCategories)).toEqual([
        'Freelance',
        'Prime',
        'Salaire',
      ])
    })
  })

  describe('includeCategoryBreakdown', () => {
    it('should not include monthlyAmounts/subcategories by default', async () => {
      setupMocks([createRow({ total_amount: 100 })])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory[0]?.monthlyAmounts).toBeUndefined()
      expect(result.expensesByCategory[0]?.subcategories).toBeUndefined()
      expect(result.monthLabels).toBeUndefined()
      expect(result.periodMonths).toBeUndefined()
    })

    it('should include per-category monthlyAmounts and subcategories when toggle is on', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          subcategory: 'Courses',
          transaction_count: 3,
          total_amount: 200,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          subcategory: 'Restaurant',
          transaction_count: 2,
          total_amount: 100,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          subcategory: 'Courses',
          transaction_count: 1,
          total_amount: 50,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeCategoryBreakdown: true,
      })

      expect(result.periodMonths).toBe(2)
      expect(result.monthLabels).toEqual(['2024-01', '2024-02'])

      const cat = result.expensesByCategory[0]
      expect(cat?.categoryId).toBe('cat-1')
      expect(cat?.amount).toBe(350)
      expect(cat?.averagePerMonth).toBe(175)
      expect(cat?.transactionCount).toBe(6)
      expect(cat?.monthlyAmounts).toEqual([200, 150])
      expect(cat?.subcategories).toEqual([
        {
          subcategory: 'Courses',
          amount: 250,
          transactionCount: 4,
          averagePerMonth: 125,
        },
        {
          subcategory: 'Restaurant',
          amount: 100,
          transactionCount: 2,
          averagePerMonth: 50,
        },
      ])
    })

    it('should fill zero months between start and end dates', async () => {
      setupMocks([
        createRow({
          month_key: '2024-03',
          category_id: 'cat-1',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          subcategory: '',
          total_amount: 90,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-04-30',
        includeCategoryBreakdown: true,
      })

      expect(result.monthLabels).toEqual([
        '2024-01',
        '2024-02',
        '2024-03',
        '2024-04',
      ])
      expect(result.expensesByCategory[0]?.monthlyAmounts).toEqual([
        0, 0, 90, 0,
      ])
    })
  })
  describe('everyday vs exceptional split', () => {
    it('leaves categories untouched by any event identical in both modes', async () => {
      setupMocks([
        // Rent: fully everyday, and still debited while its owner is away.
        createRow({
          month_key: '2024-01',
          category_id: 'cat-rent',
          category_name: 'Logement',
          type: 'EXPENSE',
          total_amount: 800,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-rent',
          category_name: 'Logement',
          type: 'EXPENSE',
          total_amount: 800,
        }),
        // Travel: entirely carried by an exceptional event.
        createRow({
          month_key: '2024-02',
          category_id: 'cat-travel',
          category_name: 'Voyages',
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: 600,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeCategoryBreakdown: true,
      })

      const rent = result.expensesByCategory.find(
        c => c.category === 'Logement'
      )
      const travel = result.expensesByCategory.find(
        c => c.category === 'Voyages'
      )

      // The untouched category must read the same in both modes.
      expect(rent?.exceptionalAmount).toBe(0)
      expect(rent?.everydayAmount).toBe(1600)
      expect(rent?.averagePerMonth).toBe(800)
      expect(rent?.everydayAveragePerMonth).toBe(800)

      // Only the category carrying the event moves.
      expect(travel?.exceptionalAmount).toBe(600)
      expect(travel?.everydayAmount).toBe(0)
      expect(travel?.averagePerMonth).toBe(300)
      expect(travel?.everydayAveragePerMonth).toBe(0)
    })

    it('splits a category that mixes everyday and exceptional spending', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 400,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: 200,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeCategoryBreakdown: true,
      })

      const food = result.expensesByCategory[0]
      expect(food?.amount).toBe(600)
      expect(food?.exceptionalAmount).toBe(200)
      expect(food?.everydayAmount).toBe(400)
      expect(food?.averagePerMonth).toBe(300)
      expect(food?.everydayAveragePerMonth).toBe(200)
      expect(food?.monthlyAmounts).toEqual([400, 200])
      expect(food?.everydayMonthlyAmounts).toEqual([400, 0])
    })

    it('reports the exceptional total and the monthly everyday split', async () => {
      setupMocks(
        [
          createRow({
            month_key: '2024-01',
            category_name: 'Voyages',
            type: 'EXPENSE',
            is_exceptional: true,
            total_amount: 500,
          }),
          createRow({
            month_key: '2024-01',
            category_name: 'Logement',
            type: 'EXPENSE',
            total_amount: 800,
          }),
        ],
        ['Compte Courant'],
        [
          {
            id: 'tag-1',
            name: 'Vacances Italie',
            color: '#06b6d4',
            icon: null,
            amount: 500,
          },
        ]
      )

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      expect(result.totalExceptionalExpenses).toBe(500)
      expect(result.exceptionalEvents).toEqual([
        {
          id: 'tag-1',
          name: 'Vacances Italie',
          color: '#06b6d4',
          icon: null,
          amount: 500,
        },
      ])
      expect(result.monthlyData[0]?.expenses).toBe(1300)
      expect(result.monthlyData[0]?.exceptionalExpenses).toBe(500)
      expect(result.monthlyData[0]?.everydayNetExpenses).toBe(800)
    })
  })
  describe('everyday vs exceptional — deductions and invariants', () => {
    /** Two rows for one category: an exceptional share and an everyday one. */
    function mixedCategory(
      category: string,
      month: string,
      everyday: number,
      exceptional: number
    ) {
      return [
        createRow({
          month_key: month,
          category_name: category,
          type: 'EXPENSE',
          total_amount: everyday,
        }),
        createRow({
          month_key: month,
          category_name: category,
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: exceptional,
        }),
      ]
    }

    it('keeps everyday + exceptional equal to the total on a messy dataset', async () => {
      setupMocks([
        ...mixedCategory('Alimentation', '2024-01', 380, 0),
        ...mixedCategory('Alimentation', '2024-02', 210, 175.5),
        ...mixedCategory('Alimentation', '2024-03', 402.33, 0),
        ...mixedCategory('Transport', '2024-01', 120, 0),
        ...mixedCategory('Transport', '2024-02', 65.75, 428),
        ...mixedCategory('Logement', '2024-03', 800, 0),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeCategoryBreakdown: true,
      })

      expect(result.expensesByCategory.length).toBeGreaterThan(0)
      for (const cat of result.expensesByCategory) {
        // The two shares must always reconstitute the displayed total.
        expect(
          Math.round(
            ((cat.everydayAmount ?? 0) + (cat.exceptionalAmount ?? 0)) * 100
          ) / 100
        ).toBeCloseTo(cat.amount, 2)

        // …and the monthly series must sum back to its own share.
        const monthlySum = (cat.everydayMonthlyAmounts ?? []).reduce(
          (a, b) => a + b,
          0
        )
        expect(monthlySum).toBeCloseTo(cat.everydayAmount ?? 0, 1)

        const realSum = (cat.monthlyAmounts ?? []).reduce((a, b) => a + b, 0)
        expect(realSum).toBeCloseTo(cat.amount, 1)

        // The everyday share can never exceed the total.
        expect(cat.everydayAmount ?? 0).toBeLessThanOrEqual(cat.amount + 0.01)
      }
    })

    it('matches the sum of the exceptional shares with the reported total', async () => {
      setupMocks([
        ...mixedCategory('Alimentation', '2024-01', 300, 100),
        ...mixedCategory('Transport', '2024-01', 200, 50.5),
      ])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      const sum = result.expensesByCategory.reduce(
        (acc, c) => acc + (c.exceptionalAmount ?? 0),
        0
      )
      expect(result.totalExceptionalExpenses).toBeCloseTo(sum, 2)
      expect(result.totalExceptionalExpenses).toBe(150.5)
    })

    it('excludes hidden categories from the exceptional total', async () => {
      setupMocks([
        createRow({
          category_name: 'Voyages',
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: 500,
        }),
        createRow({
          category_name: 'Logement',
          type: 'EXPENSE',
          total_amount: 800,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
        hiddenExpenseCategoryIds: ['cat-Voyages'],
      })

      expect(result.totalExceptionalExpenses).toBe(0)
      expect(result.expensesByCategory).toHaveLength(1)
      expect(result.expensesByCategory[0]?.category).toBe('Logement')
    })

    it('never sets the everyday fields on income categories', async () => {
      setupMocks([
        createRow({
          category_name: 'Salaire',
          type: 'INCOME',
          total_amount: 2500,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      const salary = result.incomeByCategory[0]
      expect(salary?.amount).toBe(2500)
      expect(salary?.everydayAmount).toBeUndefined()
      expect(salary?.exceptionalAmount).toBeUndefined()
      expect(salary?.everydayAveragePerMonth).toBeUndefined()
    })

    it('omits the everyday fields when no breakdown is requested', async () => {
      setupMocks(mixedCategory('Voyages', '2024-01', 400, 600))

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory[0]?.amount).toBe(1000)
      expect(result.expensesByCategory[0]?.everydayAmount).toBeUndefined()
      expect(result.periodMonths).toBeUndefined()
    })

    it('zeroes the everyday share of a fully exceptional month', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_name: 'Voyages',
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: 1200,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      const month = result.monthlyData[0]
      expect(month?.expenses).toBe(1200)
      expect(month?.exceptionalExpenses).toBe(1200)
      expect(month?.everydayNetExpenses).toBe(0)
    })

    it('reports the everyday share of a month mixing both', async () => {
      setupMocks([
        ...mixedCategory('Alimentation', '2024-01', 450, 0),
        ...mixedCategory('Voyages', '2024-01', 0, 550),
      ])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      const month = result.monthlyData[0]
      expect(month?.expenses).toBe(1000)
      expect(month?.exceptionalExpenses).toBe(550)
      expect(month?.everydayNetExpenses).toBe(450)
    })

    it('preserves the split through the joint-account divisor', async () => {
      // The SQL already divides by the divisor; the split must ride on top of
      // the halved amounts without reintroducing the full ones.
      setupMocks(mixedCategory('Voyages', '2024-01', 200, 300))

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      const travel = result.expensesByCategory[0]
      expect(travel?.amount).toBe(500)
      expect(travel?.exceptionalAmount).toBe(300)
      expect(travel?.everydayAmount).toBe(200)
    })
  })
})

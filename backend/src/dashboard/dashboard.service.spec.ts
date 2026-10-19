import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import type { SmoothedPurchaseRow } from '../transactions/amortized-slices.service'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { RecurrencesService } from '../recurrences/recurrences.service'

/** Brought up to date before every summary; a cache these tests do not read. */
const mockRecurrences = { refreshQuietly: vi.fn() }

/** Smoothed purchases, everyday reading only; none unless a test says so. */
const mockAmortizedSlices = { read: vi.fn() }

/** A smoothed purchase as the slices query returns it. */
function smoothedRow(
  overrides: Partial<SmoothedPurchaseRow> = {}
): SmoothedPurchaseRow {
  return {
    transaction_id: 'tx-iphone',
    description: 'IPHONE',
    date: '2026-06-12',
    months: 24,
    net: 1300,
    monthly: 54.17,
    first_month: '2026-06',
    last_month: '2028-05',
    category_id: 'cat-High-tech',
    category_name: 'High-tech',
    category_icon: null,
    subcategory_id: 'sub-Telephone',
    subcategory: 'Telephone',
    subcategory_icon: null,
    nature: 'PLEASURE',
    rhythm: 'VARIABLE',
    is_recurring: false,
    pending: 0,
    source_month: '2026-06',
    source_in_window: false,
    slices: [],
    ...overrides,
  }
}

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
      subcategory_id: string | null
      subcategory: string
      is_exceptional: boolean
      transaction_count: number
      total_amount: number
      received_credit: number
      pending_credit: number
      nature: string | null
      rhythm: string | null
      is_recurring: boolean
      category_catalog_key: string | null
    }> = {}
  ) => ({
    nature: overrides.nature ?? null,
    rhythm: overrides.rhythm ?? null,
    is_recurring: overrides.is_recurring ?? false,
    category_catalog_key: overrides.category_catalog_key ?? null,
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
    // A named line stands for a real subcategory, with an id derived from
    // its name unless the test passes one; the unnamed line is « none ».
    subcategory_id:
      'subcategory_id' in overrides
        ? (overrides.subcategory_id ?? null)
        : overrides.subcategory
          ? `sub-${overrides.subcategory}`
          : null,
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
    tag: {
      findMany: vi.fn(),
    },
    tagFamily: {
      findMany: vi.fn(),
    },
  }

  // The user's preference for debts still owed. Off here so that every test
  // written before the preference existed keeps reading gross figures; the
  // tests of the preference itself switch it on.
  const mockFilterPreferencesService = {
    deductsPendingByDefault: vi.fn(),
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
    }[] = [],
    pendingReceivables = 0
  ) {
    mockPrismaService.$queryRaw
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(accounts.map(account => ({ account })))
      .mockResolvedValueOnce(events)
      .mockResolvedValueOnce([{ pending: pendingReceivables }])
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: FilterPreferencesService,
          useValue: mockFilterPreferencesService,
        },
        { provide: RecurrencesService, useValue: mockRecurrences },
        { provide: AmortizedSlicesService, useValue: mockAmortizedSlices },
      ],
    }).compile()

    service = module.get<DashboardService>(DashboardService)

    vi.clearAllMocks()
    mockAmortizedSlices.read.mockResolvedValue([])
    mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
      false
    )
    // Whatever a test queues with `mockResolvedValueOnce`, the receivables
    // query that comes last gets an empty answer by default.
    mockPrismaService.$queryRaw.mockResolvedValue([{ pending: 0 }])

    // Default mocks
    mockPrismaService.tag.findMany.mockResolvedValue([])
    // No tag family: the families of the year read nothing more.
    mockPrismaService.tagFamily.findMany.mockResolvedValue([])
  })

  describe('a debt still owed', () => {
    it('is taken off the spending when the preference says so and the request does not', async () => {
      mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
        true
      )
      // 3 700 lent to a relative, claimed back in full: the row arrives net.
      setupMocks([
        createRow({
          category_name: 'Famille et amis',
          total_amount: 0,
          pending_credit: 3700,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(
        mockFilterPreferencesService.deductsPendingByDefault
      ).toHaveBeenCalledWith(mockUserId)
      // Gross, the month spent 3 700; net of the debt, nothing.
      expect(result.monthlyData[0]?.expenses).toBe(3700)
      expect(result.monthlyData[0]?.netExpenses).toBe(0)
      expect(result.totalExpenses).toBe(0)
    })

    it('stays in the spending when the preference says so', async () => {
      mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
        false
      )
      setupMocks([
        createRow({
          category_name: 'Famille et amis',
          total_amount: 3700,
          pending_credit: 3700,
        }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.monthlyData[0]?.netExpenses).toBe(3700)
      expect(result.totalExpenses).toBe(3700)
    })

    it('lets the request override the preference', async () => {
      mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
        true
      )
      setupMocks([
        createRow({
          category_name: 'Famille et amis',
          total_amount: 3700,
          pending_credit: 3700,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        deductPendingReimbursements: false,
      })

      expect(
        mockFilterPreferencesService.deductsPendingByDefault
      ).not.toHaveBeenCalled()
      expect(result.monthlyData[0]?.netExpenses).toBe(3700)
    })

    it('is reported as what is still owed, whatever the period', async () => {
      setupMocks([], [], [], 3700.456)

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })

      expect(result.pendingReceivables).toBe(3700.46)
    })
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

    it('should expose the category id even without the breakdown', async () => {
      setupMocks([
        createRow({ category_name: 'Alimentation', total_amount: 100 }),
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory[0]?.categoryId).toBe('cat-Alimentation')
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
          subcategoryId: 'sub-Courses',
          subcategory: 'Courses',
          amount: 250,
          transactionCount: 4,
          averagePerMonth: 125,
        },
        {
          subcategoryId: 'sub-Restaurant',
          subcategory: 'Restaurant',
          amount: 100,
          transactionCount: 2,
          averagePerMonth: 50,
        },
      ])
    })

    it('keys the breakdown by subcategory id, with « none » as a null id', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_id: 'cat-1',
          subcategory_id: 'sub-courses',
          subcategory: 'Courses',
          total_amount: 40,
          transaction_count: 1,
        }),
        // Same subcategory, another month and the exceptional split: one line.
        createRow({
          month_key: '2024-02',
          category_id: 'cat-1',
          subcategory_id: 'sub-courses',
          subcategory: 'Courses',
          is_exceptional: true,
          total_amount: 60,
          transaction_count: 2,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-1',
          subcategory_id: null,
          subcategory: '',
          total_amount: 5,
          transaction_count: 1,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        includeCategoryBreakdown: true,
      })

      const cat = result.expensesByCategory[0]
      expect(cat?.amount).toBe(105)
      expect(
        cat?.subcategories?.map(s => [
          s.subcategoryId,
          s.subcategory,
          s.amount,
          s.transactionCount,
        ])
      ).toEqual([
        ['sub-courses', 'Courses', 100, 3],
        [null, '', 5, 1],
      ])

      const [aggregation] = mockPrismaService.$queryRaw.mock.calls[0] as [
        { strings: string[] },
      ]
      const sql = aggregation.strings.join('')
      expect(sql).toContain("COALESCE(sc.name, '') AS subcategory")
      expect(sql).toMatch(/GROUP BY[^\n]*t\.subcategory_id/)
      expect(sql).not.toContain('COALESCE(t.subcategory')
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
  describe('the structure of spending and the savings reading', () => {
    it('counts a line of a recurrence as committed and reports it apart', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          // Simply Piano, filed under a variable subcategory: the query reads
          // it as committed because it belongs to a recurrence.
          createRow({
            category_name: 'Loisirs et culture',
            total_amount: 17.99,
            nature: 'PLEASURE',
            rhythm: 'COMMITTED',
            is_recurring: true,
          }),
          createRow({
            category_name: 'Loisirs et culture',
            total_amount: 40,
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.spendingStructure).toMatchObject({
        committed: 17.99,
        variable: 40,
        recurring: 17.99,
        total: 57.99,
      })
      const [aggregation] = mockPrismaService.$queryRaw.mock.calls[0] as [
        { strings: string[] },
      ]
      const sql = aggregation.strings.join('')
      expect(sql).toContain(
        "WHEN rtx.transaction_id IS NOT NULL THEN 'COMMITTED'"
      )
      expect(sql).toContain("r.status IN ('ACTIVE', 'STOPPED')")
    })

    it('reads each expense through its nature and rhythm, on both readings', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_name: 'Logement',
            total_amount: 1000,
            nature: 'ESSENTIAL',
            rhythm: 'COMMITTED',
          }),
          createRow({
            category_name: 'Restaurants',
            total_amount: 200,
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
          }),
          // A holiday restaurant: chosen, variable, and exceptional.
          createRow({
            category_name: 'Restaurants',
            total_amount: 300,
            nature: 'PLEASURE',
            rhythm: 'VARIABLE',
            is_exceptional: true,
          }),
          // A legacy row: no attribute yet.
          createRow({ category_name: 'Abonnements', total_amount: 50 }),
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 3000,
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.spendingStructure).toEqual({
        essential: 1000,
        pleasure: 500,
        unknownNature: 50,
        committed: 1000,
        variable: 500,
        unknownRhythm: 50,
        recurring: 0,
        total: 1550,
      })
      expect(result.everydaySpendingStructure).toEqual({
        essential: 1000,
        pleasure: 200,
        unknownNature: 50,
        committed: 1000,
        variable: 200,
        unknownRhythm: 50,
        recurring: 0,
        total: 1250,
      })
      // No transfer: nothing saved, and the free money is income less the
      // committed everyday spending.
      expect(result.savingsTransfers).toBe(0)
      expect(result.savingsRate).toBe(0)
      expect(result.remainingToLive).toBe(2000)
    })

    it('counts a transfer into savings as saved and nowhere else', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 2000,
          }),
          createRow({
            category_name: 'Épargne de précaution',
            type: 'TRANSFER',
            category_catalog_key: 'emergency-savings',
            // Money leaving the current account: negative, like an expense.
            total_amount: -300,
          }),
          createRow({
            category_name: 'Investissement',
            type: 'TRANSFER',
            category_catalog_key: 'investment',
            total_amount: -100,
          }),
          // A withdrawal from savings comes back positive and un-saves.
          createRow({
            category_name: 'Épargne projet',
            type: 'TRANSFER',
            category_catalog_key: 'project-savings',
            total_amount: 50,
          }),
          // An internal move says nothing about saving.
          createRow({
            category_name: 'Virement interne',
            type: 'TRANSFER',
            category_catalog_key: 'internal-transfer',
            total_amount: -800,
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.totalIncome).toBe(2000)
      expect(result.totalExpenses).toBe(0)
      expect(result.incomeByCategory.map(c => c.category)).toEqual(['Salaire'])
      expect(optionNames(result.allIncomeCategories)).toEqual(['Salaire'])
      expect(result.savingsTransfers).toBe(350)
      expect(result.savingsRate).toBe(0.175)
      expect(result.remainingToLive).toBe(1650)
    })

    it('reports no rate and no free money without income', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([createRow({ total_amount: 100 })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.savingsRate).toBeNull()
      expect(result.remainingToLive).toBeNull()
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

  describe('a smoothed purchase', () => {
    it('trades its own month for its slices in the everyday reading only', async () => {
      setupMocks([
        createRow({
          month_key: '2026-06',
          category_name: 'High-tech',
          subcategory: 'Telephone',
          total_amount: 1300,
          nature: 'PLEASURE',
          rhythm: 'VARIABLE',
        }),
      ])
      mockAmortizedSlices.read.mockResolvedValue([
        smoothedRow({
          source_in_window: true,
          slices: [
            { month: '2026-06', amount: 54.17 },
            { month: '2026-07', amount: 54.17 },
          ],
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-06-01',
        endDate: '2026-07-31',
        includeCategoryBreakdown: true,
      })

      // Real: untouched, the phone in June.
      expect(result.monthlyData.map(m => [m.month, m.netExpenses])).toEqual([
        ['2026-06', 1300],
        ['2026-07', 0],
      ])
      expect(result.totalExpenses).toBe(1300)
      expect(result.spendingStructure.variable).toBe(1300)
      // Everyday: a slice a month, read as committed.
      expect(
        result.monthlyData.map(m => [
          m.everydayNetExpenses,
          m.amortizedExpenses,
        ])
      ).toEqual([
        [54.17, 54.17],
        [54.17, 54.17],
      ])
      expect(result.everydaySpendingStructure).toMatchObject({
        variable: 0,
        committed: 108.34,
        pleasure: 108.34,
        recurring: 0,
        total: 108.34,
      })
      const hightech = result.expensesByCategory[0]
      expect(hightech?.amount).toBe(1300)
      expect(hightech?.everydayAmount).toBe(108.34)
      expect(hightech?.everydayMonthlyAmounts).toEqual([54.17, 54.17])
      expect(hightech?.amortizedAmount).toBe(108.34)
      expect(hightech?.amortizedMonthlyAmounts).toEqual([54.17, 54.17])
      expect(hightech?.subcategories?.[0]).toMatchObject({
        amount: 1300,
        everydayAmount: 108.34,
        amortizedAmount: 108.34,
      })
    })

    it('stops the slices at the current month when the period has no end', async () => {
      setupMocks([])

      await service.getSummary(mockUserId, {})

      const [query] = mockAmortizedSlices.read.mock.calls[0] as [
        { firstMonth: string; lastMonth: string; scope: { strings: string[] } },
      ]
      const now = new Date()
      expect(query.firstMonth).toBe('1970-01-01')
      expect(query.lastMonth).toBe(
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
      )
      expect(query.scope.strings.join('')).toContain('is_excluded_from_stats')
    })

    it('leaves a month and a category it never touches as they were', async () => {
      setupMocks([
        createRow({
          month_key: '2026-07',
          category_name: 'Courses',
          total_amount: 200,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        includeCategoryBreakdown: true,
      })

      expect(result.monthlyData[0]).not.toHaveProperty('amortizedExpenses')
      expect(result.expensesByCategory[0]).not.toHaveProperty('amortizedAmount')
      expect(
        result.expensesByCategory[0]?.subcategories?.[0]
      ).not.toHaveProperty('everydayAmount')
    })
  })

  describe('the tag families of the year', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    /** The SQL and the values of the families-of-the-year query. */
    function familiesQuery(): { sql: string; values: unknown[] } {
      const call = mockPrismaService.$queryRaw.mock.calls.find(
        ([sql]: [{ strings: string[] }]) =>
          sql.strings.join('?').includes('year_tx AS')
      ) as [{ strings: string[]; values: unknown[] }] | undefined
      if (!call) throw new Error('no families-of-the-year query')
      return { sql: call[0].strings.join('?'), values: call[0].values }
    }

    const travel = {
      id: 'fam-travel',
      name: 'Voyages',
      color: '#22c55e',
      icon: 'plane',
      annualBudget: 1000,
    }
    const hyrox = {
      id: 'fam-hyrox',
      name: 'HYROX',
      color: null,
      icon: null,
      annualBudget: null,
    }

    it('is empty without a family, and reads nothing more', async () => {
      setupMocks([createRow({ total_amount: 100 })])

      const result = await service.getSummary(mockUserId, {})

      expect(result.tagFamiliesOfYear).toEqual([])
      expect(result.realExpensesOfYear).toBeNull()
      // The four queries of the summary, not one more.
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(4)
      expect(mockPrismaService.tagFamily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUserId } })
      )
    })

    it('lists the families with spending, biggest first, with envelope and remainder', async () => {
      mockPrismaService.tagFamily.findMany.mockResolvedValue([hyrox, travel])
      setupMocks([createRow({ total_amount: 100 })])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          family_id: 'fam-hyrox',
          transaction_count: 2,
          spent: 180.004,
          tag_count: 1,
          real_expenses: 12000.456,
        },
        {
          family_id: 'fam-travel',
          transaction_count: 5,
          spent: 1250.5,
          tag_count: 2,
          real_expenses: 12000.456,
        },
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      })

      const year = Number(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
        }).format(new Date())
      )
      expect(result.tagFamiliesOfYear).toEqual([
        {
          id: 'fam-travel',
          name: 'Voyages',
          color: '#22c55e',
          icon: 'plane',
          year,
          spent: 1250.5,
          annualBudget: 1000,
          remaining: -250.5,
          transactionCount: 5,
          tagCount: 2,
        },
        {
          id: 'fam-hyrox',
          name: 'HYROX',
          color: null,
          icon: null,
          year,
          spent: 180,
          annualBudget: null,
          remaining: null,
          transactionCount: 2,
          tagCount: 1,
        },
      ])
      expect(result.realExpensesOfYear).toBe(12000.46)
      // The period's own figures are untouched.
      expect(result.totalExpenses).toBe(100)
    })

    it('reads the calendar year in Paris, not the period nor the UTC day', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // 23:30 UTC on New Year's Eve is already 2027 in Paris.
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      })

      const { values } = familiesQuery()
      expect(values).toContain(2027)
      expect(values).toContainEqual(new Date('2027-01-01T00:00:00Z'))
      expect(values).toContainEqual(new Date('2028-01-01T00:00:00Z'))
      // No family spent anything that year: nothing to show, no share.
      expect(result.tagFamiliesOfYear).toEqual([])
      expect(result.realExpensesOfYear).toBeNull()
    })

    it('counts a line once per family, in event basis, with the family conventions', async () => {
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([])

      await service.getSummary(mockUserId, {})

      const { sql } = familiesQuery()
      // Grouped by transaction and family before anything is summed.
      expect(sql).toContain('GROUP BY tt.transaction_id, tg.family_id')
      // A line belongs to the year its dated tag starts in.
      expect(sql).toContain(
        'EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int ='
      )
      expect(sql).toContain('ABS(t.amount::numeric) / COALESCE(a.divisor, 1)')
      expect(sql).toContain('COALESCE(a.is_excluded_from_stats, false) = false')
      // The year's real expenses are netted as the period's totals are.
      expect(sql).toContain('expense_credit')
      expect(sql).toContain('LEFT JOIN expense_credit ec')
    })
  })
})

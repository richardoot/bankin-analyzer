import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { DashboardService } from './dashboard.service'
import { PrismaService } from '../prisma/prisma.service'
import { AmortizedSlicesService } from '../transactions/amortized-slices.service'
import type { SmoothedPurchaseRow } from '../transactions/amortized-slices.service'
import { FilterPreferencesService } from '../filter-preferences/filter-preferences.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { netAmountSql } from '../reimbursements/reimbursement-credit.sql'
import type { RecurrenceOfMonthRow } from './dashboard.service'

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
      family_id?: string | null
      family_name?: string | null
      family_color?: string | null
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
      // Saved: the income less every expense, the holiday included. The
      // free money is income less the committed everyday spending alone.
      expect(result.savingsTransfers).toBe(0)
      expect(result.savings).toBe(1450)
      expect(result.savingsRate).toBe(0.4833)
      expect(result.remainingToLive).toBe(2000)
    })

    it('reads a transfer into savings apart, without moving the savings', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 2000,
          }),
          createRow({
            category_name: 'Logement',
            total_amount: 500,
            nature: 'ESSENTIAL',
            rhythm: 'COMMITTED',
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
      expect(result.totalExpenses).toBe(500)
      expect(result.incomeByCategory.map(c => c.category)).toEqual(['Salaire'])
      expect(optionNames(result.allIncomeCategories)).toEqual(['Salaire'])
      // Where some of the money went, for information only.
      expect(result.savingsTransfers).toBe(350)
      // What the month kept: the transfers change none of it.
      expect(result.savings).toBe(1500)
      expect(result.savingsRate).toBe(0.75)
      expect(result.remainingToLive).toBe(1500)
    })

    it('reads a month in deficit as negative savings', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          createRow({
            category_name: 'Salaire',
            type: 'INCOME',
            total_amount: 1000,
          }),
          createRow({ category_name: 'Voyage', total_amount: 1250.5 }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.savings).toBe(-250.5)
      expect(result.savingsRate).toBe(-0.2505)
    })

    it('reports no rate and no free money without income', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([createRow({ total_amount: 100 })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getSummary(mockUserId, {})

      expect(result.savings).toBe(-100)
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

    it('reports the events month by month, from the event transactions', async () => {
      setupMocks([
        createRow({
          month_key: '2024-01',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 300,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 250,
        }),
        createRow({
          month_key: '2024-02',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          is_exceptional: true,
          total_amount: 180.456,
        }),
        createRow({
          month_key: '2024-03',
          category_id: 'cat-food',
          category_name: 'Alimentation',
          type: 'EXPENSE',
          total_amount: 320,
        }),
        createRow({
          month_key: '2024-01',
          category_id: 'cat-rent',
          category_name: 'Logement',
          type: 'EXPENSE',
          total_amount: 800,
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        includeCategoryBreakdown: true,
      })

      const food = result.expensesByCategory.find(
        c => c.category === 'Alimentation'
      )
      expect(food?.exceptionalAmount).toBe(180.46)
      expect(food?.exceptionalMonthlyAmounts).toEqual([0, 180.46, 0])
      const sum = (food?.exceptionalMonthlyAmounts ?? []).reduce(
        (a, b) => a + b,
        0
      )
      expect(sum).toBeCloseTo(food?.exceptionalAmount ?? NaN, 2)

      // Same presence rule as exceptionalAmount: a category untouched by any
      // event still carries the field, all months at zero.
      const rent = result.expensesByCategory.find(
        c => c.category === 'Logement'
      )
      expect(rent?.exceptionalAmount).toBe(0)
      expect(rent?.exceptionalMonthlyAmounts).toEqual([0, 0, 0])
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
          // A tag in no family.
          familyId: null,
          familyName: null,
          familyColor: null,
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
      expect(salary?.exceptionalMonthlyAmounts).toBeUndefined()
      expect(salary?.everydayAveragePerMonth).toBeUndefined()
    })

    it('omits the everyday fields when no breakdown is requested', async () => {
      setupMocks(mixedCategory('Voyages', '2024-01', 400, 600))

      const result = await service.getSummary(mockUserId, {})

      expect(result.expensesByCategory[0]?.amount).toBe(1000)
      expect(result.expensesByCategory[0]?.everydayAmount).toBeUndefined()
      expect(result.expensesByCategory[0]?.exceptionalAmount).toBeUndefined()
      expect(
        result.expensesByCategory[0]?.exceptionalMonthlyAmounts
      ).toBeUndefined()
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
      // No event here: monthly minus everyday would read the smoothing as one.
      expect(hightech?.exceptionalMonthlyAmounts).toEqual([0, 0])
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

    /** The calendar year in Paris, as the service reads it. */
    function parisYear(): number {
      return Number(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
        }).format(new Date())
      )
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
      expect(result.exceptionalExpensesOfYear).toBeNull()
      // The four queries of the summary, not one more.
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(4)
      expect(mockPrismaService.tagFamily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUserId } })
      )
    })

    it('lists the families with spending, biggest first, with envelope and remainder', async () => {
      const year = parisYear()
      mockPrismaService.tagFamily.findMany.mockResolvedValue([hyrox, travel])
      setupMocks([createRow({ total_amount: 100 })])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          family_id: 'fam-hyrox',
          event_year: year,
          transaction_count: 2,
          spent: 180.004,
          tag_count: 1,
          real_expenses: 12000.456,
          exceptional_expenses: 2400.004,
        },
        {
          family_id: 'fam-travel',
          event_year: year,
          transaction_count: 5,
          spent: 1250.5,
          tag_count: 2,
          real_expenses: 12000.456,
          exceptional_expenses: 2400.004,
        },
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      })

      expect(result.tagFamiliesOfYear).toEqual([
        {
          id: 'fam-travel',
          name: 'Voyages',
          color: '#22c55e',
          icon: 'plane',
          year,
          spent: 1250.5,
          spentByYear: [{ year, spent: 1250.5 }],
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
          spentByYear: [{ year, spent: 180 }],
          annualBudget: null,
          remaining: null,
          transactionCount: 2,
          tagCount: 1,
        },
      ])
      expect(result.realExpensesOfYear).toBe(12000.46)
      expect(result.exceptionalExpensesOfYear).toBe(2400)
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
      expect(result.exceptionalExpensesOfYear).toBeNull()
    })

    it('counts a line once per family, in event basis, with the family conventions', async () => {
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([])

      await service.getSummary(mockUserId, {})

      const { sql } = familiesQuery()
      // Grouped by transaction and family before anything is summed.
      expect(sql).toContain('GROUP BY tt.transaction_id, tg.family_id')
      // A line belongs to the year its dated tag starts in, read over
      // every year up to the current one, grouped by family and year.
      expect(sql).toContain(
        'EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int AS event_year'
      )
      expect(sql).toContain(
        'EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int <='
      )
      expect(sql).not.toContain(
        'EXTRACT(YEAR FROM COALESCE(ft.event_start, t.date))::int ='
      )
      expect(sql).toContain('GROUP BY y.family_id, y.event_year')
      expect(sql).toContain('AND y2.event_year = y.event_year')
      // Each family's spend and the year's real expenses are netted alike.
      expect(sql).toContain('ABS(t.amount::numeric) - COALESCE(ec.received, 0)')
      expect(sql).toContain('/ COALESCE(a.divisor, 1)')
      expect(sql).toContain("t.type IS DISTINCT FROM 'INCOME'")
      expect(sql).toContain('COALESCE(a.is_excluded_from_stats, false) = false')
      expect(sql).toContain('expense_credit')
      expect(sql).toContain('LEFT JOIN expense_credit ec')
    })

    it('counts only the current year in a line, and lists every year oldest first', async () => {
      const year = parisYear()
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          family_id: 'fam-travel',
          event_year: year,
          transaction_count: 3,
          spent: 420.256,
          tag_count: 1,
          real_expenses: 9000,
          exceptional_expenses: 1500,
        },
        {
          family_id: 'fam-travel',
          event_year: year - 2,
          transaction_count: 7,
          spent: 684.004,
          tag_count: 2,
          real_expenses: 9000,
          exceptional_expenses: 1500,
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.tagFamiliesOfYear).toEqual([
        expect.objectContaining({
          id: 'fam-travel',
          year,
          spent: 420.26,
          remaining: 579.74,
          transactionCount: 3,
          tagCount: 1,
          spentByYear: [
            { year: year - 2, spent: 684 },
            { year, spent: 420.26 },
          ],
        }),
      ])
    })

    it('leaves out a family without expenses this year', async () => {
      const year = parisYear()
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel, hyrox])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          family_id: 'fam-travel',
          event_year: year - 1,
          transaction_count: 4,
          spent: 800,
          tag_count: 1,
          real_expenses: 9000,
          exceptional_expenses: 1500,
        },
        {
          family_id: 'fam-hyrox',
          event_year: year,
          transaction_count: 1,
          spent: 90,
          tag_count: 1,
          real_expenses: 9000,
          exceptional_expenses: 1500,
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.tagFamiliesOfYear.map(f => f.id)).toEqual(['fam-hyrox'])
      expect(result.tagFamiliesOfYear[0]?.spentByYear).toEqual([
        { year, spent: 90 },
      ])
      expect(result.exceptionalExpensesOfYear).toBe(1500)
    })

    it("reads the year's exceptional expenses in the same query, by payment date", async () => {
      const year = parisYear()
      mockPrismaService.tagFamily.findMany.mockResolvedValue([travel])
      setupMocks([])
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          family_id: 'fam-travel',
          event_year: year,
          transaction_count: 1,
          spent: 100,
          tag_count: 1,
          real_expenses: 9000,
          exceptional_expenses: 1530.456,
        },
      ])

      const result = await service.getSummary(mockUserId, {})

      expect(result.exceptionalExpensesOfYear).toBe(1530.46)
      const { sql, values } = familiesQuery()
      // The rule of query 1: a transaction with one of the user's
      // exceptional tags.
      expect(sql).toContain('exceptional_tx AS (')
      expect(sql).toContain('tg.is_exceptional = true')
      expect(values).toContain(mockUserId)
      // Expenses paid that calendar year, joined on that rule, stats-excluded
      // accounts ignored.
      const block = sql.slice(
        sql.indexOf('exceptional_year AS ('),
        sql.indexOf('SELECT\n        y.family_id')
      )
      expect(block).toContain(
        'JOIN exceptional_tx et ON et.transaction_id = t.id'
      )
      expect(block).toContain("t.type = 'EXPENSE'")
      expect(block).toContain('t.date >= ?')
      expect(block).toContain('t.date < ?')
      expect(block).toContain(
        'COALESCE(a.is_excluded_from_stats, false) = false'
      )
      expect(block).toContain('LEFT JOIN expense_credit ec')
      expect(sql).toContain(
        '(SELECT expenses FROM exceptional_year) AS exceptional_expenses'
      )
      // Still one query for the families.
      expect(
        mockPrismaService.$queryRaw.mock.calls.filter(
          ([q]: [{ strings: string[] }]) =>
            q.strings.join('?').includes('year_tx AS')
        )
      ).toHaveLength(1)
    })
  })

  describe('the averages read the closed months', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // The 23rd of October 2026 in Paris: October is the current month.
      vi.setSystemTime(new Date('2026-10-23T10:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const groceries = (month_key: string, total_amount: number) =>
      createRow({
        month_key,
        category_name: 'Courses',
        subcategory: 'Supermarché',
        total_amount,
      })
    const salary = (month_key: string, total_amount: number) =>
      createRow({
        month_key,
        category_name: 'Salaires',
        type: 'INCOME',
        total_amount,
      })

    it('divides a period ending in the current month by its closed months, the current one left out', async () => {
      setupMocks([
        groceries('2026-08', 300),
        groceries('2026-09', 500),
        // Halfway through the month: drawn, never averaged.
        groceries('2026-10', 120),
        createRow({
          month_key: '2026-10',
          category_name: 'Courses',
          subcategory: 'Supermarché',
          is_exceptional: true,
          total_amount: 80,
        }),
        salary('2026-08', 2500),
        salary('2026-09', 2500),
        salary('2026-10', 1000),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-08-01',
        endDate: '2026-10-23',
        includeCategoryBreakdown: true,
      })

      expect(result.periodMonths).toBe(2)
      expect(result.monthLabels).toEqual(['2026-08', '2026-09', '2026-10'])
      // The current month stays in the series the charts draw.
      expect(result.monthlyData.map(m => m.month)).toEqual([
        '2026-08',
        '2026-09',
        '2026-10',
      ])
      const courses = result.expensesByCategory[0]
      expect(courses?.amount).toBe(1000)
      expect(courses?.monthlyAmounts).toEqual([300, 500, 200])
      expect(courses?.averagePerMonth).toBe(400)
      expect(courses?.everydayAveragePerMonth).toBe(400)
      expect(courses?.subcategories?.[0]?.averagePerMonth).toBe(400)
      const salaries = result.incomeByCategory[0]
      expect(salaries?.averagePerMonth).toBe(2500)
    })

    it('leaves the current month out of a smoothed line too', async () => {
      setupMocks([])
      mockAmortizedSlices.read.mockResolvedValue([
        smoothedRow({
          slices: [
            { month: '2026-08', amount: 50 },
            { month: '2026-09', amount: 50 },
            { month: '2026-10', amount: 50 },
          ],
        }),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-08-01',
        endDate: '2026-10-23',
        includeCategoryBreakdown: true,
      })

      const hightech = result.expensesByCategory[0]
      expect(hightech?.everydayAmount).toBe(150)
      expect(hightech?.everydayAveragePerMonth).toBe(50)
      expect(hightech?.subcategories?.[0]?.everydayAveragePerMonth).toBe(50)
    })

    it('divides a period entirely in the past by all its months', async () => {
      setupMocks([
        groceries('2026-06', 300),
        groceries('2026-07', 300),
        groceries('2026-08', 600),
      ])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        includeCategoryBreakdown: true,
      })

      expect(result.periodMonths).toBe(3)
      expect(result.expensesByCategory[0]?.averagePerMonth).toBe(400)
    })

    it('divides a period made of the current month alone by 1', async () => {
      setupMocks([groceries('2026-10', 120), salary('2026-10', 1000)])

      const result = await service.getSummary(mockUserId, {
        startDate: '2026-10-01',
        endDate: '2026-10-23',
        includeCategoryBreakdown: true,
      })

      expect(result.periodMonths).toBe(1)
      expect(result.expensesByCategory[0]?.averagePerMonth).toBe(120)
      expect(result.incomeByCategory[0]?.averagePerMonth).toBe(1000)
    })

    it('counts the closed months of an unbounded period from the months it holds', async () => {
      setupMocks([groceries('2026-07', 300), groceries('2026-10', 90)])

      const result = await service.getSummary(mockUserId, {
        includeCategoryBreakdown: true,
      })

      expect(result.periodMonths).toBe(1)
      expect(result.expensesByCategory[0]?.averagePerMonth).toBe(300)
    })
  })
  describe('the unfolded lines', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // The 23rd of October 2026: June to September are closed months.
      vi.setSystemTime(new Date('2026-10-23T10:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const PERIOD = {
      startDate: '2026-06-01',
      endDate: '2026-09-30',
      includeCategoryBreakdown: true,
    }

    const expense = (
      month_key: string,
      category_name: string,
      total_amount: number,
      attributes: {
        nature: string | null
        rhythm: string | null
        is_exceptional?: boolean
        is_recurring?: boolean
      }
    ) => createRow({ month_key, category_name, total_amount, ...attributes })

    const essentialVariable = { nature: 'ESSENTIAL', rhythm: 'VARIABLE' }
    const essentialCommitted = { nature: 'ESSENTIAL', rhythm: 'COMMITTED' }
    const pleasureVariable = { nature: 'PLEASURE', rhythm: 'VARIABLE' }
    const legacy = { nature: null, rhythm: null }

    /**
     * Four months, June empty: groceries, rent, restaurants, a streaming
     * subscription committed by its recurrence, a legacy line, and two
     * events — a trip in July, a hotel in September.
     */
    const LEDGER = [
      expense('2026-07', 'Courses', 400, essentialVariable),
      expense('2026-07', 'Logement', 800, essentialCommitted),
      expense('2026-07', 'Restaurants', 200, pleasureVariable),
      expense('2026-07', 'Ancienne', 50, legacy),
      expense('2026-07', 'Voyages', 600, {
        ...pleasureVariable,
        is_exceptional: true,
      }),
      expense('2026-08', 'Courses', 500, essentialVariable),
      expense('2026-08', 'Logement', 800, essentialCommitted),
      expense('2026-08', 'Restaurants', 100, pleasureVariable),
      expense('2026-08', 'Loisirs', 15, {
        nature: 'PLEASURE',
        rhythm: 'COMMITTED',
        is_recurring: true,
      }),
      expense('2026-09', 'Courses', 300, essentialVariable),
      expense('2026-09', 'Logement', 800, essentialCommitted),
      expense('2026-09', 'Restaurants', 300, pleasureVariable),
      expense('2026-09', 'Logement', 427, {
        ...essentialVariable,
        is_exceptional: true,
      }),
      createRow({
        month_key: '2026-09',
        category_name: 'Salaires',
        type: 'INCOME',
        total_amount: 2500,
      }),
    ]

    const EVENTS = [
      {
        id: 'tag-japon',
        name: 'Japon',
        color: '#ef4444',
        icon: null,
        family_id: 'fam-voyages',
        family_name: 'Voyages',
        family_color: '#3b82f6',
        amount: 600,
      },
      {
        id: 'tag-mariage',
        name: 'Mariage',
        color: null,
        icon: null,
        family_id: null,
        family_name: null,
        family_color: null,
        amount: 427,
      },
    ]

    const sum = (rows: { amount: number }[]) =>
      Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100

    it('lists the categories of each segment, which add up to the segment, on both readings', async () => {
      setupMocks(LEDGER, undefined, EVENTS)

      const result = await service.getSummary(mockUserId, PERIOD)

      const breakdown = result.structureBreakdown
      expect(breakdown).toBeDefined()
      for (const [reading, structure] of [
        ['everyday', result.everydaySpendingStructure],
        ['real', result.spendingStructure],
      ] as const) {
        for (const segment of [
          'essential',
          'pleasure',
          'committed',
          'variable',
        ] as const) {
          expect(sum(breakdown?.[reading][segment] ?? [])).toBe(
            structure[segment]
          )
        }
      }
      // The heaviest first, averaged over the four closed months; the
      // events out of the everyday reading, the legacy line out of both.
      expect(breakdown?.everyday.essential).toEqual([
        {
          categoryId: 'cat-Logement',
          category: 'Logement',
          icon: null,
          amount: 2400,
          averagePerMonth: 600,
        },
        {
          categoryId: 'cat-Courses',
          category: 'Courses',
          icon: null,
          amount: 1200,
          averagePerMonth: 300,
        },
      ])
      expect(breakdown?.real.pleasure.map(c => [c.category, c.amount])).toEqual(
        [
          // A tie reads in alphabetical order.
          ['Restaurants', 600],
          ['Voyages', 600],
          ['Loisirs', 15],
        ]
      )
      expect(breakdown?.real.essential[0]).toMatchObject({
        category: 'Logement',
        amount: 2827,
        averagePerMonth: 706.75,
      })
      // A line of a recurrence is committed, whatever its subcategory says.
      expect(breakdown?.everyday.committed.map(c => c.category)).toEqual([
        'Logement',
        'Loisirs',
      ])
      const named = Object.values(breakdown?.real ?? {}).flat()
      expect(named.map(c => c.category)).not.toContain('Ancienne')
    })

    it('gives each segment its share of every month, a month with nothing spent left blank', async () => {
      setupMocks(LEDGER, undefined, EVENTS)

      const result = await service.getSummary(mockUserId, PERIOD)

      expect(result.monthLabels).toEqual([
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
      ])
      // Everyday: July 200 of 1 450 (the legacy line in the total), August
      // 115 of 1 415, September 300 of 1 400.
      expect(result.structureShareByMonth?.everyday.pleasure).toEqual([
        null,
        13.8,
        8.1,
        21.4,
      ])
      expect(result.structureShareByMonth?.everyday.committed).toEqual([
        null,
        55.2,
        57.6,
        57.1,
      ])
      // Real: the trip in July's pleasure, the hotel in September's total.
      expect(result.structureShareByMonth?.real.pleasure).toEqual([
        null,
        39,
        8.1,
        16.4,
      ])
      expect(result.structureShareByMonth?.real.essential).toEqual([
        null,
        58.5,
        91.9,
        83.6,
      ])
    })

    it('reads the smoothed purchases by their slices in the everyday composition', async () => {
      setupMocks([
        expense('2026-07', 'High-tech', 1300, pleasureVariable),
        expense('2026-07', 'Courses', 400, essentialVariable),
      ])
      mockAmortizedSlices.read.mockResolvedValue([
        smoothedRow({
          source_month: '2026-07',
          source_in_window: true,
          slices: [
            { month: '2026-07', amount: 54.17 },
            { month: '2026-08', amount: 54.17 },
          ],
        }),
      ])

      const result = await service.getSummary(mockUserId, PERIOD)

      const everyday = result.structureBreakdown?.everyday
      expect(everyday?.committed).toEqual([
        expect.objectContaining({ category: 'High-tech', amount: 108.34 }),
      ])
      expect(everyday?.variable.map(c => c.category)).toEqual(['Courses'])
      expect(sum(everyday?.pleasure ?? [])).toBe(
        result.everydaySpendingStructure.pleasure
      )
      expect(result.structureShareByMonth?.everyday.pleasure).toEqual([
        null,
        11.9,
        100,
        null,
      ])
    })

    it('sums the exceptional expenses by category to what the events cost', async () => {
      setupMocks(LEDGER, undefined, EVENTS)

      const result = await service.getSummary(mockUserId, PERIOD)

      expect(result.exceptionalByCategory).toEqual([
        {
          categoryId: 'cat-Voyages',
          category: 'Voyages',
          icon: null,
          amount: 600,
        },
        {
          categoryId: 'cat-Logement',
          category: 'Logement',
          icon: null,
          amount: 427,
        },
      ])
      expect(sum(result.exceptionalByCategory ?? [])).toBe(
        sum(result.exceptionalEvents)
      )
      expect(sum(result.exceptionalByCategory ?? [])).toBe(
        result.totalExceptionalExpenses
      )
    })

    it('names the family of each event', async () => {
      setupMocks(LEDGER, undefined, EVENTS)

      const result = await service.getSummary(mockUserId, {
        startDate: PERIOD.startDate,
        endDate: PERIOD.endDate,
      })

      expect(result.exceptionalEvents).toEqual([
        expect.objectContaining({
          id: 'tag-japon',
          familyId: 'fam-voyages',
          familyName: 'Voyages',
          familyColor: '#3b82f6',
        }),
        expect.objectContaining({
          id: 'tag-mariage',
          familyId: null,
          familyName: null,
          familyColor: null,
        }),
      ])
    })

    it('leaves the unfolded lines out without the breakdown', async () => {
      setupMocks(LEDGER, undefined, EVENTS)

      const result = await service.getSummary(mockUserId, {
        startDate: PERIOD.startDate,
        endDate: PERIOD.endDate,
      })

      expect(result).not.toHaveProperty('structureBreakdown')
      expect(result).not.toHaveProperty('structureShareByMonth')
      expect(result).not.toHaveProperty('exceptionalByCategory')
    })
  })

  describe('the month band', () => {
    /** The reading day: October 2026 on its 23rd, September the last closed month. */
    const AS_OF = '2026-10-23'

    /**
     * A small ledger, month by month: the everyday spending, the events on
     * top of it, the income. Read back as the aggregation rows query 1
     * returns, already net.
     */
    const LEDGER: Record<
      string,
      { everyday: number; events?: number; income?: number }
    > = {
      '2026-04': { everyday: 1500, income: 2500 },
      '2026-05': { everyday: 1700, income: 2500 },
      '2026-06': { everyday: 1600, events: 600, income: 2500 },
      '2026-07': { everyday: 1400, income: 2600 },
      '2026-08': { everyday: 1800, events: 900, income: 2500 },
      '2026-09': { everyday: 1650, income: 2500 },
      // To date, and no salary yet: it lands on the 28th.
      '2026-10': { everyday: 1000, events: 300 },
    }

    function ledgerRows(
      ledger: typeof LEDGER = LEDGER
    ): ReturnType<typeof createRow>[] {
      return Object.entries(ledger).flatMap(([month, m]) => [
        createRow({
          month_key: month,
          category_name: 'Alimentation',
          total_amount: m.everyday,
        }),
        ...(m.events
          ? [
              createRow({
                month_key: month,
                category_name: 'Voyages',
                is_exceptional: true,
                total_amount: m.events,
              }),
            ]
          : []),
        ...(m.income
          ? [
              createRow({
                month_key: month,
                category_name: 'Salaires',
                type: 'INCOME',
                total_amount: m.income,
              }),
            ]
          : []),
        // A transfer to savings moves nothing.
        createRow({
          month_key: month,
          category_name: 'Épargne',
          type: 'TRANSFER',
          total_amount: -400,
        }),
      ])
    }

    function recurrence(
      overrides: Partial<RecurrenceOfMonthRow>
    ): RecurrenceOfMonthRow {
      return {
        id: 'rec',
        name: 'Série',
        status: 'ACTIVE',
        amount: 10,
        next_expected: '2026-10-28',
        category_id: 'cat-Abonnements',
        charged_this_month: false,
        excluded: false,
        ...overrides,
      }
    }

    const RECURRENCES: RecurrenceOfMonthRow[] = [
      recurrence({ id: 'netflix', name: 'Netflix', amount: 13.49 }),
      // Late: due on the 5th, not charged yet — still to come.
      recurrence({
        id: 'rent',
        name: 'Loyer',
        amount: 700,
        next_expected: '2026-10-05',
      }),
      // Due today, whatever fell earlier this month.
      recurrence({
        id: 'edf',
        name: 'EDF',
        amount: 80,
        next_expected: AS_OF,
        charged_this_month: true,
      }),
      // Due earlier and already charged this month: nothing more to come.
      recurrence({
        id: 'spotify',
        name: 'Spotify',
        next_expected: '2026-10-10',
        charged_this_month: true,
      }),
      recurrence({ id: 'gym', name: 'Salle', status: 'STOPPED' }),
      recurrence({ id: 'trial', name: 'Essai', status: 'CANDIDATE' }),
      recurrence({
        id: 'insurance',
        name: 'Assurance',
        next_expected: '2026-11-02',
      }),
      recurrence({ id: 'pro', name: 'Outil pro', excluded: true }),
    ]

    function setupMonth(
      rows = ledgerRows(),
      historyStart: string | null = '2025-01-05',
      recurrences = RECURRENCES
    ): void {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ start: historyStart }])
        .mockResolvedValueOnce(recurrences)
    }

    it('reads the habit as the median of the six closed months, prorated to the day', async () => {
      setupMonth()

      const result = await service.getMonth(mockUserId, { asOf: AS_OF })

      expect(mockRecurrences.refreshQuietly).toHaveBeenCalledWith(mockUserId)
      expect(result.month).toBe('2026-10')
      expect(result.asOfDay).toBe(23)
      expect(result.daysInMonth).toBe(31)
      // Vie courante by default: the events are out.
      expect(result.spent).toBe(1000)
      expect(result.spentSeries).toEqual([
        1500, 1700, 1600, 1400, 1800, 1650, 1000,
      ])
      // 1400 1500 1600 | 1650 1700 1800.
      expect(result.habit).toBe(1625)
      expect(result.habitMonths).toBe(6)
      // 1625 × 23 / 31.
      expect(result.habitToDate).toBe(1205.65)
    })

    it('reads the current month without its salary yet against the expected income', async () => {
      setupMonth()

      const result = await service.getMonth(mockUserId, { asOf: AS_OF })

      expect(result.incomeReceived).toBe(0)
      expect(result.incomeSeries).toEqual([2500, 2500, 2500, 2600, 2500, 2500])
      expect(result.incomeExpected).toBe(2500)
      // 2500 − 1000 − 793.49.
      expect(result.remainingToLive).toBe(706.51)
      expect(result.remainingShare).toBe(0.2826)
    })

    it('counts the active recurrences still due this month, late ones included, by date', async () => {
      setupMonth()

      const result = await service.getMonth(mockUserId, { asOf: AS_OF })

      expect(result.upcoming).toEqual([
        {
          id: 'rent',
          name: 'Loyer',
          amount: 700,
          nextExpected: '2026-10-05',
          categoryId: 'cat-Abonnements',
        },
        {
          id: 'edf',
          name: 'EDF',
          amount: 80,
          nextExpected: AS_OF,
          categoryId: 'cat-Abonnements',
        },
        {
          id: 'netflix',
          name: 'Netflix',
          amount: 13.49,
          nextExpected: '2026-10-28',
          categoryId: 'cat-Abonnements',
        },
      ])
      // Neither the stopped series, the candidate, next month's insurance,
      // the one already charged nor the stats-excluded one.
      expect(result.upcomingTotal).toBe(793.49)
    })

    it('reads everything in « Tout », events included, habit and month alike', async () => {
      setupMonth()

      const result = await service.getMonth(mockUserId, {
        asOf: AS_OF,
        reading: 'real',
      })

      expect(result.spent).toBe(1300)
      expect(result.spentSeries).toEqual([
        1500, 1700, 2200, 1400, 2700, 1650, 1300,
      ])
      // 1400 1500 1650 | 1700 2200 2700.
      expect(result.habit).toBe(1675)
      expect(result.habitToDate).toBe(1242.74)
      expect(result.remainingToLive).toBe(406.51)
    })

    it('spreads a smoothed purchase into its slices in the everyday reading only', async () => {
      setupMonth()
      mockAmortizedSlices.read.mockResolvedValue([
        smoothedRow({
          net: 1200,
          source_month: '2026-10',
          source_in_window: true,
          slices: [{ month: '2026-10', amount: 100 }],
        }),
      ])
      const everyday = await service.getMonth(mockUserId, { asOf: AS_OF })
      // The month spent the 1 200 € it carries? No: a slice of 100 €.
      expect(everyday.spent).toBe(1000 - 1200 + 100)

      setupMonth()
      const real = await service.getMonth(mockUserId, {
        asOf: AS_OF,
        reading: 'real',
      })
      expect(real.spent).toBe(1300)
    })

    it('has no habit under three closed months, and keeps the figures', async () => {
      // The first transaction on 10 July: July is not whole, August and
      // September are.
      setupMonth(ledgerRows(), '2026-07-10')

      const result = await service.getMonth(mockUserId, { asOf: AS_OF })

      expect(result.habitMonths).toBe(2)
      expect(result.habit).toBeNull()
      expect(result.habitToDate).toBeNull()
      expect(result.incomeExpected).toBeNull()
      expect(result.remainingToLive).toBeNull()
      expect(result.remainingShare).toBeNull()
      expect(result.spent).toBe(1000)
      expect(result.spentSeries).toEqual([1800, 1650, 1000])
      expect(result.incomeSeries).toEqual([2500, 2500])
      expect(result.upcomingTotal).toBe(793.49)
    })

    it('counts a month the history covers but nothing was spent in as zero', async () => {
      const { '2026-05': _quiet, ...rest } = LEDGER
      setupMonth(ledgerRows(rest))

      const result = await service.getMonth(mockUserId, { asOf: AS_OF })

      expect(result.spentSeries).toEqual([
        1500, 0, 1600, 1400, 1800, 1650, 1000,
      ])
      // 0 1400 1500 | 1600 1650 1800.
      expect(result.habit).toBe(1550)
    })

    it('reads the window up to the end of the day it is read at, in the summary scope', async () => {
      setupMonth()

      await service.getMonth(mockUserId, { asOf: AS_OF })

      const [aggregation] = mockPrismaService.$queryRaw.mock.calls[0] as [
        { strings: string[]; values: unknown[] },
      ]
      expect(aggregation.strings.join('')).toContain('is_excluded_from_stats')
      expect(aggregation.values).toContainEqual(
        new Date('2026-04-01T00:00:00.000Z')
      )
      expect(aggregation.values).toContainEqual(
        new Date('2026-10-23T23:59:59.999Z')
      )
      const [slices] = mockAmortizedSlices.read.mock.calls[0] as [
        { firstMonth: string; lastMonth: string },
      ]
      expect(slices.firstMonth).toBe('2026-04-01')
      expect(slices.lastMonth).toBe('2026-10-01')
    })

    it('reads today in Paris when no day is given', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // 23:30 UTC on 31 October is already 1 November in Paris.
      vi.setSystemTime(new Date('2026-10-31T23:30:00.000Z'))
      try {
        setupMonth()
        const result = await service.getMonth(mockUserId, {})
        expect(result.month).toBe('2026-11')
        expect(result.asOfDay).toBe(1)
        expect(result.daysInMonth).toBe(30)
      } finally {
        vi.useRealTimers()
      }
    })

    describe('the reimbursements', () => {
      const netAmountOf = (): string => {
        const [query] = mockAmortizedSlices.read.mock.calls[0] as [
          { netAmount: { sql: string } },
        ]
        return query.netAmount.sql
      }
      const aggregationOf = (): string => {
        const [aggregation] = mockPrismaService.$queryRaw.mock.calls[0] as [
          { sql: string },
        ]
        return aggregation.sql
      }

      it('deducts both by default, the debts still owed as the preference says', async () => {
        mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
          true
        )
        setupMonth()

        await service.getMonth(mockUserId, { asOf: AS_OF })

        expect(
          mockFilterPreferencesService.deductsPendingByDefault
        ).toHaveBeenCalledWith(mockUserId)
        const expected = netAmountSql({
          deductReceived: true,
          deductPending: true,
        }).sql
        expect(netAmountOf()).toBe(expected)
        expect(aggregationOf()).toContain(expected)
      })

      it('follows the switches when the request says them', async () => {
        mockFilterPreferencesService.deductsPendingByDefault.mockResolvedValue(
          true
        )
        setupMonth()

        await service.getMonth(mockUserId, {
          asOf: AS_OF,
          deductReimbursements: false,
          deductPendingReimbursements: false,
        })

        expect(
          mockFilterPreferencesService.deductsPendingByDefault
        ).not.toHaveBeenCalled()
        const expected = netAmountSql({
          deductReceived: false,
          deductPending: false,
        }).sql
        expect(netAmountOf()).toBe(expected)
        expect(aggregationOf()).toContain(expected)
      })

      it('reads the rows as they come, already net', async () => {
        // 3 700 lent and claimed back: the row arrives at zero.
        setupMonth([
          ...ledgerRows(),
          createRow({
            month_key: '2026-10',
            category_name: 'Famille et amis',
            total_amount: 0,
            pending_credit: 3700,
          }),
        ])

        const result = await service.getMonth(mockUserId, { asOf: AS_OF })

        expect(result.spent).toBe(1000)
      })
    })
  })
})

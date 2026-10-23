import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDashboardData } from './useDashboardData'
import { api } from '@/lib/api'
import type { DashboardSummaryDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  UNCATEGORIZED_CATEGORY_ID: '__uncategorized__',
  api: {
    getDashboardSummary: vi.fn(),
    getTransactions: vi.fn(),
    getAccounts: vi.fn(),
  },
}))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    deductPendingReimbursements: false,
    setDeductPendingReimbursements: vi.fn(),
    timePeriod: 'all',
    setTimePeriod: vi.fn(),
    getDateRangeFromPeriod: vi.fn(() => ({ startDate: null, endDate: null })),
  }),
}))

// Configurable mock for accounts store
let mockAccountDivisors: Record<string, number> = {}

vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [],
    isLoading: false,
    error: null,
    load: vi.fn().mockResolvedValue(undefined),
    getDivisor: vi.fn(
      (accountId: string) => mockAccountDivisors[accountId] ?? 1
    ),
  }),
}))

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountDivisors = {}
  })

  const mockSummary: DashboardSummaryDto = {
    monthlyData: [
      {
        month: '2024-01',
        label: 'Jan 2024',
        expenses: 165.5,
        netExpenses: 165.5,
        income: 2500,
        exceptionalExpenses: 0,
        everydayNetExpenses: 165.5,
      },
      {
        month: '2024-02',
        label: 'Fév 2024',
        expenses: 800,
        netExpenses: 800,
        income: 2500,
        exceptionalExpenses: 0,
        everydayNetExpenses: 800,
      },
    ],
    // `monthlyAmounts` is aligned with `monthLabels`, and is what the
    // drill-down charts read now that the server computes the netting.
    expensesByCategory: [
      {
        categoryId: 'cat-Logement',
        category: 'Logement',
        amount: 800,
        monthlyAmounts: [0, 800],
      },
      {
        categoryId: 'cat-Alimentation',
        category: 'Alimentation',
        amount: 165.5,
        monthlyAmounts: [165.5, 0],
      },
    ],
    incomeByCategory: [
      {
        categoryId: 'cat-Salaires',
        category: 'Salaires',
        amount: 5000,
        monthlyAmounts: [2500, 2500],
      },
    ],
    monthLabels: ['2024-01', '2024-02'],
    totalExpenses: 965.5,
    totalIncome: 5000,
    allExpenseCategories: [
      { id: 'cat-Alimentation', name: 'Alimentation' },
      { id: 'cat-Logement', name: 'Logement' },
    ],
    allIncomeCategories: [{ id: 'cat-Salaires', name: 'Salaires' }],
    availableAccounts: ['Compte Courant'],
    totalExceptionalExpenses: 0,
    exceptionalEvents: [],
  }

  describe('fetchData', () => {
    it('should fetch dashboard summary and update state', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, monthlyData, isLoading, error } = useDashboardData()

      expect(isLoading.value).toBe(false)

      await fetchData()

      expect(api.getDashboardSummary).toHaveBeenCalledWith({
        startDate: undefined,
        endDate: undefined,
        deductReimbursements: true,
        deductPendingReimbursements: false,
        includeCategoryBreakdown: true,
      })
      expect(isLoading.value).toBe(false)
      expect(error.value).toBeNull()
      expect(monthlyData.value).toHaveLength(2)
    })

    it('should set loading state during fetch', async () => {
      let resolvePromise: ((value: DashboardSummaryDto) => void) | undefined
      const promise = new Promise<DashboardSummaryDto>(resolve => {
        resolvePromise = resolve
      })
      vi.mocked(api.getDashboardSummary).mockReturnValue(promise)

      const { fetchData, isLoading } = useDashboardData()

      expect(isLoading.value).toBe(false)

      const fetchPromise = fetchData()
      expect(isLoading.value).toBe(true)

      if (resolvePromise) {
        resolvePromise(mockSummary)
      }
      await fetchPromise

      expect(isLoading.value).toBe(false)
    })

    it('should handle API errors', async () => {
      vi.mocked(api.getDashboardSummary).mockRejectedValue(
        new Error('Network error')
      )

      const { fetchData, error, isLoading } = useDashboardData()
      await fetchData()

      expect(error.value).toBe('Network error')
      expect(isLoading.value).toBe(false)
    })

    it('should handle empty summary', async () => {
      const emptySummary: DashboardSummaryDto = {
        monthlyData: [],
        expensesByCategory: [],
        incomeByCategory: [],
        totalExpenses: 0,
        totalIncome: 0,
        allExpenseCategories: [],
        allIncomeCategories: [],
        availableAccounts: [],
        totalExceptionalExpenses: 0,
        exceptionalEvents: [],
      }

      vi.mocked(api.getDashboardSummary).mockResolvedValue(emptySummary)

      const { fetchData, monthlyData, expensesByMonth, incomeByMonth } =
        useDashboardData()
      await fetchData()

      expect(monthlyData.value).toHaveLength(0)
      expect(expensesByMonth.value.labels).toEqual([])
      expect(expensesByMonth.value.values).toEqual([])
      expect(incomeByMonth.value.labels).toEqual([])
      expect(incomeByMonth.value.values).toEqual([])
    })
  })

  describe('computed properties from summary', () => {
    it('should compute expensesByMonth from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, expensesByMonth } = useDashboardData()
      await fetchData()

      expect(expensesByMonth.value.labels).toEqual(['Jan 2024', 'Fév 2024'])
      expect(expensesByMonth.value.values).toEqual([165.5, 800])
    })

    it('should compute incomeByMonth from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, incomeByMonth } = useDashboardData()
      await fetchData()

      expect(incomeByMonth.value.labels).toEqual(['Jan 2024', 'Fév 2024'])
      expect(incomeByMonth.value.values).toEqual([2500, 2500])
    })

    it('should compute totalExpenses from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, totalExpenses } = useDashboardData()
      await fetchData()

      expect(totalExpenses.value).toBe(965.5)
    })

    it('should compute totalIncome from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, totalIncome } = useDashboardData()
      await fetchData()

      expect(totalIncome.value).toBe(5000)
    })

    it('reads the savings as income less expenses, the server first', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...mockSummary,
        savings: 4034.5,
      })
      const fromServer = useDashboardData()
      await fromServer.fetchData()
      expect(fromServer.savings.value).toBe(4034.5)

      // An older server without the field: the same definition, locally.
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      const local = useDashboardData()
      await local.fetchData()
      expect(local.savings.value).toBe(4034.5)
    })

    it('should compute expensesByCategory from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, expensesByCategory } = useDashboardData()
      await fetchData()

      expect(expensesByCategory.value.labels).toEqual([
        'Logement',
        'Alimentation',
      ])
      expect(expensesByCategory.value.values).toEqual([800, 165.5])
    })

    it('should compute incomeByCategory from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, incomeByCategory } = useDashboardData()
      await fetchData()

      expect(incomeByCategory.value.labels).toEqual(['Salaires'])
      expect(incomeByCategory.value.values).toEqual([5000])
    })

    it('should return all expense categories from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, allExpenseCategories } = useDashboardData()
      await fetchData()

      expect(allExpenseCategories.value.map(c => c.name)).toEqual([
        'Alimentation',
        'Logement',
      ])
    })

    it('should return all income categories from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, allIncomeCategories } = useDashboardData()
      await fetchData()

      expect(allIncomeCategories.value.map(c => c.name)).toEqual(['Salaires'])
    })
  })

  describe('income drill-down', () => {
    const mockIncomeTransactions: TransactionDto[] = [
      {
        id: '3',
        date: '2024-01-25T00:00:00.000Z',
        description: 'Salaire',
        amount: 2500.0,
        type: 'INCOME',
        accountId: 'Compte Courant',
        account: 'Compte Courant',
        categoryId: 'cat-Salaires',
        categoryName: 'Salaires',
        isPointed: true,
        createdAt: '2024-01-25T00:00:00.000Z',
      },
      {
        id: '5',
        date: '2024-02-25T00:00:00.000Z',
        description: 'Salaire',
        amount: 2500.0,
        type: 'INCOME',
        accountId: 'Compte Courant',
        account: 'Compte Courant',
        categoryId: 'cat-Salaires',
        categoryName: 'Salaires',
        isPointed: true,
        createdAt: '2024-02-25T00:00:00.000Z',
      },
    ]

    it('should return overall income when no category is selected', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, filteredIncomeByMonth, selectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      expect(selectedIncomeCategory.value).toBeNull()
      expect(filteredIncomeByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredIncomeByMonth.value.values).toEqual([2500, 2500])
    })

    it('shows the selected income category monthly series', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, filteredIncomeByMonth, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      setSelectedIncomeCategory('cat-Salaires')

      expect(filteredIncomeByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredIncomeByMonth.value.values).toEqual([2500, 2500])
    })

    it('should update selected income category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: mockIncomeTransactions,
        meta: {
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const { fetchData, selectedIncomeCategory, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      expect(selectedIncomeCategory.value).toBeNull()

      await setSelectedIncomeCategory('cat-Salaires')
      expect(selectedIncomeCategory.value).toBe('cat-Salaires')

      await setSelectedIncomeCategory(null)
      expect(selectedIncomeCategory.value).toBeNull()
    })
  })

  describe('everyday vs exceptional aggregation', () => {
    const summaryWithEvents: DashboardSummaryDto = {
      monthlyData: [
        {
          month: '2024-01',
          label: 'Jan 2024',
          expenses: 800,
          netExpenses: 800,
          income: 2500,
          exceptionalExpenses: 0,
          everydayNetExpenses: 800,
        },
        {
          month: '2024-02',
          label: 'Fév 2024',
          expenses: 1400,
          netExpenses: 1400,
          income: 2500,
          exceptionalExpenses: 600,
          everydayNetExpenses: 800,
        },
      ],
      expensesByCategory: [
        {
          categoryId: 'cat-Logement',
          category: 'Logement',
          amount: 1600,
          everydayAmount: 1600,
          exceptionalAmount: 0,
          averagePerMonth: 800,
          everydayAveragePerMonth: 800,
        },
        {
          categoryId: 'cat-Voyages',
          category: 'Voyages',
          amount: 600,
          everydayAmount: 0,
          exceptionalAmount: 600,
          averagePerMonth: 300,
          everydayAveragePerMonth: 0,
        },
      ],
      incomeByCategory: [
        {
          categoryId: 'cat-Salaires',
          category: 'Salaires',
          amount: 5000,
        },
      ],
      totalExpenses: 2200,
      totalIncome: 5000,
      allExpenseCategories: [
        { id: 'cat-Logement', name: 'Logement' },
        { id: 'cat-Voyages', name: 'Voyages' },
      ],
      allIncomeCategories: [{ id: 'cat-Salaires', name: 'Salaires' }],
      availableAccounts: ['Compte Courant'],
      periodMonths: 2,
      monthLabels: ['2024-01', '2024-02'],
      totalExceptionalExpenses: 600,
      exceptionalEvents: [
        {
          id: 'tag-1',
          name: 'Vacances Italie',
          color: '#06b6d4',
          icon: null,
          amount: 600,
        },
      ],
    }

    it('sums the everyday share across categories', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)

      const { fetchData, totalEverydayExpenses, totalExceptionalExpenses } =
        useDashboardData()
      await fetchData()

      expect(totalEverydayExpenses.value).toBe(1600)
      expect(totalExceptionalExpenses.value).toBe(600)
    })

    it('exposes the events of the period', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)

      const { fetchData, exceptionalEvents, hasExceptionalExpenses } =
        useDashboardData()
      await fetchData()

      expect(hasExceptionalExpenses.value).toBe(true)
      expect(exceptionalEvents.value).toHaveLength(1)
      expect(exceptionalEvents.value[0]?.name).toBe('Vacances Italie')
    })

    it('carries one reading for the whole page, persisted, everyday by default', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)

      const {
        fetchData,
        breakdownMode,
        setBreakdownMode,
        displayedTotalExpenses,
      } = useDashboardData()
      await fetchData()

      expect(breakdownMode.value).toBe('everyday')
      expect(displayedTotalExpenses.value).toBe(1600)

      setBreakdownMode('real')
      expect(displayedTotalExpenses.value).toBe(2200)
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dashboard-breakdown-mode',
        'real'
      )

      // A fresh composable reads the choice back.
      vi.mocked(localStorage.getItem).mockReturnValue('real')
      expect(useDashboardData().breakdownMode.value).toBe('real')
    })

    it('reports no exceptional spending when there is none', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...summaryWithEvents,
        // The averages read the months: they say no event either.
        monthlyData: summaryWithEvents.monthlyData.map(m => ({
          ...m,
          expenses: 800,
          netExpenses: 800,
          exceptionalExpenses: 0,
          everydayNetExpenses: 800,
        })),
        expensesByCategory: [
          {
            categoryId: 'cat-Logement',
            category: 'Logement',
            amount: 1600,
            everydayAmount: 1600,
            exceptionalAmount: 0,
          },
        ],
        totalExpenses: 1600,
        totalExceptionalExpenses: 0,
        exceptionalEvents: [],
      })

      const { fetchData, hasExceptionalExpenses, totalEverydayExpenses } =
        useDashboardData()
      await fetchData()

      expect(hasExceptionalExpenses.value).toBe(false)
      // With no event, both readings are strictly identical.
      expect(totalEverydayExpenses.value).toBe(1600)
    })

    it('falls back to the real amounts when the everyday share is absent', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...summaryWithEvents,
        // A response without the category breakdown carries no everyday field.
        expensesByCategory: [
          {
            categoryId: 'cat-Logement',
            category: 'Logement',
            amount: 1600,
          },
          {
            categoryId: 'cat-Voyages',
            category: 'Voyages',
            amount: 600,
          },
        ],
        totalExceptionalExpenses: 0,
      })

      const { fetchData, totalEverydayExpenses } = useDashboardData()
      await fetchData()

      expect(totalEverydayExpenses.value).toBe(2200)
    })
  })
})

describe('useDashboardData — smoothed purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  /**
   * January carries a 600 event; a 1 200 € phone bought in January is
   * smoothed over 12 months (100 a month). March has nothing real in it:
   * only the phone's slice reaches it, as does a category with no row.
   */
  const summary: DashboardSummaryDto = {
    monthlyData: [
      {
        month: '2024-01',
        label: 'Jan 2024',
        expenses: 2600,
        netExpenses: 2600,
        income: 2500,
        exceptionalExpenses: 600,
        everydayNetExpenses: 900,
        amortizedExpenses: 100,
      },
      {
        month: '2024-02',
        label: 'Fév 2024',
        expenses: 800,
        netExpenses: 800,
        income: 2500,
        exceptionalExpenses: 0,
        everydayNetExpenses: 900,
        amortizedExpenses: 100,
      },
      {
        month: '2024-03',
        label: 'Mars 2024',
        expenses: 0,
        netExpenses: 0,
        income: 0,
        exceptionalExpenses: 0,
        everydayNetExpenses: 100,
        amortizedExpenses: 100,
      },
    ],
    expensesByCategory: [
      {
        categoryId: 'cat-Logement',
        category: 'Logement',
        amount: 3400,
        transactionCount: 4,
        everydayAmount: 1600,
        exceptionalAmount: 600,
      },
      {
        categoryId: 'cat-Tech',
        category: 'High-tech',
        amount: 0,
        transactionCount: 0,
        everydayAmount: 300,
        exceptionalAmount: 0,
        amortizedAmount: 300,
      },
    ],
    incomeByCategory: [],
    totalExpenses: 3400,
    totalIncome: 5000,
    allExpenseCategories: [],
    allIncomeCategories: [],
    availableAccounts: [],
    periodMonths: 3,
    monthLabels: ['2024-01', '2024-02', '2024-03'],
    totalExceptionalExpenses: 600,
    exceptionalEvents: [],
  }

  it('reads the real months and categories as before, without the carriers', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(summary)
    const data = useDashboardData()
    await data.fetchData()

    expect(data.hasAmortizedExpenses.value).toBe(true)
    expect(data.monthlyData.value).toHaveLength(3)
    expect(data.expenseCategoriesDetailed.value).toHaveLength(2)

    data.setBreakdownMode('real')
    expect(data.monthlyData.value.map(m => m.month)).toEqual([
      '2024-01',
      '2024-02',
    ])
    expect(data.periodMonths.value).toBe(2)
    expect(data.averageMonthlyExpenses.value).toBe(1700)
    expect(data.expenseCategoriesDetailed.value.map(c => c.category)).toEqual([
      'Logement',
    ])
  })
})

describe('useDashboardData — the closed months', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 23, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const month = (
    key: string,
    netExpenses: number,
    income: number,
    exceptionalExpenses = 0
  ) => ({
    month: key,
    label: key,
    expenses: netExpenses,
    netExpenses,
    income,
    exceptionalExpenses,
    everydayNetExpenses: netExpenses - exceptionalExpenses,
  })

  /** August and September closed; October on its 23rd. */
  const summary: DashboardSummaryDto = {
    monthlyData: [
      month('2026-08', 1000, 2500, 200),
      month('2026-09', 1200, 2500),
      month('2026-10', 400, 0),
    ],
    expensesByCategory: [
      {
        categoryId: 'cat-a',
        category: 'A',
        amount: 2600,
        everydayAmount: 2400,
      },
    ],
    incomeByCategory: [],
    totalExpenses: 2600,
    totalIncome: 5000,
    allExpenseCategories: [],
    allIncomeCategories: [],
    availableAccounts: [],
    periodMonths: 2,
    monthLabels: ['2026-08', '2026-09', '2026-10'],
    totalExceptionalExpenses: 200,
    exceptionalEvents: [],
  }

  it('reads periodMonths from the server, not the months it draws', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(summary)
    const data = useDashboardData()
    await data.fetchData()

    expect(data.monthlyData.value).toHaveLength(3)
    expect(data.periodMonths.value).toBe(2)
    expect(data.averagesReadClosedMonths.value).toBe(true)
  })

  it('leaves the current month out of every average', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(summary)
    const data = useDashboardData()
    await data.fetchData()

    expect(data.averageMonthlyExpenses.value).toBe(1100)
    expect(data.averageMonthlyIncome.value).toBe(2500)
    expect(data.averageMonthlySavings.value).toBe(1400)
  })

  it('averages the current month alone over 1, and says so', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue({
      ...summary,
      monthlyData: [month('2026-10', 400, 1000)],
      totalExpenses: 400,
      totalIncome: 1000,
      periodMonths: 1,
      monthLabels: ['2026-10'],
    })
    const data = useDashboardData()
    await data.fetchData()

    expect(data.periodMonths.value).toBe(1)
    expect(data.averageMonthlyExpenses.value).toBe(400)
    expect(data.averagesReadClosedMonths.value).toBe(false)
  })

  it('divides by the months drawn on a server without the field', async () => {
    const { periodMonths: _omitted, ...older } = summary
    vi.mocked(api.getDashboardSummary).mockResolvedValue(older)
    const data = useDashboardData()
    await data.fetchData()

    expect(data.periodMonths.value).toBe(3)
    expect(data.averageMonthlyExpenses.value).toBe(866.67)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDashboardData } from './useDashboardData'
import { api } from '@/lib/api'
import type { DashboardSummaryDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  UNCATEGORIZED_CATEGORY_ID: '__uncategorized__',
  api: {
    getDashboardSummary: vi.fn(),
    getTransactions: vi.fn(),
    getCategoryAssociations: vi.fn(),
    getAccounts: vi.fn(),
  },
}))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    hiddenExpenseCategoryIds: [],
    hiddenIncomeCategoryIds: [],
    globalHiddenExpenseCategoryIds: [],
    globalHiddenIncomeCategoryIds: [],
    isExpenseCategoryHidden: vi.fn(() => false),
    isIncomeCategoryHidden: vi.fn(() => false),
    isExpenseCategoryGloballyHidden: vi.fn(() => false),
    isIncomeCategoryGloballyHidden: vi.fn(() => false),
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

// Configurable mock for category associations
let mockAssociations: Array<{
  expenseCategoryId: string
  incomeCategoryId: string
}> = []

vi.mock('@/stores/categoryAssociations', () => ({
  useCategoryAssociationsStore: () => ({
    get associations() {
      return mockAssociations
    },
    isLoading: false,
    error: null,
    load: vi.fn().mockResolvedValue(undefined),
    isIncomeCategoryAssociated: vi.fn(() => false),
  }),
}))

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssociations = []
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

  const mockTransactions: TransactionDto[] = [
    {
      id: '1',
      date: '2024-01-15T00:00:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      type: 'EXPENSE',
      accountId: 'Compte Courant',
      account: 'Compte Courant',
      categoryId: 'cat-Alimentation',
      categoryName: 'Alimentation',
      isPointed: false,
      createdAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: '2',
      date: '2024-01-20T00:00:00.000Z',
      description: 'Courses',
      amount: -120.0,
      type: 'EXPENSE',
      accountId: 'Compte Courant',
      account: 'Compte Courant',
      categoryId: 'cat-Alimentation',
      categoryName: 'Alimentation',
      isPointed: false,
      createdAt: '2024-01-20T00:00:00.000Z',
    },
  ]

  describe('fetchData', () => {
    it('should fetch dashboard summary and update state', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, monthlyData, isLoading, error } = useDashboardData()

      expect(isLoading.value).toBe(false)

      await fetchData()

      expect(api.getDashboardSummary).toHaveBeenCalledWith({
        hiddenExpenseCategoryIds: [],
        hiddenIncomeCategoryIds: [],
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

  describe('drill-down functionality', () => {
    it('should return overall expenses when no category is selected', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, filteredExpensesByMonth, selectedCategory } =
        useDashboardData()
      await fetchData()

      expect(selectedCategory.value).toBeNull()
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([165.5, 800])
    })

    it('shows the selected category monthly series', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, filteredExpensesByMonth, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      setSelectedCategory('cat-Alimentation')

      // Read straight from the summary rather than recomputed from raw
      // transactions, so the chart cannot disagree with the breakdown beside it.
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([165.5, 0])
    })

    it('does not fetch transactions to draw the drill-down', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, setSelectedCategory } = useDashboardData()
      await fetchData()
      setSelectedCategory('cat-Alimentation')

      // Selecting a category used to trigger a full paginated walk of every
      // transaction on the account.
      expect(api.getTransactions).not.toHaveBeenCalled()
    })

    it('should show all months with zeros when no transactions match selected category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: mockTransactions,
        meta: {
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const { fetchData, filteredExpensesByMonth, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('cat-Catégorie Inexistante')

      // All months from period shown with zero values
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([0, 0])
    })

    it('should clear selected category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: mockTransactions,
        meta: {
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const { fetchData, selectedCategory, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('cat-Alimentation')
      expect(selectedCategory.value).toBe('cat-Alimentation')

      await setSelectedCategory(null)
      expect(selectedCategory.value).toBeNull()
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

    it('uses the same divisor as the real average', async () => {
      // The regression: dividing the everyday total by a shrunken number of
      // "everyday months" moved figures that carried no event at all.
      vi.mocked(api.getDashboardSummary).mockResolvedValue(summaryWithEvents)

      const {
        fetchData,
        averageMonthlyExpenses,
        averageEverydayMonthlyExpenses,
        periodMonths,
      } = useDashboardData()
      await fetchData()

      expect(periodMonths.value).toBe(2)
      expect(averageMonthlyExpenses.value).toBe(1100) // 2200 / 2
      expect(averageEverydayMonthlyExpenses.value).toBe(800) // 1600 / 2

      // The gap between both figures is exactly the exceptional spending.
      const gap =
        (averageMonthlyExpenses.value - averageEverydayMonthlyExpenses.value) *
        periodMonths.value
      expect(gap).toBeCloseTo(totalExceptionalOf(summaryWithEvents), 2)
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

    it('reports no exceptional spending when there is none', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue({
        ...summaryWithEvents,
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

      const {
        fetchData,
        hasExceptionalExpenses,
        averageMonthlyExpenses,
        averageEverydayMonthlyExpenses,
      } = useDashboardData()
      await fetchData()

      expect(hasExceptionalExpenses.value).toBe(false)
      // With no event, both averages must be strictly identical.
      expect(averageEverydayMonthlyExpenses.value).toBe(
        averageMonthlyExpenses.value
      )
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

/** Total exceptional spending declared by a summary fixture. */
function totalExceptionalOf(summary: DashboardSummaryDto): number {
  return summary.expensesByCategory.reduce(
    (acc, c) => acc + (c.exceptionalAmount ?? 0),
    0
  )
}

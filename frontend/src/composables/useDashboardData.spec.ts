import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDashboardData } from './useDashboardData'
import { api } from '@/lib/api'
import type { DashboardSummaryDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getDashboardSummary: vi.fn(),
    getTransactions: vi.fn(),
  },
}))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    jointAccounts: [],
    hiddenExpenseCategories: [],
    hiddenIncomeCategories: [],
    categoryAssociations: [],
    isJointAccount: vi.fn(() => false),
    isExpenseCategoryHidden: vi.fn(() => false),
    isIncomeCategoryHidden: vi.fn(() => false),
  }),
}))

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSummary: DashboardSummaryDto = {
    monthlyData: [
      { month: '2024-01', label: 'Jan 2024', expenses: 165.5, income: 2500 },
      { month: '2024-02', label: 'Fév 2024', expenses: 800, income: 2500 },
    ],
    expensesByCategory: [
      { category: 'Logement', amount: 800 },
      { category: 'Alimentation', amount: 165.5 },
    ],
    incomeByCategory: [{ category: 'Salaires', amount: 5000 }],
    totalExpenses: 965.5,
    totalIncome: 5000,
    allExpenseCategories: ['Alimentation', 'Logement'],
    allIncomeCategories: ['Salaires'],
    availableAccounts: ['Compte Courant'],
  }

  const mockTransactions: TransactionDto[] = [
    {
      id: '1',
      date: '2024-01-15T00:00:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      type: 'EXPENSE',
      account: 'Compte Courant',
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
      account: 'Compte Courant',
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
        jointAccounts: [],
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
        categoryAssociations: [],
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

      expect(allExpenseCategories.value).toEqual(['Alimentation', 'Logement'])
    })

    it('should return all income categories from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, allIncomeCategories } = useDashboardData()
      await fetchData()

      expect(allIncomeCategories.value).toEqual(['Salaires'])
    })

    it('should return available accounts from summary', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)

      const { fetchData, availableAccounts } = useDashboardData()
      await fetchData()

      expect(availableAccounts.value).toEqual(['Compte Courant'])
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

    it('should load transactions when category is selected for drill-down', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, setSelectedCategory, selectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Alimentation')

      expect(selectedCategory.value).toBe('Alimentation')
      expect(api.getTransactions).toHaveBeenCalled()
    })

    it('should filter expenses by selected category after loading transactions', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, filteredExpensesByMonth, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Alimentation')

      // Only Alimentation expenses (45.5 + 120 = 165.5) in January
      expect(filteredExpensesByMonth.value.labels).toEqual(['Jan 2024'])
      expect(filteredExpensesByMonth.value.values).toEqual([165.5])
    })

    it('should return empty data when no transactions match selected category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, filteredExpensesByMonth, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Catégorie Inexistante')

      expect(filteredExpensesByMonth.value.labels).toEqual([])
      expect(filteredExpensesByMonth.value.values).toEqual([])
    })

    it('should not reload transactions if already loaded', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, setSelectedCategory, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Alimentation')
      await setSelectedIncomeCategory('Salaires')

      // Should only call getTransactions once
      expect(api.getTransactions).toHaveBeenCalledTimes(1)
    })

    it('should clear selected category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, selectedCategory, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Alimentation')
      expect(selectedCategory.value).toBe('Alimentation')

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
        account: 'Compte Courant',
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
        account: 'Compte Courant',
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

    it('should filter income by selected category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockIncomeTransactions)

      const { fetchData, filteredIncomeByMonth, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedIncomeCategory('Salaires')

      expect(filteredIncomeByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredIncomeByMonth.value.values).toEqual([2500, 2500])
    })

    it('should update selected income category', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockIncomeTransactions)

      const { fetchData, selectedIncomeCategory, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      expect(selectedIncomeCategory.value).toBeNull()

      await setSelectedIncomeCategory('Salaires')
      expect(selectedIncomeCategory.value).toBe('Salaires')

      await setSelectedIncomeCategory(null)
      expect(selectedIncomeCategory.value).toBeNull()
    })
  })

  describe('data reset on refetch', () => {
    it('should reset transactions when fetchData is called again', async () => {
      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const { fetchData, setSelectedCategory, transactions } =
        useDashboardData()

      await fetchData()
      await setSelectedCategory('Alimentation')

      expect(transactions.value).toHaveLength(2)

      // Fetch data again
      await fetchData()

      // Transactions should be reset
      expect(transactions.value).toHaveLength(0)
    })
  })
})

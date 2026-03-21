import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDashboardData } from './useDashboardData'
import { api } from '@/lib/api'
import type { DashboardSummaryDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getDashboardSummary: vi.fn(),
    getTransactions: vi.fn(),
    getCategoryAssociations: vi.fn(),
    getAccounts: vi.fn(),
  },
}))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    hiddenExpenseCategories: [],
    hiddenIncomeCategories: [],
    globalHiddenExpenseCategories: [],
    globalHiddenIncomeCategories: [],
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
      (accountName: string) => mockAccountDivisors[accountName] ?? 1
    ),
    isJointAccount: vi.fn(
      (accountName: string) => (mockAccountDivisors[accountName] ?? 1) > 1
    ),
    isInvestmentAccount: vi.fn(() => false),
  }),
}))

// Configurable mock for category associations
let mockAssociations: Array<{
  expenseCategoryName: string
  incomeCategoryName: string
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
      },
      {
        month: '2024-02',
        label: 'Fév 2024',
        expenses: 800,
        netExpenses: 800,
        income: 2500,
      },
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
        hiddenExpenseCategories: [],
        hiddenIncomeCategories: [],
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

      const { fetchData, setSelectedCategory, selectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Alimentation')

      expect(selectedCategory.value).toBe('Alimentation')
      expect(api.getTransactions).toHaveBeenCalled()
    })

    it('should filter expenses by selected category after loading transactions', async () => {
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

      await setSelectedCategory('Alimentation')

      // All months from period shown, with Alimentation expenses (45.5 + 120 = 165.5) in January, 0 in February
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([165.5, 0])
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

      await setSelectedCategory('Catégorie Inexistante')

      // All months from period shown with zero values
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([0, 0])
    })

    it('should not reload transactions if already loaded', async () => {
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

      await setSelectedCategory('Alimentation')
      expect(selectedCategory.value).toBe('Alimentation')

      await setSelectedCategory(null)
      expect(selectedCategory.value).toBeNull()
    })

    it('should deduct reimbursements from filtered expenses when category has association', async () => {
      const transactionsWithReimbursements: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Frais médicaux',
          amount: -100.0,
          type: 'EXPENSE',
          account: 'Compte Courant',
          categoryName: 'Santé',
          isPointed: false,
          createdAt: '2024-01-15T00:00:00.000Z',
        },
        {
          id: '2',
          date: '2024-01-20T00:00:00.000Z',
          description: 'Remboursement mutuelle',
          amount: 60.0,
          type: 'INCOME',
          account: 'Compte Courant',
          categoryName: 'Remboursement Santé',
          isPointed: false,
          createdAt: '2024-01-20T00:00:00.000Z',
        },
        {
          id: '3',
          date: '2024-02-10T00:00:00.000Z',
          description: 'Frais médicaux',
          amount: -200.0,
          type: 'EXPENSE',
          account: 'Compte Courant',
          categoryName: 'Santé',
          isPointed: false,
          createdAt: '2024-02-10T00:00:00.000Z',
        },
      ]

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: transactionsWithReimbursements,
        meta: {
          total: 3,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      // Configure the mock associations
      mockAssociations = [
        {
          expenseCategoryName: 'Santé',
          incomeCategoryName: 'Remboursement Santé',
        },
      ]

      const { fetchData, filteredExpensesByMonth, setSelectedCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedCategory('Santé')

      // Jan: 100 expense - 60 reimbursement = 40 net
      // Feb: 200 expense - 0 reimbursement = 200 net
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([40, 200])
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

      await setSelectedIncomeCategory('Salaires')
      expect(selectedIncomeCategory.value).toBe('Salaires')

      await setSelectedIncomeCategory(null)
      expect(selectedIncomeCategory.value).toBeNull()
    })
  })

  describe('data reset on refetch', () => {
    it('should reset transactions when fetchData is called again without category filter', async () => {
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

      const { fetchData, setSelectedCategory, transactions } =
        useDashboardData()

      await fetchData()
      await setSelectedCategory('Alimentation')

      expect(transactions.value).toHaveLength(2)

      // Clear category filter
      await setSelectedCategory(null)

      // Fetch data again
      await fetchData()

      // Transactions should be reset when no category filter is active
      expect(transactions.value).toHaveLength(0)
    })

    it('should reload transactions when fetchData is called with active category filter', async () => {
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

      const { fetchData, setSelectedCategory, transactions } =
        useDashboardData()

      await fetchData()
      await setSelectedCategory('Alimentation')

      expect(transactions.value).toHaveLength(2)
      expect(api.getTransactions).toHaveBeenCalledTimes(1)

      // Fetch data again with category still selected
      await fetchData()

      // Transactions should be reloaded to maintain drill-down view
      expect(transactions.value).toHaveLength(2)
      expect(api.getTransactions).toHaveBeenCalledTimes(2)
    })
  })

  describe('Joint accounts with divisors - drill-down', () => {
    const jointAccountTransactions: TransactionDto[] = [
      {
        id: '1',
        date: '2024-01-15T00:00:00.000Z',
        description: 'Loyer',
        amount: -1000,
        type: 'EXPENSE',
        account: 'Compte Joint',
        categoryName: 'Logement',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      },
      {
        id: '2',
        date: '2024-01-20T00:00:00.000Z',
        description: 'Electricité',
        amount: -200,
        type: 'EXPENSE',
        account: 'Compte Joint',
        categoryName: 'Logement',
        isPointed: false,
        createdAt: '2024-01-20T00:00:00.000Z',
      },
      {
        id: '3',
        date: '2024-02-15T00:00:00.000Z',
        description: 'Loyer',
        amount: -1000,
        type: 'EXPENSE',
        account: 'Compte Joint',
        categoryName: 'Logement',
        isPointed: false,
        createdAt: '2024-02-15T00:00:00.000Z',
      },
    ]

    it('should divide expenses by account divisor in drill-down view', async () => {
      // Configure joint account with divisor 2
      mockAccountDivisors = {
        'Compte Joint': 2,
      }

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: jointAccountTransactions,
        meta: {
          total: 3,
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

      await setSelectedCategory('Logement')

      // Jan: (1000 + 200) / 2 = 600
      // Feb: 1000 / 2 = 500
      expect(filteredExpensesByMonth.value.labels).toEqual([
        'Jan 2024',
        'Fév 2024',
      ])
      expect(filteredExpensesByMonth.value.values).toEqual([600, 500])
    })

    it('should handle mixed accounts with different divisors in drill-down', async () => {
      const mixedAccountTransactions: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Loyer',
          amount: -1000,
          type: 'EXPENSE',
          account: 'Compte Joint',
          categoryName: 'Logement',
          isPointed: false,
          createdAt: '2024-01-15T00:00:00.000Z',
        },
        {
          id: '2',
          date: '2024-01-20T00:00:00.000Z',
          description: 'Assurance habitation',
          amount: -100,
          type: 'EXPENSE',
          account: 'Compte Courant',
          categoryName: 'Logement',
          isPointed: false,
          createdAt: '2024-01-20T00:00:00.000Z',
        },
      ]

      // Configure different divisors
      mockAccountDivisors = {
        'Compte Joint': 2,
        'Compte Courant': 1,
      }

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: mixedAccountTransactions,
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

      await setSelectedCategory('Logement')

      // Jan: 1000/2 + 100/1 = 500 + 100 = 600
      expect(filteredExpensesByMonth.value.values).toEqual([600, 0])
    })

    it('should divide income by account divisor in drill-down view', async () => {
      const jointAccountIncomeTransactions: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-25T00:00:00.000Z',
          description: 'Salaire',
          amount: 4000,
          type: 'INCOME',
          account: 'Compte Joint',
          categoryName: 'Salaires',
          isPointed: false,
          createdAt: '2024-01-25T00:00:00.000Z',
        },
        {
          id: '2',
          date: '2024-02-25T00:00:00.000Z',
          description: 'Salaire',
          amount: 4000,
          type: 'INCOME',
          account: 'Compte Joint',
          categoryName: 'Salaires',
          isPointed: false,
          createdAt: '2024-02-25T00:00:00.000Z',
        },
      ]

      mockAccountDivisors = {
        'Compte Joint': 2,
      }

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: jointAccountIncomeTransactions,
        meta: {
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      const { fetchData, filteredIncomeByMonth, setSelectedIncomeCategory } =
        useDashboardData()
      await fetchData()

      await setSelectedIncomeCategory('Salaires')

      // Jan: 4000/2 = 2000, Feb: 4000/2 = 2000
      expect(filteredIncomeByMonth.value.values).toEqual([2000, 2000])
    })

    it('should apply divisor to reimbursements and deduct from expenses in drill-down', async () => {
      const transactionsWithReimbursements: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Frais médicaux',
          amount: -400,
          type: 'EXPENSE',
          account: 'Compte Joint',
          categoryName: 'Santé',
          isPointed: false,
          createdAt: '2024-01-15T00:00:00.000Z',
        },
        {
          id: '2',
          date: '2024-01-20T00:00:00.000Z',
          description: 'Remboursement mutuelle',
          amount: 200,
          type: 'INCOME',
          account: 'Compte Joint',
          categoryName: 'Remboursement Santé',
          isPointed: false,
          createdAt: '2024-01-20T00:00:00.000Z',
        },
        {
          id: '3',
          date: '2024-02-10T00:00:00.000Z',
          description: 'Frais médicaux',
          amount: -600,
          type: 'EXPENSE',
          account: 'Compte Joint',
          categoryName: 'Santé',
          isPointed: false,
          createdAt: '2024-02-10T00:00:00.000Z',
        },
      ]

      mockAccountDivisors = {
        'Compte Joint': 2,
      }

      // Configure category association
      mockAssociations = [
        {
          expenseCategoryName: 'Santé',
          incomeCategoryName: 'Remboursement Santé',
        },
      ]

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: transactionsWithReimbursements,
        meta: {
          total: 3,
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

      await setSelectedCategory('Santé')

      // Jan: expense = 400/2 = 200, reimbursement = 200/2 = 100, net = 100
      // Feb: expense = 600/2 = 300, reimbursement = 0, net = 300
      expect(filteredExpensesByMonth.value.values).toEqual([100, 300])
    })

    it('should handle reimbursements from different accounts with different divisors', async () => {
      const mixedReimbursementTransactions: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Frais médicaux',
          amount: -400,
          type: 'EXPENSE',
          account: 'Compte Joint',
          categoryName: 'Santé',
          isPointed: false,
          createdAt: '2024-01-15T00:00:00.000Z',
        },
        {
          id: '2',
          date: '2024-01-20T00:00:00.000Z',
          description: 'Remboursement mutuelle',
          amount: 100,
          type: 'INCOME',
          account: 'Compte Courant', // Personal account
          categoryName: 'Remboursement Santé',
          isPointed: false,
          createdAt: '2024-01-20T00:00:00.000Z',
        },
      ]

      mockAccountDivisors = {
        'Compte Joint': 2,
        'Compte Courant': 1,
      }

      mockAssociations = [
        {
          expenseCategoryName: 'Santé',
          incomeCategoryName: 'Remboursement Santé',
        },
      ]

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: mixedReimbursementTransactions,
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

      await setSelectedCategory('Santé')

      // Jan: expense = 400/2 = 200, reimbursement = 100/1 = 100, net = 100
      expect(filteredExpensesByMonth.value.values).toEqual([100, 0])
    })

    it('should use default divisor 1 for unknown accounts', async () => {
      const unknownAccountTransactions: TransactionDto[] = [
        {
          id: '1',
          date: '2024-01-15T00:00:00.000Z',
          description: 'Achat',
          amount: -100,
          type: 'EXPENSE',
          account: 'Compte Inconnu',
          categoryName: 'Divers',
          isPointed: false,
          createdAt: '2024-01-15T00:00:00.000Z',
        },
      ]

      // No divisor configured for 'Compte Inconnu' - should default to 1
      mockAccountDivisors = {}

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: unknownAccountTransactions,
        meta: {
          total: 1,
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

      await setSelectedCategory('Divers')

      // Should use divisor 1, so amount stays 100
      expect(filteredExpensesByMonth.value.values).toEqual([100, 0])
    })

    it('should correctly compute total filtered expenses with divisors', async () => {
      mockAccountDivisors = {
        'Compte Joint': 2,
      }

      vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummary)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: jointAccountTransactions,
        meta: {
          total: 3,
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

      await setSelectedCategory('Logement')

      // Jan: (1000 + 200) / 2 = 600
      // Feb: 1000 / 2 = 500
      // Total: 600 + 500 = 1100
      const total = filteredExpensesByMonth.value.values.reduce(
        (sum, val) => sum + val,
        0
      )
      expect(total).toBe(1100)
    })
  })
})

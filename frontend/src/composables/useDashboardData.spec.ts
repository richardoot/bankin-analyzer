import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDashboardData } from './useDashboardData'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
  },
}))

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockTransactions = [
    {
      id: '1',
      date: '2024-01-15T00:00:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      isPointed: false,
      createdAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: '2',
      date: '2024-01-20T00:00:00.000Z',
      description: 'Courses',
      amount: -120.0,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      isPointed: false,
      createdAt: '2024-01-20T00:00:00.000Z',
    },
    {
      id: '3',
      date: '2024-01-25T00:00:00.000Z',
      description: 'Salaire',
      amount: 2500.0,
      type: 'INCOME' as const,
      account: 'Compte Courant',
      isPointed: true,
      createdAt: '2024-01-25T00:00:00.000Z',
    },
    {
      id: '4',
      date: '2024-02-10T00:00:00.000Z',
      description: 'Loyer',
      amount: -800.0,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      isPointed: false,
      createdAt: '2024-02-10T00:00:00.000Z',
    },
    {
      id: '5',
      date: '2024-02-25T00:00:00.000Z',
      description: 'Salaire',
      amount: 2500.0,
      type: 'INCOME' as const,
      account: 'Compte Courant',
      isPointed: true,
      createdAt: '2024-02-25T00:00:00.000Z',
    },
  ]

  it('should fetch transactions and compute monthly data', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const { fetchData, monthlyData, isLoading, error } = useDashboardData()

    expect(isLoading.value).toBe(false)

    await fetchData()

    expect(api.getTransactions).toHaveBeenCalled()
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(monthlyData.value).toHaveLength(2)
  })

  it('should aggregate expenses by month correctly', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const { fetchData, expensesByMonth } = useDashboardData()
    await fetchData()

    expect(expensesByMonth.value.labels).toEqual(['Jan 2024', 'Fév 2024'])
    expect(expensesByMonth.value.values).toEqual([165.5, 800])
  })

  it('should aggregate income by month correctly', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const { fetchData, incomeByMonth } = useDashboardData()
    await fetchData()

    expect(incomeByMonth.value.labels).toEqual(['Jan 2024', 'Fév 2024'])
    expect(incomeByMonth.value.values).toEqual([2500, 2500])
  })

  it('should compute total expenses correctly', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const { fetchData, totalExpenses } = useDashboardData()
    await fetchData()

    expect(totalExpenses.value).toBe(965.5)
  })

  it('should compute total income correctly', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

    const { fetchData, totalIncome } = useDashboardData()
    await fetchData()

    expect(totalIncome.value).toBe(5000)
  })

  it('should handle empty transactions', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue([])

    const { fetchData, monthlyData, expensesByMonth, incomeByMonth } =
      useDashboardData()
    await fetchData()

    expect(monthlyData.value).toHaveLength(0)
    expect(expensesByMonth.value.labels).toEqual([])
    expect(expensesByMonth.value.values).toEqual([])
    expect(incomeByMonth.value.labels).toEqual([])
    expect(incomeByMonth.value.values).toEqual([])
  })

  it('should handle API errors', async () => {
    vi.mocked(api.getTransactions).mockRejectedValue(new Error('Network error'))

    const { fetchData, error, isLoading } = useDashboardData()
    await fetchData()

    expect(error.value).toBe('Network error')
    expect(isLoading.value).toBe(false)
  })

  it('should set loading state during fetch', async () => {
    let resolvePromise: ((value: typeof mockTransactions) => void) | undefined
    const promise = new Promise<typeof mockTransactions>(resolve => {
      resolvePromise = resolve
    })
    vi.mocked(api.getTransactions).mockReturnValue(promise)

    const { fetchData, isLoading } = useDashboardData()

    expect(isLoading.value).toBe(false)

    const fetchPromise = fetchData()
    expect(isLoading.value).toBe(true)

    if (resolvePromise) {
      resolvePromise(mockTransactions)
    }
    await fetchPromise

    expect(isLoading.value).toBe(false)
  })

  it('should sort months chronologically', async () => {
    const unorderedTransactions = [
      {
        id: '1',
        date: '2024-03-15T00:00:00.000Z',
        description: 'Mars',
        amount: -100,
        type: 'EXPENSE' as const,
        account: 'Compte',
        isPointed: false,
        createdAt: '2024-03-15T00:00:00.000Z',
      },
      {
        id: '2',
        date: '2024-01-15T00:00:00.000Z',
        description: 'Janvier',
        amount: -50,
        type: 'EXPENSE' as const,
        account: 'Compte',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      },
      {
        id: '3',
        date: '2024-02-15T00:00:00.000Z',
        description: 'Février',
        amount: -75,
        type: 'EXPENSE' as const,
        account: 'Compte',
        isPointed: false,
        createdAt: '2024-02-15T00:00:00.000Z',
      },
    ]

    vi.mocked(api.getTransactions).mockResolvedValue(unorderedTransactions)

    const { fetchData, monthlyData } = useDashboardData()
    await fetchData()

    expect(monthlyData.value.map(d => d.month)).toEqual([
      '2024-01',
      '2024-02',
      '2024-03',
    ])
  })
})

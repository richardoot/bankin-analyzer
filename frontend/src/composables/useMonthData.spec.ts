import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { DashboardMonthDto } from '@/lib/api'
import { useMonthData } from './useMonthData'

const { getDashboardMonth } = vi.hoisted(() => ({
  getDashboardMonth: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { getDashboardMonth },
}))

function month(spent: number): DashboardMonthDto {
  return {
    month: '2026-10',
    asOfDay: 23,
    daysInMonth: 31,
    spent,
    spentSeries: [1500, 1700, 1600, 1400, 1800, 1650, spent],
    habit: 1625,
    habitToDate: 1205.65,
    habitMonths: 6,
    incomeReceived: 0,
    incomeExpected: 2500,
    incomeSeries: [2500, 2500, 2500, 2600, 2500, 2500],
    upcoming: [],
    upcomingTotal: 0,
    remainingToLive: 2500 - spent,
    remainingShare: (2500 - spent) / 2500,
  }
}

describe('useMonthData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setup() {
    const reading = ref<'everyday' | 'real'>('everyday')
    const deductReimbursements = ref(true)
    const deductPendingReimbursements = ref(false)
    const state = useMonthData({
      reading,
      deductReimbursements,
      deductPendingReimbursements: () => deductPendingReimbursements.value,
    })
    return {
      ...state,
      reading,
      deductReimbursements,
      deductPendingReimbursements,
    }
  }

  it('asks for the month with the reading and the two switches, nothing else', async () => {
    getDashboardMonth.mockResolvedValue(month(1000))
    const { data, isLoading, fetchMonth } = setup()

    const pending = fetchMonth()
    expect(isLoading.value).toBe(true)
    await pending

    expect(getDashboardMonth).toHaveBeenCalledWith({
      reading: 'everyday',
      deductReimbursements: true,
      deductPendingReimbursements: false,
    })
    expect(data.value?.spent).toBe(1000)
    expect(isLoading.value).toBe(false)
  })

  it('asks again when the reading or a switch changes', async () => {
    getDashboardMonth.mockResolvedValue(month(1000))
    const {
      fetchMonth,
      reading,
      deductReimbursements,
      deductPendingReimbursements,
    } = setup()
    await fetchMonth()

    reading.value = 'real'
    await nextTick()
    await flushPromises()
    deductReimbursements.value = false
    await nextTick()
    await flushPromises()
    deductPendingReimbursements.value = true
    await nextTick()
    await flushPromises()

    expect(getDashboardMonth).toHaveBeenCalledTimes(4)
    expect(getDashboardMonth).toHaveBeenLastCalledWith({
      reading: 'real',
      deductReimbursements: false,
      deductPendingReimbursements: true,
    })
  })

  it('keeps the latest answer when two cross', async () => {
    let resolveFirst: (value: DashboardMonthDto) => void = () => {}
    getDashboardMonth
      .mockImplementationOnce(
        () =>
          new Promise<DashboardMonthDto>(resolve => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce(month(1300))
    const { data, fetchMonth } = setup()

    const first = fetchMonth()
    await fetchMonth()
    resolveFirst(month(1000))
    await first

    expect(data.value?.spent).toBe(1300)
  })

  it('says the month could not be read, and keeps what it had', async () => {
    getDashboardMonth
      .mockResolvedValueOnce(month(1000))
      .mockRejectedValueOnce(
        new Error("La lecture du mois n'a pas pu être chargée")
      )
    const { data, error, fetchMonth } = setup()
    await fetchMonth()
    await fetchMonth()

    expect(error.value).toBe("La lecture du mois n'a pas pu être chargée")
    expect(data.value?.spent).toBe(1000)
  })
})

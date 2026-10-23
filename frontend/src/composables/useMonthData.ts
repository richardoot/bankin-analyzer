import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { api, type DashboardMonthDto, type TrendReading } from '@/lib/api'

export interface MonthDataInputs {
  /** The dashboard's reading, « Vie courante » or « Tout ». */
  reading: MaybeRefOrGetter<TrendReading>
  deductReimbursements: MaybeRefOrGetter<boolean>
  deductPendingReimbursements: MaybeRefOrGetter<boolean>
}

/**
 * « Ce mois-ci » (agent-os/product/dashboard-refonte.md, lot 1): the
 * current month to date against the habit.
 *
 * Its own request, sent beside the summary rather than after it, and a
 * failure stays in the band: the rest of the page never waits for it nor
 * falls with it. It follows the reading and the two reimbursement
 * switches, never the period — the band reads the current month whatever
 * window the page shows below.
 */
export function useMonthData(inputs: MonthDataInputs) {
  const data = ref<DashboardMonthDto | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // A later answer always wins: flipping a switch twice quickly must not
  // leave the first answer on screen.
  let sequence = 0

  async function fetchMonth(): Promise<void> {
    const request = ++sequence
    isLoading.value = true
    error.value = null
    try {
      const result = await api.getDashboardMonth({
        reading: toValue(inputs.reading),
        deductReimbursements: toValue(inputs.deductReimbursements),
        deductPendingReimbursements: toValue(
          inputs.deductPendingReimbursements
        ),
      })
      if (request !== sequence) return
      data.value = result
    } catch (err) {
      if (request !== sequence) return
      error.value =
        err instanceof Error
          ? err.message
          : "La lecture du mois n'a pas pu être chargée"
    } finally {
      if (request === sequence) isLoading.value = false
    }
  }

  watch(
    () => [
      toValue(inputs.reading),
      toValue(inputs.deductReimbursements),
      toValue(inputs.deductPendingReimbursements),
    ],
    () => {
      void fetchMonth()
    }
  )

  return { data, isLoading, error, fetchMonth }
}

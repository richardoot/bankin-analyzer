<script setup lang="ts">
  import { computed } from 'vue'
  import { formatCurrency } from '@/lib/formatters'

  /** One column: a plan month that has started. */
  export interface MatrixMonth {
    /** YYYY-MM */
    ym: string
    /** Short label, e.g. "Août" */
    label: string
    /** True for the month still running — its column is never complete. */
    isRunning: boolean
  }

  /** One row: a category, its envelope, and what it spent each month. */
  export interface MatrixRow {
    categoryId: string
    categoryName: string
    categoryIcon?: string | null
    /** Monthly envelope, 0 when the category has none. */
    budget: number
    /** Spending per month, aligned index for index with `months`. */
    amounts: number[]
  }

  const props = defineProps<{
    months: MatrixMonth[]
    rows: MatrixRow[]
    /** The month currently isolated on the page, highlighted here. */
    selectedMonth: string | null
  }>()

  const emit = defineEmits<{
    (e: 'select-month', yearMonth: string): void
  }>()

  /** Column totals, plus the envelope total they are judged against. */
  const monthTotals = computed(() =>
    props.months.map((_, index) =>
      props.rows.reduce((sum, row) => sum + (row.amounts[index] ?? 0), 0)
    )
  )

  const budgetTotal = computed(() =>
    props.rows.reduce((sum, row) => sum + row.budget, 0)
  )

  /**
   * How a cell reads against its envelope. A category without one is
   * deliberately neutral rather than green: nothing was promised, so nothing
   * was kept.
   *
   * The running month is compared to the full envelope, not to a prorated
   * share. Half a month over a prorated third would light up red every time
   * a bill lands early, and a false alarm costs more here than a late one:
   * "over" must mean the month is genuinely spent through.
   */
  function toneFor(row: MatrixRow, index: number): 'over' | 'under' | 'none' {
    if (row.budget <= 0) return 'none'
    const amount = row.amounts[index] ?? 0
    if (amount > row.budget) return 'over'
    return 'under'
  }

  const CELL_TONE: Record<'over' | 'under' | 'none', string> = {
    over: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-semibold',
    under:
      'bg-emerald-50/60 dark:bg-emerald-900/15 text-emerald-700 dark:text-emerald-400',
    none: 'text-gray-600 dark:text-gray-400',
  }

  function cellTitle(row: MatrixRow, index: number): string {
    const amount = row.amounts[index] ?? 0
    const month = props.months[index]?.label ?? ''
    if (row.budget <= 0) {
      return `${row.categoryName} · ${month} : ${formatCurrency(amount)} — pas d'enveloppe`
    }
    const gap = row.budget - amount
    const verdict =
      gap >= 0
        ? `${formatCurrency(gap)} sous l'enveloppe`
        : `${formatCurrency(-gap)} au-dessus`
    return `${row.categoryName} · ${month} : ${formatCurrency(amount)} sur ${formatCurrency(row.budget)} — ${verdict}`
  }
</script>

<template>
  <div
    data-testid="budget-monthly-matrix"
    class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-4 sm:p-5 mb-6"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Mois par mois
      </h2>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        Rouge : l'enveloppe du mois est dépassée. Clique un mois pour n'afficher
        que celui-là.
      </p>
    </div>

    <!-- The table is the one thing on this page that legitimately grows wider
         than the viewport, so it scrolls inside its own box. -->
    <div class="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <table class="min-w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              class="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 pb-2 pr-3"
            >
              Catégorie
            </th>
            <th
              class="text-right text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 pb-2 px-3 whitespace-nowrap"
            >
              Budget
            </th>
            <th
              v-for="month in months"
              :key="month.ym"
              class="pb-2 px-3 whitespace-nowrap"
            >
              <button
                type="button"
                :data-testid="`matrix-header-${month.ym}`"
                class="text-xs font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 transition-colors"
                :class="
                  selectedMonth === month.ym
                    ? 'bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                "
                @click="emit('select-month', month.ym)"
              >
                {{ month.label }}
                <span v-if="month.isRunning" class="text-amber-500">●</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.categoryId"
            :data-testid="`matrix-row-${row.categoryName}`"
            class="border-t border-gray-100 dark:border-slate-700"
          >
            <td
              class="sticky left-0 z-10 bg-white dark:bg-slate-900 py-1.5 pr-3 max-w-[14rem]"
            >
              <span class="flex items-center gap-1.5 min-w-0">
                <span v-if="row.categoryIcon" class="shrink-0">
                  {{ row.categoryIcon }}
                </span>
                <span class="truncate text-gray-900 dark:text-gray-100">
                  {{ row.categoryName }}
                </span>
              </span>
            </td>
            <td
              class="py-1.5 px-3 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400"
            >
              <span v-if="row.budget > 0">
                {{ formatCurrency(row.budget) }}
              </span>
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </td>
            <td
              v-for="(month, index) in months"
              :key="month.ym"
              :data-testid="`matrix-cell-${row.categoryName}-${month.ym}`"
              class="py-1.5 px-3 text-right tabular-nums whitespace-nowrap rounded"
              :class="CELL_TONE[toneFor(row, index)]"
              :title="cellTitle(row, index)"
            >
              {{ formatCurrency(row.amounts[index] ?? 0) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-gray-200 dark:border-slate-600">
            <td
              class="sticky left-0 z-10 bg-white dark:bg-slate-900 py-2 pr-3 font-semibold text-gray-900 dark:text-gray-100"
            >
              Total
            </td>
            <td
              class="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap"
            >
              {{ formatCurrency(budgetTotal) }}
            </td>
            <td
              v-for="(total, index) in monthTotals"
              :key="months[index]?.ym ?? index"
              :data-testid="`matrix-total-${months[index]?.ym}`"
              class="py-2 px-3 text-right tabular-nums font-semibold whitespace-nowrap"
              :class="
                budgetTotal > 0 && total > budgetTotal
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-gray-100'
              "
            >
              {{ formatCurrency(total) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

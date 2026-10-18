<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import { formatCurrency } from '@/lib/formatters'
  import {
    transactionsLink,
    type ExceptionalFilter,
  } from '@/lib/transactionsLink'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import IconChevronDown from '@/components/icons/IconChevronDown.vue'

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
    /**
     * `exclude` when the amounts are read « Vie courante »: the links then
     * leave the events out, as the figures do.
     */
    exceptional?: ExceptionalFilter | undefined
  }>()

  /**
   * The grid is the widest thing on the page: on a phone it starts folded,
   * one tap away, so the envelopes below are not pushed under a table that
   * has to be scrolled sideways anyway. Isolating a month is done from the
   * table's period band — this grid only shows which one is read.
   */
  const isMobile = useIsMobile()
  const open = ref(!isMobile.value)

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
      'bg-green-50/60 dark:bg-green-900/15 text-green-700 dark:text-green-400',
    none: 'text-gray-600 dark:text-gray-400',
  }

  /**
   * A cell opens the rows behind it: that category, that month. The
   * figures here are netted and shared, so the link says `gross`. The
   * link is styled as the cell's own text — the grid stays a grid.
   */
  function cellLink(row: MatrixRow, index: number) {
    const month = props.months[index]
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: row.categoryId,
      month: month?.ym,
      exceptional: props.exceptional,
      gross: true,
      label: `${row.categoryName} · ${month?.label ?? ''}`,
    })
  }

  function totalLink(index: number) {
    const month = props.months[index]
    return transactionsLink({
      type: 'EXPENSE',
      month: month?.ym,
      exceptional: props.exceptional,
      gross: true,
      label: `Dépenses · ${month?.label ?? ''}`,
    })
  }

  const CELL_LINK_CLASS =
    'block rounded px-0.5 -mx-0.5 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'

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
    <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        <button
          type="button"
          class="flex min-h-[44px] w-full items-center gap-2 text-left md:hidden"
          :aria-expanded="open"
          aria-controls="budget-monthly-matrix-table"
          data-testid="matrix-toggle"
          @click="open = !open"
        >
          Mois par mois
          <IconChevronDown
            class="h-4 w-4 text-gray-500 transition-transform dark:text-gray-400"
            :class="{ '-rotate-180': open }"
          />
        </button>
        <span class="max-md:hidden">Mois par mois</span>
      </h2>
      <p class="hidden text-xs text-gray-500 sm:block dark:text-gray-400">
        Rouge : l'enveloppe du mois est dépassée. Le mois isolé dans le tableau
        est mis en avant.
      </p>
    </div>

    <!-- The table is the one thing on this page that legitimately grows wider
         than the viewport, so it scrolls inside its own box. -->
    <div
      v-show="open"
      id="budget-monthly-matrix-table"
      class="overflow-x-auto -mx-4 sm:mx-0"
      data-testid="matrix-body"
    >
      <table class="min-w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              class="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 pb-2 pl-4 pr-3 sm:pl-0"
            >
              Catégorie
            </th>
            <th
              class="text-right text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400 pb-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Budget
            </th>
            <th
              v-for="month in months"
              :key="month.ym"
              class="pb-2 px-2 sm:px-3 whitespace-nowrap"
            >
              <span
                :data-testid="`matrix-header-${month.ym}`"
                class="inline-block text-xs font-semibold uppercase tracking-wide rounded px-1.5 py-0.5"
                :class="
                  selectedMonth === month.ym
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400'
                "
                :aria-current="selectedMonth === month.ym ? 'true' : undefined"
              >
                {{ month.label }}
                <span v-if="month.isRunning" class="text-amber-500">●</span>
              </span>
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
              class="sticky left-0 z-10 bg-white dark:bg-slate-900 py-1.5 pl-4 pr-3 max-w-[8rem] sm:pl-0 sm:max-w-[14rem]"
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
              class="py-1.5 px-2 sm:px-3 text-right tabular-nums whitespace-nowrap text-primary-700 dark:text-primary-400"
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
              class="py-1.5 px-2 sm:px-3 text-right tabular-nums whitespace-nowrap rounded"
              :class="CELL_TONE[toneFor(row, index)]"
              :title="cellTitle(row, index)"
            >
              <RouterLink
                :to="cellLink(row, index)"
                :class="CELL_LINK_CLASS"
                :aria-label="`Voir les transactions de ${row.categoryName} · ${month.label}`"
              >
                {{ formatCurrency(row.amounts[index] ?? 0) }}
              </RouterLink>
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
              class="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold text-primary-700 dark:text-primary-400 whitespace-nowrap"
            >
              {{ formatCurrency(budgetTotal) }}
            </td>
            <td
              v-for="(total, index) in monthTotals"
              :key="months[index]?.ym ?? index"
              :data-testid="`matrix-total-${months[index]?.ym}`"
              class="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold whitespace-nowrap"
              :class="
                budgetTotal > 0 && total > budgetTotal
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-gray-100'
              "
            >
              <RouterLink
                :to="totalLink(index)"
                :class="CELL_LINK_CLASS"
                :aria-label="`Voir les transactions de ${months[index]?.label ?? ''}`"
              >
                {{ formatCurrency(total) }}
              </RouterLink>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="mt-2 text-xs text-gray-500 sm:hidden dark:text-gray-400">
      Rouge : l'enveloppe du mois est dépassée. Faites défiler le tableau pour
      voir les mois suivants.
    </p>
  </div>
</template>

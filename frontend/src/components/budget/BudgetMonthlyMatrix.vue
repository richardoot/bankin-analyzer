<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import { formatCurrency } from '@/lib/formatters'
  import {
    transactionsLink,
    type ExceptionalFilter,
  } from '@/lib/transactionsLink'
  import { STATE_BADGE_CLASSES } from '@/lib/stateTints'

  /** One column: a plan month that has started. */
  export interface MatrixMonth {
    /** YYYY-MM */
    ym: string
    /** Short label, e.g. "Août" */
    label: string
    /** True for the month still running — its column is never complete. */
    isRunning: boolean
    /**
     * Read « Vie courante »: the smoothed purchases whose slice the month
     * counts, so its total's link shows them whatever their date.
     */
    smoothedIds?: string[] | undefined
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
    /**
     * Read « Vie courante »: the slices of smoothed purchases inside each
     * amount, same indexes — the « dont X € lissés ». Absent otherwise.
     */
    amortized?: number[] | undefined
    /** The purchases behind those slices, per month, for the cell's link. */
    smoothedIds?: (string[] | undefined)[] | undefined
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

  /*
   * The grid is folded by the page, in « Mois par mois » under the
   * envelopes (agent-os/product/budget-refonte.md, lot 5): the page owns
   * the `details`, the grid only draws. Isolating a month is done from
   * « Mois lu » — this grid only shows which one is read.
   */

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
   * neutral: nothing was promised, so nothing was kept. Only an
   * overrun takes a tint, the amber of the state badges; the rest is ink.
   *
   * The running month is compared to the full envelope, not to a prorated
   * share. Half a month over a prorated third would light up amber every time
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
    over: `${STATE_BADGE_CLASSES.over} font-semibold`,
    under: 'text-gray-900 dark:text-gray-100',
    none: 'text-gray-600 dark:text-gray-400',
  }

  /** A month's total over the total envelope reads as a cell over its own. */
  function totalTone(total: number): string {
    return budgetTotal.value > 0 && total > budgetTotal.value
      ? CELL_TONE.over
      : 'text-gray-900 dark:text-gray-100'
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
      // A slice counted here may come from a purchase dated in another
      // month: the list shows that purchase too.
      alsoIds: row.smoothedIds?.[index],
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
      alsoIds: month?.smoothedIds,
      gross: true,
      label: `Dépenses · ${month?.label ?? ''}`,
    })
  }

  const CELL_LINK_CLASS =
    'block rounded px-0.5 -mx-0.5 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'

  /** The slices inside a cell, or 0: what « dont X € lissés » says. */
  function amortizedAt(row: MatrixRow, index: number): number {
    const amount = row.amortized?.[index] ?? 0
    return amount > 0.005 ? amount : 0
  }

  function cellTitle(row: MatrixRow, index: number): string {
    const amount = row.amounts[index] ?? 0
    const month = props.months[index]?.label ?? ''
    const smoothed = amortizedAt(row, index)
    const ofWhich = smoothed ? ` (dont ${formatCurrency(smoothed)} lissés)` : ''
    if (row.budget <= 0) {
      return `${row.categoryName} · ${month} : ${formatCurrency(amount)}${ofWhich} — pas d'enveloppe`
    }
    const gap = row.budget - amount
    const verdict =
      gap >= 0
        ? `${formatCurrency(gap)} sous l'enveloppe`
        : `${formatCurrency(-gap)} au-dessus`
    return `${row.categoryName} · ${month} : ${formatCurrency(amount)}${ofWhich} sur ${formatCurrency(row.budget)} — ${verdict}`
  }
</script>

<template>
  <div data-testid="budget-monthly-matrix">
    <p class="mb-2 hidden text-xs text-gray-500 sm:block dark:text-gray-400">
      En ambre, l’enveloppe du mois est dépassée. Le mois lu est mis en avant.
    </p>

    <!-- The table is the one thing on this page that legitimately grows wider
         than the viewport, so it scrolls inside its own box. -->
    <div
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
              class="text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 pb-2 px-2 sm:px-3 whitespace-nowrap"
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
                    ? 'bg-gray-200 text-gray-900 dark:bg-slate-700 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400'
                "
                :aria-current="selectedMonth === month.ym ? 'true' : undefined"
              >
                {{ month.label }}
                <template v-if="month.isRunning">
                  <span class="opacity-70" aria-hidden="true">•</span>
                  <span class="sr-only">, en cours</span>
                </template>
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
              :data-testid="`matrix-budget-${row.categoryName}`"
              class="py-1.5 px-2 sm:px-3 text-right tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100"
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
              <span
                v-if="amortizedAt(row, index)"
                class="block text-[10px] font-normal text-teal-700 dark:text-teal-400"
                :data-testid="`matrix-amortized-${row.categoryName}-${month.ym}`"
              >
                dont {{ formatCurrency(amortizedAt(row, index)) }} lissés
              </span>
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
              data-testid="matrix-budget-total"
              class="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap"
            >
              {{ formatCurrency(budgetTotal) }}
            </td>
            <td
              v-for="(total, index) in monthTotals"
              :key="months[index]?.ym ?? index"
              :data-testid="`matrix-total-${months[index]?.ym}`"
              class="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold whitespace-nowrap rounded"
              :class="totalTone(total)"
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
      En ambre, l’enveloppe du mois est dépassée. Faites défiler le tableau pour
      voir les mois suivants.
    </p>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, useId } from 'vue'
  import type { AmortizedPurchaseDto } from '@/lib/api'
  import { formatCurrency, formatMonth } from '@/lib/formatters'
  import { remainingSlices } from '@/lib/amortization'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'

  /**
   * « Achats lissés en cours », folded under the envelopes: the purchases
   * the everyday reading spreads over the plan. Folded, one line — what
   * their slices still running weigh each month, how many purchases.
   * Unfolded, one line each: what it is, its monthly slice, how many slices
   * are still to fall, and the way to the purchase itself, whatever its
   * date. A slice falls every month without a new decision, like a
   * subscription: this is what the plan is already committed to.
   *
   * Renders nothing when no smoothed purchase touches the plan. The page
   * gives it purchases in the everyday reading only: the real one counts
   * each purchase whole at its date, as if it had never been smoothed.
   */
  const props = defineProps<{
    purchases: AmortizedPurchaseDto[]
    /** `YYYY-MM` of today, from which the remaining slices are counted. */
    currentMonth: string
  }>()

  /** Folded on load: the line is a summary, the detail waits. */
  const expanded = ref(false)
  const panelId = useId()

  const rows = computed(() =>
    props.purchases.map(p => ({
      purchase: p,
      remaining: remainingSlices(p, props.currentMonth),
      link: transactionsLink({ ids: [p.transactionId], label: p.description }),
    }))
  )

  /** What the slices of the lines still running weigh each month. */
  const monthlyTotal = computed(() =>
    rows.value
      .filter(r => r.remaining > 0)
      .reduce((sum, r) => sum + r.purchase.monthlyAmount, 0)
  )

  /** « 1 achat », « 3 achats ». */
  const countLabel = computed(() => {
    const n = props.purchases.length
    return `${n} achat${n > 1 ? 's' : ''}`
  })
</script>

<template>
  <section
    v-if="purchases.length > 0"
    data-testid="budget-amortized-line"
    aria-labelledby="budget-amortized-title"
    class="border-t border-gray-100 text-[13px] dark:border-slate-700"
  >
    <div
      class="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
    >
      <p
        class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-gray-500 dark:text-gray-400"
      >
        <span
          id="budget-amortized-title"
          class="font-semibold text-gray-900 dark:text-gray-100"
        >
          Achats lissés en cours
        </span>
        <template v-if="monthlyTotal > 0">
          <span aria-hidden="true">·</span>
          <span data-testid="budget-amortized-total" class="tabular-nums">
            <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
              formatCurrency(monthlyTotal)
            }}</strong>
            par mois en vie courante
          </span>
        </template>
        <span aria-hidden="true">·</span>
        <span data-testid="budget-amortized-count">{{ countLabel }}</span>
      </p>
      <button
        type="button"
        data-testid="budget-amortized-toggle"
        class="inline-flex min-h-[40px] items-center gap-1 rounded px-2 font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-slate-800"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Replier' : 'Déplier' }}
        <IconChevronRight
          class="h-4 w-4 transition-transform"
          :class="expanded ? '-rotate-90' : 'rotate-90'"
          aria-hidden="true"
        />
      </button>
    </div>

    <ul
      v-if="expanded"
      :id="panelId"
      data-testid="budget-amortized-panel"
      class="space-y-1.5 px-4 pb-4"
    >
      <li
        v-for="row in rows"
        :key="row.purchase.transactionId"
        :data-testid="`budget-amortized-${row.purchase.transactionId}`"
        class="flex items-center gap-2 rounded-md border border-gray-100 px-2.5 py-1.5 text-xs dark:border-slate-700"
      >
        <span class="min-w-0 flex-1">
          <span
            class="block truncate font-medium text-gray-900 dark:text-gray-100"
            :title="row.purchase.description"
          >
            {{ row.purchase.description }}
          </span>
          <span class="block text-gray-500 dark:text-gray-400">
            {{ formatCurrency(row.purchase.netAmount) }} sur
            {{ row.purchase.months }} mois ·
            <template v-if="row.remaining > 0">
              {{
                row.remaining === 1
                  ? 'dernière tranche'
                  : `${row.remaining} mois restants`
              }}, jusqu’en
              {{ formatMonth(row.purchase.lastMonth, { capitalize: false }) }}
            </template>
            <template v-else>
              terminé en
              {{ formatMonth(row.purchase.lastMonth, { capitalize: false }) }}
            </template>
          </span>
        </span>
        <span
          class="shrink-0 text-right font-semibold text-gray-900 tabular-nums dark:text-gray-100"
        >
          {{ formatCurrency(row.purchase.monthlyAmount) }}
          <span class="font-normal text-gray-500 dark:text-gray-400"
            >/ mois</span
          >
        </span>
        <TransactionsLink
          :to="row.link"
          :subject="row.purchase.description"
          icon-only
          :data-testid="`budget-amortized-link-${row.purchase.transactionId}`"
        />
      </li>
    </ul>
  </section>
</template>

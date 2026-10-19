<script setup lang="ts">
  import { computed } from 'vue'
  import type { AmortizedPurchaseDto } from '@/lib/api'
  import { formatCurrency, formatMonth } from '@/lib/formatters'
  import { remainingSlices } from '@/lib/amortization'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  /**
   * « Achats lissés en cours »: the purchases the everyday reading spreads
   * over the plan, one line each — what it is, its monthly slice, how many
   * slices are still to fall, and the way to the purchase itself, whatever
   * its date. A slice falls every month without a new decision, like a
   * subscription: this is what the plan is already committed to.
   *
   * Renders nothing when no smoothed purchase touches the plan. The page
   * shows it in the everyday reading only: the real one counts each
   * purchase whole at its date, as if it had never been smoothed.
   */
  const props = defineProps<{
    purchases: AmortizedPurchaseDto[]
    /** `YYYY-MM` of today, from which the remaining slices are counted. */
    currentMonth: string
  }>()

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
</script>

<template>
  <section
    v-if="purchases.length > 0"
    data-testid="budget-amortized"
    aria-labelledby="budget-amortized-title"
    class="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 dark:border-teal-800 dark:bg-teal-900/20"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3
        id="budget-amortized-title"
        class="text-xs font-medium text-teal-900 dark:text-teal-200"
      >
        Achats lissés en cours
      </h3>
      <p
        v-if="monthlyTotal > 0"
        class="text-xs tabular-nums text-teal-800 dark:text-teal-300"
        data-testid="budget-amortized-total"
      >
        {{ formatCurrency(monthlyTotal) }} / mois en vie courante
      </p>
    </div>

    <ul class="mt-2 space-y-1.5">
      <li
        v-for="row in rows"
        :key="row.purchase.transactionId"
        :data-testid="`budget-amortized-${row.purchase.transactionId}`"
        class="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs dark:bg-slate-900"
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
              }}, jusqu'en
              {{ formatMonth(row.purchase.lastMonth, { capitalize: false }) }}
            </template>
            <template v-else>
              terminé en
              {{ formatMonth(row.purchase.lastMonth, { capitalize: false }) }}
            </template>
          </span>
        </span>
        <span
          class="shrink-0 text-right font-semibold tabular-nums text-teal-800 dark:text-teal-300"
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

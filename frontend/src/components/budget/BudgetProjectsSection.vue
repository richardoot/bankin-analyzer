<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetPlanDto, TagBudgetSummaryDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  /**
   * The plan's second tier: projects charged against the reserve rather
   * than against the monthly envelopes. Renders nothing when the period
   * carries no project; a reserve overrun is said in red, never hidden.
   */
  const props = defineProps<{
    projects: TagBudgetSummaryDto | null
    plan: BudgetPlanDto | null
  }>()

  const emit = defineEmits<{ 'open-tag': [tagId: string] }>()

  const hasProjects = computed(() => (props.projects?.items.length ?? 0) > 0)

  /**
   * Reserve minus the envelopes already committed to projects. Null unless
   * the plan carries an equation — without it there is nothing to charge
   * against.
   */
  const reserveRemaining = computed<number | null>(() => {
    const reserve = props.plan?.projectReserve
    if (reserve === null || reserve === undefined) return null
    return reserve - (props.projects?.totalBudget ?? 0)
  })

  /** The project's rows over the plan — what `spent` adds up, gross. */
  function projectLink(item: { id: string; name: string }) {
    return transactionsLink({
      tagId: item.id,
      from: props.plan?.startDate.slice(0, 10),
      to: props.plan?.endDate.slice(0, 10),
      gross: true,
      label: item.name,
    })
  }

  /** Projects that have spent more than their envelope allowed. */
  function isProjectOver(item: {
    budgetAmount: number | null
    spent: number
  }): boolean {
    return item.budgetAmount !== null && item.spent > item.budgetAmount
  }
</script>

<template>
  <div
    v-if="hasProjects"
    data-testid="budget-projects"
    class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-xs font-medium text-amber-900 dark:text-amber-200">
        Projets de la période
      </p>
      <p
        v-if="reserveRemaining !== null"
        data-testid="reserve-remaining"
        class="text-xs tabular-nums"
        :class="
          reserveRemaining < 0
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : 'text-amber-800 dark:text-amber-300'
        "
      >
        <template v-if="reserveRemaining < 0">
          {{ formatCurrency(projects?.totalBudget ?? 0) }} engagés sur
          {{ formatCurrency(plan?.projectReserve ?? 0) }} de réserve —
          dépassement de {{ formatCurrency(-reserveRemaining) }}
        </template>
        <template v-else>
          {{ formatCurrency(projects?.totalBudget ?? 0) }} engagés sur
          {{ formatCurrency(plan?.projectReserve ?? 0) }} de réserve
        </template>
      </p>
    </div>

    <!-- The chip opens the tag's page; the arrow beside it, its rows. -->
    <div class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="item in projects?.items ?? []"
        :key="item.id"
        class="inline-flex items-center gap-0.5 rounded-full bg-white pr-1 dark:bg-slate-900"
      >
        <button
          type="button"
          :data-testid="`project-${item.name}`"
          class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-300 transition dark:hover:ring-primary-700"
          @click="emit('open-tag', item.id)"
        >
          <span
            class="inline-block h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: item.color ?? '#9ca3af' }"
          ></span>
          {{ item.name }}
          <span
            class="font-semibold tabular-nums"
            :class="isProjectOver(item) ? 'text-red-600 dark:text-red-400' : ''"
          >
            {{ formatCurrency(item.spent) }}
          </span>
          <span
            v-if="item.budgetAmount !== null"
            class="text-gray-500 dark:text-gray-400 tabular-nums"
          >
            / {{ formatCurrency(item.budgetAmount) }}
          </span>
          <span v-else class="text-gray-500 dark:text-gray-400 italic">
            sans enveloppe
          </span>
        </button>
        <TransactionsLink
          :to="projectLink(item)"
          :subject="item.name"
          icon-only
          class="h-6 w-6"
          :data-testid="`project-transactions-link-${item.name}`"
        />
      </span>
    </div>
  </div>
</template>

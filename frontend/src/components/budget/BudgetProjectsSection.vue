<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetPlanDto, TagBudgetSummaryDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

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
    class="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2.5"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-xs font-medium text-indigo-900 dark:text-indigo-300">
        Projets de la période
      </p>
      <p
        v-if="reserveRemaining !== null"
        data-testid="reserve-remaining"
        class="text-xs tabular-nums"
        :class="
          reserveRemaining < 0
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : 'text-indigo-700 dark:text-indigo-400'
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

    <div class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="item in projects?.items ?? []"
        :key="item.id"
        type="button"
        :data-testid="`project-${item.name}`"
        class="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-indigo-300 transition"
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
    </div>
  </div>
</template>

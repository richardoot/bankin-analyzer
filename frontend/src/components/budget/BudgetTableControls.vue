<script setup lang="ts">
  import { computed } from 'vue'
  import type { BreakdownMode } from '@/composables/useBudgetComparison'
  import { SORT_OPTIONS, type SortOrder } from './sortOptions'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'

  /**
   * Everything that steers the category table without being a row of it:
   * entering edit mode, sorting, the month selector, the closed-period
   * warning, the edit-mode quick actions, and the everyday/real tracking
   * mode with its events band. Pure controls — every decision leaves as an
   * event, every figure arrives as a prop.
   */
  const props = defineProps<{
    editing: boolean
    monthOptions: {
      ym: string
      short: string
      full: string
      isRunning: boolean
    }[]
    selectedMonth: string | null
    completeMonthsCount: number
    actualPeriodLabel: string
    planIsPast: boolean
    hasExceptional: boolean
    breakdownMode: BreakdownMode
    planEvents: { id: string; name: string; color: string | null }[]
  }>()

  const emit = defineEmits<{
    'enter-edit': []
    'select-month': [ym: string | null]
    'apply-averages': []
    'adjust-percent': [percent: number]
    reset: []
    'set-mode': [mode: BreakdownMode]
    'open-tag': [tagId: string]
  }>()
  const monthSegments = computed<SegmentedOption<string | null>[]>(() => [
    {
      value: null,
      label: `Moyenne (${props.completeMonthsCount} mois)`,
      testId: 'budget-month-average',
    },
    ...props.monthOptions.map(option => ({
      value: option.ym,
      label: option.short,
      testId: `budget-month-${option.ym}`,
      title: option.full,
    })),
  ])
  const runningMonths = computed(
    () =>
      new Set<string | null>(
        props.monthOptions.filter(m => m.isRunning).map(m => m.ym)
      )
  )

  const sortOrder = defineModel<SortOrder>('sortOrder', {
    default: 'amount-desc',
  })
</script>

<template>
  <div>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Dépenses par catégorie
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="!editing"
          type="button"
          data-testid="budget-edit-button"
          class="inline-flex min-h-[40px] items-center gap-1.5 px-3 py-1.5 text-sm font-medium sm:min-h-0 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          @click="emit('enter-edit')"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          <span class="sm:hidden">Modifier</span>
          <span class="hidden sm:inline">Modifier les budgets</span>
        </button>
        <label
          for="budget-sort"
          class="text-sm text-gray-500 dark:text-gray-400 shrink-0"
        >
          Trier :
        </label>
        <select
          id="budget-sort"
          v-model="sortOrder"
          class="min-h-[40px] min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 sm:min-h-0 sm:flex-none dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
        >
          <option
            v-for="opt in SORT_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Month selector: the plan averaged, or one month on its own.
         A budget is already a monthly figure, so on a single month the
         comparison needs no averaging at all. -->
    <div
      v-if="monthOptions.length > 0"
      data-testid="budget-month-selector"
      class="mb-4 flex flex-wrap items-center gap-2"
    >
      <span class="mr-1 shrink-0 text-xs text-gray-500 dark:text-gray-400">
        Période :
      </span>
      <SegmentedControl
        :model-value="selectedMonth"
        :options="monthSegments"
        size="sm"
        label="Période du tableau"
        @update:model-value="emit('select-month', $event)"
      >
        <template #option="{ option }">
          <span
            v-if="runningMonths.has(option.value)"
            class="ml-1 text-amber-500"
            >●</span
          >
        </template>
      </SegmentedControl>
      <span
        data-testid="budget-actual-period"
        class="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"
      >
        {{ actualPeriodLabel }}
      </span>
    </div>

    <!-- Rewriting the envelopes of a closed period moves the gap on a
         bilan that has already been read. Allowed, but never silent. -->
    <div
      v-if="editing && planIsPast"
      data-testid="budget-past-plan-warning"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300"
    >
      Ce plan est terminé. Modifier ses enveloppes change le bilan d'une période
      déjà écoulée.
    </div>

    <!-- Quick actions — edit mode only. Applying an average or shaving
         5 % off every envelope is an edit like any other; offering it
         outside edit mode is what made a budget change a single
         unannounced click. -->
    <div
      v-if="editing"
      data-testid="budget-quick-actions"
      class="mb-4 grid grid-cols-2 items-center gap-2 rounded-lg bg-gray-50 p-3 sm:flex sm:flex-wrap dark:bg-slate-800"
    >
      <span
        class="col-span-2 mr-1 text-xs text-gray-500 sm:col-auto dark:text-gray-400"
      >
        Actions rapides :
      </span>
      <button
        type="button"
        class="col-span-2 min-h-[36px] px-2.5 py-1 text-xs font-medium text-indigo-700 sm:col-auto sm:min-h-0 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
        @click="emit('apply-averages')"
      >
        Appliquer toutes les moyennes
      </button>
      <button
        type="button"
        class="min-h-[36px] px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors sm:min-h-0"
        @click="emit('adjust-percent', -5)"
      >
        −5%
      </button>
      <button
        type="button"
        class="min-h-[36px] px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors sm:min-h-0"
        @click="emit('adjust-percent', 5)"
      >
        +5%
      </button>
      <button
        type="button"
        class="col-span-2 min-h-[36px] px-2.5 py-1 text-xs font-medium text-red-600 sm:col-auto sm:ml-auto sm:min-h-0 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-md transition-colors"
        @click="emit('reset')"
      >
        Réinitialiser
      </button>
    </div>

    <!-- Tracking mode: everyday keeps a one-off event from reading as an
         overrun of the recurring budget. -->
    <div
      v-if="hasExceptional"
      data-testid="budget-breakdown-mode"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-xs font-medium text-amber-800 dark:text-amber-300">
          Suivi
        </span>
        <SegmentedControl
          :model-value="breakdownMode"
          size="sm"
          label="Mode de suivi du budget"
          :options="[
            {
              value: 'everyday',
              label: 'Vie courante',
              testId: 'budget-mode-everyday',
            },
            { value: 'real', label: 'Tout', testId: 'budget-mode-real' },
          ]"
          @update:model-value="emit('set-mode', $event)"
        />
        <span
          class="hidden text-xs leading-snug text-amber-700 sm:inline dark:text-amber-400"
        >
          {{
            breakdownMode === 'everyday'
              ? 'Les dépenses d’événements sont sorties du réel : une enveloppe n’est dépassée que par la vie courante.'
              : 'Les dépenses d’événements sont incluses : une enveloppe peut être dépassée par un projet ponctuel.'
          }}
        </span>
      </div>

      <div
        v-if="planEvents.length > 0"
        class="mt-2 flex flex-wrap items-center gap-1.5"
      >
        <span class="text-xs text-amber-700 dark:text-amber-400">
          Événements de la période :
        </span>
        <button
          v-for="event in planEvents"
          :key="event.id"
          type="button"
          :data-testid="`budget-event-${event.name}`"
          class="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-amber-300 transition"
          @click="emit('open-tag', event.id)"
        >
          <span
            class="inline-block h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: event.color ?? '#9ca3af' }"
          ></span>
          {{ event.name }}
        </button>
      </div>
    </div>
  </div>
</template>

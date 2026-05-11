<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    ComparisonPreset,
    ComparisonRange,
  } from '@/composables/useBudgetComparison'
  import type { BudgetPlanDto } from '@/lib/api'

  const props = defineProps<{
    plan: BudgetPlanDto | null
    /** True if the "Année dernière" preset has any data (checked once by the parent). */
    yearAgoAvailable: boolean
    /** Currently selected preset. */
    preset: ComparisonPreset
    /** Custom dates (only used when preset = 'custom'). */
    customStartDate: string
    customEndDate: string
  }>()

  const emit = defineEmits<{
    'update:preset': [preset: ComparisonPreset]
    'update:customStartDate': [date: string]
    'update:customEndDate': [date: string]
    /** Emitted whenever the resolved comparison range changes. Null when none. */
    'update:range': [range: ComparisonRange | null]
  }>()

  const MONTH_NAMES_FR = [
    'Janv',
    'Févr',
    'Mars',
    'Avr',
    'Mai',
    'Juin',
    'Juil',
    'Août',
    'Sept',
    'Oct',
    'Nov',
    'Déc',
  ]

  /** Format a YYYY-MM-DD date into "Janv 2026". */
  function formatMonth(dateIso: string): string {
    const parts = dateIso.split('-')
    const year = Number(parts[0])
    const month = Number(parts[1]) - 1
    return `${MONTH_NAMES_FR[month] ?? '?'} ${year}`
  }

  /** Format a range as "Janv 2026" (single month) or "Janv–Mars 2026". */
  function formatRange(start: string, end: string): string {
    const s = start.split('-')
    const e = end.split('-')
    const sy = Number(s[0])
    const ey = Number(e[0])
    const sm = Number(s[1]) - 1
    const em = Number(e[1]) - 1
    if (sy === ey) {
      if (sm === em) return `${MONTH_NAMES_FR[sm]} ${sy}`
      return `${MONTH_NAMES_FR[sm]}–${MONTH_NAMES_FR[em]} ${sy}`
    }
    return `${MONTH_NAMES_FR[sm]} ${sy} → ${MONTH_NAMES_FR[em]} ${ey}`
  }

  /** Last day of a given UTC month index */
  function lastDayOfMonth(year: number, monthIdx0: number): number {
    return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate()
  }

  function pad(n: number): string {
    return String(n).padStart(2, '0')
  }

  /**
   * Build a ComparisonRange from a preset, anchored to the plan's start.
   * Returns null when the preset can't be resolved (e.g. no plan, or
   * year-ago when no data available).
   */
  function rangeFromPreset(
    preset: ComparisonPreset,
    plan: BudgetPlanDto
  ): ComparisonRange | null {
    if (preset === 'none') return null
    if (preset === 'custom') {
      if (!props.customStartDate || !props.customEndDate) return null
      return {
        startDate: props.customStartDate,
        endDate: props.customEndDate,
        startMonth: props.customStartDate.slice(0, 7),
        endMonth: props.customEndDate.slice(0, 7),
        label: formatRange(props.customStartDate, props.customEndDate),
        source: 'custom',
      }
    }

    const planStart = plan.startDate.split('-')
    const planStartYear = Number(planStart[0])
    const planStartMonth = Number(planStart[1]) - 1

    if (preset === 'year-ago') {
      // Same length as the plan, shifted exactly one year back.
      const planEnd = plan.endDate.split('-')
      const planEndYear = Number(planEnd[0])
      const planEndMonth = Number(planEnd[1]) - 1
      const startYear = planStartYear - 1
      const endYear = planEndYear - 1
      const startDate = `${startYear}-${pad(planStartMonth + 1)}-01`
      const endDate = `${endYear}-${pad(planEndMonth + 1)}-${pad(lastDayOfMonth(endYear, planEndMonth))}`
      return {
        startDate,
        endDate,
        startMonth: startDate.slice(0, 7),
        endMonth: endDate.slice(0, 7),
        label: formatRange(startDate, endDate),
        source: 'year-ago',
      }
    }

    // 3m / 6m / 12m: the N months immediately before the plan starts.
    const monthsBack = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
    // End month = the month right before plan start.
    const endMonthAbs = planStartYear * 12 + planStartMonth - 1
    const startMonthAbs = endMonthAbs - (monthsBack - 1)
    const endYear = Math.floor(endMonthAbs / 12)
    const endMonth = endMonthAbs - endYear * 12
    const startYear = Math.floor(startMonthAbs / 12)
    const startMonth = startMonthAbs - startYear * 12
    const startDate = `${startYear}-${pad(startMonth + 1)}-01`
    const endDate = `${endYear}-${pad(endMonth + 1)}-${pad(lastDayOfMonth(endYear, endMonth))}`
    return {
      startDate,
      endDate,
      startMonth: startDate.slice(0, 7),
      endMonth: endDate.slice(0, 7),
      label: formatRange(startDate, endDate),
      source: preset,
    }
  }

  /** Resolve the current comparison range from preset + custom dates. */
  const resolvedRange = computed<ComparisonRange | null>(() => {
    if (!props.plan) return null
    return rangeFromPreset(props.preset, props.plan)
  })

  /** Watch & emit the resolved range so the parent can pass it to the composable. */
  watch(
    resolvedRange,
    range => {
      emit('update:range', range)
    },
    { immediate: true }
  )

  /** Local state for the dropdown (closed by default). */
  const open = ref(false)

  /** Options to display in the dropdown. Year-ago is filtered out when unavailable. */
  const options = computed<{ value: ComparisonPreset; label: string }[]>(() => {
    const base: { value: ComparisonPreset; label: string }[] = [
      { value: 'none', label: 'Aucune comparaison' },
      { value: '3m', label: '3 mois précédents' },
      { value: '6m', label: '6 mois précédents' },
      { value: '12m', label: '12 mois précédents' },
    ]
    if (props.yearAgoAvailable) {
      base.push({ value: 'year-ago', label: 'Même période, an dernier' })
    }
    base.push({ value: 'custom', label: 'Personnalisé' })
    return base
  })

  const currentLabel = computed(() => {
    const opt = options.value.find(o => o.value === props.preset)
    if (!opt) return 'Aucune comparaison'
    if (props.preset === 'none') return opt.label
    if (resolvedRange.value)
      return `${opt.label} · ${resolvedRange.value.label}`
    return opt.label
  })

  function selectPreset(p: ComparisonPreset) {
    emit('update:preset', p)
    open.value = false
  }
</script>

<template>
  <div class="space-y-2" data-testid="comparison-selector">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span
        class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 shrink-0"
      >
        Comparer avec
      </span>

      <div class="relative inline-block">
        <button
          type="button"
          data-testid="comparison-trigger"
          class="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          @click="open = !open"
        >
          <span
            class="inline-block w-2 h-2 rounded-full shrink-0"
            :class="
              preset === 'none'
                ? 'bg-gray-300 dark:bg-slate-600'
                : 'bg-indigo-500'
            "
          />
          <span>{{ currentLabel }}</span>
          <svg
            class="w-4 h-4 text-gray-400 dark:text-gray-500"
            :class="{ 'rotate-180': open }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <div
          v-if="open"
          class="absolute z-20 mt-1 min-w-[220px] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
        >
          <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            :data-testid="`comparison-option-${opt.value}`"
            class="block w-full text-left px-3 py-2 text-sm transition-colors"
            :class="
              preset === opt.value
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
            "
            @click="selectPreset(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <span
        v-if="resolvedRange"
        class="text-xs text-gray-400 dark:text-gray-500"
      >
        {{ formatMonth(resolvedRange.startDate) }} →
        {{ formatMonth(resolvedRange.endDate) }}
      </span>
    </div>

    <!-- Custom date inputs -->
    <div
      v-if="preset === 'custom'"
      class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
    >
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
          >Du :</label
        >
        <input
          type="date"
          :value="customStartDate"
          data-testid="comparison-custom-start"
          class="px-2.5 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
          @input="
            emit(
              'update:customStartDate',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
          >Au :</label
        >
        <input
          type="date"
          :value="customEndDate"
          data-testid="comparison-custom-end"
          class="px-2.5 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
          @input="
            emit(
              'update:customEndDate',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, useId, watch } from 'vue'
  import type {
    ComparisonPreset,
    ComparisonRange,
  } from '@/composables/useBudgetComparison'
  import type { BudgetPlanDto } from '@/lib/api'
  import { formatMonth } from '@/lib/formatters'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'

  /**
   * « Comparer avec »: the past the plan is set against. A segment of its
   * few choices, mounted by the page on the chart's card, in tracking as in
   * editing: the chart draws the comparison's months in grey, the history
   * column of the envelopes waits for edit mode. The resolved range leaves
   * as `update:range`; the preset and the dates stay with the page.
   */
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

  /** Format a range as "Janv. 2026" (single month) or "Janv.–Mars 2026". */
  function formatRange(start: string, end: string): string {
    const sy = Number(start.split('-')[0])
    const ey = Number(end.split('-')[0])
    if (sy === ey) {
      if (start.slice(0, 7) === end.slice(0, 7)) return formatMonth(start)
      return `${formatMonth(start, { year: false })}–${formatMonth(end)}`
    }
    return `${formatMonth(start)} → ${formatMonth(end)}`
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
      // An end before its start is not a range: say so rather than skip
      // the refetch in silence.
      if (props.customEndDate < props.customStartDate) return null
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

  /** The custom dates are both set, but in the wrong order. */
  const customRangeInverted = computed(
    () =>
      props.preset === 'custom' &&
      props.customStartDate !== '' &&
      props.customEndDate !== '' &&
      props.customEndDate < props.customStartDate
  )

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

  /**
   * The choices, all visible: none, the months right before the plan, the
   * same months a year earlier when they hold any data, or two dates.
   * « Aucune » comes first: the selector sits on the chart's card in
   * tracking as in editing, and the comparison chosen outlives edit mode
   * (Richard, 2026-10-24), so it must be possible to take it off.
   */
  const options = computed<SegmentedOption<ComparisonPreset>[]>(() => {
    const base: SegmentedOption<ComparisonPreset>[] = [
      { value: 'none', label: 'Aucune', title: 'Le plan seul' },
      { value: '3m', label: '3 mois', title: 'Les 3 mois avant le plan' },
      { value: '6m', label: '6 mois', title: 'Les 6 mois avant le plan' },
      { value: '12m', label: '12 mois', title: 'Les 12 mois avant le plan' },
    ]
    if (props.yearAgoAvailable) {
      base.push({
        value: 'year-ago',
        label: 'Il y a un an',
        title: 'Les mois du plan, un an plus tôt',
      })
    }
    base.push({ value: 'custom', label: 'Dates…', title: 'Choisir les dates' })
    return base.map(option => ({
      ...option,
      testId: `comparison-option-${option.value}`,
    }))
  })

  const labelId = `comparison-label-${useId()}`

  function selectPreset(preset: ComparisonPreset): void {
    if (preset === props.preset) return
    emit('update:preset', preset)
  }
</script>

<template>
  <div class="space-y-2" data-testid="comparison-selector">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        :id="labelId"
        class="shrink-0 text-xs text-gray-500 dark:text-gray-400"
      >
        Comparer avec
      </span>
      <SegmentedControl
        :model-value="preset"
        :options="options"
        size="sm"
        scrollable
        :labelled-by="labelId"
        @update:model-value="selectPreset"
      />
      <span
        v-if="resolvedRange"
        data-testid="comparison-range"
        class="hidden text-xs text-gray-500 sm:inline dark:text-gray-400"
      >
        {{ formatMonth(resolvedRange.startDate) }} →
        {{ formatMonth(resolvedRange.endDate) }}
      </span>
    </div>

    <!-- The two dates, under the segment, once « Dates… » is chosen. -->
    <div
      v-if="preset === 'custom'"
      class="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <label
          for="comparison-custom-start"
          class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
          >Du :</label
        >
        <input
          id="comparison-custom-start"
          type="date"
          :value="customStartDate"
          data-testid="comparison-custom-start"
          class="min-h-[44px] w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-900 sm:min-h-0 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
          @input="
            emit(
              'update:customStartDate',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </div>
      <div class="flex min-w-0 items-center gap-2">
        <label
          for="comparison-custom-end"
          class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
          >Au :</label
        >
        <input
          id="comparison-custom-end"
          type="date"
          :value="customEndDate"
          data-testid="comparison-custom-end"
          class="min-h-[44px] w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-900 sm:min-h-0 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
          @input="
            emit(
              'update:customEndDate',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </div>
    </div>
    <InlineAlert
      v-if="customRangeInverted"
      variant="warning"
      data-testid="comparison-custom-inverted"
    >
      La date de fin est antérieure à la date de début : la comparaison n’est
      pas appliquée.
    </InlineAlert>
  </div>
</template>

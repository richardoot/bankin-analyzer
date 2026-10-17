<script setup lang="ts">
  import { computed } from 'vue'
  import { useFiltersStore, type TimePeriod } from '@/stores/filters'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'

  const filtersStore = useFiltersStore()

  const periods: SegmentedOption<TimePeriod>[] = [
    { value: '3m', label: '3 mois', shortLabel: '3M', testId: 'period-3m' },
    { value: '6m', label: '6 mois', shortLabel: '6M', testId: 'period-6m' },
    { value: '1y', label: '1 an', shortLabel: '1A', testId: 'period-1y' },
    { value: 'all', label: 'Tout', testId: 'period-all' },
    {
      value: 'custom',
      label: 'Personnalisé',
      shortLabel: 'Perso.',
      testId: 'period-custom',
    },
  ]

  const dateRangeLabel = computed(() => {
    const { startDate, endDate } = filtersStore.getDateRangeFromPeriod(
      filtersStore.timePeriod
    )
    if (!startDate || !endDate) return null

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    }

    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  })

  const isCustom = computed(() => filtersStore.timePeriod === 'custom')

  const startInput = computed({
    get: () => filtersStore.customStartDate ?? '',
    set: (value: string) => {
      filtersStore.setCustomDateRange(value || null, filtersStore.customEndDate)
    },
  })

  const endInput = computed({
    get: () => filtersStore.customEndDate ?? '',
    set: (value: string) => {
      filtersStore.setCustomDateRange(
        filtersStore.customStartDate,
        value || null
      )
    },
  })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <!-- Segmented control -->
      <!-- A 5-column grid on a phone: the inline pill wrapped to a second
           line at 375px and its rounded ends landed mid-row. -->
      <SegmentedControl
        :model-value="filtersStore.timePeriod"
        :options="periods"
        label="Période"
        full-width
        @update:model-value="filtersStore.setTimePeriod($event)"
      />

      <!-- Date range indicator -->
      <div
        v-if="dateRangeLabel"
        class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
      >
        <svg
          class="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>{{ dateRangeLabel }}</span>
      </div>
    </div>

    <!-- Custom date pickers -->
    <div
      v-if="isCustom"
      data-testid="custom-date-pickers"
      class="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-4"
    >
      <div class="flex min-w-0 items-center gap-2">
        <label
          for="custom-start-date"
          class="text-sm text-gray-600 dark:text-gray-400 shrink-0"
        >
          Du :
        </label>
        <input
          id="custom-start-date"
          v-model="startInput"
          data-testid="custom-start-date"
          type="date"
          class="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:min-h-0 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
        />
      </div>
      <div class="flex min-w-0 items-center gap-2">
        <label
          for="custom-end-date"
          class="text-sm text-gray-600 dark:text-gray-400 shrink-0"
        >
          Au :
        </label>
        <input
          id="custom-end-date"
          v-model="endInput"
          data-testid="custom-end-date"
          type="date"
          class="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:min-h-0 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useFiltersStore, type TimePeriod } from '@/stores/filters'

  const filtersStore = useFiltersStore()

  const periods: { value: TimePeriod; label: string; shortLabel: string }[] = [
    { value: '3m', label: '3 mois', shortLabel: '3M' },
    { value: '6m', label: '6 mois', shortLabel: '6M' },
    { value: '1y', label: '1 an', shortLabel: '1A' },
    { value: 'all', label: 'Tout', shortLabel: 'Tout' },
    { value: 'custom', label: 'Personnalisé', shortLabel: 'Perso.' },
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
      <div
        class="inline-flex rounded-lg bg-gray-100 dark:bg-slate-700/50 p-1 flex-wrap"
      >
        <button
          v-for="(period, index) in periods"
          :key="period.value"
          :data-testid="`period-${period.value}`"
          class="relative px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
          :class="[
            filtersStore.timePeriod === period.value
              ? 'text-white'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
            index === 0 ? 'rounded-l-md' : '',
            index === periods.length - 1 ? 'rounded-r-md' : '',
          ]"
          @click="filtersStore.setTimePeriod(period.value)"
        >
          <!-- Active background pill -->
          <span
            v-if="filtersStore.timePeriod === period.value"
            class="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-500 dark:to-blue-400 rounded-md shadow-sm"
          />
          <!-- Label -->
          <span class="relative z-10 hidden sm:inline">{{ period.label }}</span>
          <span class="relative z-10 sm:hidden">{{ period.shortLabel }}</span>
        </button>
      </div>

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
      class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
    >
      <div class="flex items-center gap-2">
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
          class="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm min-h-[44px] sm:min-h-0"
        />
      </div>
      <div class="flex items-center gap-2">
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
          class="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm min-h-[44px] sm:min-h-0"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { CategoryDataDto } from '@/lib/api'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import { formatCurrency } from '@/lib/formatters'

  const props = withDefaults(
    defineProps<{
      categories: CategoryDataDto[]
      monthLabels: string[]
      total: number
      /** Color for sparklines + drill-down chart */
      color?: string
      /**
       * 'everyday' strips the share carried by exceptional events (holidays,
       * birthdays) from the headline figures, leaving the recurring lifestyle.
       */
      mode?: 'real' | 'everyday'
    }>(),
    {
      color: '#ef4444',
      mode: 'real',
    }
  )

  const expanded = ref<Set<string>>(new Set())

  function toggleExpanded(key: string) {
    if (expanded.value.has(key)) {
      expanded.value.delete(key)
    } else {
      expanded.value.add(key)
    }
  }

  function isExpanded(key: string): boolean {
    return expanded.value.has(key)
  }

  const MONTH_LABELS_FR: Record<string, string> = {
    '01': 'Jan',
    '02': 'Fév',
    '03': 'Mar',
    '04': 'Avr',
    '05': 'Mai',
    '06': 'Juin',
    '07': 'Juil',
    '08': 'Août',
    '09': 'Sep',
    '10': 'Oct',
    '11': 'Nov',
    '12': 'Déc',
  }

  // Display labels (Jan 2025 etc.) for the bar chart x-axis
  const displayLabels = computed(() =>
    props.monthLabels.map(ym => {
      const [, month] = ym.split('-')
      return MONTH_LABELS_FR[month ?? ''] ?? ym
    })
  )

  function rowKey(cat: CategoryDataDto): string {
    return cat.categoryId ?? cat.category
  }

  const isEveryday = computed(() => props.mode === 'everyday')

  /** Amount over the period, in the active mode. */
  function displayedAmount(cat: CategoryDataDto): number {
    if (isEveryday.value && cat.everydayAmount !== undefined) {
      return cat.everydayAmount
    }
    return cat.amount
  }

  /** Monthly average, in the active mode. Undefined without a breakdown. */
  function displayedAverage(cat: CategoryDataDto): number | undefined {
    if (isEveryday.value && cat.everydayAveragePerMonth !== undefined) {
      return cat.everydayAveragePerMonth
    }
    return cat.averagePerMonth
  }

  function getPercent(cat: CategoryDataDto): number {
    if (props.total <= 0) return 0
    return (displayedAmount(cat) / props.total) * 100
  }

  // Each category may not have monthlyAmounts (legacy/empty); guard.
  function getSparklineData(cat: CategoryDataDto): number[] {
    if (isEveryday.value && cat.everydayMonthlyAmounts) {
      return cat.everydayMonthlyAmounts
    }
    return cat.monthlyAmounts ?? []
  }

  function chartDataFor(cat: CategoryDataDto) {
    return {
      labels: displayLabels.value,
      values: getSparklineData(cat),
    }
  }
</script>

<template>
  <div class="space-y-1.5" data-testid="category-breakdown-list">
    <div
      v-if="categories.length === 0"
      class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      Aucune catégorie à afficher
    </div>

    <div
      v-for="cat in categories"
      :key="rowKey(cat)"
      class="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
    >
      <!-- Row -->
      <button
        type="button"
        :data-testid="`category-row-${cat.category}`"
        class="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
        :aria-expanded="isExpanded(rowKey(cat))"
        @click="toggleExpanded(rowKey(cat))"
      >
        <!-- Chevron -->
        <svg
          class="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform"
          :class="{ 'rotate-90': isExpanded(rowKey(cat)) }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>

        <!-- Icon + name -->
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span v-if="cat.icon" class="text-lg shrink-0">{{ cat.icon }}</span>
          <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
            {{ cat.category }}
          </span>
          <span
            class="text-xs text-gray-400 dark:text-gray-500 shrink-0 hidden sm:inline"
          >
            {{ getPercent(cat).toFixed(1) }}%
          </span>
        </div>

        <!-- Sparkline -->
        <div class="hidden sm:block shrink-0">
          <SparklineChart
            v-if="getSparklineData(cat).length >= 2"
            :data="getSparklineData(cat)"
            :color="color"
          />
        </div>

        <!-- Amounts -->
        <div class="shrink-0 text-right">
          <div
            class="font-semibold text-gray-900 dark:text-gray-100 tabular-nums"
          >
            {{ formatCurrency(displayedAverage(cat) ?? displayedAmount(cat))
            }}<span
              v-if="displayedAverage(cat) !== undefined"
              class="text-xs font-normal text-gray-500 dark:text-gray-400"
            >
              /mois</span
            >
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            Total : {{ formatCurrency(displayedAmount(cat)) }}
          </div>
          <div
            v-if="cat.exceptionalAmount && cat.exceptionalAmount > 0"
            class="text-xs text-amber-600 dark:text-amber-500 tabular-nums"
            :title="
              isEveryday
                ? 'Montant exclu de cette moyenne'
                : 'Part incluse dans cette moyenne'
            "
          >
            {{ isEveryday ? 'hors' : 'dont' }}
            {{ formatCurrency(cat.exceptionalAmount) }} exceptionnel
          </div>
        </div>
      </button>

      <!-- Drill-down panel -->
      <div
        v-if="isExpanded(rowKey(cat))"
        class="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 px-4 py-4"
      >
        <!-- Subcategories table -->
        <div
          v-if="cat.subcategories && cat.subcategories.length > 0"
          class="mb-4"
        >
          <h4
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
          >
            Sous-catégories
          </h4>
          <div class="space-y-1">
            <div
              v-for="sub in cat.subcategories"
              :key="sub.subcategory || '(sans sous-catégorie)'"
              class="flex items-center gap-3 px-3 py-1.5 rounded text-sm bg-white dark:bg-slate-900"
            >
              <span
                v-if="sub.icon"
                class="text-base shrink-0 leading-none"
                aria-hidden="true"
              >
                {{ sub.icon }}
              </span>
              <span class="flex-1 truncate text-gray-700 dark:text-gray-300">
                {{ sub.subcategory || '(sans sous-catégorie)' }}
              </span>
              <span
                class="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0"
              >
                {{ sub.transactionCount }} tx
              </span>
              <span
                class="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0"
              >
                {{ formatCurrency(sub.amount) }}
              </span>
              <span
                class="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 hidden sm:inline"
              >
                {{ formatCurrency(sub.averagePerMonth) }}/mois
              </span>
            </div>
          </div>
        </div>

        <!-- Monthly evolution chart -->
        <div v-if="getSparklineData(cat).length >= 2">
          <h4
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
          >
            Évolution mensuelle
          </h4>
          <MonthlyBarChart
            :data="chartDataFor(cat)"
            :title="cat.category"
            :color="color"
          />
        </div>

        <!-- Reimbursement info -->
        <div
          v-if="cat.reimbursement || cat.pendingReimbursement"
          class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
        >
          <span v-if="cat.reimbursement">
            Remboursements reçus déduits :
            <strong class="text-gray-700 dark:text-gray-300">{{
              formatCurrency(cat.reimbursement)
            }}</strong>
          </span>
          <span v-if="cat.pendingReimbursement">
            En attente déduits :
            <strong class="text-gray-700 dark:text-gray-300">{{
              formatCurrency(cat.pendingReimbursement)
            }}</strong>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { UNCATEGORIZED_CATEGORY_ID, type CategoryDataDto } from '@/lib/api'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import { formatCurrency, formatMonth } from '@/lib/formatters'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'

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
      /**
       * The hue each category takes in the donut beside the list, by name:
       * drawn as a dot before the name so the two can be read together.
       */
      colors?: Map<string, string> | undefined
      /**
       * The period the figures cover, for the links to the Transactions
       * page: a row opens its category over that window, a bar of the
       * drill-down chart opens its month.
       */
      window?:
        { from?: string | undefined; to?: string | undefined } | undefined
    }>(),
    {
      color: '#ef4444',
      mode: 'real',
      colors: undefined,
      window: undefined,
    }
  )

  const router = useRouter()

  /** The id a link names: the unfiled rows have a word for it, not an id. */
  function linkCategoryId(cat: CategoryDataDto): string {
    return cat.categoryId === UNCATEGORIZED_CATEGORY_ID
      ? NO_CATEGORY
      : cat.categoryId
  }

  /**
   * The figures here are netted and shared; the list is not. `gross` makes
   * the Transactions page say so.
   */
  function rowLink(cat: CategoryDataDto) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: linkCategoryId(cat),
      from: props.window?.from,
      to: props.window?.to,
      gross: true,
      label: cat.category,
    })
  }

  function openMonth(cat: CategoryDataDto, month: string): void {
    void router.push(
      transactionsLink({
        type: 'EXPENSE',
        categoryId: linkCategoryId(cat),
        month,
        gross: true,
        label: `${cat.category} · ${formatMonth(month, { capitalize: false })}`,
      })
    )
  }

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

  // Display labels (Jan 2025 etc.) for the bar chart x-axis
  const displayLabels = computed(() =>
    props.monthLabels.map(ym => formatMonth(ym, { year: false }))
  )

  function rowKey(cat: CategoryDataDto): string {
    return cat.categoryId
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
      class="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700"
    >
      <!-- Row: the toggle, then the link to its transactions beside it —
           never inside it, a link in a button is two gestures in one.
           No overflow-hidden on the card: it cut the keyboard focus ring
           off; the row rounds its own corners instead. -->
      <div class="flex items-center pr-2">
        <button
          type="button"
          :data-testid="`category-row-${cat.category}`"
          class="min-w-0 flex-1 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          :class="isExpanded(rowKey(cat)) ? 'rounded-tl-lg' : 'rounded-l-lg'"
          :aria-expanded="isExpanded(rowKey(cat))"
          @click="toggleExpanded(rowKey(cat))"
        >
          <!-- Chevron -->
          <IconChevronRight
            class="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform"
            :class="{ 'rotate-90': isExpanded(rowKey(cat)) }"
          />

          <!-- Icon + name; the share sits beside the name on a desk and
             wraps under it on a phone, where it used to be hidden outright. -->
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
            <span
              v-if="colors?.get(cat.category)"
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: colors.get(cat.category) }"
              :data-testid="`category-color-${cat.category}`"
              aria-hidden="true"
            />
            <span v-if="cat.icon" class="text-lg shrink-0">{{ cat.icon }}</span>
            <span
              class="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100"
            >
              {{ cat.category }}
            </span>
            <span
              class="basis-full text-xs text-gray-500 tabular-nums sm:basis-auto dark:text-gray-400"
            >
              {{ getPercent(cat).toFixed(1) }}%
            </span>
          </div>

          <!-- Sparkline -->
          <div class="hidden sm:block shrink-0">
            <SparklineChart
              v-if="getSparklineData(cat).length >= 2"
              :data="getSparklineData(cat)"
              :color="props.color"
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
              class="text-xs text-amber-700 dark:text-amber-400 tabular-nums"
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
        <TransactionsLink
          :to="rowLink(cat)"
          :subject="cat.category"
          icon-only
          :data-testid="`category-link-${cat.category}`"
        />
      </div>

      <!-- Drill-down panel -->
      <div
        v-if="isExpanded(rowKey(cat))"
        class="rounded-b-lg border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 px-4 py-4"
      >
        <!-- Subcategories table -->
        <div
          v-if="cat.subcategories && cat.subcategories.length > 0"
          class="mb-4"
        >
          <SectionLabel as="h4" class="mb-2"> Sous-catégories </SectionLabel>
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
                class="hidden text-xs text-gray-500 tabular-nums shrink-0 sm:inline dark:text-gray-400"
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
          <SectionLabel as="h4" class="mb-2">
            Évolution mensuelle
          </SectionLabel>
          <!-- A bar opens its month; the link above is the keyboard way. -->
          <MonthlyBarChart
            :data="chartDataFor(cat)"
            :title="cat.category"
            :color="props.color"
            :months="monthLabels"
            @select-month="month => openMonth(cat, month)"
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

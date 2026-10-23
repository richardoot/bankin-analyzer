<script setup lang="ts">
  import { onMounted, computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import IncomeExpensesChart from '@/components/charts/IncomeExpensesChart.vue'
  import TimePeriodSelector from '@/components/filters/TimePeriodSelector.vue'
  import CategoryBreakdownList from '@/components/dashboard/CategoryBreakdownList.vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import LegacyMigrationBanner from '@/components/settings/LegacyMigrationBanner.vue'
  import StructureLines from '@/components/dashboard/StructureLines.vue'
  import PeriodSummaryLines from '@/components/dashboard/PeriodSummaryLines.vue'
  import SpendingTrendsCard from '@/components/dashboard/SpendingTrendsCard.vue'
  import TodoCard from '@/components/dashboard/TodoCard.vue'
  import { todoItems as composeTodoItems } from '@/lib/todo'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import { useDashboardData } from '@/composables/useDashboardData'
  import { useFiltersStore } from '@/stores/filters'
  import { formatCompactCurrency, formatMonth } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import { DASHBOARD_THRESHOLDS } from '@/lib/dashboardThresholds'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import type { TrendsResponseDto } from '@/lib/api'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import ReadingMenu from '@/components/dashboard/ReadingMenu.vue'
  import MonthBand from '@/components/dashboard/MonthBand.vue'
  import { useMonthData } from '@/composables/useMonthData'
  import { useAccountsStore } from '@/stores/accounts'

  const router = useRouter()

  const {
    totalExpenses,
    totalIncome,
    breakdownMode,
    setBreakdownMode,
    displayedTotalExpenses,
    pendingPreferenceSyncError,
    exceptionalEvents,
    hasExceptionalExpenses,
    hasAmortizedExpenses,
    periodMonths,
    averagesReadClosedMonths,
    averageMonthlyIncome,
    averageMonthlySavings,
    monthlyData,
    incomeCategoriesDetailed,
    spendingStructure,
    everydaySpendingStructure,
    tagFamiliesOfYear,
    structureBreakdown,
    structureShareByMonth,
    pendingReceivables,
    expenseCategoriesDetailed,
    monthLabels,
    periodRangeLabel,
    allExpenseCategories,
    deductReimbursements,
    deductPendingReimbursements,
    isLoading,
    error,
    fetchData,
    hasLoaded,
  } = useDashboardData()

  /** The trends the « Ce qui change » card loaded, for « À faire ». */
  const trendsData = ref<TrendsResponseDto | null>(null)
  /** « À faire »: what the summary and the trends ask the user to do. */
  const todoItems = computed(() =>
    composeTodoItems(
      {
        spendingStructure: spendingStructure.value,
        pendingReceivables: pendingReceivables.value,
        tagFamiliesOfYear: tagFamiliesOfYear.value,
      },
      trendsData.value
    )
  )
  const filtersStore = useFiltersStore()
  const accountsStore = useAccountsStore()

  /** The reading, written through the composable that keeps it. */
  const breakdownModeModel = computed({
    get: () => breakdownMode.value,
    set: setBreakdownMode,
  })

  /**
   * « Ce mois-ci »: its own request, sent with the summary, following the
   * reading and the switches, never the period.
   */
  const {
    data: monthData,
    isLoading: isMonthLoading,
    error: monthError,
    fetchMonth,
  } = useMonthData({
    reading: breakdownMode,
    deductReimbursements,
    deductPendingReimbursements,
  })

  // A first answer came back: later fetches are refreshes, shown over the
  // current figures, never by swapping the page — and its filters — for a
  // skeleton. An empty period counts as an answer.
  const showFullLoader = computed(() => isLoading.value && !hasLoaded.value)

  // Show subtle refresh indicator when reloading with existing data
  const isRefreshing = computed(() => isLoading.value && hasLoaded.value)

  // Nothing on the period: the sections make way for an empty state
  // instead of rendering as empty charts above it.
  const hasAnyData = computed(
    () => totalExpenses.value > 0 || totalIncome.value > 0
  )

  // An empty unbounded period means no transaction at all — the onboarding.
  // Any other empty period only means nothing happened in it — unless there
  // is no account either: the default period is twelve months now, and a
  // newcomer must still land on the way in, not on « choose another period ».
  const isEmptyPeriod = computed(
    () => filtersStore.timePeriod !== 'all' && accountsStore.accounts.length > 0
  )

  function showAllPeriods(): void {
    filtersStore.setTimePeriod('all')
  }

  /**
   * Links to the Transactions page. Every figure here is netted and
   * shared, so each link carries `gross`: the list will say it shows the
   * full amounts. The period is the dashboard's own window — carried on
   * the link, never synchronised with the list's filters.
   */
  const linkWindow = computed(() => {
    const range = filtersStore.getDateRangeFromPeriod(filtersStore.timePeriod)
    return {
      from: range.startDate ?? undefined,
      to: range.endDate ?? undefined,
    }
  })

  /** The expense categories' names by id: a trend tile names a subcategory's parent. */
  const expenseCategoryNames = computed<Record<string, string>>(() =>
    Object.fromEntries(allExpenseCategories.value.map(c => [c.id, c.name]))
  )

  type LinkType = 'EXPENSE' | 'INCOME'

  const KIND_LABEL: Record<LinkType, string> = {
    EXPENSE: 'Dépenses',
    INCOME: 'Revenus',
  }

  /** The whole period's expenses, or its income. */
  function periodLink(type: LinkType) {
    return transactionsLink({
      type,
      ...linkWindow.value,
      gross: true,
      label: `${KIND_LABEL[type]} de la période`,
    })
  }
  const expensesLink = computed(() => periodLink('EXPENSE'))
  const incomeLink = computed(() => periodLink('INCOME'))

  /** A column of the monthly chart opens its month's expenses. */
  function openMonth(month: string): void {
    void router.push(
      transactionsLink({
        type: 'EXPENSE',
        month,
        gross: true,
        label: `${KIND_LABEL.EXPENSE} · ${formatMonth(month, { capitalize: false })}`,
      })
    )
  }

  /** « Où part l'argent · novembre 2025 à octobre 2026 ». */
  const whereTitle = computed(() =>
    periodRangeLabel.value
      ? `Où part l'argent · ${periodRangeLabel.value}`
      : "Où part l'argent"
  )

  /** « Les 12 catégories, les plus lourdes en tête ». */
  const categoriesSubtitle = computed(() => {
    const n = expenseCategoriesDetailed.value.length
    return n === 1
      ? 'Une seule catégorie sur la période'
      : `Les ${n} catégories, les plus lourdes en tête`
  })

  onMounted(() => {
    fetchData()
    void fetchMonth()
  })
</script>

<template>
  <PageShell width="wide" data-testid="dashboard-container">
    <PageHeader title="Dashboard" subtitle="Vue d'ensemble de vos finances">
      <template #actions>
        <!-- Subtle refresh indicator -->
        <div
          v-if="isRefreshing"
          class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
        >
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Mise à jour...</span>
        </div>
        <!-- The ways of reading the figures, behind one button that says
             which one is on. -->
        <ReadingMenu
          v-if="!showFullLoader"
          v-model:breakdown-mode="breakdownModeModel"
          v-model:deduct-reimbursements="deductReimbursements"
          v-model:deduct-pending-reimbursements="deductPendingReimbursements"
          :has-exceptional-expenses="hasExceptionalExpenses"
          :has-amortized-expenses="hasAmortizedExpenses"
          :pending-sync-error="pendingPreferenceSyncError"
        />
      </template>
    </PageHeader>

    <!-- Error state: says what failed and offers the way out; the filters
           and whatever was already on screen stay put underneath. -->
    <InlineAlert
      v-if="error"
      data-testid="dashboard-error"
      class="mb-6"
      title="Le tableau de bord n'a pas pu être chargé."
      :retry-label="isLoading ? 'Nouvelle tentative…' : 'Réessayer'"
      retry-test-id="dashboard-retry"
      :retrying="isLoading"
      @retry="fetchData()"
    >
      {{ error }}
      <span v-if="hasAnyData" class="block text-xs opacity-80"
        >Les chiffres affichés sont ceux du dernier chargement réussi.</span
      >
    </InlineAlert>

    <!-- Initial load: the page's own shape, not a spinner. -->
    <div v-if="showFullLoader" class="space-y-6" aria-busy="true">
      <SkeletonBlock class="h-24 rounded-xl" />
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <SkeletonBlock v-for="n in 4" :key="n" class="h-28 rounded-xl" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SkeletonBlock class="h-80 rounded-xl" />
        <SkeletonBlock class="h-80 rounded-xl" />
      </div>
    </div>

    <!-- Content (shown when we have data or finished loading) -->
    <div
      v-if="!showFullLoader"
      class="transition-opacity duration-200"
      :class="isRefreshing ? 'opacity-60' : 'opacity-100'"
    >
      <!-- Under the header, not above it: it arrives after the first fetch
           and must not push the reading menu down as it is being aimed at. -->
      <LegacyMigrationBanner class="mb-6" />

      <template v-if="hasAnyData">
        <!-- « Ce mois-ci »: the current month to date, first; the period
             governs only what comes below it. -->
        <MonthBand
          class="mb-8"
          :data="monthData"
          :reading="breakdownMode"
          :is-loading="isMonthLoading"
          :error="monthError"
          @retry="fetchMonth()"
        />

        <!-- What changes: after the totals, before their detail. Its own
             request, sent once the summary is on screen; it follows the
             reading and the reimbursement switches, never the period.
             Compact here: the lead and three tiles, the rest on /trends. -->
        <SpendingTrendsCard
          class="mb-8"
          compact
          :reading="breakdownMode"
          :deduct-reimbursements="deductReimbursements"
          :deduct-pending-reimbursements="deductPendingReimbursements"
          :category-names="expenseCategoryNames"
          @loaded="trendsData = $event"
        />

        <!-- « À faire »: the lines to file, the money advanced, an envelope
             over, a charge that moved. Renders nothing when nothing is to do. -->
        <TodoCard class="mb-8" :items="todoItems" />

        <!-- « Où part l'argent »: the period, in its heading and its
             selector, then one card — the structure, the months, the
             categories, the summary lines. -->
        <section
          data-testid="dashboard-where-section"
          aria-labelledby="dashboard-where-title"
          class="mb-10"
        >
          <header
            class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
          >
            <h2
              id="dashboard-where-title"
              class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              data-testid="dashboard-where-title"
            >
              {{ whereTitle }}
            </h2>
            <!-- The period governs this section only: it says so by
                 sitting in its header. -->
            <div data-testid="dashboard-period" class="lg:shrink-0">
              <TimePeriodSelector />
            </div>
          </header>

          <BaseCard data-testid="dashboard-where-card" class="space-y-8">
            <StructureLines
              v-if="spendingStructure && everydaySpendingStructure"
              :actual="spendingStructure"
              :everyday="everydaySpendingStructure"
              :reading="breakdownMode"
              :period-months="periodMonths"
              :window="linkWindow"
              :breakdown="structureBreakdown"
              :share-by-month="structureShareByMonth"
              :month-labels="monthLabels"
            />

            <!-- The months: a column opens its month, the link under the
                 chart is the keyboard way to the whole period. -->
            <div data-testid="dashboard-charts-section">
              <SectionLabel as="h3" class="mb-2">
                Revenus et dépenses par mois
              </SectionLabel>
              <IncomeExpensesChart
                :months="monthlyData"
                :reading="breakdownMode"
                :habit="monthData?.habit ?? null"
                @select-month="openMonth"
              />
              <div class="mt-2 flex justify-end">
                <TransactionsLink
                  :to="expensesLink"
                  subject="la période"
                  data-testid="expenses-transactions-link"
                />
              </div>
            </div>

            <!-- Every category, the heaviest first; a sparkline only on
                 the big ones, every row's months once it is expanded. -->
            <div
              v-if="expenseCategoriesDetailed.length > 0"
              data-testid="dashboard-categories"
            >
              <h3
                class="text-base font-semibold text-gray-900 dark:text-gray-100"
              >
                Par catégorie · moyenne par mois, sur
                <span class="tabular-nums">{{
                  formatCompactCurrency(displayedTotalExpenses)
                }}</span>
              </h3>
              <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {{ categoriesSubtitle }}
              </p>
              <CategoryBreakdownList
                :categories="expenseCategoriesDetailed"
                :month-labels="monthLabels"
                :total="displayedTotalExpenses"
                :mode="breakdownMode"
                :window="linkWindow"
                :trend-min-share="DASHBOARD_THRESHOLDS.sparklineMinShare"
              />
            </div>

            <PeriodSummaryLines
              :average-income="averageMonthlyIncome"
              :average-savings="averageMonthlySavings"
              :period-months="periodMonths"
              :closed-months="averagesReadClosedMonths"
              :income-sources="incomeCategoriesDetailed"
              :income-link="incomeLink"
              :events="hasExceptionalExpenses ? exceptionalEvents : []"
              :families="tagFamiliesOfYear"
              :has-exceptional-expenses="hasExceptionalExpenses"
            />
          </BaseCard>
        </section>
      </template>

      <!-- A quiet period, for a user who has data elsewhere in time, or a
           failed first load: the period stays at hand to pick another —
           a new period is also a way to try again. -->
      <section
        v-else-if="error || isEmptyPeriod"
        data-testid="dashboard-where-section"
        aria-labelledby="dashboard-where-title"
      >
        <header
          class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
        >
          <h2
            id="dashboard-where-title"
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            data-testid="dashboard-where-title"
          >
            {{ whereTitle }}
          </h2>
          <!-- The period governs this section only: it says so by
               sitting in its header. -->
          <div data-testid="dashboard-period" class="lg:shrink-0">
            <TimePeriodSelector />
          </div>
        </header>
        <BaseCard
          v-if="!error"
          padding="none"
          data-testid="dashboard-empty-period"
        >
          <EmptyState
            title="Aucune transaction sur cette période"
            description="Choisissez une autre période, ou affichez tout l'historique."
          >
            <template #action>
              <BaseButton
                data-testid="dashboard-show-all"
                @click="showAllPeriods"
              >
                Afficher tout
              </BaseButton>
            </template>
          </EmptyState>
        </BaseCard>
      </section>

      <!-- Zero transactions: one question, two explicit ways in -->
      <BaseCard
        v-else-if="!error"
        padding="none"
        data-testid="dashboard-onboarding"
      >
        <EmptyState
          title="Aucune transaction pour l'instant"
          description="Importez vos transactions depuis un export CSV Bankin, ou connectez votre banque pour les synchroniser automatiquement."
        >
          <template #icon>
            <svg
              class="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </template>
          <template #action>
            <BaseButton
              to="/settings/accounts"
              data-testid="onboarding-connect-bank"
            >
              Connecter une banque
            </BaseButton>
            <BaseButton
              to="/import"
              variant="secondary"
              data-testid="onboarding-import-csv"
            >
              Importer un CSV
            </BaseButton>
          </template>
        </EmptyState>
      </BaseCard>
    </div>
  </PageShell>
</template>

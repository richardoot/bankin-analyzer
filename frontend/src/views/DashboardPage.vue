<script setup lang="ts">
  import { onMounted, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import TimePeriodSelector from '@/components/filters/TimePeriodSelector.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import CategoryBreakdownList from '@/components/dashboard/CategoryBreakdownList.vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import LegacyMigrationBanner from '@/components/settings/LegacyMigrationBanner.vue'
  import SpendingStructureCard from '@/components/dashboard/SpendingStructureCard.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import { useDashboardData } from '@/composables/useDashboardData'
  import { useFiltersStore } from '@/stores/filters'
  import { formatCurrency } from '@/lib/formatters'
  import { assignCategoryColors } from '@/lib/chartPalette'
  import { useChartTheme } from '@/composables/useChartTheme'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'

  const router = useRouter()

  const {
    totalExpenses,
    totalIncome,
    averageMonthlyExpenses,
    averageEverydayMonthlyExpenses,
    averageExceptionalMonthlyExpenses,
    breakdownMode,
    setBreakdownMode,
    displayedTotalExpenses,
    displayedAverageMonthlyExpenses,
    displayedExpensesByCategory,
    pendingPreferenceSyncError,
    exceptionalEvents,
    hasExceptionalExpenses,
    averageMonthlyIncome,
    averageMonthlySavings,
    periodMonths,
    spendingStructure,
    everydaySpendingStructure,
    savingsTransfers,
    pendingReceivables,
    savingsRate,
    remainingToLive,
    expensesSparkline,
    incomeSparkline,
    savingsSparkline,
    incomeByCategory,
    expenseCategoriesDetailed,
    monthLabels,
    allExpenseCategories,
    allIncomeCategories,
    selectedCategory,
    selectedIncomeCategory,
    filteredExpensesByMonth,
    filteredIncomeByMonth,
    setSelectedCategory,
    setSelectedIncomeCategory,
    deductReimbursements,
    deductPendingReimbursements,
    isLoading,
    error,
    fetchData,
    hasLoaded,
  } = useDashboardData()
  const filtersStore = useFiltersStore()
  const { isDark } = useChartTheme()

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
  // Any other empty period only means nothing happened in it.
  const isEmptyPeriod = computed(() => filtersStore.timePeriod !== 'all')

  function showAllPeriods(): void {
    filtersStore.setTimePeriod('all')
  }

  /**
   * The donut's colors, by category name, handed to the list under it so
   * a slice and its row read as one. Same cap as the chart (its default
   * topN of 7), same sort — the assignment is the chart's own.
   */
  const DONUT_TOP_N = 7
  const categoryColors = computed(() =>
    assignCategoryColors(
      displayedExpensesByCategory.value.labels,
      displayedExpensesByCategory.value.values,
      DONUT_TOP_N,
      isDark.value
    )
  )

  /**
   * Sum of the listed events, so the banner header matches the chips below it.
   * Deliberately not `totalExceptionalExpenses`, which is net of reimbursements
   * while the per-event amounts are gross.
   */
  const exceptionalEventsTotal = computed(() =>
    exceptionalEvents.value.reduce((sum, e) => sum + e.amount, 0)
  )

  function openTagAnalysis(tagId: string): void {
    router.push({ name: 'tag-analysis', params: { id: tagId } })
  }

  onMounted(() => {
    fetchData()
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <SkeletonBlock v-for="n in 3" :key="n" class="h-28 rounded-xl" />
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
      <!-- Period + reimbursement toggles (harmonized in a single card) -->
      <BaseCard
        bordered
        data-testid="dashboard-filters-card"
        class="mb-6 space-y-4"
      >
        <TimePeriodSelector />

        <div
          class="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-6 dark:border-slate-700"
        >
          <label
            for="dashboard-deduct-reimbursements"
            class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
          >
            <ToggleSwitch
              id="dashboard-deduct-reimbursements"
              :checked="deductReimbursements"
              label="Déduire les remboursements reçus"
              data-testid="toggle-deduct-reimbursements"
              @change="deductReimbursements = $event"
            />
            <span
              class="text-left text-xs leading-tight text-gray-700 sm:text-sm dark:text-gray-300"
            >
              <span class="sm:hidden">Déduire les remb. reçus</span>
              <span class="hidden sm:inline"
                >Déduire les remboursements reçus</span
              >
            </span>
          </label>
          <label
            for="dashboard-deduct-pending"
            class="flex min-h-[44px] cursor-pointer items-center gap-2.5 select-none sm:min-h-0"
          >
            <ToggleSwitch
              id="dashboard-deduct-pending"
              :checked="deductPendingReimbursements"
              label="Déduire les remboursements en attente"
              data-testid="toggle-deduct-pending"
              @change="deductPendingReimbursements = $event"
            />
            <span
              class="text-left text-xs leading-tight text-gray-700 sm:text-sm dark:text-gray-300"
            >
              <span class="sm:hidden">Déduire les remb. en attente</span>
              <span class="hidden sm:inline"
                >Déduire les remboursements en attente</span
              >
            </span>
          </label>
        </div>
        <!-- The two switches look alike but are not: one is a reading of
             this screen, the other a preference the budget shares. -->
        <p class="text-xs text-gray-500 dark:text-gray-400">
          « En attente » est une préférence enregistrée, partagée avec le Budget
          ; « reçus » ne vaut que pour cette lecture.
        </p>
        <InlineAlert
          v-if="pendingPreferenceSyncError"
          variant="warning"
          data-testid="dashboard-pending-sync-error"
        >
          Le réglage « en attente » s'applique ici, mais n'a pas pu être
          enregistré sur le serveur : {{ pendingPreferenceSyncError }}
        </InlineAlert>

        <!-- One reading for the whole page: the expenses KPI, the
             structure, the donut and the list follow it together. -->
        <div
          v-if="hasExceptionalExpenses"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 pt-4 dark:border-slate-700"
          data-testid="dashboard-breakdown-mode"
        >
          <span
            id="dashboard-reading-label"
            class="text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            Lecture des dépenses
          </span>
          <SegmentedControl
            :model-value="breakdownMode"
            size="sm"
            labelled-by="dashboard-reading-label"
            :options="[
              {
                value: 'everyday',
                label: 'Vie courante',
                testId: 'breakdown-mode-everyday',
              },
              { value: 'real', label: 'Tout', testId: 'breakdown-mode-real' },
            ]"
            @update:model-value="setBreakdownMode($event)"
          />
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{
              breakdownMode === 'everyday'
                ? 'Les dépenses d’événements sont mises à part.'
                : 'Les dépenses d’événements sont comprises.'
            }}
          </span>
        </div>
      </BaseCard>

      <!-- Below the filters, not above: it arrives after the first fetch
           and used to push the period bar down as it was being aimed at. -->
      <LegacyMigrationBanner class="mb-6" />

      <template v-if="hasAnyData">
        <!-- KPI cards: monthly averages -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <!-- Average monthly expenses -->
          <BaseCard
            data-testid="kpi-card-expenses"
            class="border-l-4 border-red-500"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Dépenses moyennes / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold text-red-600 dark:text-red-400"
                  data-testid="kpi-expenses-value"
                >
                  {{ formatCurrency(displayedAverageMonthlyExpenses) }}
                </div>
                <!-- The other reading, so the gap between the two — the
                     events — is always on screen. -->
                <div
                  v-if="hasExceptionalExpenses"
                  class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                  data-testid="kpi-expenses-other-reading"
                >
                  <template v-if="breakdownMode === 'everyday'">
                    hors événements ·
                    <span
                      class="font-semibold text-gray-700 dark:text-gray-300"
                    >
                      {{ formatCurrency(averageMonthlyExpenses) }}
                    </span>
                    / mois tout compris
                  </template>
                  <template v-else>
                    dont vie courante
                    <span
                      class="font-semibold text-gray-700 dark:text-gray-300"
                    >
                      {{ formatCurrency(averageEverydayMonthlyExpenses) }}
                    </span>
                    / mois, événements
                    {{ formatCurrency(averageExceptionalMonthlyExpenses) }}
                  </template>
                </div>
              </div>
              <SparklineChart
                v-if="expensesSparkline.length >= 2"
                :data="expensesSparkline"
                color="#ef4444"
              />
            </div>
          </BaseCard>

          <!-- Average monthly income -->
          <BaseCard
            data-testid="kpi-card-income"
            class="border-l-4 border-green-500"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Revenus moyens / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold text-green-700 dark:text-green-400"
                >
                  {{ formatCurrency(averageMonthlyIncome) }}
                </div>
              </div>
              <SparklineChart
                v-if="incomeSparkline.length >= 2"
                :data="incomeSparkline"
                color="#22c55e"
              />
            </div>
          </BaseCard>

          <!-- Average monthly savings -->
          <BaseCard
            data-testid="kpi-card-savings"
            class="border-l-4"
            :class="
              averageMonthlySavings >= 0 ? 'border-green-500' : 'border-red-500'
            "
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div
                  class="text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  Épargne moyenne / mois
                </div>
                <div
                  class="mt-2 text-2xl font-bold"
                  :class="
                    averageMonthlySavings >= 0
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  "
                >
                  {{ formatCurrency(averageMonthlySavings) }}
                </div>
              </div>
              <SparklineChart
                v-if="savingsSparkline.length >= 2"
                :data="savingsSparkline"
                :color="averageMonthlySavings >= 0 ? '#22c55e' : '#ef4444'"
              />
            </div>
          </BaseCard>
        </div>

        <SpendingStructureCard
          v-if="spendingStructure && everydaySpendingStructure"
          class="mb-8"
          :actual="spendingStructure"
          :everyday="everydaySpendingStructure"
          :savings-transfers="savingsTransfers"
          :pending-receivables="pendingReceivables"
          :savings-rate="savingsRate"
          :remaining-to-live="remainingToLive"
          :period-months="periodMonths"
          :reading="breakdownMode === 'everyday' ? 'everyday' : 'actual'"
        />

        <!-- Expenses section (primary) -->
        <section data-testid="dashboard-expenses-section" class="mb-10">
          <h2
            class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Dépenses
          </h2>
          <div
            data-testid="dashboard-charts-section"
            class="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <!-- Monthly expenses chart -->
            <BaseCard>
              <div
                class="mb-4 flex flex-wrap items-center justify-between gap-2"
              >
                <h3
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Dépenses par mois
                </h3>
                <BaseField
                  v-if="allExpenseCategories.length > 0"
                  as="select"
                  size="sm"
                  label="Catégorie des dépenses par mois"
                  label-hidden
                  data-testid="expense-category-filter"
                  class="max-w-full"
                  :model-value="selectedCategory ?? ''"
                  @update:model-value="
                    setSelectedCategory($event ? String($event) : null)
                  "
                >
                  <option value="">Toutes les catégories</option>
                  <option
                    v-for="cat in allExpenseCategories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.name }}
                  </option>
                </BaseField>
              </div>
              <div v-if="totalExpenses > 0" class="relative">
                <MonthlyBarChart
                  :data="filteredExpensesByMonth"
                  title="Dépenses"
                  color="#ef4444"
                />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucune dépense enregistrée
              </div>
            </BaseCard>

            <!-- Expenses pie chart -->
            <BaseCard>
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
              >
                Dépenses par catégorie
              </h3>
              <div
                v-if="displayedExpensesByCategory.values.length > 0"
                class="h-64 sm:h-80"
              >
                <CategoryPieChart
                  :data="displayedExpensesByCategory"
                  :top-n="DONUT_TOP_N"
                  title="Dépenses"
                />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucune dépense enregistrée
              </div>
            </BaseCard>
          </div>

          <!-- Category breakdown list (drill-down) -->
          <BaseCard v-if="expenseCategoriesDetailed.length > 0" class="mt-6">
            <h3
              class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1"
            >
              Détail par catégorie
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Cliquez sur une catégorie pour voir ses sous-catégories et son
              évolution mensuelle.
              <template v-if="breakdownMode === 'everyday'">
                Moyennes hors dépenses d'événements : seules les catégories
                concernées changent de valeur.
              </template>
            </p>

            <!-- What the exceptional share is made of -->
            <div
              v-if="hasExceptionalExpenses && exceptionalEvents.length > 0"
              class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
            >
              <p
                class="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1.5"
              >
                Événements de la période —
                {{ formatCurrency(exceptionalEventsTotal) }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="event in exceptionalEvents"
                  :key="event.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-300 transition dark:hover:ring-primary-700"
                  @click="openTagAnalysis(event.id)"
                >
                  <span
                    class="inline-block h-2 w-2 rounded-full shrink-0"
                    :style="{ backgroundColor: event.color ?? '#9ca3af' }"
                  ></span>
                  {{ event.name }}
                  <span class="font-semibold tabular-nums">
                    {{ formatCurrency(event.amount) }}
                  </span>
                </button>
              </div>
            </div>

            <CategoryBreakdownList
              :categories="expenseCategoriesDetailed"
              :month-labels="monthLabels"
              :total="displayedTotalExpenses"
              :mode="breakdownMode"
              :colors="categoryColors"
              color="#ef4444"
            />
          </BaseCard>
        </section>

        <!-- Income section (secondary) -->
        <section data-testid="dashboard-income-section">
          <h2
            class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Revenus
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Monthly income chart -->
            <BaseCard>
              <div
                class="mb-4 flex flex-wrap items-center justify-between gap-2"
              >
                <h3
                  class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Revenus par mois
                </h3>
                <BaseField
                  v-if="allIncomeCategories.length > 0"
                  as="select"
                  size="sm"
                  label="Catégorie des revenus par mois"
                  label-hidden
                  data-testid="income-category-filter"
                  class="max-w-full"
                  :model-value="selectedIncomeCategory ?? ''"
                  @update:model-value="
                    setSelectedIncomeCategory($event ? String($event) : null)
                  "
                >
                  <option value="">Toutes les catégories</option>
                  <option
                    v-for="cat in allIncomeCategories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.name }}
                  </option>
                </BaseField>
              </div>
              <div v-if="totalIncome > 0" class="relative">
                <MonthlyBarChart
                  :data="filteredIncomeByMonth"
                  title="Revenus"
                  color="#22c55e"
                />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun revenu enregistré
              </div>
            </BaseCard>

            <!-- Income pie chart -->
            <BaseCard>
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
              >
                Revenus par catégorie
              </h3>
              <div
                v-if="incomeByCategory.values.length > 0"
                class="h-64 sm:h-80"
              >
                <CategoryPieChart :data="incomeByCategory" title="Revenus" />
              </div>
              <div
                v-else
                class="py-12 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun revenu enregistré
              </div>
            </BaseCard>
          </div>
        </section>
      </template>

      <!-- A quiet period, for a user who has data elsewhere in time -->
      <BaseCard
        v-else-if="!error && isEmptyPeriod"
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

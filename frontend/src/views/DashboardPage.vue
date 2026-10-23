<script setup lang="ts">
  import { onMounted, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import TimePeriodSelector from '@/components/filters/TimePeriodSelector.vue'
  import CategoryBreakdownList from '@/components/dashboard/CategoryBreakdownList.vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import LegacyMigrationBanner from '@/components/settings/LegacyMigrationBanner.vue'
  import SpendingStructureCard from '@/components/dashboard/SpendingStructureCard.vue'
  import TagFamiliesOfYearCard from '@/components/dashboard/TagFamiliesOfYearCard.vue'
  import SpendingTrendsCard from '@/components/dashboard/SpendingTrendsCard.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import { useDashboardData } from '@/composables/useDashboardData'
  import { useFiltersStore } from '@/stores/filters'
  import { formatCurrency, formatMonth } from '@/lib/formatters'
  import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/api'
  import {
    MAX_LINK_LIST,
    NO_CATEGORY,
    transactionsLink,
  } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
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
    monthlyData,
    incomeCategoriesDetailed,
    spendingStructure,
    everydaySpendingStructure,
    savings,
    savingsTransfers,
    pendingReceivables,
    savingsRate,
    remainingToLive,
    tagFamiliesOfYear,
    realExpensesOfYear,
    exceptionalExpensesOfYear,
    incomeByCategory,
    expenseCategoriesDetailed,
    monthLabels,
    allExpenseCategories,
    allIncomeCategories,
    selectedIncomeCategory,
    expensesByMonth,
    filteredIncomeByMonth,
    setSelectedIncomeCategory,
    deductReimbursements,
    deductPendingReimbursements,
    isLoading,
    error,
    fetchData,
    hasLoaded,
  } = useDashboardData()
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

  /** The `YYYY-MM` behind each bar of the monthly charts. */
  const monthKeys = computed(() => monthlyData.value.map(d => d.month))

  function linkId(categoryId: string): string {
    return categoryId === UNCATEGORIZED_CATEGORY_ID ? NO_CATEGORY : categoryId
  }

  /** A category's id from the name a chart draws, or null for « Autres ». */
  function idByName(
    categories: { categoryId: string; category: string }[],
    name: string
  ): string | null {
    const found = categories.find(c => c.category === name)
    return found ? linkId(found.categoryId) : null
  }

  const incomeSliceIds = computed(() =>
    incomeByCategory.value.labels.map(label =>
      idByName(incomeCategoriesDetailed.value, label)
    )
  )

  type LinkType = 'EXPENSE' | 'INCOME'

  /** The expense categories' names by id: a trend tile names a subcategory's parent. */
  const expenseCategoryNames = computed<Record<string, string>>(() =>
    Object.fromEntries(allExpenseCategories.value.map(c => [c.id, c.name]))
  )

  function categoriesOf(type: LinkType): { id: string; name: string }[] {
    return type === 'EXPENSE'
      ? allExpenseCategories.value
      : allIncomeCategories.value
  }

  function nameOf(type: LinkType, id: string | null): string | undefined {
    if (id === NO_CATEGORY) return 'Sans catégorie'
    return categoriesOf(type).find(c => c.id === id)?.name
  }

  const KIND_LABEL: Record<LinkType, string> = {
    EXPENSE: 'Dépenses',
    INCOME: 'Revenus',
  }

  /**
   * The category the monthly chart's select holds. Only income has one: an
   * expense category draws its months in its own row of the list.
   */
  function selectedOf(type: LinkType): string | null {
    return type === 'INCOME' ? selectedIncomeCategory.value : null
  }

  /** The whole period, narrowed to the category the chart's select holds. */
  function periodLink(type: LinkType) {
    const selected = selectedOf(type)
    const name = nameOf(type, selected)
    return transactionsLink({
      type,
      categoryId: selected ? linkId(selected) : undefined,
      ...linkWindow.value,
      gross: true,
      label: name
        ? `${KIND_LABEL[type]} · ${name}`
        : `${KIND_LABEL[type]} de la période`,
    })
  }
  const expensesLink = computed(() => periodLink('EXPENSE'))
  const incomeLink = computed(() => periodLink('INCOME'))

  function openMonth(type: LinkType, month: string): void {
    const selected = selectedOf(type)
    const name = nameOf(type, selected) ?? KIND_LABEL[type]
    void router.push(
      transactionsLink({
        type,
        categoryId: selected ? linkId(selected) : undefined,
        month,
        gross: true,
        label: `${name} · ${formatMonth(month, { capitalize: false })}`,
      })
    )
  }

  /**
   * A slice of the income donut opens its category. Income has no events to
   * leave out: the link counts everything, as the monthly bars do.
   */
  function openCategory(type: LinkType, id: string): void {
    void router.push(
      transactionsLink({
        type,
        categoryId: id,
        ...linkWindow.value,
        gross: true,
        label: nameOf(type, id),
      })
    )
  }

  /** The « Autres » slice: every category it merges, at once. */
  function openCategories(type: LinkType, ids: string[]): void {
    if (ids.length === 0 || ids.length > MAX_LINK_LIST) return
    void router.push(
      transactionsLink({
        type,
        categoryIds: ids,
        ...linkWindow.value,
        gross: true,
        label: `${KIND_LABEL[type]} · Autres (${ids.length})`,
      })
    )
  }

  function eventLink(event: { id: string; name: string }) {
    return transactionsLink({
      tagId: event.id,
      ...linkWindow.value,
      gross: true,
      label: event.name,
    })
  }

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
             reading and the reimbursement switches, never the period. -->
        <SpendingTrendsCard
          class="mb-8"
          :reading="breakdownMode"
          :deduct-reimbursements="deductReimbursements"
          :deduct-pending-reimbursements="deductPendingReimbursements"
          :category-names="expenseCategoryNames"
        />

        <SpendingStructureCard
          v-if="spendingStructure && everydaySpendingStructure"
          class="mb-8"
          :actual="spendingStructure"
          :everyday="everydaySpendingStructure"
          :savings="savings"
          :savings-transfers="savingsTransfers"
          :pending-receivables="pendingReceivables"
          :savings-rate="savingsRate"
          :remaining-to-live="remainingToLive"
          :period-months="periodMonths"
          :reading="breakdownMode === 'everyday' ? 'everyday' : 'actual'"
          :window="linkWindow"
        />

        <!-- The families over the year: only where an event touches the
             period, like the reading selector. -->
        <TagFamiliesOfYearCard
          v-if="hasExceptionalExpenses && tagFamiliesOfYear.length > 0"
          class="mb-8"
          :families="tagFamiliesOfYear"
          :real-expenses="realExpensesOfYear"
          :exceptional-expenses="exceptionalExpensesOfYear"
        />

        <!-- The period, until « Où part l'argent » gives it its place in
             its header (lot 4): above the expenses it governs. -->
        <div data-testid="dashboard-period" class="mb-4">
          <TimePeriodSelector />
        </div>

        <!-- Expenses section (primary) -->
        <section data-testid="dashboard-expenses-section" class="mb-10">
          <h2
            class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Dépenses
          </h2>
          <!-- Monthly expenses chart. No category select: each row of the
               list below draws its own months. -->
          <BaseCard data-testid="dashboard-charts-section">
            <h3
              class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
            >
              Dépenses par mois
            </h3>
            <div v-if="totalExpenses > 0" class="relative">
              <!-- A bar opens its month; the link under the chart is the
                   keyboard way to the same period. -->
              <MonthlyBarChart
                :data="expensesByMonth"
                title="Dépenses"
                color="#ef4444"
                :months="monthKeys"
                @select-month="month => openMonth('EXPENSE', month)"
              />
              <div class="mt-2 flex justify-end">
                <TransactionsLink
                  :to="expensesLink"
                  subject="la période"
                  data-testid="expenses-transactions-link"
                />
              </div>
            </div>
            <div
              v-else
              class="py-12 text-center text-gray-500 dark:text-gray-400"
            >
              Aucune dépense enregistrée
            </div>
          </BaseCard>

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
                <!-- The chip opens the tag's analysis; the arrow beside it,
                     its transactions over the period. -->
                <span
                  v-for="event in exceptionalEvents"
                  :key="event.id"
                  class="inline-flex items-center gap-0.5 rounded-full bg-white pr-1 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-300 transition dark:hover:ring-primary-700"
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
                  <TransactionsLink
                    :to="eventLink(event)"
                    :subject="event.name"
                    icon-only
                    class="h-6 w-6"
                    :data-testid="`event-transactions-link-${event.id}`"
                  />
                </span>
              </div>
            </div>

            <CategoryBreakdownList
              :categories="expenseCategoriesDetailed"
              :month-labels="monthLabels"
              :total="displayedTotalExpenses"
              :mode="breakdownMode"
              :window="linkWindow"
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
                  :months="monthKeys"
                  @select-month="month => openMonth('INCOME', month)"
                />
                <div class="mt-2 flex justify-end">
                  <TransactionsLink
                    :to="incomeLink"
                    subject="la période"
                    data-testid="income-transactions-link"
                  />
                </div>
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
                <CategoryPieChart
                  :data="incomeByCategory"
                  title="Revenus"
                  :ids="incomeSliceIds"
                  @select="id => openCategory('INCOME', id)"
                  @select-others="ids => openCategories('INCOME', ids)"
                />
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

      <!-- A quiet period, for a user who has data elsewhere in time, or a
           failed first load: the period stays at hand to pick another —
           a new period is also a way to try again. -->
      <div v-else-if="error || isEmptyPeriod">
        <div data-testid="dashboard-period" class="mb-4">
          <TimePeriodSelector />
        </div>
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
      </div>

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

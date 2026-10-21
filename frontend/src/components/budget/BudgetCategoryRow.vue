<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    AmortizedPurchaseDto,
    CategoryAverageDto,
    SubcategoryAverageDto,
  } from '@/lib/api'
  import { isAmortizationCarrier, smoothedSourceIds } from '@/lib/amortization'
  import { formatCurrency } from '@/lib/formatters'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'

  /**
   * One category of the budget table: the row and its drill-down panel.
   *
   * Every figure arrives precomputed — averages, margins, prorata, dirty
   * state — so this component is a pure view over data the page derives
   * once, and the three ways a row can change a budget (typing, taking
   * the historical average, taking the actual) leave as events. The page
   * keeps the drafts, the sorting and the API. Taking a reference figure
   * is a visible « Reprendre » button under it, never the figure itself
   * dressed as a link: a number that rewrites an envelope when clicked
   * is a trap, not an affordance.
   */
  const props = defineProps<{
    category: CategoryAverageDto
    expanded: boolean
    editing: boolean
    showHistorical: boolean
    showActual: boolean
    historicalAverage: number
    actualAverage: number
    exceptionalAverage: number
    budget: number
    savedBudget: number
    dirty: boolean
    proratedBudget: number | null
    rowStatus: 'over' | 'covered' | 'none'
    marginVsHistorical: number
    remainingVsActual: number
    sparkline: number[]
    chartData: { labels: string[]; values: number[] }
    breakdownMode: 'real' | 'everyday'
    /**
     * The windows the two reference figures cover, for the links to the
     * Transactions page: the comparison months behind « Historique », the
     * plan months — or the one isolated — behind « Réel ». Each figure is
     * netted and shared, so its link carries `gross`.
     */
    historicalWindow?: { from: string; to: string; label: string } | null
    actualWindow?: { from: string; to: string; label: string } | null
    /** The `YYYY-MM` behind each bar of the drill-down chart. */
    monthKeys?: string[] | undefined
    /**
     * The whole window the statistics cover — what the subcategory lines
     * of the drill-down add up.
     */
    breakdownWindow?: { from: string; to: string } | null
    /**
     * Read « Vie courante »: the slices of smoothed purchases in « Réel »
     * — the « dont X € lissés ». 0 otherwise.
     */
    amortizedAverage?: number | undefined
    /**
     * Read « Vie courante »: the category's smoothed purchases, so a link
     * shows the ones whose slices its figure counts. Empty otherwise.
     */
    smoothedPurchases?: AmortizedPurchaseDto[] | undefined
  }>()

  const emit = defineEmits<{
    'toggle-expand': []
    'update-budget': [raw: string]
    'apply-budget': [amount: number]
    /** A bar of the drill-down chart was clicked — its `YYYY-MM`. */
    'select-month': [yearMonth: string]
  }>()

  /**
   * In « Vie courante » both reference figures leave the events out; their
   * links do the same.
   */
  function windowLink(window: { from: string; to: string; label: string }) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      from: window.from,
      to: window.to,
      exceptional: props.breakdownMode === 'everyday' ? 'exclude' : undefined,
      alsoIds: smoothedSourceIds(props.smoothedPurchases, {
        categoryId: props.category.categoryId,
        from: window.from.slice(0, 7),
        to: window.to.slice(0, 7),
      }),
      gross: true,
      label: `${props.category.categoryName} · ${window.label}`,
    })
  }

  /** The events' share of « Réel », on its own: what « dont / hors » names. */
  function exceptionalLink(window: {
    from: string
    to: string
    label: string
  }) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      from: window.from,
      to: window.to,
      exceptional: 'only',
      gross: true,
      label: `${props.category.categoryName} · événements · ${window.label}`,
    })
  }

  function subcategoryName(sub: SubcategoryAverageDto): string {
    return sub.subcategory || 'sans sous-catégorie'
  }

  /**
   * Whether a line reads « Vie courante »: only a line a smoothed purchase
   * touches carries its own everyday figures; every other line keeps the
   * one it always had, events included.
   */
  function readsEveryday(sub: SubcategoryAverageDto): boolean {
    return (
      props.breakdownMode === 'everyday' && sub.everydayAmount !== undefined
    )
  }

  /**
   * The lines shown: in the real reading, not the ones the backend added for
   * slices alone — that reading must look as it did before smoothing.
   */
  const subcategoryLines = computed(() =>
    (props.category.subcategories ?? []).filter(
      sub => props.breakdownMode !== 'real' || !isAmortizationCarrier(sub)
    )
  )

  /**
   * A subcategory line opens the rows it sums, by the subcategory's id —
   * `none` for the rows filed under none. Its figure counts every row,
   * events included, so the link never narrows on them — unless the line
   * reads « Vie courante », when it leaves the events out and adds the
   * smoothed purchases whose slices it counts, like its figure.
   */
  function subcategoryLink(sub: SubcategoryAverageDto) {
    const window = props.breakdownWindow
    if (!window) return null
    const everyday = readsEveryday(sub)
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: props.category.categoryId,
      subcategoryId: sub.subcategoryId ?? NO_CATEGORY,
      from: window.from,
      to: window.to,
      exceptional: everyday ? 'exclude' : undefined,
      alsoIds: everyday
        ? smoothedSourceIds(props.smoothedPurchases, {
            categoryId: props.category.categoryId,
            subcategoryId: sub.subcategoryId,
            from: window.from.slice(0, 7),
            to: window.to.slice(0, 7),
          })
        : undefined,
      gross: true,
      label: `${props.category.categoryName} · ${subcategoryName(sub)}`,
    })
  }
</script>

<template>
  <!-- A subgrid of the page's table from `sm`: the columns are the
       table's, sized over every row. -->
  <div
    :data-testid="`budget-row-${category.categoryName}`"
    class="sm:col-span-full sm:grid sm:grid-cols-subgrid"
  >
    <!-- Row -->
    <div
      class="col-span-full grid grid-cols-3 sm:grid-cols-subgrid sm:gap-x-6 gap-x-3 gap-y-2 sm:gap-y-0 items-center py-3 sm:py-4 px-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
    >
      <!-- Name + chevron + status badge -->
      <button
        type="button"
        class="col-span-3 sm:col-span-1 flex items-center gap-2 min-w-0 text-left"
        :aria-expanded="expanded"
        @click="emit('toggle-expand')"
      >
        <IconChevronRight
          class="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform"
          :class="{ 'rotate-90': expanded }"
        />
        <span v-if="category.categoryIcon" class="text-lg shrink-0">
          {{ category.categoryIcon }}
        </span>
        <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
          {{ category.categoryName }}
        </span>
        <!-- Status badge: over budget ⚠ or budget covers history ✓ -->
        <span
          v-if="rowStatus === 'over'"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
          title="Dépassement par rapport au budget"
        >
          ⚠ Dépassé
        </span>
        <span
          v-else-if="rowStatus === 'covered'"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          title="Le budget couvre la moyenne historique"
        >
          ✓ Couvert
        </span>
      </button>

      <!-- Historique (conditional) -->
      <div
        v-if="showHistorical"
        class="text-right text-sm tabular-nums leading-tight"
      >
        <span
          class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
          >Historique</span
        >
        <span
          v-if="historicalAverage > 0"
          class="text-indigo-600 dark:text-indigo-400 font-medium"
        >
          {{ formatCurrency(historicalAverage) }}
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">—</span>
        <TransactionsLink
          v-if="historicalWindow && historicalAverage > 0"
          :to="windowLink(historicalWindow)"
          :subject="`${category.categoryName} · ${historicalWindow.label}`"
          icon-only
          class="-my-1 ml-0.5 align-middle"
          :data-testid="`budget-historical-link-${category.categoryName}`"
        />
        <BaseButton
          v-if="editing && historicalAverage > 0"
          variant="ghost"
          size="sm"
          class="mt-0.5 !px-1.5 !py-0.5 !text-xs"
          :aria-label="`Reprendre la moyenne historique de ${category.categoryName} (${formatCurrency(historicalAverage)}) comme budget`"
          :data-testid="`budget-take-historical-${category.categoryName}`"
          @click="emit('apply-budget', historicalAverage)"
        >
          Reprendre
        </BaseButton>
      </div>

      <!-- Budget: read as text, edited only in edit mode -->
      <div class="text-right">
        <span
          v-if="editing"
          class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
          >Budget</span
        >
        <div v-if="editing" class="relative inline-block w-full sm:w-auto">
          <input
            type="number"
            min="0"
            step="1"
            :value="budget > 0 ? budget : ''"
            placeholder="—"
            inputmode="decimal"
            :data-testid="`budget-input-${category.categoryName}`"
            class="w-full min-h-[40px] sm:min-h-0 sm:w-28 pl-2 pr-7 py-1.5 text-sm text-right bg-white dark:bg-slate-900 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-gray-100 tabular-nums font-medium"
            :class="
              dirty
                ? 'border-primary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-primary-300 dark:border-primary-800'
            "
            @input="
              emit('update-budget', ($event.target as HTMLInputElement).value)
            "
          />
          <span
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none"
          >
            €
          </span>
          <!-- What this envelope was before the draft touched it. -->
          <span
            v-if="dirty"
            :data-testid="`budget-was-${category.categoryName}`"
            class="block text-[10px] text-gray-500 dark:text-gray-400 line-through tabular-nums text-right"
          >
            {{ formatCurrency(savedBudget) }}
          </span>
        </div>
        <div v-else class="text-sm tabular-nums leading-tight">
          <span
            class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
            >Budget</span
          >
          <span
            v-if="budget > 0"
            :data-testid="`budget-value-${category.categoryName}`"
            class="font-semibold text-primary-700 dark:text-primary-400"
          >
            {{ formatCurrency(budget) }}
          </span>
          <span v-else class="text-gray-500 dark:text-gray-400">—</span>
          <!-- On a month still running, the envelope's fair share to date —
               so a half-finished month is judged on pace. -->
          <span
            v-if="proratedBudget !== null"
            :data-testid="`budget-prorata-${category.categoryName}`"
            class="block text-[10px] text-gray-500 dark:text-gray-400 tabular-nums"
            title="Part du budget correspondant aux jours écoulés"
          >
            {{ formatCurrency(proratedBudget ?? 0) }}
            à ce jour
          </span>
        </div>
      </div>

      <!-- Réel à date (conditional) -->
      <div
        v-if="showActual"
        class="text-right text-sm tabular-nums leading-tight"
      >
        <span
          class="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
          >Réel</span
        >
        <span
          v-if="actualAverage > 0"
          class="text-red-600 dark:text-red-400 font-medium"
        >
          {{ formatCurrency(actualAverage) }}
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">—</span>
        <TransactionsLink
          v-if="actualWindow && actualAverage > 0"
          :to="windowLink(actualWindow)"
          :subject="`${category.categoryName} · ${actualWindow.label}`"
          icon-only
          class="-my-1 ml-0.5 align-middle"
          :data-testid="`budget-actual-link-${category.categoryName}`"
        />
        <!-- The event share, said in words: « hors » when the everyday
             reading left it out, « dont » when the real one counts it. -->
        <span
          v-if="exceptionalAverage > 0.005"
          :data-testid="`budget-exceptional-${category.categoryName}`"
          class="block text-[10px] text-amber-700 dark:text-amber-400"
        >
          {{ breakdownMode === 'everyday' ? 'hors' : 'dont' }}
          {{ formatCurrency(exceptionalAverage) }} d'événements
          <TransactionsLink
            v-if="actualWindow"
            :to="exceptionalLink(actualWindow)"
            :subject="`${category.categoryName} · événements · ${actualWindow.label}`"
            icon-only
            class="-my-2 h-6 w-6 align-middle"
            :data-testid="`budget-exceptional-link-${category.categoryName}`"
          />
        </span>
        <!-- Read « Vie courante », the slices of smoothed purchases the
             figure counts in place of the purchases themselves. -->
        <span
          v-if="breakdownMode === 'everyday' && (amortizedAverage ?? 0) > 0.005"
          :data-testid="`budget-amortized-${category.categoryName}`"
          class="block text-[10px] text-teal-700 dark:text-teal-400"
        >
          dont {{ formatCurrency(amortizedAverage ?? 0) }} lissés
        </span>
        <BaseButton
          v-if="editing && actualAverage > 0"
          variant="ghost"
          size="sm"
          class="mt-0.5 !px-1.5 !py-0.5 !text-xs"
          :aria-label="`Reprendre le réel de ${category.categoryName} (${formatCurrency(actualAverage)}) comme budget`"
          :data-testid="`budget-take-actual-${category.categoryName}`"
          @click="emit('apply-budget', actualAverage)"
        >
          Reprendre
        </BaseButton>
      </div>

      <!-- Sparkline -->
      <div class="hidden sm:flex justify-end items-center w-24">
        <SparklineChart
          v-if="sparkline.length >= 2"
          :data="sparkline"
          color="#ef4444"
        />
      </div>
    </div>

    <!-- Drill-down panel -->
    <div
      v-if="expanded"
      class="col-span-full min-w-0 bg-gray-50 dark:bg-slate-800/40 px-4 py-5 border-t border-gray-100 dark:border-slate-700 space-y-5"
    >
      <!-- Margin / remaining quick summary -->
      <div
        v-if="budget > 0 && (showHistorical || showActual)"
        class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
        :data-testid="`budget-row-detail-${category.categoryName}`"
      >
        <div
          v-if="showHistorical"
          class="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3"
        >
          <div
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
          >
            Marge vs historique
          </div>
          <div
            class="text-lg font-bold tabular-nums"
            :class="
              marginVsHistorical > 0
                ? 'text-green-700 dark:text-green-400'
                : marginVsHistorical < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            "
          >
            {{ marginVsHistorical > 0 ? '+' : ''
            }}{{ formatCurrency(marginVsHistorical) }}
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <template v-if="marginVsHistorical > 0">
              Budget plus généreux que la moyenne passée
            </template>
            <template v-else-if="marginVsHistorical < 0">
              Budget plus serré que la moyenne passée
            </template>
            <template v-else>Budget aligné sur la moyenne passée</template>
          </p>
        </div>
        <div
          v-if="showActual"
          class="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3"
        >
          <div
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1"
          >
            Reste à dépenser
          </div>
          <div
            class="text-lg font-bold tabular-nums"
            :class="
              remainingVsActual > 0
                ? 'text-green-700 dark:text-green-400'
                : remainingVsActual < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            "
          >
            {{ remainingVsActual > 0 ? '+' : ''
            }}{{ formatCurrency(remainingVsActual) }}
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <template v-if="remainingVsActual > 0">
              Marge disponible vs la moyenne réelle
            </template>
            <template v-else-if="remainingVsActual < 0">
              Dépassement par rapport au budget
            </template>
            <template v-else>Budget pile consommé</template>
          </p>
        </div>
      </div>

      <!-- Subcategories -->
      <div v-if="subcategoryLines.length > 0">
        <SectionLabel as="h3" class="mb-2"> Sous-catégories </SectionLabel>
        <div class="space-y-1">
          <div
            v-for="sub in subcategoryLines"
            :key="sub.subcategoryId ?? '(sans sous-catégorie)'"
            class="flex items-center gap-3 py-1.5 pl-3 pr-1 rounded text-sm bg-white dark:bg-slate-900"
          >
            <span class="flex-1 truncate text-gray-700 dark:text-gray-300">
              {{ sub.subcategory || '(sans sous-catégorie)' }}
            </span>
            <span
              class="hidden text-xs text-gray-500 tabular-nums shrink-0 sm:inline dark:text-gray-400"
            >
              {{ sub.transactionCount }} tx
            </span>
            <span
              class="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0 text-right"
              :data-testid="`budget-subcategory-amount-${category.categoryName}-${sub.subcategory || 'none'}`"
            >
              {{
                formatCurrency(
                  readsEveryday(sub)
                    ? (sub.everydayAmount ?? sub.totalAmount)
                    : sub.totalAmount
                )
              }}
              <span
                v-if="readsEveryday(sub) && (sub.amortizedAmount ?? 0) > 0.005"
                class="block text-[10px] font-normal text-teal-700 dark:text-teal-400"
              >
                dont {{ formatCurrency(sub.amortizedAmount ?? 0) }} lissés
              </span>
            </span>
            <span
              class="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 hidden sm:inline"
            >
              {{
                formatCurrency(
                  readsEveryday(sub)
                    ? (sub.everydayAveragePerMonth ?? sub.averagePerMonth)
                    : sub.averagePerMonth
                )
              }}/mois
            </span>
            <TransactionsLink
              v-if="subcategoryLink(sub)"
              :to="subcategoryLink(sub)!"
              :subject="`${category.categoryName} · ${subcategoryName(sub)}`"
              icon-only
              class="-my-1"
              :data-testid="`budget-subcategory-link-${category.categoryName}-${sub.subcategory || 'none'}`"
            />
          </div>
        </div>
      </div>

      <!-- Monthly evolution chart -->
      <div v-if="(category.monthlyAmounts?.length ?? 0) >= 2">
        <SectionLabel as="h3" class="mb-2"> Évolution mensuelle </SectionLabel>
        <!-- A bar opens its month; the links beside the figures above
             are the keyboard way to the same category. -->
        <MonthlyBarChart
          :data="chartData"
          :title="category.categoryName"
          color="#ef4444"
          :months="monthKeys"
          @select-month="month => emit('select-month', month)"
        />
      </div>

      <!-- Reimbursement info -->
      <div
        v-if="category.reimbursement || category.pendingReimbursement"
        class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
      >
        <span v-if="category.reimbursement">
          Remboursements reçus déduits :
          <strong class="text-gray-700 dark:text-gray-300">
            {{ formatCurrency(category.reimbursement) }}
          </strong>
        </span>
        <span v-if="category.pendingReimbursement">
          En attente déduits :
          <strong class="text-gray-700 dark:text-gray-300">
            {{ formatCurrency(category.pendingReimbursement) }}
          </strong>
        </span>
      </div>
    </div>
  </div>
</template>

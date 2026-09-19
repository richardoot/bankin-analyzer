<script setup lang="ts">
  import type { CategoryAverageDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'

  /**
   * One category of the budget table: the row and its drill-down panel.
   *
   * Every figure arrives precomputed — averages, margins, prorata, dirty
   * state — so this component is a pure view over data the page derives
   * once, and the three ways a row can change a budget (typing, applying
   * the historical average, applying the actual) leave as events. The page
   * keeps the drafts, the sorting and the API.
   */
  defineProps<{
    category: CategoryAverageDto
    rowGrid: string
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
    comparisonLabel?: string | undefined
    actualPeriodLabel: string
    breakdownMode: 'real' | 'everyday'
  }>()

  const emit = defineEmits<{
    'toggle-expand': []
    'update-budget': [raw: string]
    'apply-budget': [amount: number]
  }>()
</script>

<template>
  <div :data-testid="`budget-row-${category.categoryName}`">
    <!-- Row -->
    <div
      class="grid grid-cols-3 sm:[grid-template-columns:var(--row-grid)] sm:gap-x-6 gap-x-3 gap-y-2 sm:gap-y-0 items-center py-3 sm:py-4 px-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
      :style="{ '--row-grid': rowGrid }"
    >
      <!-- Name + chevron + status badge -->
      <button
        type="button"
        class="col-span-3 sm:col-span-1 flex items-center gap-2 min-w-0 text-left"
        :aria-expanded="expanded"
        @click="emit('toggle-expand')"
      >
        <svg
          class="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform"
          :class="{ 'rotate-90': expanded }"
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
        <span v-if="category.categoryIcon" class="text-lg shrink-0">
          {{ category.categoryIcon }}
        </span>
        <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
          {{ category.categoryName }}
        </span>
        <!-- Status badge: over budget ⚠ or budget covers history ✓ -->
        <span
          v-if="rowStatus === 'over'"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
          title="Dépassement par rapport au budget"
        >
          ⚠ Dépassé
        </span>
        <span
          v-else-if="rowStatus === 'covered'"
          class="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400"
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
          class="block text-[10px] uppercase tracking-wide text-gray-400 sm:hidden"
          >Historique</span
        >
        <button
          v-if="editing && historicalAverage > 0"
          type="button"
          class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline decoration-dotted underline-offset-2"
          :title="`Moyenne sur ${comparisonLabel} — cliquer pour appliquer comme budget`"
          @click="emit('apply-budget', historicalAverage)"
        >
          {{ formatCurrency(historicalAverage) }}
        </button>
        <span
          v-else-if="historicalAverage > 0"
          class="text-indigo-600 dark:text-indigo-400 font-medium"
        >
          {{ formatCurrency(historicalAverage) }}
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">—</span>
      </div>

      <!-- Budget: read as text, edited only in edit mode -->
      <div class="text-right">
        <span
          v-if="editing"
          class="block text-[10px] uppercase tracking-wide text-gray-400 sm:hidden"
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
                ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                : 'border-primary-300 dark:border-primary-800'
            "
            @input="
              emit('update-budget', ($event.target as HTMLInputElement).value)
            "
          />
          <span
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-500/70 dark:text-primary-400/70 pointer-events-none"
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
            class="block text-[10px] uppercase tracking-wide text-gray-400 sm:hidden"
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
          class="block text-[10px] uppercase tracking-wide text-gray-400 sm:hidden"
          >Réel</span
        >
        <button
          v-if="editing && actualAverage > 0"
          type="button"
          class="text-red-600 dark:text-red-400 font-medium hover:underline decoration-dotted underline-offset-2"
          :title="`Réel sur ${actualPeriodLabel} — cliquer pour appliquer comme budget`"
          @click="emit('apply-budget', actualAverage)"
        >
          {{ formatCurrency(actualAverage) }}
        </button>
        <span
          v-else-if="actualAverage > 0"
          class="text-red-600 dark:text-red-400 font-medium"
        >
          {{ formatCurrency(actualAverage) }}
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">—</span>
        <span
          v-if="exceptionalAverage > 0.005"
          :data-testid="`budget-exceptional-${category.categoryName}`"
          class="block text-[10px] text-amber-600 dark:text-amber-500"
          :title="
            breakdownMode === 'everyday'
              ? 'Part portée par un événement, exclue de ce réel'
              : 'Part portée par un événement, incluse dans ce réel'
          "
        >
          {{ breakdownMode === 'everyday' ? 'hors' : 'dont' }}
          {{ formatCurrency(exceptionalAverage) }}
        </span>
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
      class="bg-gray-50 dark:bg-slate-800/40 px-4 py-5 border-t border-gray-100 dark:border-slate-700 space-y-5"
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
                ? 'text-primary-600 dark:text-primary-400'
                : marginVsHistorical < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500'
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
                ? 'text-primary-600 dark:text-primary-400'
                : remainingVsActual < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500'
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
      <div v-if="category.subcategories && category.subcategories.length > 0">
        <h3
          class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
        >
          Sous-catégories
        </h3>
        <div class="space-y-1">
          <div
            v-for="sub in category.subcategories"
            :key="sub.subcategory || '(sans sous-catégorie)'"
            class="flex items-center gap-3 px-3 py-1.5 rounded text-sm bg-white dark:bg-slate-900"
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
              class="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0"
            >
              {{ formatCurrency(sub.totalAmount) }}
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
      <div v-if="(category.monthlyAmounts?.length ?? 0) >= 2">
        <h3
          class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
        >
          Évolution mensuelle
        </h3>
        <MonthlyBarChart
          :data="chartData"
          :title="category.categoryName"
          color="#ef4444"
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

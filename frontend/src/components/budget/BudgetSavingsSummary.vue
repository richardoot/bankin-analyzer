<script setup lang="ts">
  import { computed } from 'vue'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    /** Label describing the plan's date range, e.g. "Mai 2026" */
    planLabel: string
    /** Average monthly income projected for the plan */
    planIncomeAvg: number
    /** Total budget allocated by the user across all categories */
    planBudgetTotal: number
    /** Actual avg expenses on COMPLETE plan months. */
    planActualExpenseAvg: number
    /** Actual avg income on COMPLETE plan months. */
    planActualIncomeAvg: number
    /** Number of plan months fully elapsed. */
    completePlanMonthsCount: number
    /** True when every plan month is in the past — drives "Bilan du plan" wording. */
    isPlanFinished: boolean
    /**
     * What the "Réel" figures actually cover, when it is not the default
     * average over every complete month — a single month the user isolated.
     * The block reads whichever period the page reads; saying which one is
     * the whole difference between a figure and a misreading. Null for the
     * default average.
     */
    actualPeriodLabel: string | null

    /** Optional comparison block. */
    comparison: {
      label: string
      incomeAvg: number
      expenseAvg: number
    } | null
  }>()

  // ── Planification: budget allocation vs historical reality ─────────────
  // The "projected savings" in this context assumes the user's income stays
  // similar to the comparison period — that is the only sensible reference
  // before the plan has any real data. Using `planIncomeAvg` here would be
  // wrong because future plan months have no income yet.
  const comparisonSavings = computed(() =>
    props.comparison
      ? props.comparison.incomeAvg - props.comparison.expenseAvg
      : 0
  )
  const planningProjectedSavings = computed(() =>
    props.comparison ? props.comparison.incomeAvg - props.planBudgetTotal : 0
  )
  /** Plan − comparison: positive = plan more economical than the past. */
  const planningDelta = computed(
    () => planningProjectedSavings.value - comparisonSavings.value
  )

  // ── Suivi: actual reality vs the plan's allocation ─────────────────────
  // Both sides use the *actual* income observed across complete plan months
  // — that way "Écart d'épargne" simplifies to `budget − actualExpense`,
  // which is what the user expects to see.
  const followupProjectedSavings = computed(
    () => props.planActualIncomeAvg - props.planBudgetTotal
  )
  const planActualSavings = computed(
    () => props.planActualIncomeAvg - props.planActualExpenseAvg
  )
  /** Actual − projected: positive = saving more than budgeted. */
  const trackingDelta = computed(
    () => planActualSavings.value - followupProjectedSavings.value
  )

  /** Generic projected savings shown only in the minimal fallback block. */
  const minimalProjectedSavings = computed(
    () => props.planIncomeAvg - props.planBudgetTotal
  )

  // An isolated month is worth a block even before any month has completed:
  // the plan's first, still-running month is exactly when the question "am I
  // on track" is asked, and it is the one month the average cannot answer.
  const showFollowupBlock = computed(
    () => props.completePlanMonthsCount > 0 || !!props.actualPeriodLabel
  )
  const showPlanningBlock = computed(() => props.comparison !== null)

  const followupTitle = computed(() =>
    props.isPlanFinished ? 'Bilan du plan' : 'Suivi'
  )
  const followupHint = computed(() => {
    if (props.actualPeriodLabel) return props.actualPeriodLabel
    return props.isPlanFinished
      ? `Plan terminé · ${props.completePlanMonthsCount} mois`
      : `Plan en cours · ${props.completePlanMonthsCount} mois écoulé${props.completePlanMonthsCount > 1 ? 's' : ''}`
  })

  function colorClass(value: number): string {
    if (value > 0) return 'text-emerald-600 dark:text-emerald-400'
    if (value < 0) return 'text-red-600 dark:text-red-400'
    return 'text-gray-500 dark:text-gray-400'
  }

  /** Returns the relative gap as a "+12 %" / "−8 %" label. */
  function relative(value: number, reference: number): string {
    if (!reference) return ''
    const pct = (value / Math.abs(reference)) * 100
    if (Math.abs(pct) < 1) return ''
    const sign = pct > 0 ? '+' : ''
    return `${sign}${Math.round(pct)} %`
  }
</script>

<template>
  <div class="space-y-4" data-testid="savings-summary">
    <!-- ── Suivi (priorité visuelle quand des mois sont complétés) ── -->
    <section
      v-if="showFollowupBlock"
      data-testid="summary-followup"
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-5"
    >
      <header class="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            🎯 {{ followupTitle }}
            <span
              class="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400"
            >
              Suis-je dans les clous&nbsp;?
            </span>
          </h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {{ followupHint }} · {{ planLabel }}
          </p>
        </div>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Budget alloué
          </span>
          <span
            class="text-lg font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums"
          >
            {{ formatCurrency(planBudgetTotal) }}
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            Épargne prévue
            <span :class="colorClass(followupProjectedSavings)">
              {{ formatCurrency(followupProjectedSavings) }}
            </span>
          </span>
        </div>

        <div class="flex flex-col gap-0.5">
          <span
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Réel à date
          </span>
          <span
            class="text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums"
          >
            {{ formatCurrency(planActualExpenseAvg) }}
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            Épargne réelle
            <span :class="colorClass(planActualSavings)">
              {{ formatCurrency(planActualSavings) }}
            </span>
          </span>
        </div>

        <div
          class="flex flex-col gap-0.5 sm:border-l sm:pl-4 border-gray-200 dark:border-slate-700"
        >
          <span
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Écart d'épargne
          </span>
          <span
            class="text-lg font-bold tabular-nums"
            :class="colorClass(trackingDelta)"
          >
            {{ trackingDelta > 0 ? '+' : ''
            }}{{ formatCurrency(trackingDelta) }}
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            <template v-if="trackingDelta > 0">
              ✓ Tu épargnes plus que prévu
            </template>
            <template v-else-if="trackingDelta < 0">
              ⚠ Dépassement par rapport au plan
            </template>
            <template v-else>Pile dans le budget</template>
          </span>
        </div>
      </div>
    </section>

    <!-- ── Planification (toujours quand comparaison active) ── -->
    <section
      v-if="showPlanningBlock"
      data-testid="summary-planning"
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-5"
    >
      <header class="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            📊 Planification
            <span
              class="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400"
            >
              Mon plan est-il réaliste&nbsp;?
            </span>
          </h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {{ comparison?.label }} → {{ planLabel }}
          </p>
        </div>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div class="flex flex-col gap-0.5">
          <span
            class="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
          >
            Historique
          </span>
          <span
            class="text-lg font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums"
          >
            {{ formatCurrency(comparison?.expenseAvg ?? 0) }}
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            Épargne moyenne
            <span :class="colorClass(comparisonSavings)">
              {{ formatCurrency(comparisonSavings) }}
            </span>
          </span>
        </div>

        <div class="flex flex-col gap-0.5">
          <span
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Budget alloué
          </span>
          <span
            class="text-lg font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums"
          >
            {{ formatCurrency(planBudgetTotal) }}
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            Épargne prévue
            <span :class="colorClass(planningProjectedSavings)">
              {{ formatCurrency(planningProjectedSavings) }}
            </span>
          </span>
        </div>

        <div
          class="flex flex-col gap-0.5 sm:border-l sm:pl-4 border-gray-200 dark:border-slate-700"
        >
          <span
            class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Marge dégagée
          </span>
          <span
            class="text-lg font-bold tabular-nums"
            :class="colorClass(planningDelta)"
          >
            {{ planningDelta > 0 ? '+' : ''
            }}{{ formatCurrency(planningDelta) }}
            <span
              v-if="relative(planningDelta, comparisonSavings)"
              class="text-xs font-normal"
            >
              ({{ relative(planningDelta, comparisonSavings) }})
            </span>
          </span>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">
            <template v-if="planningDelta > 0">
              ✓ Plan plus économe que le passé
            </template>
            <template v-else-if="planningDelta < 0">
              ⚠ Plan moins économe que le passé
            </template>
            <template v-else>À l'équilibre</template>
          </span>
        </div>
      </div>
    </section>

    <!-- ── Fallback minimal: aucun bloc activé ── -->
    <section
      v-if="!showFollowupBlock && !showPlanningBlock"
      data-testid="summary-plan-only"
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border border-gray-200 dark:border-slate-700 p-5"
    >
      <header class="mb-3">
        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          Épargne projetée
        </h3>
        <p class="text-xs text-gray-400 dark:text-gray-500">
          {{ planLabel }}
        </p>
      </header>
      <div class="flex items-baseline gap-3">
        <span
          class="text-2xl font-bold tabular-nums"
          :class="colorClass(minimalProjectedSavings)"
        >
          {{ formatCurrency(minimalProjectedSavings) }}
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          Revenus {{ formatCurrency(planIncomeAvg) }} − Budget
          {{ formatCurrency(planBudgetTotal) }}
        </span>
      </div>
    </section>
  </div>
</template>

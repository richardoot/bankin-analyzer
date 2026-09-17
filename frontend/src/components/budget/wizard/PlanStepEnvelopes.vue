<script setup lang="ts">
  import type { CategoryAverageDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  /**
   * Étape 3 — les enveloppes et l'équation d'épargne. Chaque ligne
   * arrive précalculée (montant saisi, moyenne de référence, part
   * exceptionnelle exclue) ; la saisie d'un montant ou de l'épargne
   * remonte en événement, le parent tient le seul état.
   */
  export interface EnvelopeRow {
    category: CategoryAverageDto
    amount: number
    seedAverage: number
    excluded: number
  }

  defineProps<{
    rows: EnvelopeRow[]
    isLoading: boolean
    copyWithoutPlan: boolean
    previewTotal: number
    showSavingsIndicator: boolean
    referenceIncomeAvg: number
    referenceIncomeLabel: string
    projectedSavings: number
    savingsTarget: number | null
    monthlyProjectReserve: number | null
    planProjectReserve: number | null
    planMonthCount: number
    reserveGap: number | null
    lookbackExceptionalPerMonth: number
  }>()

  const emit = defineEmits<{
    'update-entry': [categoryId: string, raw: string]
    'set-savings': [raw: string]
  }>()
</script>

<template>
  <div class="space-y-5">
    <div>
      <div class="flex items-center justify-between mb-2 gap-3">
        <label
          class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-2"
        >
          Montants
          <span
            v-if="isLoading"
            class="flex items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400"
            data-testid="preview-loading"
          >
            <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
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
            mise à jour…
          </span>
        </label>
        <span class="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          Total : <strong>{{ formatCurrency(previewTotal) }}</strong>
        </span>
      </div>

      <!-- Projected monthly savings indicator -->
      <div
        v-if="showSavingsIndicator"
        data-testid="projected-savings"
        class="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 px-3 py-2 text-xs"
      >
        <span class="text-gray-500 dark:text-gray-400 leading-snug">
          Revenus moyens
          <span class="text-gray-700 dark:text-gray-300 tabular-nums">
            {{ formatCurrency(referenceIncomeAvg) }}
          </span>
          <span class="text-gray-500 dark:text-gray-400">
            · {{ referenceIncomeLabel }}
          </span>
        </span>
        <span class="flex items-baseline gap-1.5">
          <span class="text-gray-500 dark:text-gray-400">
            Épargne prévue / mois :
          </span>
          <strong
            class="text-sm tabular-nums"
            :class="
              projectedSavings > 0
                ? 'text-primary-600 dark:text-primary-400'
                : projectedSavings < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            "
          >
            {{ projectedSavings > 0 ? '+' : ''
            }}{{ formatCurrency(projectedSavings) }}
          </strong>
        </span>
      </div>

      <!-- The equation: savings is decided, the project reserve is
           what the plan leaves once it is set aside. -->
      <div
        v-if="showSavingsIndicator"
        data-testid="savings-equation"
        class="mb-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2.5 text-xs"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label
            for="savings-target"
            class="font-medium text-indigo-900 dark:text-indigo-300"
          >
            Épargne décidée / mois
          </label>
          <div class="relative shrink-0">
            <input
              id="savings-target"
              data-testid="savings-target-input"
              type="number"
              min="0"
              step="10"
              :value="savingsTarget ?? ''"
              placeholder="—"
              class="w-28 pl-2 pr-7 py-1 text-sm text-right bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-md text-gray-900 dark:text-gray-100 tabular-nums"
              @input="
                emit('set-savings', ($event.target as HTMLInputElement).value)
              "
            />
            <span
              class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none"
            >
              €
            </span>
          </div>
          <span
            v-if="savingsTarget === null"
            class="text-indigo-700/80 dark:text-indigo-400/80 leading-snug"
          >
            Décidez-la avant de répartir le reste : ce plan dégage actuellement
            {{ formatCurrency(projectedSavings) }} / mois.
          </span>
        </div>

        <!-- Derived reserve — deliberately shown even when negative -->
        <div
          v-if="monthlyProjectReserve !== null"
          data-testid="project-reserve"
          class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1"
        >
          <span class="text-indigo-900 dark:text-indigo-300">
            Budget projets :
          </span>
          <strong
            class="text-sm tabular-nums"
            :class="
              monthlyProjectReserve < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-indigo-700 dark:text-indigo-300'
            "
          >
            {{ formatCurrency(monthlyProjectReserve) }} / mois
          </strong>
          <span class="text-indigo-700/70 dark:text-indigo-400/70">
            soit
            {{ formatCurrency(planProjectReserve ?? 0) }} sur
            {{ planMonthCount }} mois
          </span>
        </div>

        <!-- Confrontation with what events have actually cost -->
        <p
          v-if="reserveGap !== null"
          data-testid="reserve-gap"
          class="mt-2 leading-snug"
          :class="
            reserveGap < 0
              ? 'text-red-700 dark:text-red-400'
              : 'text-primary-700 dark:text-primary-400'
          "
        >
          <template v-if="reserveGap < 0">
            Vos événements ont coûté
            {{ formatCurrency(lookbackExceptionalPerMonth) }} / mois sur
            {{ referenceIncomeLabel }}. Il manque
            <strong>{{ formatCurrency(-reserveGap) }} / mois</strong> : épargner
            moins, couper dans la vie courante, ou renoncer à un projet.
          </template>
          <template v-else>
            Vos événements ont coûté
            {{ formatCurrency(lookbackExceptionalPerMonth) }} / mois sur
            {{ referenceIncomeLabel }} — ce plan en finance le train habituel,
            avec <strong>{{ formatCurrency(reserveGap) }} / mois</strong> de
            marge.
          </template>
        </p>
      </div>

      <p
        v-if="copyWithoutPlan"
        class="mb-2 text-xs text-gray-500 dark:text-gray-400 italic"
      >
        Choisissez un plan à copier — en attendant, toutes les catégories sont
        affichées vides.
      </p>
      <div
        v-if="rows.length === 0 && !isLoading"
        class="text-sm text-gray-500 dark:text-gray-400 py-4 px-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
      >
        Aucune catégorie de dépense disponible.
      </div>
      <div
        v-else
        class="space-y-1 max-h-72 overflow-y-auto pr-1 -mr-1 transition-opacity"
        :class="{ 'opacity-60': isLoading }"
      >
        <div
          v-for="row in rows"
          :key="row.category.categoryId"
          :data-testid="`preview-row-${row.category.categoryName}`"
          class="flex items-center gap-3 py-1.5 px-3 rounded text-sm bg-gray-50 dark:bg-slate-800"
        >
          <span v-if="row.category.categoryIcon" class="text-base shrink-0">
            {{ row.category.categoryIcon }}
          </span>
          <span class="flex-1 truncate text-gray-700 dark:text-gray-300">
            {{ row.category.categoryName }}
          </span>
          <span
            v-if="row.category.reimbursement && row.category.reimbursement > 0"
            :data-testid="`preview-reimbursement-${row.category.categoryName}`"
            class="text-[10px] font-medium tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400"
            :title="`Remboursements reçus déduits : ${formatCurrency(row.category.reimbursement)}`"
          >
            −{{ formatCurrency(row.category.reimbursement) }} reçus
          </span>
          <span
            v-if="
              row.category.pendingReimbursement &&
              row.category.pendingReimbursement > 0
            "
            :data-testid="`preview-pending-${row.category.categoryName}`"
            class="text-[10px] font-medium tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
            :title="`Remboursements en attente déduits : ${formatCurrency(row.category.pendingReimbursement)}`"
          >
            −{{ formatCurrency(row.category.pendingReimbursement) }} en attente
          </span>
          <span
            v-if="row.excluded > 0.005"
            :data-testid="`preview-exceptional-${row.category.categoryName}`"
            class="text-[10px] font-medium tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
            :title="`Part exceptionnelle exclue de l'enveloppe : ${formatCurrency(row.excluded)}/mois sur une moyenne de ${formatCurrency(row.category.averagePerMonth)}`"
          >
            −{{ formatCurrency(row.excluded) }} exceptionnel
          </span>
          <span
            class="text-xs text-gray-500 dark:text-gray-400 tabular-nums hidden sm:inline shrink-0"
          >
            <template v-if="row.seedAverage > 0">
              Moy. {{ formatCurrency(row.seedAverage) }}
            </template>
            <template v-else>Pas d'historique</template>
          </span>
          <div class="relative shrink-0">
            <input
              type="number"
              min="0"
              step="1"
              :value="row.amount > 0 ? row.amount : ''"
              placeholder="—"
              class="w-24 pl-2 pr-7 py-1 text-sm text-right bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-md text-gray-900 dark:text-gray-100 tabular-nums"
              @input="
                emit(
                  'update-entry',
                  row.category.categoryId,
                  ($event.target as HTMLInputElement).value
                )
              "
            />
            <span
              class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none"
            >
              €
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

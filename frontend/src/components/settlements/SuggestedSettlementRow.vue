<script setup lang="ts">
  /**
   * One suggested pairing. Extracted so the section on the page and the
   * "see all" modal render it identically — the same row shown in two places
   * has to behave the same in both, and a copy would drift.
   */
  import type { SettlementSuggestionDto, SuggestionReason } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  defineProps<{
    suggestion: SettlementSuggestionDto
    /** True while this row's settlement is being written. */
    isConfirming: boolean
    /** True while any row is being written, so the others hold still. */
    isBusy: boolean
  }>()

  const emit = defineEmits<{ confirm: [] }>()

  const REASON_LABELS: Record<SuggestionReason, string> = {
    name: 'nom du payeur',
    category: 'categorie associee',
    amount: 'montant',
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR')
  }
</script>

<template>
  <li
    class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 px-4 py-3"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="font-medium text-gray-900 dark:text-gray-100 truncate">{{
          suggestion.description
        }}</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{
          formatDate(suggestion.date)
        }}</span>
        <span
          class="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          style="font-variant-numeric: tabular-nums"
          >+{{ formatCurrency(suggestion.availableAmount) }}</span
        >
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
        Rembourserait peut-etre
        <span class="font-medium">{{ suggestion.personName }}</span>
        a hauteur de
        <span class="font-medium" style="font-variant-numeric: tabular-nums">{{
          formatCurrency(suggestion.coverage)
        }}</span>
        sur {{ suggestion.debts.length }} depense{{
          suggestion.debts.length > 1 ? 's' : ''
        }}
      </p>

      <!-- The reasons are the point: they are what makes the guess
           reviewable rather than something to take on faith. -->
      <ul class="flex flex-wrap gap-1.5 mt-2">
        <li
          v-for="reason in suggestion.reasons"
          :key="reason"
          class="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400"
        >
          {{ REASON_LABELS[reason] }}
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      :disabled="isBusy"
      @click="emit('confirm')"
    >
      {{ isConfirming ? 'Enregistrement...' : 'Confirmer' }}
    </button>
  </li>
</template>

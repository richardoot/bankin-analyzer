<script setup lang="ts">
  /**
   * Incoming transfers that look like they repay someone, ready to confirm.
   *
   * This is the entry direction the reimbursement flow was missing. Everything
   * else starts from the expense — "who owes me for this?" — but a refund from
   * a health insurer or a friend arrives the other way round: a transfer lands,
   * and the question is what it settles. Answering it used to mean opening the
   * settlement modal person by person and guessing.
   *
   * Each row carries the reasons it was suggested. That is deliberate: a
   * proposal whose reasoning is hidden cannot be judged, and this one moves
   * money between categories, so it has to be judged.
   */
  import { ref, computed, onMounted } from 'vue'
  import { api } from '@/lib/api'
  import type { SettlementSuggestionDto, SuggestionReason } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import { cascadeAllocate, type AllocationLine } from '@/lib/settlements'

  const emit = defineEmits<{
    /** A settlement was created; the page reloads its own data. */
    settled: []
  }>()

  const suggestions = ref<SettlementSuggestionDto[]>([])
  const isLoading = ref(false)
  const confirmingId = ref<string | null>(null)
  const error = ref<string | null>(null)

  /** One row per transfer: the best-scoring person wins it. */
  const bestPerTransaction = computed<SettlementSuggestionDto[]>(() => {
    const seen = new Set<string>()
    return suggestions.value.filter(s => {
      if (seen.has(s.transactionId)) return false
      seen.add(s.transactionId)
      return true
    })
  })

  const REASON_LABELS: Record<SuggestionReason, string> = {
    name: 'nom du payeur',
    category: 'categorie associee',
    amount: 'montant',
  }

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      suggestions.value = await api.getSettlementSuggestions()
    } catch {
      error.value = 'Impossible de charger les rapprochements suggeres'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Turn a suggestion into a real settlement, spreading the cash over the
   * debts oldest-first — the same waterfall the manual modal uses, so
   * confirming here and doing it by hand give the same result.
   */
  async function confirm(suggestion: SettlementSuggestionDto): Promise<void> {
    confirmingId.value = suggestion.transactionId
    error.value = null
    try {
      const lines: AllocationLine[] = suggestion.debts.map(debt => ({
        reimbursementId: debt.reimbursementId,
        categoryId: debt.categoryId,
        categoryName: debt.categoryName ?? '',
        date: debt.expenseDate,
        description: debt.description,
        amountDue: debt.amountRemaining,
      }))
      const allocations = cascadeAllocate(lines, suggestion.availableAmount)

      const reimbursements = Array.from(allocations.entries())
        .filter(([, amount]) => amount > 0)
        .map(([reimbursementId, amountSettled]) => ({
          reimbursementId,
          amountSettled,
        }))

      if (reimbursements.length === 0) return

      await api.createSettlement({
        personId: suggestion.personId,
        incomeTransactionId: suggestion.transactionId,
        reimbursements,
      })

      await load()
      emit('settled')
    } catch {
      error.value = 'Le rapprochement a echoue'
    } finally {
      confirmingId.value = null
    }
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR')
  }

  onMounted(load)

  defineExpose({ load })
</script>

<template>
  <section
    v-if="isLoading || bestPerTransaction.length > 0 || error"
    class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 mb-6"
  >
    <header class="flex items-baseline justify-between gap-3 mb-4">
      <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        Virements a rapprocher
      </h2>
      <span
        v-if="bestPerTransaction.length > 0"
        class="text-xs text-gray-500 dark:text-gray-400"
      >
        {{ bestPerTransaction.length }} suggestion{{
          bestPerTransaction.length > 1 ? 's' : ''
        }}
      </span>
    </header>

    <p
      v-if="error"
      class="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2 mb-3"
    >
      {{ error }}
    </p>

    <p v-if="isLoading" class="text-sm text-gray-500 dark:text-gray-400">
      Recherche des rapprochements...
    </p>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="suggestion in bestPerTransaction"
        :key="suggestion.transactionId"
        class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 px-4 py-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span
              class="font-medium text-gray-900 dark:text-gray-100 truncate"
              >{{ suggestion.description }}</span
            >
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
            Rembourserait
            <span class="font-medium">{{ suggestion.personName }}</span>
            a hauteur de
            <span
              class="font-medium"
              style="font-variant-numeric: tabular-nums"
              >{{ formatCurrency(suggestion.coverage) }}</span
            >
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
          :disabled="confirmingId !== null"
          @click="confirm(suggestion)"
        >
          {{
            confirmingId === suggestion.transactionId
              ? 'Rapprochement...'
              : 'Rapprocher'
          }}
        </button>
      </li>
    </ul>
  </section>
</template>

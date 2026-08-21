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
    <!-- This section sits above a list of things the user entered themselves,
         so it has to say loudly that its own contents are guesses. Without
         that, a proposed pairing reads as a recorded fact. -->
    <header class="mb-4">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
          <span
            class="inline-block text-[11px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 align-middle mr-2"
            >Suggestions</span
          >
          Virements qui ressemblent a des remboursements
        </h2>
        <span
          v-if="bestPerTransaction.length > 0"
          class="text-xs text-gray-500 dark:text-gray-400"
        >
          {{ bestPerTransaction.length }} proposition{{
            bestPerTransaction.length > 1 ? 's' : ''
          }}
        </span>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1.5">
        Rapprochements <strong>devines</strong> par l'application, pas des
        remboursements que vous avez saisis.
        <strong>Rien n'est enregistre</strong> tant que vous n'avez pas
        confirme.
      </p>

      <!-- The ranking is only trustworthy if its rules are readable, and they
           are simple enough to state in full. -->
      <details class="mt-2">
        <summary
          class="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 w-fit"
        >
          Comment ces suggestions sont-elles trouvees ?
        </summary>
        <div
          class="text-xs text-gray-600 dark:text-gray-400 mt-2 pl-3 border-l-2 border-gray-200 dark:border-slate-700 flex flex-col gap-1.5"
        >
          <p>
            Chaque virement dont l'argent n'a pas encore servi est compare a
            chaque personne qui vous doit quelque chose. Trois indices sont
            recherches :
          </p>
          <ul class="flex flex-col gap-1 pl-1">
            <li>
              <strong>nom du payeur</strong> — un mot du nom apparait dans le
              libelle de la banque ;
            </li>
            <li>
              <strong>categorie associee</strong> — le virement est classe dans
              une categorie que vous avez associee a celle de la depense ;
            </li>
            <li>
              <strong>montant</strong> — la somme disponible correspond
              exactement a une dette, ou au total du par la personne.
            </li>
          </ul>
          <p>
            Les indices trouves sont affiches sous chaque ligne. Plus il y en a,
            plus la proposition est haute dans la liste — mais un seul indice
            suffit a la faire apparaitre, donc une proposition peut n'avoir
            aucun sens.
          </p>
        </div>
      </details>
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
            Rembourserait peut-etre
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
              ? 'Enregistrement...'
              : 'Confirmer'
          }}
        </button>
      </li>
    </ul>
  </section>
</template>

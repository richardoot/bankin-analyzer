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
  import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
  import { api } from '@/lib/api'
  import type { SettlementSuggestionDto } from '@/lib/api'
  import { cascadeAllocate, type AllocationLine } from '@/lib/settlements'
  import SuggestedSettlementRow from './SuggestedSettlementRow.vue'

  /**
   * How many rows the section shows before deferring to the modal. A block at
   * the top of a page is a summons, not a worklist: on real data there are
   * still 36 plausible pairings, and dumping all of them buries the page they
   * sit above.
   */
  const PREVIEW_COUNT = 5

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

  const previewed = computed(() =>
    bestPerTransaction.value.slice(0, PREVIEW_COUNT)
  )
  const hiddenCount = computed(() =>
    Math.max(0, bestPerTransaction.value.length - PREVIEW_COUNT)
  )

  const isModalOpen = ref(false)

  // Nothing left to show: the modal would stand empty over the page.
  watch(bestPerTransaction, list => {
    if (list.length === 0) isModalOpen.value = false
  })

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') isModalOpen.value = false
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))

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
            <strong>Au moins deux indices doivent concorder</strong> pour qu'une
            ligne apparaisse : un seul se declenche trop souvent par hasard —
            votre nom figure dans quantite de libelles qui n'ont rien de
            remboursements. Les indices retenus sont affiches sous chaque ligne,
            et plus il y en a, plus la proposition est haute dans la liste.
          </p>
          <p>
            Une proposition reste une hypothese : verifiez-la avant de
            confirmer.
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
      <SuggestedSettlementRow
        v-for="suggestion in previewed"
        :key="suggestion.transactionId"
        :suggestion="suggestion"
        :is-confirming="confirmingId === suggestion.transactionId"
        :is-busy="confirmingId !== null"
        @confirm="confirm(suggestion)"
      />
    </ul>

    <button
      v-if="hiddenCount > 0"
      type="button"
      class="mt-3 w-full text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
      @click="isModalOpen = true"
    >
      Voir les {{ bestPerTransaction.length }} suggestions
      <span class="text-indigo-500 dark:text-indigo-500"
        >({{ hiddenCount }} de plus)</span
      >
    </button>
  </section>

  <Teleport to="body">
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="fixed inset-0 bg-black/50" @click="isModalOpen = false" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-suggestions-title"
        class="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
      >
        <div
          class="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-slate-700 p-6"
        >
          <div>
            <h2
              id="all-suggestions-title"
              class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              <span
                class="inline-block text-[11px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 align-middle mr-2"
                >Suggestions</span
              >
              {{ bestPerTransaction.length }} rapprochements possibles
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Devines par l'application. Rien n'est enregistre tant que vous
              n'avez pas confirme.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            @click="isModalOpen = false"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p
          v-if="error"
          class="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 mx-6 mt-4 rounded-lg px-3 py-2"
        >
          {{ error }}
        </p>

        <ul class="flex flex-col gap-3 overflow-y-auto p-6">
          <SuggestedSettlementRow
            v-for="suggestion in bestPerTransaction"
            :key="suggestion.transactionId"
            :suggestion="suggestion"
            :is-confirming="confirmingId === suggestion.transactionId"
            :is-busy="confirmingId !== null"
            @confirm="confirm(suggestion)"
          />
        </ul>
      </div>
    </div>
  </Teleport>
</template>

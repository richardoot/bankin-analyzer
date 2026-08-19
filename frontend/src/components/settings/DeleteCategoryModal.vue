<script setup lang="ts">
  /**
   * Deleting a category is unlike deleting a bank account: no transaction is
   * destroyed, the FK is SET NULL and the spending survives without its
   * filing. So the dialog does not open on a warning — it opens on an
   * inventory, split in two: what is kept but detached, and what is destroyed.
   *
   * The name has to be typed back only when something is actually attached.
   * Asking for it to remove an empty category would be ceremony, and ceremony
   * that fires every time stops being read.
   */
  import { computed, ref, watch } from 'vue'
  import {
    api,
    type CategoryDeletionSummaryDto,
    type CategoryDto,
  } from '@/lib/api'

  const props = defineProps<{
    category: CategoryDto | null
  }>()

  const emit = defineEmits<{
    close: []
    deleted: [
      {
        category: CategoryDto
        uncategorizedTransactions: number
      },
    ]
  }>()

  const summary = ref<CategoryDeletionSummaryDto | null>(null)
  const isLoadingSummary = ref(false)
  const isDeleting = ref(false)
  const error = ref<string | null>(null)
  const confirmation = ref('')

  const isOpen = computed(() => props.category !== null)

  /** Nothing attached: the deletion is a no-op for the rest of the data. */
  const isEmptyCategory = computed(() => {
    const s = summary.value
    if (!s) return false
    return (
      s.transactionCount === 0 &&
      s.subcategoryNames.length === 0 &&
      s.budgetPlanEntries.length === 0 &&
      s.reimbursementCount === 0 &&
      s.associatedCategoryName === null
    )
  })

  const requiresTypedName = computed(
    () => summary.value !== null && !isEmptyCategory.value
  )

  // Compared trimmed and case-insensitively: the guard is about aiming at the
  // right category, not about typing accuracy.
  const isConfirmed = computed(() => {
    if (!requiresTypedName.value) return true
    const expected = props.category?.name.trim().toLocaleLowerCase('fr')
    if (!expected) return false
    return confirmation.value.trim().toLocaleLowerCase('fr') === expected
  })

  const canDelete = computed(
    () =>
      isConfirmed.value &&
      !isDeleting.value &&
      !isLoadingSummary.value &&
      summary.value !== null
  )

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: 'numeric',
  })

  const currencyFormatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })

  const rangeLabel = computed(() => {
    const first = summary.value?.firstTransactionDate
    const last = summary.value?.lastTransactionDate
    if (!first || !last) return null
    const from = dateFormatter.format(new Date(first))
    const to = dateFormatter.format(new Date(last))
    return from === to ? from : `du ${from} au ${to}`
  })

  function planWindow(entry: { startDate: string; endDate: string }): string {
    const from = monthFormatter.format(new Date(entry.startDate))
    const to = monthFormatter.format(new Date(entry.endDate))
    return from === to ? from : `${from} – ${to}`
  }

  const typeLabel = computed(() =>
    props.category?.type === 'EXPENSE' ? 'dépense' : 'revenu'
  )

  watch(
    () => props.category,
    async category => {
      summary.value = null
      error.value = null
      confirmation.value = ''
      if (!category) return

      isLoadingSummary.value = true
      try {
        summary.value = await api.getCategoryDeletionSummary(category.id)
      } catch (err) {
        error.value =
          err instanceof Error
            ? err.message
            : "Impossible de calculer l'impact de la suppression"
      } finally {
        isLoadingSummary.value = false
      }
    },
    { immediate: true }
  )

  function close(): void {
    if (isDeleting.value) return
    emit('close')
  }

  async function confirmDelete(): Promise<void> {
    const category = props.category
    if (!category || !canDelete.value) return

    isDeleting.value = true
    error.value = null
    try {
      const result = await api.deleteCategory(category.id)
      emit('deleted', {
        category,
        uncategorizedTransactions: result.uncategorizedTransactions,
      })
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors de la suppression'
    } finally {
      isDeleting.value = false
    }
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && category"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="close" />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-category-title"
          class="relative z-10 max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:shadow-slate-900/30"
          data-testid="delete-category-modal"
        >
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
            >
              <svg
                class="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2
              id="delete-category-title"
              class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              Supprimer « {{ category.name }} »
            </h2>
          </div>

          <p
            v-if="isLoadingSummary"
            class="mb-6 text-sm text-gray-500 dark:text-gray-400"
            data-testid="deletion-loading"
          >
            Inventaire de ce qui est lié à cette catégorie…
          </p>

          <div v-else-if="summary" class="mb-6 space-y-4">
            <p
              v-if="isEmptyCategory"
              class="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-slate-800 dark:text-gray-300"
              data-testid="deletion-empty"
            >
              Rien n'est rattaché à cette catégorie de {{ typeLabel }} : aucune
              transaction, sous-catégorie, ligne de budget, association ni
              demande de remboursement. Sa suppression n'a aucun autre effet.
            </p>

            <template v-else>
              <!-- Kept, but detached -->
              <div
                v-if="
                  summary.transactionCount > 0 || summary.reimbursementCount > 0
                "
                data-testid="deletion-kept"
              >
                <h3
                  class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  Conservé, mais déclassé
                </h3>
                <ul
                  class="space-y-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
                >
                  <li v-if="summary.transactionCount > 0">
                    <strong>{{ summary.transactionCount }}</strong>
                    {{
                      summary.transactionCount > 1
                        ? 'transactions gardent leur montant'
                        : 'transaction garde son montant'
                    }}
                    mais
                    {{ summary.transactionCount > 1 ? 'passent' : 'passe' }} en
                    « sans catégorie »<template v-if="rangeLabel">
                      ({{ rangeLabel }})</template
                    >.
                  </li>
                  <li v-if="summary.labelledTransactionCount > 0">
                    Le libellé de sous-catégorie de
                    <strong>{{ summary.labelledTransactionCount }}</strong>
                    d'entre elles est effacé, sans quoi il survivrait à sa
                    catégorie dans le dashboard.
                  </li>
                  <li v-if="summary.reimbursementCount > 0">
                    <strong>{{ summary.reimbursementCount }}</strong>
                    {{
                      summary.reimbursementCount > 1
                        ? 'demandes de remboursement restent dues'
                        : 'demande de remboursement reste due'
                    }}
                    mais
                    {{ summary.reimbursementCount > 1 ? 'perdent' : 'perd' }}
                    leur catégorie.
                  </li>
                </ul>
              </div>

              <!-- Destroyed -->
              <div
                v-if="
                  summary.subcategoryNames.length > 0 ||
                  summary.budgetPlanEntries.length > 0 ||
                  summary.associatedCategoryName
                "
                data-testid="deletion-destroyed"
              >
                <h3
                  class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  Supprimé avec la catégorie
                </h3>
                <ul
                  class="space-y-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200"
                >
                  <li v-if="summary.subcategoryNames.length > 0">
                    <strong>{{ summary.subcategoryNames.length }}</strong>
                    {{
                      summary.subcategoryNames.length > 1
                        ? 'sous-catégories'
                        : 'sous-catégorie'
                    }}
                    : {{ summary.subcategoryNames.join(', ') }}
                  </li>
                  <li v-if="summary.budgetPlanEntries.length > 0">
                    <strong>{{ summary.budgetPlanEntries.length }}</strong>
                    {{
                      summary.budgetPlanEntries.length > 1
                        ? 'lignes de budget'
                        : 'ligne de budget'
                    }}
                    — l'enveloppe de
                    {{
                      summary.budgetPlanEntries.length > 1
                        ? 'ces plans diminue'
                        : 'ce plan diminue'
                    }}
                    d'autant :
                    <ul class="mt-1 space-y-0.5 pl-4">
                      <li
                        v-for="entry in summary.budgetPlanEntries"
                        :key="`${entry.planName}-${entry.startDate}`"
                        class="list-disc"
                      >
                        {{ entry.planName }} ({{ planWindow(entry) }}) :
                        {{ currencyFormatter.format(entry.amount) }} / mois
                      </li>
                    </ul>
                  </li>
                  <li v-if="summary.associatedCategoryName">
                    L'association de remboursement avec «
                    {{ summary.associatedCategoryName }} ». La catégorie
                    associée, elle, n'est pas touchée.
                  </li>
                </ul>
              </div>

              <!-- Current settings, for the record -->
              <p
                v-if="summary.isGloballyHidden || summary.isExcludedFromBudget"
                class="text-sm text-gray-600 dark:text-gray-400"
                data-testid="deletion-settings"
              >
                Pour mémoire, cette catégorie est actuellement
                <template v-if="summary.isGloballyHidden"
                  >masquée du dashboard</template
                >
                <template
                  v-if="
                    summary.isGloballyHidden && summary.isExcludedFromBudget
                  "
                >
                  et
                </template>
                <template v-if="summary.isExcludedFromBudget"
                  >exclue des budgets</template
                >.
              </p>
            </template>

            <p class="text-sm text-gray-600 dark:text-gray-400">
              Cette action est
              <strong class="text-red-600 dark:text-red-400">
                irréversible </strong
              >: recréer une catégorie du même nom ne rattachera pas les
              transactions déclassées.
            </p>
          </div>

          <div v-if="requiresTypedName" class="mb-6">
            <label
              for="delete-category-confirmation"
              class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tapez
              <strong class="text-red-600 dark:text-red-400">{{
                category.name
              }}</strong>
              pour confirmer
            </label>
            <input
              id="delete-category-confirmation"
              v-model="confirmation"
              type="text"
              autocomplete="off"
              :placeholder="category.name"
              :disabled="isDeleting"
              data-testid="delete-category-confirmation"
              class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 dark:focus:border-red-400 dark:focus:ring-red-400"
              @keyup.enter="confirmDelete"
            />
          </div>

          <p
            v-if="error"
            class="mb-4 text-sm text-red-600 dark:text-red-400"
            data-testid="deletion-error"
          >
            {{ error }}
          </p>

          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-800"
              :disabled="isDeleting"
              @click="close"
            >
              Annuler
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
              :disabled="!canDelete"
              data-testid="delete-category-confirm"
              @click="confirmDelete"
            >
              {{ isDeleting ? 'Suppression…' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

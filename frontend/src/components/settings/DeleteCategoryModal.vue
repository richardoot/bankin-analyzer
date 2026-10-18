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
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ConfirmByTyping from '@/components/ui/ConfirmByTyping.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'
  import {
    api,
    type CategoryDeletionSummaryDto,
    type CategoryDto,
  } from '@/lib/api'
  import {
    formatCompactCurrency,
    formatDate,
    formatMonth,
  } from '@/lib/formatters'

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
  /** Set by the typed-name field; true outright when no name is asked for. */
  const typedOk = ref(false)

  const isOpen = computed(() => props.category !== null)

  /** Nothing attached: the deletion is a no-op for the rest of the data. */
  const isEmptyCategory = computed(() => {
    const s = summary.value
    if (!s) return false
    return (
      s.transactionCount === 0 &&
      s.subcategoryNames.length === 0 &&
      s.budgetPlanEntries.length === 0 &&
      s.reimbursementCount === 0
    )
  })

  const requiresTypedName = computed(
    () => summary.value !== null && !isEmptyCategory.value
  )

  const isConfirmed = computed(() => !requiresTypedName.value || typedOk.value)

  const canDelete = computed(
    () =>
      isConfirmed.value &&
      !isDeleting.value &&
      !isLoadingSummary.value &&
      summary.value !== null
  )

  const rangeLabel = computed(() => {
    const first = summary.value?.firstTransactionDate
    const last = summary.value?.lastTransactionDate
    if (!first || !last) return null
    const from = formatDate(first, 'long')
    const to = formatDate(last, 'long')
    return from === to ? from : `du ${from} au ${to}`
  })

  function planWindow(entry: { startDate: string; endDate: string }): string {
    const from = formatMonth(entry.startDate, { capitalize: false })
    const to = formatMonth(entry.endDate, { capitalize: false })
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
  <BaseModal
    :open="isOpen"
    :title="category ? `Supprimer « ${category.name} »` : undefined"
    tone="danger"
    max-width="lg"
    :closable="!isDeleting"
    data-testid="delete-category-modal"
    @close="close"
  >
    <template v-if="category">
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
          transaction, sous-catégorie, ligne de budget, association ni demande
          de remboursement. Sa suppression n'a aucun autre effet.
        </p>

        <template v-else>
          <!-- Kept, but detached -->
          <div
            v-if="
              summary.transactionCount > 0 || summary.reimbursementCount > 0
            "
            data-testid="deletion-kept"
          >
            <SectionLabel as="h3" class="mb-2"
              >Conservé, mais déclassé</SectionLabel
            >
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
                {{ summary.transactionCount > 1 ? 'passent' : 'passe' }} en «
                sans catégorie »<template v-if="rangeLabel">
                  ({{ rangeLabel }})</template
                >.
                <TransactionsLink
                  v-if="category"
                  :to="
                    transactionsLink({
                      categoryId: category.id,
                      label: category.name,
                    })
                  "
                  :subject="category.name"
                  size="md"
                  data-testid="deletion-transactions-link"
                  @click="close"
                >
                  Les voir
                </TransactionsLink>
              </li>
              <li v-if="summary.labelledTransactionCount > 0">
                Le libellé de sous-catégorie de
                <strong>{{ summary.labelledTransactionCount }}</strong>
                d'entre elles est effacé, sans quoi il survivrait à sa catégorie
                dans le dashboard.
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
              summary.budgetPlanEntries.length > 0
            "
            data-testid="deletion-destroyed"
          >
            <SectionLabel as="h3" class="mb-2"
              >Supprimé avec la catégorie</SectionLabel
            >
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
                    {{ formatCompactCurrency(entry.amount) }} / mois
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400">
          Cette action est
          <strong class="text-red-600 dark:text-red-400"> irréversible </strong
          >: recréer une catégorie du même nom ne rattachera pas les
          transactions déclassées.
        </p>
      </div>

      <ConfirmByTyping
        v-if="requiresTypedName"
        v-model:confirmed="typedOk"
        :expected="category.name"
        :disabled="isDeleting"
        data-testid="delete-category-confirmation"
        @submit="confirmDelete"
      />

      <InlineAlert v-if="error" class="mt-4" data-testid="deletion-error">
        {{ error }}
      </InlineAlert>
    </template>

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="isDeleting"
        @click="close"
      >
        Annuler
      </BaseButton>
      <BaseButton
        variant="danger"
        class="flex-1"
        :disabled="!canDelete"
        :loading="isDeleting"
        data-testid="delete-category-confirm"
        @click="confirmDelete"
      >
        Supprimer
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  /**
   * Deleting a bank account is the only irreversible action of the preferences
   * page, so the dialog is built as a brake rather than a prompt: it first
   * fetches what would actually be destroyed (transactions, their date range,
   * the debts and settlements attached to them) and only unlocks the red
   * button once the user has typed the account name back. Typing the *name*,
   * not a generic word, is what makes deleting the wrong account of a list
   * hard.
   */
  import { computed, ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ConfirmByTyping from '@/components/ui/ConfirmByTyping.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import { useAccountsStore } from '@/stores/accounts'
  import type { AccountDeletionSummaryDto, AccountDto } from '@/lib/api'
  import { formatDate } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

  const props = defineProps<{
    account: AccountDto | null
  }>()

  const emit = defineEmits<{
    close: []
    deleted: [{ account: AccountDto; deletedTransactions: number }]
  }>()

  const accountsStore = useAccountsStore()

  const summary = ref<AccountDeletionSummaryDto | null>(null)
  const isLoadingSummary = ref(false)
  const isDeleting = ref(false)
  const error = ref<string | null>(null)
  const isConfirmed = ref(false)

  const isOpen = computed(() => props.account !== null)

  const canDelete = computed(
    () => isConfirmed.value && !isDeleting.value && !isLoadingSummary.value
  )

  const rangeLabel = computed(() => {
    const first = summary.value?.firstTransactionDate
    const last = summary.value?.lastTransactionDate
    if (!first || !last) return null
    const from = formatDate(first, 'long')
    const to = formatDate(last, 'long')
    return from === to ? from : `du ${from} au ${to}`
  })

  watch(
    () => props.account,
    async account => {
      summary.value = null
      error.value = null
      if (!account) return

      isLoadingSummary.value = true
      try {
        summary.value = await accountsStore.deletionSummary(account.id)
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
    const account = props.account
    if (!account || !canDelete.value) return

    isDeleting.value = true
    error.value = null
    try {
      const deletedTransactions = await accountsStore.remove(account.id)
      emit('deleted', { account, deletedTransactions })
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
    :title="account ? `Supprimer « ${account.name} »` : undefined"
    tone="danger"
    max-width="md"
    :closable="!isDeleting"
    data-testid="delete-bank-account-modal"
    @close="close"
  >
    <template v-if="account">
      <p
        v-if="isLoadingSummary"
        class="mb-6 text-sm text-gray-500 dark:text-gray-400"
      >
        Calcul de l'impact…
      </p>

      <div v-else-if="summary" class="mb-6 space-y-3">
        <ul
          class="space-y-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200"
          data-testid="deletion-impact"
        >
          <li>
            <strong>{{ summary.transactionCount }}</strong>
            {{
              summary.transactionCount > 1
                ? 'transactions seront supprimées'
                : 'transaction sera supprimée'
            }}
            <template v-if="rangeLabel"> ({{ rangeLabel }})</template>
            <TransactionsLink
              v-if="summary.transactionCount > 0"
              :to="
                transactionsLink({ account: account.name, label: account.name })
              "
              :subject="account.name"
              size="md"
              data-testid="deletion-transactions-link"
              @click="close"
            >
              Les voir
            </TransactionsLink>
          </li>
          <li v-if="summary.reimbursementCount > 0">
            <strong>{{ summary.reimbursementCount }}</strong>
            {{
              summary.reimbursementCount > 1
                ? 'demandes de remboursement liées seront supprimées'
                : 'demande de remboursement liée sera supprimée'
            }}
          </li>
          <li v-if="summary.settlementCount > 0">
            <strong>{{ summary.settlementCount }}</strong>
            {{
              summary.settlementCount > 1
                ? 'règlements financés par ce compte seront annulés'
                : 'règlement financé par ce compte sera annulé'
            }}, et les dettes qu'ils soldaient redeviendront dues.
          </li>
        </ul>

        <p class="text-sm text-gray-600 dark:text-gray-400">
          Vos catégories, tags, personnes et budgets ne sont pas touchés :
          seules les transactions de ce compte disparaissent. Cette action est
          <strong class="text-red-600 dark:text-red-400">irréversible</strong>.
        </p>
      </div>

      <ConfirmByTyping
        v-model:confirmed="isConfirmed"
        :expected="account.name"
        :disabled="isDeleting"
        data-testid="delete-bank-account-confirmation"
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
        data-testid="confirm-delete-account"
        @click="confirmDelete"
      >
        Supprimer définitivement
      </BaseButton>
    </template>
  </BaseModal>
</template>

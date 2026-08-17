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
  import { useAccountsStore } from '@/stores/accounts'
  import type { AccountDeletionSummaryDto, AccountDto } from '@/lib/api'

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
  const confirmation = ref('')

  const isOpen = computed(() => props.account !== null)

  // Names are compared trimmed and case-insensitively: the guard is about
  // aiming at the right account, not about typing accuracy.
  const isConfirmed = computed(() => {
    const expected = props.account?.name.trim().toLocaleLowerCase('fr')
    if (!expected) return false
    return confirmation.value.trim().toLocaleLowerCase('fr') === expected
  })

  const canDelete = computed(
    () => isConfirmed.value && !isDeleting.value && !isLoadingSummary.value
  )

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const rangeLabel = computed(() => {
    const first = summary.value?.firstTransactionDate
    const last = summary.value?.lastTransactionDate
    if (!first || !last) return null
    const from = dateFormatter.format(new Date(first))
    const to = dateFormatter.format(new Date(last))
    return from === to ? from : `du ${from} au ${to}`
  })

  watch(
    () => props.account,
    async account => {
      summary.value = null
      error.value = null
      confirmation.value = ''
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
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && account"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="close" />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-bank-account-title"
          class="relative z-10 max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:shadow-slate-900/30"
          data-testid="delete-bank-account-modal"
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
              id="delete-bank-account-title"
              class="text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              Supprimer « {{ account.name }} »
            </h2>
          </div>

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
              seules les transactions de ce compte disparaissent. Cette action
              est
              <strong class="text-red-600 dark:text-red-400">
                irréversible </strong
              >.
            </p>
          </div>

          <div class="mb-6">
            <label
              for="delete-bank-account-confirmation"
              class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tapez
              <strong class="text-red-600 dark:text-red-400">{{
                account.name
              }}</strong>
              pour confirmer
            </label>
            <input
              id="delete-bank-account-confirmation"
              v-model="confirmation"
              type="text"
              autocomplete="off"
              :placeholder="account.name"
              :disabled="isDeleting"
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
              data-testid="confirm-delete-account"
              @click="confirmDelete"
            >
              {{ isDeleting ? 'Suppression…' : 'Supprimer définitivement' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

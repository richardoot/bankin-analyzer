<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import IncomeTransactionPicker from './IncomeTransactionPicker.vue'
  import {
    availableAmountOf,
    round2,
    toAllocationLine,
    NO_CATEGORY_LABEL,
  } from '@/lib/settlements'

  const props = defineProps<{
    isOpen: boolean
    /** The single debt being settled. Null while the modal is closed. */
    reimbursement: ReimbursementDto | null
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [settlement: SettlementDto]
  }>()

  const selectedTransaction = ref<TransactionDto | null>(null)
  const amount = ref(0)
  const forceComplete = ref(false)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  const line = computed(() =>
    props.reimbursement ? toAllocationLine(props.reimbursement) : null
  )

  const amountDue = computed(() => line.value?.amountDue ?? 0)

  const pot = computed(() =>
    selectedTransaction.value ? availableAmountOf(selectedTransaction.value) : 0
  )

  /**
   * One line, so the ranking has exactly one amount to match and one category
   * to recognise — a far sharper signal than the whole backlog of the person.
   */
  const suggestionContext = computed(() => ({
    personName: props.reimbursement?.personName ?? '',
    pendingTotals: [amountDue.value],
  }))

  const shortfall = computed(() => round2(amountDue.value - amount.value))

  const isShort = computed(() => amount.value > 0 && shortfall.value > 0)

  const canConfirm = computed(
    () =>
      selectedTransaction.value !== null &&
      amount.value > 0 &&
      amount.value <= amountDue.value + 0.001 &&
      amount.value <= pot.value + 0.001 &&
      !isSubmitting.value
  )

  function selectTransaction(transaction: TransactionDto): void {
    selectedTransaction.value = transaction
    // Take what the line owes, capped by what the receipt still holds.
    amount.value = round2(
      Math.min(amountDue.value, availableAmountOf(transaction))
    )
    forceComplete.value = false
  }

  function onAmountCommit(event: Event): void {
    const raw = Number.parseFloat((event.target as HTMLInputElement).value)
    const value = Number.isFinite(raw) ? raw : 0
    amount.value = round2(
      Math.min(Math.max(0, value), Math.min(amountDue.value, pot.value))
    )
    // Crediting the full due makes the "solder" flag meaningless.
    if (amount.value >= amountDue.value) forceComplete.value = false
  }

  function reset(): void {
    selectedTransaction.value = null
    amount.value = 0
    forceComplete.value = false
    error.value = null
    isSubmitting.value = false
  }

  function handleClose(): void {
    reset()
    emit('close')
  }

  async function handleConfirm(): Promise<void> {
    if (
      !props.reimbursement ||
      !selectedTransaction.value ||
      !canConfirm.value
    ) {
      return
    }

    isSubmitting.value = true
    error.value = null

    try {
      const settlement = await api.createSettlement({
        personId: props.reimbursement.personId,
        incomeTransactionId: selectedTransaction.value.id,
        reimbursements: [
          {
            reimbursementId: props.reimbursement.id,
            amountSettled: amount.value,
            ...(forceComplete.value && { forceComplete: true }),
          },
        ],
      })

      emit('confirm', settlement)
      handleClose()
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Erreur lors de la creation'
    } finally {
      isSubmitting.value = false
    }
  }

  watch(
    () => props.isOpen,
    isOpen => {
      if (isOpen) reset()
    }
  )

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && reimbursement && line"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

        <div
          class="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 p-6"
          >
            <div class="min-w-0">
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Regler ce remboursement
              </h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                {{ reimbursement.personName }} &middot; retrouvez la transaction
                recue qui le solde
              </p>
            </div>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 shrink-0"
              aria-label="Fermer"
              @click="handleClose"
            >
              <svg
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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

          <div class="flex-1 overflow-y-auto p-6">
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <!-- The debt being settled -->
            <div
              data-testid="single-settlement-line"
              class="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <div
                  class="font-medium text-gray-900 dark:text-gray-100 truncate"
                >
                  <span class="text-gray-400 dark:text-gray-500"
                    >[{{ formatDate(line.date) }}]</span
                  >
                  {{ line.description }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ line.categoryName || NO_CATEGORY_LABEL }}
                </div>
              </div>
              <div
                class="text-lg font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap"
              >
                {{ formatCurrency(amountDue) }}
              </div>
            </div>

            <label
              class="block text-sm text-gray-600 dark:text-gray-400 mb-3"
              for="settlement-search"
            >
              Quelle transaction correspond au paiement de
              {{ reimbursement.personName }} ?
            </label>

            <IncomeTransactionPicker
              :context="suggestionContext"
              :selected-transaction-id="selectedTransaction?.id ?? null"
              @select="selectTransaction"
            />

            <!-- What will be credited, once the receipt is known -->
            <div v-if="selectedTransaction" class="mt-6">
              <div
                class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <div
                    class="font-medium text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ selectedTransaction.description }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDate(selectedTransaction.date) }} &middot;
                    {{ selectedTransaction.account }}
                  </div>
                </div>
                <div
                  class="text-lg font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                >
                  +{{ formatCurrency(pot) }}
                </div>
              </div>

              <div
                class="mt-3 flex items-center justify-between gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg"
              >
                <label
                  class="text-sm text-gray-700 dark:text-gray-300"
                  for="single-settlement-amount"
                >
                  Montant a imputer
                </label>
                <div class="flex items-center gap-1 shrink-0">
                  <input
                    id="single-settlement-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    :max="Math.min(amountDue, pot)"
                    :value="amount"
                    :aria-label="`Montant affecte a ${line.description}`"
                    class="w-28 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
                    @change="onAmountCommit"
                  />
                  <span class="text-gray-500 dark:text-gray-400">&euro;</span>
                </div>
              </div>

              <!-- Settle-the-shortfall, only when the line stays short -->
              <label
                v-if="isShort"
                class="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
              >
                <input
                  v-model="forceComplete"
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  :aria-label="`Solder ${line.description}`"
                />
                Solder cette ligne malgre l'ecart de
                {{ formatCurrency(shortfall) }}
              </label>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="border-t border-gray-200 dark:border-slate-700 p-6 flex justify-end gap-3"
          >
            <button
              type="button"
              class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              :disabled="isSubmitting"
              @click="handleClose"
            >
              Annuler
            </button>
            <button
              type="button"
              data-testid="single-settlement-confirm"
              class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!canConfirm"
              @click="handleConfirm"
            >
              <span v-if="isSubmitting" class="flex items-center gap-2">
                <span
                  class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                />
                Creation...
              </span>
              <span v-else>Confirmer le reglement</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .modal-enter-active,
  .modal-leave-active {
    transition: opacity 0.2s ease;
  }

  .modal-enter-from,
  .modal-leave-to {
    opacity: 0;
  }
</style>

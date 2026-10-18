<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
  } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import IncomeTransactionPicker from './IncomeTransactionPicker.vue'
  import {
    availableAmountOf,
    round2,
    toAllocationLine,
    NO_CATEGORY_LABEL,
  } from '@/lib/settlements'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

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
  /** Scrolled to on a pick: on a phone the recap sits under the fold. */
  const recapRef = ref<HTMLElement | null>(null)

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
    void nextTick(() => {
      recapRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
  }

  /** Committed on change (BaseField `lazy`), then clamped to the line and the pot. */
  function onAmountCommit(raw: number | null): void {
    const value = raw ?? 0
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
        e instanceof Error ? e.message : 'Erreur lors de la création'
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
</script>

<template>
  <BaseModal
    :open="isOpen && reimbursement !== null && line !== null"
    title="Régler ce remboursement"
    :subtitle="`${reimbursement?.personName ?? ''} · retrouvez la transaction reçue qui le solde`"
    max-width="xl"
    :closable="!isSubmitting"
    @close="handleClose"
  >
    <template v-if="reimbursement && line">
      <InlineAlert v-if="error" class="mb-4">{{ error }}</InlineAlert>

      <!-- The debt being settled -->
      <div
        data-testid="single-settlement-line"
        class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-debt-200 bg-debt-50/60 p-3 dark:border-debt-800 dark:bg-debt-900/20"
      >
        <div class="min-w-0">
          <p
            class="flex items-center gap-1 font-medium text-gray-900 dark:text-gray-100"
            :title="line.description"
          >
            <span class="min-w-0 truncate">
              <span class="text-gray-500 dark:text-gray-400"
                >[{{ formatDate(line.date) }}]</span
              >
              {{ line.description }}
            </span>
            <!-- A draft is open: the row opens beside it. -->
            <TransactionsLink
              :to="
                transactionsLink({
                  ids: [reimbursement.transactionId],
                  label: line.description,
                })
              "
              :subject="line.description"
              icon-only
              new-tab
              class="h-6 w-6"
              data-testid="single-settlement-line-link"
            />
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ line.categoryName || NO_CATEGORY_LABEL }}
          </p>
        </div>
        <p
          class="text-lg font-bold whitespace-nowrap text-debt-700 dark:text-debt-400"
        >
          {{ formatCurrency(amountDue) }}
        </p>
      </div>

      <label
        class="mb-3 block text-sm text-gray-600 dark:text-gray-400"
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
      <div
        v-if="selectedTransaction"
        ref="recapRef"
        class="mt-6 scroll-mt-2"
        data-testid="single-settlement-recap"
      >
        <div
          class="flex items-center justify-between gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-900/20"
        >
          <div class="min-w-0">
            <p
              class="truncate font-medium text-gray-900 dark:text-gray-100"
              :title="selectedTransaction.description"
            >
              {{ selectedTransaction.description }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ formatDate(selectedTransaction.date) }} &middot;
              {{ selectedTransaction.account }}
            </p>
          </div>
          <p
            class="text-lg font-bold whitespace-nowrap text-green-700 dark:text-green-400"
          >
            +{{ formatCurrency(pot) }}
          </p>
        </div>

        <div
          class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700"
        >
          <span class="text-sm text-gray-700 dark:text-gray-300">
            Montant à imputer
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <BaseField
              amount
              lazy
              size="sm"
              label-hidden
              label="Montant à imputer"
              :model-value="amount"
              class="w-24 sm:w-28 [&_input]:text-right"
              @update:model-value="
                value => onAmountCommit(value as number | null)
              "
            />
            <span class="text-gray-500 dark:text-gray-400">&euro;</span>
          </div>
        </div>

        <!-- Settle-the-shortfall, only when the line stays short -->
        <div v-if="isShort" class="mt-3">
          <BaseCheckbox
            v-model="forceComplete"
            :label="`Solder cette ligne malgré l'écart de ${formatCurrency(shortfall)}`"
            :aria-label="`Solder ${line.description}`"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <BaseButton
        variant="secondary"
        :disabled="isSubmitting"
        @click="handleClose"
      >
        Annuler
      </BaseButton>
      <BaseButton
        data-testid="single-settlement-confirm"
        :disabled="!canConfirm"
        :loading="isSubmitting"
        @click="handleConfirm"
      >
        Confirmer le règlement
      </BaseButton>
    </template>
  </BaseModal>
</template>

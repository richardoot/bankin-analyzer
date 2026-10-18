<script setup lang="ts">
  /**
   * Assigning a debt to a person on an expense.
   *
   * There used to be an income-category field here. It existed because the old
   * model routed a refund back to an expense through a category pairing, so the
   * category had to be chosen up front. The deduction now attaches to the
   * expense transaction itself, which already knows its category — the field
   * decided nothing and only asked the user to guess.
   */
  import { computed, ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import { api } from '@/lib/api'
  import type { TransactionDto, PersonDto } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import { useToast } from '@/composables/useToast'

  const props = defineProps<{
    isOpen: boolean
    transaction: TransactionDto | null
    persons: PersonDto[]
    remainingAmount: number
  }>()

  const emit = defineEmits<{
    close: []
    created: [
      reimbursement: Awaited<ReturnType<typeof api.createReimbursement>>,
    ]
  }>()

  const toast = useToast()

  const form = ref<{ personId: string; amount: number | null; note: string }>({
    personId: '',
    amount: 0,
    note: '',
  })
  const isCreating = ref(false)
  const customDivisor = ref<number | null>(2)

  function resetForm(): void {
    form.value = {
      personId: '',
      amount: props.remainingAmount,
      note: '',
    }
    customDivisor.value = 2
  }

  function setAmountFromDivisor(divisor: number): void {
    if (!props.transaction || divisor <= 0) return
    const baseAmount = Math.abs(props.transaction.amount)
    const calculated = Math.round((baseAmount / divisor) * 100) / 100
    form.value.amount = Math.min(calculated, props.remainingAmount)
  }

  function applyCustomDivisor(): void {
    const divisor = customDivisor.value ?? 0
    if (divisor > 0) setAmountFromDivisor(divisor)
  }

  const amount = computed(() => form.value.amount ?? 0)

  /** Why the amount cannot be taken, said next to the field rather than by a grey button. */
  const amountError = computed<string | undefined>(() => {
    if (form.value.amount === null || amount.value <= 0) return undefined
    if (amount.value > props.remainingAmount) {
      return `Le montant dépasse le restant à assigner (${formatCurrency(props.remainingAmount)}).`
    }
    return undefined
  })

  const canSubmit = computed(
    () =>
      form.value.personId !== '' &&
      amount.value > 0 &&
      amountError.value === undefined &&
      !isCreating.value
  )

  async function handleSubmit(): Promise<void> {
    if (!props.transaction || !canSubmit.value) return

    try {
      isCreating.value = true
      // The optional fields are omitted rather than sent as `undefined`:
      // under `exactOptionalPropertyTypes` those are different things, and the
      // payload should say "no category" by saying nothing.
      const newReimbursement = await api.createReimbursement({
        transactionId: props.transaction.id,
        personId: form.value.personId,
        amount: amount.value,
        ...(form.value.note && { note: form.value.note }),
      })
      emit('created', newReimbursement)
    } catch (err) {
      console.error('Failed to create reimbursement:', err)
      // The modal stays open with the form as typed, so the user can retry.
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossible de créer le remboursement'
      )
    } finally {
      isCreating.value = false
    }
  }

  // Reset the form whenever the modal transitions from closed to open.
  // This runs after Vue has propagated the latest `transaction` and
  // `remainingAmount` props, so the defaults use the freshly-selected
  // transaction.
  watch(
    () => props.isOpen,
    isOpen => {
      if (isOpen) resetForm()
    }
  )

  defineExpose({ resetForm })
</script>

<template>
  <BaseModal
    :open="isOpen && transaction !== null"
    title="Assigner un remboursement"
    max-width="md"
    :closable="!isCreating"
    @close="emit('close')"
  >
    <template v-if="transaction">
      <!-- Transaction info -->
      <div class="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-slate-800">
        <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
          {{ formatDate(transaction.date) }} · {{ transaction.description }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div
            class="rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-700"
          >
            <SectionLabel>Montant total</SectionLabel>
            <p class="text-lg font-semibold text-red-600 dark:text-red-500">
              {{ formatCurrency(transaction.amount) }}
            </p>
          </div>
          <div
            class="rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-700"
          >
            <SectionLabel>Restant à assigner</SectionLabel>
            <p
              class="text-lg font-semibold"
              :class="
                remainingAmount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400'
              "
            >
              {{ formatCurrency(remainingAmount) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Form -->
      <div class="space-y-4">
        <BaseField
          v-model="form.personId"
          as="select"
          label="Personne *"
          data-testid="reimbursement-person"
        >
          <option value="">Sélectionnez une personne</option>
          <option v-for="person in persons" :key="person.id" :value="person.id">
            {{ person.name }}
          </option>
        </BaseField>

        <div>
          <BaseField
            v-model="form.amount"
            amount
            label="Montant *"
            :error="amountError"
            data-testid="reimbursement-amount"
          />

          <div class="mt-2">
            <p class="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
              Raccourcis (base :
              {{ formatCurrency(Math.abs(transaction.amount)) }})
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <BaseButton
                v-for="d in [1, 2, 3, 4]"
                :key="d"
                variant="secondary"
                size="sm"
                @click="setAmountFromDivisor(d)"
              >
                {{ d === 1 ? '100 %' : `/ ${d}` }}
              </BaseButton>
              <div class="flex items-center gap-1">
                <span class="text-xs text-gray-500 dark:text-gray-400">/</span>
                <div class="w-20">
                  <BaseField
                    v-model="customDivisor"
                    type="number"
                    size="sm"
                    label="Diviseur personnalisé"
                    label-hidden
                    min="1"
                    max="100"
                    @keyup.enter="applyCustomDivisor"
                  />
                </div>
                <BaseButton
                  variant="tinted"
                  size="sm"
                  @click="applyCustomDivisor"
                >
                  Appliquer
                </BaseButton>
              </div>
            </div>
          </div>
        </div>

        <BaseField
          v-model="form.note"
          type="text"
          label="Note (optionnel)"
          placeholder="Ajouter une note…"
          data-testid="reimbursement-note"
        />
      </div>
    </template>

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="isCreating"
        @click="emit('close')"
      >
        Annuler
      </BaseButton>
      <BaseButton
        class="flex-1"
        :disabled="!canSubmit"
        :loading="isCreating"
        @click="handleSubmit"
      >
        Confirmer
      </BaseButton>
    </template>
  </BaseModal>
</template>

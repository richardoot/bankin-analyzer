<script setup lang="ts">
  import { ref } from 'vue'
  import { api } from '@/lib/api'
  import type { TransactionDto, PersonDto, CategoryDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    isOpen: boolean
    transaction: TransactionDto | null
    persons: PersonDto[]
    incomeCategories: CategoryDto[]
    remainingAmount: number
  }>()

  const emit = defineEmits<{
    close: []
    created: [
      reimbursement: Awaited<ReturnType<typeof api.createReimbursement>>,
    ]
  }>()

  const form = ref({
    personId: '',
    amount: 0,
    categoryId: '',
    note: '',
  })
  const isCreating = ref(false)
  const customDivisor = ref(2)

  function resetForm(): void {
    form.value = {
      personId: '',
      amount: props.remainingAmount,
      categoryId: '',
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
    if (customDivisor.value > 0) {
      setAmountFromDivisor(customDivisor.value)
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!props.transaction || !form.value.personId) return

    try {
      isCreating.value = true
      const newReimbursement = await api.createReimbursement({
        transactionId: props.transaction.id,
        personId: form.value.personId,
        amount: form.value.amount,
        categoryId: form.value.categoryId || undefined,
        note: form.value.note || undefined,
      })
      emit('created', newReimbursement)
    } catch (err) {
      console.error('Failed to create reimbursement:', err)
    } finally {
      isCreating.value = false
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  defineExpose({ resetForm })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen && transaction"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

      <div
        role="dialog"
        aria-labelledby="reimbursement-modal-title"
        class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
      >
        <h3
          id="reimbursement-modal-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Assigner un remboursement
        </h3>

        <!-- Transaction info -->
        <div class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
          <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {{ formatDate(transaction.date) }} -
            {{ transaction.description }}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div
              class="bg-white dark:bg-slate-700 rounded-lg p-2 border border-gray-200 dark:border-slate-600"
            >
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Montant total
              </div>
              <div class="text-lg font-semibold text-red-600 dark:text-red-500">
                {{ formatCurrency(transaction.amount) }}
              </div>
            </div>
            <div
              class="bg-white dark:bg-slate-700 rounded-lg p-2 border border-gray-200 dark:border-slate-600"
            >
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Restant a assigner
              </div>
              <div
                class="text-lg font-semibold"
                :class="
                  remainingAmount > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                "
              >
                {{ formatCurrency(remainingAmount) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Form -->
        <div class="space-y-4">
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Personne *
            </label>
            <select
              v-model="form.personId"
              class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
            >
              <option value="">Selectionnez une personne</option>
              <option
                v-for="person in persons"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </option>
            </select>
          </div>

          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Montant *
            </label>
            <input
              v-model.number="form.amount"
              type="number"
              step="0.01"
              min="0.01"
              :max="remainingAmount"
              class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
            />

            <div class="mt-2">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Raccourcis (base:
                {{ formatCurrency(Math.abs(transaction.amount)) }})
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="d in [1, 2, 3, 4]"
                  :key="d"
                  type="button"
                  class="px-2 py-1 text-xs font-medium rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  @click="setAmountFromDivisor(d)"
                >
                  {{ d === 1 ? '100%' : `/ ${d}` }}
                </button>
                <div class="flex items-center gap-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400"
                    >/</span
                  >
                  <input
                    v-model.number="customDivisor"
                    type="number"
                    min="1"
                    max="100"
                    class="w-12 px-1.5 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    @keyup.enter="applyCustomDivisor"
                  />
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                    @click="applyCustomDivisor"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Categorie (optionnel)
            </label>
            <select
              v-model="form.categoryId"
              class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
            >
              <option value="">Sans categorie</option>
              <option
                v-for="cat in incomeCategories"
                :key="cat.id"
                :value="cat.id"
              >
                {{ cat.name }}
              </option>
            </select>
          </div>

          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Note (optionnel)
            </label>
            <input
              v-model="form.note"
              type="text"
              placeholder="Ajouter une note..."
              class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
            />
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex gap-3 mt-6">
          <button
            class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            @click="emit('close')"
          >
            Annuler
          </button>
          <button
            :disabled="
              !form.personId ||
              form.amount <= 0 ||
              form.amount > remainingAmount ||
              isCreating
            "
            class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
            :class="
              form.personId &&
              form.amount > 0 &&
              form.amount <= remainingAmount &&
              !isCreating
                ? 'bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600'
                : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
            "
            @click="handleSubmit"
          >
            <span v-if="isCreating">Creation...</span>
            <span v-else>Confirmer</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

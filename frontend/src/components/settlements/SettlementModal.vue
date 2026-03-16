<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
  } from '@/lib/api'

  interface CategoryGroup {
    categoryId: string | null
    categoryName: string
    amount: number
    reimbursements: ReimbursementDto[]
  }

  interface TransactionWithAvailable extends TransactionDto {
    availableAmount: number
    usedAmount: number
  }

  const props = defineProps<{
    isOpen: boolean
    personId: string
    personName: string
    pendingByCategory: Map<string | null, CategoryGroup>
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [settlement: SettlementDto]
  }>()

  // State
  const currentStep = ref<1 | 2 | 3>(1)
  const selectedCategoryIds = ref<Set<string | null>>(new Set())
  const selectedTransactionId = ref<string | null>(null)
  const incomeTransactions = ref<TransactionWithAvailable[]>([])
  const isLoading = ref(false)
  const isLoadingTransactions = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')
  const forceComplete = ref(false)

  // Computed
  const categories = computed(() =>
    Array.from(props.pendingByCategory.values())
  )

  const selectedCategories = computed(() =>
    categories.value.filter(c => selectedCategoryIds.value.has(c.categoryId))
  )

  const totalSelectedAmount = computed(() =>
    selectedCategories.value.reduce((sum, c) => sum + c.amount, 0)
  )

  const selectedReimbursements = computed(() =>
    selectedCategories.value.flatMap(c => c.reimbursements)
  )

  const filteredTransactions = computed(() => {
    if (!searchQuery.value) return incomeTransactions.value
    const query = searchQuery.value.toLowerCase()
    return incomeTransactions.value.filter(t =>
      t.description.toLowerCase().includes(query)
    )
  })

  const selectedTransaction = computed(() =>
    incomeTransactions.value.find(t => t.id === selectedTransactionId.value)
  )

  const amountDifference = computed(() => {
    if (!selectedTransaction.value) return 0
    return selectedTransaction.value.availableAmount - totalSelectedAmount.value
  })

  const canProceedStep1 = computed(() => selectedCategoryIds.value.size > 0)
  const canProceedStep2 = computed(() => selectedTransactionId.value !== null)

  // Get income category names from selected reimbursement categories
  const selectedIncomeCategoryNames = computed(() => {
    const names = new Set<string>()
    for (const category of selectedCategories.value) {
      // Use the reimbursement's own category name directly
      // This is already an income category (e.g., "R Abonnements")
      if (category.categoryName && category.categoryName !== 'Sans categorie') {
        names.add(category.categoryName)
      }
    }
    return names
  })

  // Watchers
  watch(
    () => props.isOpen,
    isOpen => {
      if (isOpen) {
        resetModal()
        // Pre-select all categories
        categories.value.forEach(c => {
          selectedCategoryIds.value.add(c.categoryId)
        })
      }
    }
  )

  // Methods
  function resetModal(): void {
    currentStep.value = 1
    selectedCategoryIds.value = new Set()
    selectedTransactionId.value = null
    incomeTransactions.value = []
    error.value = null
    searchQuery.value = ''
    forceComplete.value = false
  }

  function handleClose(): void {
    resetModal()
    emit('close')
  }

  function toggleCategory(categoryId: string | null): void {
    if (selectedCategoryIds.value.has(categoryId)) {
      selectedCategoryIds.value.delete(categoryId)
    } else {
      selectedCategoryIds.value.add(categoryId)
    }
    // Force reactivity
    selectedCategoryIds.value = new Set(selectedCategoryIds.value)
  }

  function selectAllCategories(): void {
    categories.value.forEach(c => {
      selectedCategoryIds.value.add(c.categoryId)
    })
    selectedCategoryIds.value = new Set(selectedCategoryIds.value)
  }

  function deselectAllCategories(): void {
    selectedCategoryIds.value.clear()
    selectedCategoryIds.value = new Set(selectedCategoryIds.value)
  }

  async function goToStep2(): Promise<void> {
    isLoadingTransactions.value = true
    error.value = null

    try {
      // Load income transactions using paginated API
      const response = await api.getTransactions({
        type: 'INCOME',
        limit: 100, // Load enough for selection
      })
      let incomeOnly = response.data

      // Filter by selected reimbursement category names if any
      const categoryNames = selectedIncomeCategoryNames.value
      if (categoryNames.size > 0) {
        incomeOnly = incomeOnly.filter(
          t => t.categoryName && categoryNames.has(t.categoryName)
        )
      }

      // Get available amount for each transaction
      const transactionsWithAvailable: TransactionWithAvailable[] = []
      for (const transaction of incomeOnly) {
        try {
          const available = await api.getTransactionAvailableAmount(
            transaction.id
          )
          transactionsWithAvailable.push({
            ...transaction,
            availableAmount: available.availableAmount,
            usedAmount: available.usedAmount,
          })
        } catch {
          // If we can't get available amount, assume full amount is available
          transactionsWithAvailable.push({
            ...transaction,
            availableAmount: transaction.amount,
            usedAmount: 0,
          })
        }
      }

      // Sort by date (most recent first) and filter out fully used
      incomeTransactions.value = transactionsWithAvailable
        .filter(t => t.availableAmount > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      currentStep.value = 2
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement'
    } finally {
      isLoadingTransactions.value = false
    }
  }

  function goToStep3(): void {
    currentStep.value = 3
  }

  function goBack(): void {
    if (currentStep.value === 2) {
      currentStep.value = 1
      selectedTransactionId.value = null
    } else if (currentStep.value === 3) {
      currentStep.value = 2
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!selectedTransaction.value) return

    isLoading.value = true
    error.value = null

    try {
      // Calculate amount to settle for each reimbursement
      // If transaction amount < total, distribute proportionally
      const availableAmount = selectedTransaction.value.availableAmount
      const totalAmount = totalSelectedAmount.value

      const reimbursements = selectedReimbursements.value.map(r => {
        let amountSettled: number
        if (availableAmount >= totalAmount) {
          // Enough money - settle full amount
          amountSettled = r.amountRemaining
        } else {
          // Partial payment - distribute proportionally
          const ratio = availableAmount / totalAmount
          amountSettled = Math.round(r.amountRemaining * ratio * 100) / 100
        }

        return {
          reimbursementId: r.id,
          amountSettled,
        }
      })

      const settlement = await api.createSettlement({
        personId: props.personId,
        incomeTransactionId: selectedTransaction.value.id,
        reimbursements,
        forceComplete: forceComplete.value || undefined,
      })

      emit('confirm', settlement)
      handleClose()
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Erreur lors de la creation'
    } finally {
      isLoading.value = false
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  function getMatchIndicator(transaction: TransactionWithAvailable): {
    type: 'exact' | 'excess' | 'partial'
    label: string
  } {
    const diff = transaction.availableAmount - totalSelectedAmount.value
    if (Math.abs(diff) < 0.01) {
      return { type: 'exact', label: 'Correspondance exacte' }
    } else if (diff > 0) {
      return { type: 'excess', label: `Excedent ${formatCurrency(diff)}` }
    } else {
      return { type: 'partial', label: `Partiel ${formatCurrency(diff)}` }
    }
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

        <!-- Modal -->
        <div
          class="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 p-6"
          >
            <div>
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Enregistrer un reglement
              </h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {{ personName }}
              </p>
            </div>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
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

          <!-- Progress -->
          <div
            class="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-slate-800"
          >
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
              :class="
                currentStep >= 1
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-500'
              "
            >
              1
            </div>
            <div class="flex-1 h-1 bg-gray-200 dark:bg-slate-700 rounded">
              <div
                class="h-full bg-emerald-500 rounded transition-all"
                :style="{ width: currentStep >= 2 ? '100%' : '0%' }"
              />
            </div>
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
              :class="
                currentStep >= 2
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-500'
              "
            >
              2
            </div>
            <div class="flex-1 h-1 bg-gray-200 dark:bg-slate-700 rounded">
              <div
                class="h-full bg-emerald-500 rounded transition-all"
                :style="{ width: currentStep >= 3 ? '100%' : '0%' }"
              />
            </div>
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
              :class="
                currentStep >= 3
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-500'
              "
            >
              3
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Error -->
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <!-- Step 1: Select categories -->
            <div v-if="currentStep === 1">
              <h3
                class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4"
              >
                Selectionner les categories a regler
              </h3>

              <div class="flex justify-between items-center mb-4">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ selectedCategoryIds.size }} /
                  {{ categories.length }} categories
                </span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                    @click="selectAllCategories"
                  >
                    Tout selectionner
                  </button>
                  <span class="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    type="button"
                    class="text-sm text-gray-600 dark:text-gray-400 hover:underline"
                    @click="deselectAllCategories"
                  >
                    Tout deselectionner
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="category in categories"
                  :key="category.categoryId ?? 'no-category'"
                  class="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  :class="{
                    'ring-2 ring-emerald-500 border-emerald-500':
                      selectedCategoryIds.has(category.categoryId),
                  }"
                  @click="toggleCategory(category.categoryId)"
                >
                  <input
                    type="checkbox"
                    :checked="selectedCategoryIds.has(category.categoryId)"
                    class="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    @click.stop
                    @change="toggleCategory(category.categoryId)"
                  />
                  <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-gray-100">
                      {{ category.categoryName }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      {{ category.reimbursements.length }} remboursement(s)
                    </div>
                  </div>
                  <div
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {{ formatCurrency(category.amount) }}
                  </div>
                </div>
              </div>

              <div
                class="mt-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg flex justify-between items-center"
              >
                <span class="text-gray-700 dark:text-gray-300"
                  >Total selectionne</span
                >
                <span
                  class="text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                  {{ formatCurrency(totalSelectedAmount) }}
                </span>
              </div>
            </div>

            <!-- Step 2: Select transaction -->
            <div v-else-if="currentStep === 2">
              <h3
                class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2"
              >
                Selectionner la transaction de reglement
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Montant a regler:
                <strong>{{ formatCurrency(totalSelectedAmount) }}</strong>
              </p>

              <!-- Search -->
              <div class="relative mb-4">
                <svg
                  class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Rechercher une transaction..."
                  class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <!-- Loading -->
              <div v-if="isLoadingTransactions" class="py-12 text-center">
                <div
                  class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"
                />
                <p class="mt-2 text-gray-600 dark:text-gray-400">
                  Chargement des transactions...
                </p>
              </div>

              <!-- Transactions list -->
              <div v-else class="space-y-2 max-h-80 overflow-y-auto">
                <div
                  v-for="transaction in filteredTransactions"
                  :key="transaction.id"
                  class="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  :class="{
                    'ring-2 ring-emerald-500 border-emerald-500':
                      selectedTransactionId === transaction.id,
                  }"
                  @click="selectedTransactionId = transaction.id"
                >
                  <input
                    type="radio"
                    :checked="selectedTransactionId === transaction.id"
                    class="h-5 w-5 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    @click.stop
                    @change="selectedTransactionId = transaction.id"
                  />
                  <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-gray-100">
                      {{ transaction.description }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      {{ formatDate(transaction.date) }} -
                      {{ transaction.account }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div
                      class="text-lg font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      +{{ formatCurrency(transaction.availableAmount) }}
                    </div>
                    <div
                      class="text-xs px-2 py-0.5 rounded-full"
                      :class="{
                        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400':
                          getMatchIndicator(transaction).type === 'exact',
                        'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400':
                          getMatchIndicator(transaction).type === 'excess',
                        'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400':
                          getMatchIndicator(transaction).type === 'partial',
                      }"
                    >
                      {{ getMatchIndicator(transaction).label }}
                    </div>
                  </div>
                </div>

                <div
                  v-if="filteredTransactions.length === 0"
                  class="py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  Aucune transaction INCOME disponible
                </div>
              </div>
            </div>

            <!-- Step 3: Confirmation -->
            <div v-else-if="currentStep === 3">
              <h3
                class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4"
              >
                Confirmer le reglement
              </h3>

              <!-- Selected categories -->
              <div class="mb-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <h4
                  class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Categories a regler
                </h4>
                <ul class="space-y-1">
                  <li
                    v-for="category in selectedCategories"
                    :key="category.categoryId ?? 'no-category'"
                    class="flex justify-between text-sm"
                  >
                    <span class="text-gray-600 dark:text-gray-400">{{
                      category.categoryName
                    }}</span>
                    <span class="text-gray-900 dark:text-gray-100">{{
                      formatCurrency(category.amount)
                    }}</span>
                  </li>
                </ul>
                <div
                  class="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between font-medium"
                >
                  <span class="text-gray-700 dark:text-gray-300">Total</span>
                  <span class="text-gray-900 dark:text-gray-100">{{
                    formatCurrency(totalSelectedAmount)
                  }}</span>
                </div>
              </div>

              <!-- Selected transaction -->
              <div
                v-if="selectedTransaction"
                class="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"
              >
                <h4
                  class="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2"
                >
                  Transaction de reglement
                </h4>
                <div class="text-gray-900 dark:text-gray-100 font-medium">
                  {{ selectedTransaction.description }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ formatDate(selectedTransaction.date) }} -
                  {{ selectedTransaction.account }}
                </div>
                <div
                  class="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1"
                >
                  +{{ formatCurrency(selectedTransaction.availableAmount) }}
                </div>
              </div>

              <!-- Balance -->
              <div
                class="p-4 rounded-lg"
                :class="{
                  'bg-emerald-50 dark:bg-emerald-900/20': amountDifference >= 0,
                  'bg-orange-50 dark:bg-orange-900/20': amountDifference < 0,
                }"
              >
                <div class="flex justify-between items-center">
                  <span class="text-gray-700 dark:text-gray-300">A regler</span>
                  <span class="text-gray-900 dark:text-gray-100">{{
                    formatCurrency(totalSelectedAmount)
                  }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-700 dark:text-gray-300"
                    >Transaction</span
                  >
                  <span class="text-gray-900 dark:text-gray-100">
                    {{
                      selectedTransaction
                        ? formatCurrency(selectedTransaction.availableAmount)
                        : '-'
                    }}
                  </span>
                </div>
                <div
                  class="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between font-bold"
                >
                  <span class="text-gray-900 dark:text-gray-100"
                    >Difference</span
                  >
                  <span
                    :class="{
                      'text-emerald-600 dark:text-emerald-400':
                        amountDifference >= 0,
                      'text-orange-600 dark:text-orange-400':
                        amountDifference < 0,
                    }"
                  >
                    {{ amountDifference >= 0 ? '+' : ''
                    }}{{ formatCurrency(amountDifference) }}
                  </span>
                </div>

                <!-- Warning for partial payment -->
                <div
                  v-if="amountDifference < 0"
                  class="mt-3 p-3 bg-orange-100 dark:bg-orange-900/30 rounded text-sm text-orange-700 dark:text-orange-400"
                >
                  <strong>Reglement partiel</strong> -
                  {{ formatCurrency(Math.abs(amountDifference)) }} resteront en
                  attente.
                </div>

                <!-- Force complete checkbox for partial payments -->
                <label
                  v-if="amountDifference < 0"
                  class="mt-3 flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <input
                    v-model="forceComplete"
                    type="checkbox"
                    class="mt-0.5 h-5 w-5 rounded border-gray-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span
                      class="text-sm font-medium text-gray-900 dark:text-gray-100"
                    >
                      Marquer comme entierement rembourse
                    </span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Valider completement les remboursements meme si le montant
                      recu est inferieur au montant du.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex justify-between items-center border-t border-gray-200 dark:border-slate-700 p-6"
          >
            <button
              v-if="currentStep > 1"
              type="button"
              class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              :disabled="isLoading"
              @click="goBack"
            >
              Retour
            </button>
            <div v-else />

            <div class="flex gap-3">
              <button
                type="button"
                class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                :disabled="isLoading"
                @click="handleClose"
              >
                Annuler
              </button>

              <!-- Step 1 next button -->
              <button
                v-if="currentStep === 1"
                type="button"
                class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canProceedStep1 || isLoadingTransactions"
                @click="goToStep2"
              >
                <span
                  v-if="isLoadingTransactions"
                  class="flex items-center gap-2"
                >
                  <span
                    class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                  />
                  Chargement...
                </span>
                <span v-else>Suivant</span>
              </button>

              <!-- Step 2 next button -->
              <button
                v-else-if="currentStep === 2"
                type="button"
                class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canProceedStep2"
                @click="goToStep3"
              >
                Suivant
              </button>

              <!-- Step 3 confirm button -->
              <button
                v-else
                type="button"
                class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isLoading"
                @click="handleConfirm"
              >
                <span v-if="isLoading" class="flex items-center gap-2">
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

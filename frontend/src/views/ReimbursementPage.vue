<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { usePersonsStore } from '@/stores/persons'
  import { api } from '@/lib/api'
  import type { TransactionDto, ReimbursementDto, CategoryDto } from '@/lib/api'

  const personsStore = usePersonsStore()

  // Form state for adding person
  const newPersonName = ref('')
  const newPersonEmail = ref('')
  const isAddingPerson = ref(false)

  // Edit person state
  const editingPersonId = ref<string | null>(null)
  const editingPersonName = ref('')

  // Delete confirmation modal state
  const personToDelete = ref<{ id: string; name: string } | null>(null)

  // Transactions state
  const transactions = ref<TransactionDto[]>([])
  const isLoadingTransactions = ref(false)
  const transactionsError = ref<string | null>(null)

  // Categories state
  const allCategories = ref<CategoryDto[]>([])

  // Reimbursements state
  const reimbursements = ref<ReimbursementDto[]>([])
  const isLoadingReimbursements = ref(false)
  const reimbursementsError = ref<string | null>(null)

  // Modal state for adding reimbursement
  const showReimbursementModal = ref(false)
  const selectedTransaction = ref<TransactionDto | null>(null)
  const reimbursementForm = ref({
    personId: '',
    amount: 0,
    categoryId: '',
    note: '',
  })
  const isCreatingReimbursement = ref(false)
  const customDivisor = ref(2)

  // Filters
  const selectedCategory = ref<string | null>(null)
  const showOnlyNotPointed = ref(false)

  // Pagination
  const currentPage = ref(1)
  const pageSize = 20

  // Computed: extract unique categories from transactions
  const categories = computed(() => {
    const cats = new Set<string>()
    transactions.value.forEach(t => {
      if (t.categoryName) {
        cats.add(t.categoryName)
      }
    })
    return Array.from(cats).sort()
  })

  // Computed: filtered transactions
  const filteredTransactions = computed(() => {
    return transactions.value.filter(t => {
      // Only EXPENSE type
      if (t.type !== 'EXPENSE') return false
      // Category filter
      if (selectedCategory.value && t.categoryName !== selectedCategory.value)
        return false
      // Not pointed filter (show only transactions that are NOT pointed)
      if (showOnlyNotPointed.value && t.isPointed) return false
      return true
    })
  })

  // Computed: paginated transactions
  const paginatedTransactions = computed(() => {
    const start = (currentPage.value - 1) * pageSize
    return filteredTransactions.value.slice(start, start + pageSize)
  })

  // Computed: total pages
  const totalPages = computed(() =>
    Math.ceil(filteredTransactions.value.length / pageSize)
  )

  // Computed: page numbers to display
  const visiblePages = computed(() => {
    const pages: number[] = []
    const total = totalPages.value
    const current = currentPage.value

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i)
    } else {
      if (current <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i)
        pages.push(-1) // ellipsis
        pages.push(total)
      } else if (current >= total - 3) {
        pages.push(1)
        pages.push(-1)
        for (let i = total - 4; i <= total; i++) pages.push(i)
      } else {
        pages.push(1)
        pages.push(-1)
        for (let i = current - 1; i <= current + 1; i++) pages.push(i)
        pages.push(-2)
        pages.push(total)
      }
    }
    return pages
  })

  // Income categories for reimbursement dropdown
  const incomeCategories = computed(() => {
    return allCategories.value.filter(c => c.type === 'INCOME')
  })

  // Get reimbursements for a specific transaction
  function getReimbursementsForTransaction(txId: string): ReimbursementDto[] {
    return reimbursements.value.filter(r => r.transactionId === txId)
  }

  // Get remaining amount to assign for a transaction
  function getRemainingAmount(tx: TransactionDto): number {
    const assigned = getReimbursementsForTransaction(tx.id).reduce(
      (sum, r) => sum + r.amount,
      0
    )
    return Math.abs(tx.amount) - assigned
  }

  // Summary by person
  interface PersonSummary {
    personId: string
    personName: string
    total: number
    byCategory: { categoryId: string; categoryName: string; amount: number }[]
  }

  const summaryByPerson = computed((): PersonSummary[] => {
    const map = new Map<
      string,
      {
        personId: string
        personName: string
        total: number
        byCategory: Map<string, { categoryName: string; amount: number }>
      }
    >()

    reimbursements.value.forEach(r => {
      if (!map.has(r.personId)) {
        map.set(r.personId, {
          personId: r.personId,
          personName: r.personName,
          total: 0,
          byCategory: new Map(),
        })
      }
      const person = map.get(r.personId)!
      person.total += r.amountRemaining

      const catKey = r.categoryId || 'none'
      const catName = r.categoryName || 'Sans categorie'
      if (!person.byCategory.has(catKey)) {
        person.byCategory.set(catKey, { categoryName: catName, amount: 0 })
      }
      person.byCategory.get(catKey)!.amount += r.amountRemaining
    })

    return Array.from(map.values()).map(p => ({
      personId: p.personId,
      personName: p.personName,
      total: p.total,
      byCategory: Array.from(p.byCategory.entries()).map(([id, data]) => ({
        categoryId: id,
        categoryName: data.categoryName,
        amount: data.amount,
      })),
    }))
  })

  // Total due
  const totalDue = computed(() =>
    reimbursements.value.reduce((sum, r) => sum + r.amountRemaining, 0)
  )

  // Reset page when filters change
  watch([selectedCategory, showOnlyNotPointed], () => {
    currentPage.value = 1
  })

  // Fetch transactions
  async function fetchTransactions() {
    try {
      isLoadingTransactions.value = true
      transactionsError.value = null
      transactions.value = await api.getTransactions()
    } catch (err) {
      transactionsError.value =
        err instanceof Error ? err.message : 'Failed to fetch transactions'
    } finally {
      isLoadingTransactions.value = false
    }
  }

  // Fetch categories
  async function fetchCategories() {
    try {
      allCategories.value = await api.getCategories()
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }

  // Fetch reimbursements
  async function fetchReimbursements() {
    try {
      isLoadingReimbursements.value = true
      reimbursementsError.value = null
      reimbursements.value = await api.getReimbursements()
    } catch (err) {
      reimbursementsError.value =
        err instanceof Error ? err.message : 'Failed to fetch reimbursements'
    } finally {
      isLoadingReimbursements.value = false
    }
  }

  // Open reimbursement modal
  function openReimbursementModal(tx: TransactionDto) {
    selectedTransaction.value = tx
    reimbursementForm.value = {
      personId: '',
      amount: getRemainingAmount(tx),
      categoryId: '',
      note: '',
    }
    showReimbursementModal.value = true
  }

  // Close reimbursement modal
  function closeReimbursementModal() {
    showReimbursementModal.value = false
    selectedTransaction.value = null
    reimbursementForm.value = {
      personId: '',
      amount: 0,
      categoryId: '',
      note: '',
    }
    customDivisor.value = 2
  }

  // Set amount from divisor (based on base transaction amount)
  function setAmountFromDivisor(divisor: number) {
    if (!selectedTransaction.value || divisor <= 0) return
    const baseAmount = Math.abs(selectedTransaction.value.amount)
    const calculatedAmount = Math.round((baseAmount / divisor) * 100) / 100
    const remaining = getRemainingAmount(selectedTransaction.value)
    // Cap at remaining amount if calculated exceeds it
    reimbursementForm.value.amount = Math.min(calculatedAmount, remaining)
  }

  // Apply custom divisor
  function applyCustomDivisor() {
    if (customDivisor.value > 0) {
      setAmountFromDivisor(customDivisor.value)
    }
  }

  // Create reimbursement
  async function handleCreateReimbursement() {
    if (!selectedTransaction.value || !reimbursementForm.value.personId) return

    try {
      isCreatingReimbursement.value = true
      const newReimbursement = await api.createReimbursement({
        transactionId: selectedTransaction.value.id,
        personId: reimbursementForm.value.personId,
        amount: reimbursementForm.value.amount,
        categoryId: reimbursementForm.value.categoryId || undefined,
        note: reimbursementForm.value.note || undefined,
      })
      reimbursements.value.push(newReimbursement)
      closeReimbursementModal()
    } catch (err) {
      console.error('Failed to create reimbursement:', err)
    } finally {
      isCreatingReimbursement.value = false
    }
  }

  // Delete reimbursement
  async function handleDeleteReimbursement(id: string) {
    try {
      await api.deleteReimbursement(id)
      reimbursements.value = reimbursements.value.filter(r => r.id !== id)
    } catch (err) {
      console.error('Failed to delete reimbursement:', err)
    }
  }

  // Add person
  async function handleAddPerson() {
    if (!newPersonName.value.trim()) return

    isAddingPerson.value = true
    const success = await personsStore.addPerson(
      newPersonName.value.trim(),
      newPersonEmail.value.trim() || undefined
    )

    if (success) {
      newPersonName.value = ''
      newPersonEmail.value = ''
    }
    isAddingPerson.value = false
  }

  // Show delete confirmation modal
  function showDeleteConfirmation(id: string, name: string) {
    personToDelete.value = { id, name }
  }

  // Cancel delete
  function cancelDelete() {
    personToDelete.value = null
  }

  // Confirm delete person
  async function confirmDeletePerson() {
    if (!personToDelete.value) return
    await personsStore.removePerson(personToDelete.value.id)
    personToDelete.value = null
  }

  // Start editing person
  function startEditPerson(id: string, name: string) {
    editingPersonId.value = id
    editingPersonName.value = name
  }

  // Cancel editing
  function cancelEditPerson() {
    editingPersonId.value = null
    editingPersonName.value = ''
  }

  // Save edited person
  async function saveEditPerson(id: string) {
    if (!editingPersonName.value.trim()) return

    const success = await personsStore.updatePerson(
      id,
      editingPersonName.value.trim()
    )
    if (success) {
      editingPersonId.value = null
      editingPersonName.value = ''
    }
  }

  // Format currency
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  // Format date
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  // Go to page
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  onMounted(() => {
    personsStore.fetchPersons()
    fetchTransactions()
    fetchCategories()
    fetchReimbursements()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">
          Gestion des Remboursements
        </h1>
        <p class="mt-2 text-gray-600">
          Gerez les personnes et suivez les transactions a rembourser
        </p>
      </div>

      <!-- Persons Section -->
      <div class="bg-white rounded-xl shadow-sm p-6 mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">Personnes</h2>
        </div>

        <!-- Error state for persons -->
        <div
          v-if="personsStore.error"
          class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center"
        >
          <span>{{ personsStore.error }}</span>
          <button
            class="text-red-500 hover:text-red-700"
            @click="personsStore.clearError()"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        <!-- Add person form -->
        <div class="flex flex-wrap gap-3 mb-4">
          <input
            v-model="newPersonName"
            type="text"
            placeholder="Nom de la personne"
            class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            @keyup.enter="handleAddPerson"
          />
          <input
            v-model="newPersonEmail"
            type="email"
            placeholder="Email (optionnel)"
            class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            @keyup.enter="handleAddPerson"
          />
          <button
            :disabled="!newPersonName.trim() || isAddingPerson"
            class="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
            :class="
              newPersonName.trim() && !isAddingPerson
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            "
            @click="handleAddPerson"
          >
            <svg
              v-if="isAddingPerson"
              class="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Ajouter
          </button>
        </div>

        <!-- Persons list -->
        <div
          v-if="personsStore.isLoading && personsStore.persons.length === 0"
          class="flex items-center gap-2 text-gray-500"
        >
          <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Chargement...</span>
        </div>

        <div
          v-else-if="personsStore.persons.length === 0"
          class="text-gray-500 text-sm"
        >
          Aucune personne ajoutee. Commencez par ajouter une personne ci-dessus.
        </div>

        <!-- Person cards grid -->
        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          <div
            v-for="person in personsStore.persons"
            :key="person.id"
            class="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <!-- Edit mode -->
            <div v-if="editingPersonId === person.id">
              <div class="flex items-center gap-3 mb-3">
                <!-- Avatar with first letter -->
                <div
                  class="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-semibold text-indigo-600">
                    {{ person.name.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <span class="text-sm text-gray-500">Modification en cours</span>
              </div>
              <input
                v-model="editingPersonName"
                type="text"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
                placeholder="Nom de la personne"
                @keyup.enter="saveEditPerson(person.id)"
                @keyup.escape="cancelEditPerson"
              />
              <div class="flex gap-2">
                <button
                  class="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                  @click="saveEditPerson(person.id)"
                >
                  Enregistrer
                </button>
                <button
                  class="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                  @click="cancelEditPerson"
                >
                  Annuler
                </button>
              </div>
            </div>

            <!-- Display mode -->
            <div v-else class="flex items-start gap-3">
              <!-- Avatar with first letter -->
              <div
                class="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center"
              >
                <span class="text-lg font-semibold text-indigo-600">
                  {{ person.name.charAt(0).toUpperCase() }}
                </span>
              </div>

              <!-- Name and email -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1">
                  <h3 class="font-medium text-gray-900 truncate">
                    {{ person.name }}
                  </h3>
                  <button
                    class="flex-shrink-0 p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                    title="Modifier le nom"
                    @click="startEditPerson(person.id, person.name)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                </div>
                <p
                  v-if="person.email"
                  class="text-xs text-gray-500 truncate mt-0.5"
                >
                  {{ person.email }}
                </p>
                <p v-else class="text-xs text-gray-400 italic mt-0.5">
                  Pas d'email
                </p>
              </div>

              <!-- Delete button -->
              <button
                class="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Supprimer"
                @click="showDeleteConfirmation(person.id, person.name)"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Transactions Section -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">
            Transactions Depenses
          </h2>
          <div class="text-sm text-gray-500">
            {{ filteredTransactions.length }} transaction(s)
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-4 mb-6">
          <!-- Category filter -->
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Categorie:</label>
            <select
              v-model="selectedCategory"
              class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option :value="null">Toutes</option>
              <option v-for="cat in categories" :key="cat" :value="cat">
                {{ cat }}
              </option>
            </select>
          </div>

          <!-- Not pointed filter -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              v-model="showOnlyNotPointed"
              type="checkbox"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span class="text-sm text-gray-600">Uniquement non pointees</span>
          </label>
        </div>

        <!-- Error state for transactions -->
        <div
          v-if="transactionsError"
          class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"
        >
          {{ transactionsError }}
        </div>

        <!-- Loading state -->
        <div
          v-if="isLoadingTransactions"
          class="flex justify-center items-center py-12"
        >
          <div class="flex items-center gap-3 text-gray-500">
            <svg class="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Chargement des transactions...</span>
          </div>
        </div>

        <!-- Transactions list -->
        <template v-else-if="!transactionsError">
          <div
            v-if="filteredTransactions.length === 0"
            class="text-center py-12 text-gray-500"
          >
            Aucune transaction trouvee avec les filtres actuels.
          </div>

          <div v-else>
            <!-- Table header -->
            <div
              class="hidden md:grid grid-cols-12 gap-4 px-4 py-2 bg-gray-50 rounded-t-lg text-sm font-medium text-gray-500"
            >
              <div class="col-span-2">Date</div>
              <div class="col-span-3">Description</div>
              <div class="col-span-2 text-right">Montant</div>
              <div class="col-span-2">Categorie</div>
              <div class="col-span-1 text-center">Pointe</div>
              <div class="col-span-2 text-center">Actions</div>
            </div>

            <!-- Transactions rows -->
            <div class="divide-y">
              <div
                v-for="tx in paginatedTransactions"
                :key="tx.id"
                class="px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <!-- Main row -->
                <div
                  class="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center"
                >
                  <!-- Date -->
                  <div class="col-span-2 text-sm text-gray-600">
                    {{ formatDate(tx.date) }}
                  </div>

                  <!-- Description -->
                  <div class="col-span-3 text-sm font-medium text-gray-900">
                    {{ tx.description }}
                  </div>

                  <!-- Amount -->
                  <div class="col-span-2 text-sm font-semibold text-right">
                    <span class="text-red-600">
                      {{ formatCurrency(tx.amount) }}
                    </span>
                  </div>

                  <!-- Category -->
                  <div class="col-span-2 text-sm text-gray-600">
                    <span
                      v-if="tx.categoryName"
                      class="inline-flex px-2 py-0.5 bg-gray-100 rounded-full text-xs"
                    >
                      {{ tx.categoryName }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </div>

                  <!-- Pointed status -->
                  <div class="col-span-1 flex justify-center">
                    <span
                      v-if="tx.isPointed"
                      class="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600"
                    >
                      <svg
                        class="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 text-gray-400"
                    >
                      <svg
                        class="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>

                  <!-- Actions -->
                  <div class="col-span-2 flex justify-center">
                    <button
                      v-if="getRemainingAmount(tx) > 0"
                      class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                      @click="openReimbursementModal(tx)"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Assigner
                    </button>
                    <span v-else class="text-xs text-green-600 font-medium">
                      Assigne
                    </span>
                  </div>
                </div>

                <!-- Reimbursements for this transaction -->
                <div
                  v-if="getReimbursementsForTransaction(tx.id).length > 0"
                  class="mt-2 ml-4 pl-4 border-l-2 border-amber-200"
                >
                  <div
                    v-for="reimb in getReimbursementsForTransaction(tx.id)"
                    :key="reimb.id"
                    class="flex items-center justify-between py-1 text-sm"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 text-amber-700 text-xs font-medium"
                      >
                        {{ reimb.personName.charAt(0).toUpperCase() }}
                      </span>
                      <span class="text-gray-700">{{ reimb.personName }}</span>
                      <span class="text-gray-500">:</span>
                      <span class="font-medium text-amber-700">
                        {{ formatCurrency(reimb.amount) }}
                      </span>
                      <span
                        v-if="reimb.categoryName"
                        class="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                      >
                        {{ reimb.categoryName }}
                      </span>
                    </div>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Supprimer"
                      @click="handleDeleteReimbursement(reimb.id)"
                    >
                      <svg
                        class="h-4 w-4"
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
                  <!-- Remaining amount -->
                  <div
                    v-if="getRemainingAmount(tx) > 0"
                    class="text-xs text-gray-500 mt-1"
                  >
                    Restant: {{ formatCurrency(getRemainingAmount(tx)) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div
              v-if="totalPages > 1"
              class="flex items-center justify-between mt-6 pt-4 border-t"
            >
              <div class="text-sm text-gray-500">
                Page {{ currentPage }} sur {{ totalPages }}
              </div>

              <div class="flex items-center gap-1">
                <!-- Previous button -->
                <button
                  :disabled="currentPage === 1"
                  class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                  :class="
                    currentPage === 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                  "
                  @click="goToPage(currentPage - 1)"
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
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                <!-- Page numbers -->
                <template v-for="page in visiblePages" :key="page">
                  <span
                    v-if="page < 0"
                    class="px-2 py-1.5 text-sm text-gray-400"
                  >
                    ...
                  </span>
                  <button
                    v-else
                    class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                    :class="
                      page === currentPage
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    "
                    @click="goToPage(page)"
                  >
                    {{ page }}
                  </button>
                </template>

                <!-- Next button -->
                <button
                  :disabled="currentPage === totalPages"
                  class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                  :class="
                    currentPage === totalPages
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                  "
                  @click="goToPage(currentPage + 1)"
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
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Summary Section -->
      <div
        v-if="reimbursements.length > 0"
        class="bg-white rounded-xl shadow-sm p-6 mt-8"
      >
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          Recapitulatif des Remboursements
        </h2>

        <div class="space-y-4">
          <div
            v-for="person in summaryByPerson"
            :key="person.personId"
            class="border border-gray-200 rounded-lg p-4"
          >
            <!-- Person header -->
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <div
                  class="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-semibold text-amber-700">
                    {{ person.personName.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <h3 class="font-medium text-gray-900">
                  {{ person.personName }}
                </h3>
              </div>
              <div class="text-lg font-bold text-amber-700">
                {{ formatCurrency(person.total) }}
              </div>
            </div>

            <!-- Categories breakdown -->
            <div class="ml-13 space-y-1">
              <div
                v-for="cat in person.byCategory"
                :key="cat.categoryId"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-gray-600 flex items-center gap-2">
                  <span class="w-2 h-2 bg-amber-400 rounded-full"></span>
                  {{ cat.categoryName }}
                </span>
                <span class="font-medium text-gray-700">
                  {{ formatCurrency(cat.amount) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Total -->
          <div
            class="border-t-2 border-amber-200 pt-4 flex items-center justify-between"
          >
            <span class="text-lg font-semibold text-gray-900"
              >Total General</span
            >
            <span class="text-xl font-bold text-amber-700">
              {{ formatCurrency(totalDue) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Reimbursement Modal -->
    <Teleport to="body">
      <div
        v-if="showReimbursementModal && selectedTransaction"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="closeReimbursementModal"
        />

        <!-- Modal -->
        <div
          class="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        >
          <!-- Header -->
          <h3 class="text-lg font-semibold text-gray-900 mb-4">
            Assigner un remboursement
          </h3>

          <!-- Transaction info -->
          <div class="bg-gray-50 rounded-lg p-4 mb-4">
            <div class="text-sm text-gray-600 mb-2">
              {{ formatDate(selectedTransaction.date) }} -
              {{ selectedTransaction.description }}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white rounded-lg p-2 border border-gray-200">
                <div class="text-xs text-gray-500 mb-0.5">Montant total</div>
                <div class="text-lg font-semibold text-red-600">
                  {{ formatCurrency(selectedTransaction.amount) }}
                </div>
              </div>
              <div class="bg-white rounded-lg p-2 border border-gray-200">
                <div class="text-xs text-gray-500 mb-0.5">
                  Restant a assigner
                </div>
                <div
                  class="text-lg font-semibold"
                  :class="
                    getRemainingAmount(selectedTransaction) > 0
                      ? 'text-amber-600'
                      : 'text-green-600'
                  "
                >
                  {{ formatCurrency(getRemainingAmount(selectedTransaction)) }}
                </div>
              </div>
            </div>
            <div
              v-if="
                getRemainingAmount(selectedTransaction) <
                Math.abs(selectedTransaction.amount)
              "
              class="mt-2 text-xs text-gray-500"
            >
              Deja assigne:
              {{
                formatCurrency(
                  Math.abs(selectedTransaction.amount) -
                    getRemainingAmount(selectedTransaction)
                )
              }}
            </div>
          </div>

          <!-- Form -->
          <div class="space-y-4">
            <!-- Person select -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Personne *
              </label>
              <select
                v-model="reimbursementForm.personId"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">Selectionnez une personne</option>
                <option
                  v-for="person in personsStore.persons"
                  :key="person.id"
                  :value="person.id"
                >
                  {{ person.name }}
                </option>
              </select>
            </div>

            <!-- Amount input -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Montant *
              </label>
              <input
                v-model.number="reimbursementForm.amount"
                type="number"
                step="0.01"
                min="0.01"
                :max="getRemainingAmount(selectedTransaction)"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />

              <!-- Amount shortcuts -->
              <div class="mt-2">
                <div class="text-xs text-gray-500 mb-1.5">
                  Raccourcis (base:
                  {{ formatCurrency(Math.abs(selectedTransaction.amount)) }})
                </div>
                <div class="flex flex-wrap gap-2">
                  <!-- Full amount button -->
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border transition-colors"
                    :class="
                      Math.abs(selectedTransaction.amount) <=
                      getRemainingAmount(selectedTransaction)
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    "
                    :disabled="
                      Math.abs(selectedTransaction.amount) >
                      getRemainingAmount(selectedTransaction)
                    "
                    @click="setAmountFromDivisor(1)"
                  >
                    100%
                  </button>
                  <!-- Divide by 2 -->
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border transition-colors"
                    :class="
                      Math.abs(selectedTransaction.amount) / 2 <=
                      getRemainingAmount(selectedTransaction)
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    "
                    :disabled="
                      Math.abs(selectedTransaction.amount) / 2 >
                      getRemainingAmount(selectedTransaction)
                    "
                    @click="setAmountFromDivisor(2)"
                  >
                    / 2
                  </button>
                  <!-- Divide by 3 -->
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border transition-colors"
                    :class="
                      Math.abs(selectedTransaction.amount) / 3 <=
                      getRemainingAmount(selectedTransaction)
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    "
                    :disabled="
                      Math.abs(selectedTransaction.amount) / 3 >
                      getRemainingAmount(selectedTransaction)
                    "
                    @click="setAmountFromDivisor(3)"
                  >
                    / 3
                  </button>
                  <!-- Divide by 4 -->
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border transition-colors"
                    :class="
                      Math.abs(selectedTransaction.amount) / 4 <=
                      getRemainingAmount(selectedTransaction)
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    "
                    :disabled="
                      Math.abs(selectedTransaction.amount) / 4 >
                      getRemainingAmount(selectedTransaction)
                    "
                    @click="setAmountFromDivisor(4)"
                  >
                    / 4
                  </button>

                  <!-- Custom divisor -->
                  <div class="flex items-center gap-1">
                    <span class="text-xs text-gray-500">/</span>
                    <input
                      v-model.number="customDivisor"
                      type="number"
                      min="1"
                      max="100"
                      class="w-12 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                      @keyup.enter="applyCustomDivisor"
                    />
                    <button
                      type="button"
                      class="px-2 py-1 text-xs font-medium rounded border transition-colors"
                      :class="
                        customDivisor > 0 &&
                        Math.abs(selectedTransaction.amount) / customDivisor <=
                          getRemainingAmount(selectedTransaction)
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      "
                      :disabled="
                        customDivisor <= 0 ||
                        Math.abs(selectedTransaction.amount) / customDivisor >
                          getRemainingAmount(selectedTransaction)
                      "
                      @click="applyCustomDivisor"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>

                <!-- Warning if amount exceeds remaining -->
                <div
                  v-if="
                    reimbursementForm.amount >
                    getRemainingAmount(selectedTransaction)
                  "
                  class="mt-2 text-xs text-red-600 flex items-center gap-1"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Le montant depasse le restant a assigner ({{
                    formatCurrency(getRemainingAmount(selectedTransaction))
                  }})
                </div>
              </div>
            </div>

            <!-- Category select -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Categorie (optionnel)
              </label>
              <select
                v-model="reimbursementForm.categoryId"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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

            <!-- Note input -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Note (optionnel)
              </label>
              <input
                v-model="reimbursementForm.note"
                type="text"
                placeholder="Ajouter une note..."
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>

          <!-- Buttons -->
          <div class="flex gap-3 mt-6">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              @click="closeReimbursementModal"
            >
              Annuler
            </button>
            <button
              :disabled="
                !reimbursementForm.personId ||
                reimbursementForm.amount <= 0 ||
                reimbursementForm.amount >
                  getRemainingAmount(selectedTransaction) ||
                isCreatingReimbursement
              "
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
              :class="
                reimbursementForm.personId &&
                reimbursementForm.amount > 0 &&
                reimbursementForm.amount <=
                  getRemainingAmount(selectedTransaction) &&
                !isCreatingReimbursement
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-gray-300 cursor-not-allowed'
              "
              @click="handleCreateReimbursement"
            >
              <span v-if="isCreatingReimbursement">Création...</span>
              <span v-else>Confirmer</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirmation modal -->
    <Teleport to="body">
      <div
        v-if="personToDelete"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="cancelDelete" />

        <!-- Modal -->
        <div
          class="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div
              class="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center"
            >
              <svg
                class="h-6 w-6 text-red-600"
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
          </div>

          <!-- Title -->
          <h3 class="text-lg font-semibold text-gray-900 text-center mb-2">
            Supprimer cette personne ?
          </h3>

          <!-- Message -->
          <p class="text-gray-600 text-center mb-6">
            Etes-vous sur de vouloir supprimer
            <span class="font-medium text-gray-900">{{
              personToDelete.name
            }}</span>
            ? Cette action est irreversible.
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              @click="cancelDelete"
            >
              Annuler
            </button>
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              @click="confirmDeletePerson"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { RouterLink } from 'vue-router'
  import { usePersonsStore } from '@/stores/persons'
  import { useFiltersStore } from '@/stores/filters'
  import { api } from '@/lib/api'
  import type { ReimbursementDto, SettlementDto } from '@/lib/api'
  import { usePdfExport } from '@/composables/usePdfExport'
  import SettlementModal from '@/components/settlements/SettlementModal.vue'
  import SettlementHistorySection from '@/components/settlements/SettlementHistorySection.vue'
  import SettlementDetailModal from '@/components/settlements/SettlementDetailModal.vue'

  const { exportReimbursementsToPdf } = usePdfExport()

  const personsStore = usePersonsStore()
  const filtersStore = useFiltersStore()

  // Form state for adding person
  const newPersonName = ref('')
  const newPersonEmail = ref('')
  const isAddingPerson = ref(false)

  // Edit person state
  const editingPersonId = ref<string | null>(null)
  const editingPersonName = ref('')

  // Delete confirmation modal state
  const personToDelete = ref<{ id: string; name: string } | null>(null)

  // Reimbursements state
  const reimbursements = ref<ReimbursementDto[]>([])
  const isLoadingReimbursements = ref(false)
  const reimbursementsError = ref<string | null>(null)

  // Settlements state
  const settlements = ref<SettlementDto[]>([])
  const isLoadingSettlements = ref(false)
  const settlementsError = ref<string | null>(null)

  // Settlement modal state
  const showSettlementModal = ref(false)
  const settlementModalPersonId = ref<string | null>(null)
  const settlementModalPersonName = ref<string>('')

  // Settlement detail modal state
  const showSettlementDetailModal = ref(false)
  const selectedSettlement = ref<SettlementDto | null>(null)

  // Settlement delete confirmation
  const settlementToDelete = ref<string | null>(null)

  // Summary by person
  interface CategorySummary {
    categoryId: string | null
    categoryName: string
    amount: number
    amountReceived: number
    amountRemaining: number
    reimbursements: ReimbursementDto[]
    status: 'PENDING' | 'PARTIAL' | 'COMPLETED'
  }

  interface PersonSummary {
    personId: string
    personName: string
    total: number
    totalReceived: number
    totalRemaining: number
    byCategory: CategorySummary[]
  }

  // Expand/collapse state for categories (key: "personId:categoryId")
  const expandedCategories = ref<Set<string>>(new Set())

  function toggleCategoryExpanded(personId: string, categoryId: string) {
    const key = `${personId}:${categoryId}`
    if (expandedCategories.value.has(key)) {
      expandedCategories.value.delete(key)
    } else {
      expandedCategories.value.add(key)
    }
  }

  function isCategoryExpanded(personId: string, categoryId: string): boolean {
    return expandedCategories.value.has(`${personId}:${categoryId}`)
  }

  // Transaction info cache (loaded from reimbursements)
  const transactionDescriptions = ref<Map<string, string>>(new Map())
  const transactionDates = ref<Map<string, string>>(new Map())

  function getTransactionDescription(transactionId: string): string {
    return transactionDescriptions.value.get(transactionId) || 'Transaction'
  }

  function getTransactionDate(transactionId: string): string {
    return transactionDates.value.get(transactionId) || '--/--/----'
  }

  const summaryByPerson = computed((): PersonSummary[] => {
    const map = new Map<
      string,
      {
        personId: string
        personName: string
        total: number
        totalReceived: number
        totalRemaining: number
        byCategory: Map<
          string,
          {
            categoryId: string | null
            categoryName: string
            amount: number
            amountReceived: number
            amountRemaining: number
            reimbursements: ReimbursementDto[]
          }
        >
      }
    >()

    // Only include reimbursements with remaining amount (not fully settled)
    // and exclude hidden expense categories
    reimbursements.value
      .filter(r => r.amountRemaining > 0)
      .filter(
        r =>
          !filtersStore.isExpenseCategoryGloballyHidden(
            r.categoryName || 'Sans categorie'
          )
      )
      .forEach(r => {
        if (!map.has(r.personId)) {
          map.set(r.personId, {
            personId: r.personId,
            personName: r.personName,
            total: 0,
            totalReceived: 0,
            totalRemaining: 0,
            byCategory: new Map(),
          })
        }
        const person = map.get(r.personId)!
        person.total += r.amount
        person.totalReceived += r.amountReceived
        person.totalRemaining += r.amountRemaining

        const catKey = r.categoryId || 'none'
        const catName = r.categoryName || 'Sans categorie'
        if (!person.byCategory.has(catKey)) {
          person.byCategory.set(catKey, {
            categoryId: r.categoryId,
            categoryName: catName,
            amount: 0,
            amountReceived: 0,
            amountRemaining: 0,
            reimbursements: [],
          })
        }
        const category = person.byCategory.get(catKey)!
        category.amount += r.amount
        category.amountReceived += r.amountReceived
        category.amountRemaining += r.amountRemaining
        category.reimbursements.push(r)
      })

    return Array.from(map.values()).map(p => ({
      personId: p.personId,
      personName: p.personName,
      total: p.total,
      totalReceived: p.totalReceived,
      totalRemaining: p.totalRemaining,
      byCategory: Array.from(p.byCategory.entries()).map(([, data]) => {
        let status: 'PENDING' | 'PARTIAL' | 'COMPLETED' = 'PENDING'
        if (data.amountReceived >= data.amount) {
          status = 'COMPLETED'
        } else if (data.amountReceived > 0) {
          status = 'PARTIAL'
        }
        return {
          categoryId: data.categoryId,
          categoryName: data.categoryName,
          amount: data.amount,
          amountReceived: data.amountReceived,
          amountRemaining: data.amountRemaining,
          reimbursements: data.reimbursements,
          status,
        }
      }),
    }))
  })

  // Total due (excluding hidden categories)
  const totalDue = computed(() =>
    reimbursements.value
      .filter(
        r =>
          !filtersStore.isExpenseCategoryGloballyHidden(
            r.categoryName || 'Sans categorie'
          )
      )
      .reduce((sum, r) => sum + r.amountRemaining, 0)
  )

  // Fetch reimbursements (with transaction info)
  async function fetchReimbursements() {
    try {
      isLoadingReimbursements.value = true
      reimbursementsError.value = null
      const data = await api.getReimbursements()
      reimbursements.value = data
    } catch (err) {
      reimbursementsError.value =
        err instanceof Error ? err.message : 'Failed to fetch reimbursements'
    } finally {
      isLoadingReimbursements.value = false
    }
  }

  // Fetch settlements
  async function fetchSettlements() {
    try {
      isLoadingSettlements.value = true
      settlementsError.value = null
      settlements.value = await api.getSettlements()
    } catch (err) {
      settlementsError.value =
        err instanceof Error ? err.message : 'Failed to fetch settlements'
    } finally {
      isLoadingSettlements.value = false
    }
  }

  // Get pending reimbursements by category for a specific person
  function getPendingByCategoryForPerson(personId: string): Map<
    string | null,
    {
      categoryId: string | null
      categoryName: string
      amount: number
      reimbursements: ReimbursementDto[]
    }
  > {
    const result = new Map<
      string | null,
      {
        categoryId: string | null
        categoryName: string
        amount: number
        reimbursements: ReimbursementDto[]
      }
    >()

    // Only include reimbursements with remaining amount and exclude hidden categories
    reimbursements.value
      .filter(r => r.personId === personId && r.amountRemaining > 0)
      .filter(
        r =>
          !filtersStore.isExpenseCategoryGloballyHidden(
            r.categoryName || 'Sans categorie'
          )
      )
      .forEach(r => {
        const catKey = r.categoryId
        const catName = r.categoryName || 'Sans categorie'

        if (!result.has(catKey)) {
          result.set(catKey, {
            categoryId: r.categoryId,
            categoryName: catName,
            amount: 0,
            reimbursements: [],
          })
        }

        const category = result.get(catKey)!
        category.amount += r.amountRemaining
        category.reimbursements.push(r)
      })

    return result
  }

  // Open settlement modal for a person
  function openSettlementModal(personId: string, personName: string) {
    settlementModalPersonId.value = personId
    settlementModalPersonName.value = personName
    showSettlementModal.value = true
  }

  // Handle settlement created
  async function handleSettlementCreated(settlement: SettlementDto) {
    settlements.value.unshift(settlement)
    // Refresh reimbursements to get updated amounts
    await fetchReimbursements()
  }

  // View settlement details
  function viewSettlementDetails(settlement: SettlementDto) {
    selectedSettlement.value = settlement
    showSettlementDetailModal.value = true
  }

  // Close settlement detail modal
  function closeSettlementDetailModal() {
    showSettlementDetailModal.value = false
    selectedSettlement.value = null
  }

  // Request settlement deletion
  function requestDeleteSettlement(settlementId: string) {
    settlementToDelete.value = settlementId
  }

  // Cancel settlement deletion
  function cancelDeleteSettlement() {
    settlementToDelete.value = null
  }

  // Confirm delete settlement
  async function confirmDeleteSettlement() {
    if (!settlementToDelete.value) return

    const idToDelete = settlementToDelete.value
    settlementToDelete.value = null
    showSettlementDetailModal.value = false
    selectedSettlement.value = null

    try {
      await api.deleteSettlement(idToDelete)
      settlements.value = settlements.value.filter(s => s.id !== idToDelete)
      // Refresh reimbursements to restore amounts
      await fetchReimbursements()
    } catch (err) {
      console.error('Failed to delete settlement:', err)
    }
  }

  // Handle delete from detail modal
  function handleDeleteFromDetailModal() {
    if (selectedSettlement.value) {
      requestDeleteSettlement(selectedSettlement.value.id)
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
    const idToDelete = personToDelete.value.id
    personToDelete.value = null // Close modal immediately
    await personsStore.removePerson(idToDelete)
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

  onMounted(() => {
    personsStore.fetchPersons()
    fetchReimbursements()
    fetchSettlements()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8"
      >
        <div>
          <h1
            class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
          >
            Remboursements
          </h1>
          <p
            class="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400"
          >
            Gerez les personnes et suivez les remboursements en cours
          </p>
        </div>
        <RouterLink
          to="/transactions"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors min-h-[44px] sm:min-h-0 w-full sm:w-auto"
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          Voir les transactions
        </RouterLink>
      </div>

      <!-- Persons Section -->
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
      >
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Personnes
        </h2>

        <!-- Error state for persons -->
        <div
          v-if="personsStore.error"
          class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 mb-4"
        >
          {{ personsStore.error }}
        </div>

        <!-- Add person form -->
        <form
          class="flex flex-wrap gap-3 mb-6"
          @submit.prevent="handleAddPerson"
        >
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="newPersonName"
              type="text"
              placeholder="Nom de la personne"
              class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-amber-500 dark:focus:border-amber-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              :disabled="isAddingPerson"
            />
          </div>
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="newPersonEmail"
              type="email"
              placeholder="Email (optionnel)"
              class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 focus:border-amber-500 dark:focus:border-amber-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              :disabled="isAddingPerson"
            />
          </div>
          <button
            type="submit"
            :disabled="!newPersonName.trim() || isAddingPerson"
            class="px-6 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            :class="
              newPersonName.trim() && !isAddingPerson
                ? 'bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600'
                : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
            "
          >
            <span v-if="isAddingPerson">Ajout...</span>
            <span v-else>Ajouter</span>
          </button>
        </form>

        <!-- Persons list -->
        <div
          v-if="personsStore.loading"
          class="flex justify-center items-center py-8"
        >
          <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
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
        </div>

        <!-- Person cards grid -->
        <div
          v-else-if="personsStore.persons.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <div
            v-for="person in personsStore.persons"
            :key="person.id"
            class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700"
          >
            <!-- Edit mode -->
            <template v-if="editingPersonId === person.id">
              <div class="flex items-center gap-2">
                <!-- Avatar with first letter -->
                <div
                  class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"
                >
                  <span
                    class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                  >
                    {{ person.name.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <input
                  v-model="editingPersonName"
                  type="text"
                  class="flex-1 px-3 py-1.5 border border-amber-300 dark:border-amber-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  @keyup.enter="saveEditPerson(person.id)"
                  @keyup.escape="cancelEditPerson"
                />
                <button
                  class="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                  @click="saveEditPerson(person.id)"
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
                <button
                  class="p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  @click="cancelEditPerson"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </template>
            <!-- Display mode -->
            <template v-else>
              <div class="flex items-start gap-3">
                <!-- Avatar with first letter -->
                <div
                  class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"
                >
                  <span
                    class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                  >
                    {{ person.name.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <!-- Name and email -->
                <div class="flex-1 min-w-0">
                  <button
                    class="text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-amber-600 dark:hover:text-amber-400 truncate block w-full"
                    @click="startEditPerson(person.id, person.name)"
                  >
                    {{ person.name }}
                  </button>
                  <p
                    class="text-xs text-gray-500 dark:text-gray-400 truncate"
                    :title="person.email || 'Pas d\'email'"
                  >
                    {{ person.email || "Pas d'email" }}
                  </p>
                </div>
                <!-- Delete button -->
                <button
                  class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
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
            </template>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
          Aucune personne ajoutee. Commencez par ajouter une personne ci-dessus.
        </div>
      </div>

      <!-- Summary Section -->
      <div
        v-if="reimbursements.length > 0"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6 mt-8"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recapitulatif des Remboursements
          </h2>
          <button
            class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            @click="
              exportReimbursementsToPdf(
                summaryByPerson,
                totalDue,
                getTransactionDescription,
                getTransactionDate
              )
            "
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export PDF
          </button>
        </div>

        <div class="space-y-4">
          <div
            v-for="person in summaryByPerson"
            :key="person.personId"
            class="border border-gray-200 dark:border-slate-700 rounded-lg p-4"
          >
            <!-- Person header -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <div
                  class="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center"
                >
                  <span
                    class="text-lg font-semibold text-amber-700 dark:text-amber-400"
                  >
                    {{ person.personName.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <div>
                  <h3 class="font-medium text-gray-900 dark:text-gray-100">
                    {{ person.personName }}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Recu: {{ formatCurrency(person.totalReceived) }} | En
                    attente: {{ formatCurrency(person.totalRemaining) }}
                  </p>
                </div>
              </div>
              <div class="text-lg font-bold text-amber-700 dark:text-amber-400">
                {{ formatCurrency(person.total) }}
              </div>
            </div>

            <!-- Categories breakdown -->
            <div class="mt-3 space-y-1">
              <div
                v-for="cat in person.byCategory"
                :key="cat.categoryId ?? 'none'"
              >
                <!-- Category header - clickable -->
                <button
                  class="w-full flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded transition-colors text-sm min-h-[44px] sm:min-h-0"
                  @click="
                    toggleCategoryExpanded(
                      person.personId,
                      cat.categoryId ?? 'none'
                    )
                  "
                >
                  <span
                    class="text-gray-600 dark:text-gray-400 flex items-center gap-1.5 sm:gap-2 flex-wrap"
                  >
                    <svg
                      class="w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform duration-200 shrink-0"
                      :class="{
                        'rotate-90': isCategoryExpanded(
                          person.personId,
                          cat.categoryId ?? 'none'
                        ),
                      }"
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
                    <span class="truncate">{{ cat.categoryName }}</span>
                    <span
                      class="text-xs text-gray-400 dark:text-gray-500 shrink-0"
                      >({{ cat.reimbursements.length }})</span
                    >
                    <!-- Status badge -->
                    <span
                      v-if="cat.status === 'COMPLETED'"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shrink-0"
                    >
                      Regle
                    </span>
                    <span
                      v-else-if="cat.status === 'PARTIAL'"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0"
                    >
                      Partiel
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 shrink-0"
                    >
                      En attente
                    </span>
                  </span>
                  <span
                    class="font-medium text-gray-700 dark:text-gray-300 shrink-0 ml-2"
                  >
                    {{ formatCurrency(cat.amountRemaining) }}
                  </span>
                </button>

                <!-- Transaction details - collapsible -->
                <div
                  class="transition-all duration-200 ease-in-out overflow-hidden"
                  :class="
                    isCategoryExpanded(
                      person.personId,
                      cat.categoryId ?? 'none'
                    )
                      ? 'max-h-[500px] opacity-100'
                      : 'max-h-0 opacity-0'
                  "
                >
                  <div class="ml-3 sm:ml-5 mt-1 mb-2 space-y-1">
                    <div
                      v-for="r in cat.reimbursements"
                      :key="r.id"
                      class="flex flex-col sm:flex-row sm:justify-between text-xs text-gray-500 dark:text-gray-400 py-1.5 sm:py-1 pl-3 border-l-2 border-amber-200 dark:border-amber-700"
                    >
                      <span class="truncate">
                        {{ getTransactionDescription(r.transactionId) }}
                      </span>
                      <span
                        class="font-medium whitespace-nowrap mt-0.5 sm:mt-0 sm:ml-2"
                      >
                        {{ formatCurrency(r.amountRemaining) }}
                        <span
                          v-if="r.amountReceived > 0"
                          class="text-emerald-600 dark:text-emerald-400 ml-1"
                        >
                          (recu: {{ formatCurrency(r.amountReceived) }})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Settlement button -->
            <div
              v-if="person.totalRemaining > 0"
              class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700"
            >
              <button
                type="button"
                class="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                @click="openSettlementModal(person.personId, person.personName)"
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Enregistrer un reglement ({{
                  formatCurrency(person.totalRemaining)
                }}
                en attente)
              </button>
            </div>
          </div>

          <!-- Total -->
          <div
            class="border-t-2 border-amber-200 dark:border-amber-700 pt-4 flex items-center justify-between"
          >
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >Total General</span
            >
            <span class="text-xl font-bold text-amber-700 dark:text-amber-400">
              {{ formatCurrency(totalDue) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Empty state for reimbursements -->
      <div
        v-else-if="!isLoadingReimbursements && reimbursements.length === 0"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-8 mt-8 text-center"
      >
        <div
          class="h-16 w-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="h-8 w-8 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Aucun remboursement en cours
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-4">
          Assignez des remboursements aux transactions depuis la page
          Transactions.
        </p>
        <RouterLink
          to="/transactions"
          class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600 rounded-lg transition-colors"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Aller aux transactions
        </RouterLink>
      </div>

      <!-- Settlement History Section -->
      <SettlementHistorySection
        v-if="settlements.length > 0 || isLoadingSettlements"
        :settlements="settlements"
        :is-loading="isLoadingSettlements"
        class="mt-8"
        @delete="requestDeleteSettlement"
        @view-details="viewSettlementDetails"
      />
    </div>

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
          class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div
              class="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"
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
          </div>

          <!-- Title -->
          <h3
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2"
          >
            Supprimer cette personne ?
          </h3>

          <!-- Message -->
          <p class="text-gray-600 dark:text-gray-400 text-center mb-6">
            Etes-vous sur de vouloir supprimer
            <span class="font-medium text-gray-900 dark:text-gray-100">{{
              personToDelete.name
            }}</span>
            ? Cette action est irreversible.
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              @click="cancelDelete"
            >
              Annuler
            </button>
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 rounded-lg transition-colors"
              @click="confirmDeletePerson"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Settlement Modal -->
    <SettlementModal
      :is-open="showSettlementModal"
      :person-id="settlementModalPersonId ?? ''"
      :person-name="settlementModalPersonName"
      :pending-by-category="
        getPendingByCategoryForPerson(settlementModalPersonId ?? '')
      "
      @close="showSettlementModal = false"
      @confirm="handleSettlementCreated"
    />

    <!-- Settlement Detail Modal -->
    <SettlementDetailModal
      :is-open="showSettlementDetailModal"
      :settlement="selectedSettlement"
      @close="closeSettlementDetailModal"
      @delete="handleDeleteFromDetailModal"
    />

    <!-- Settlement delete confirmation modal -->
    <Teleport to="body">
      <div
        v-if="settlementToDelete"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="cancelDeleteSettlement"
        />

        <!-- Modal -->
        <div
          class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div
              class="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"
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
          </div>

          <!-- Title -->
          <h3
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2"
          >
            Annuler ce reglement ?
          </h3>

          <!-- Message -->
          <p class="text-gray-600 dark:text-gray-400 text-center mb-6">
            Cette action va annuler le reglement et restaurer les montants en
            attente sur les remboursements associes.
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              @click="cancelDeleteSettlement"
            >
              Non, conserver
            </button>
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 rounded-lg transition-colors"
              @click="confirmDeleteSettlement"
            >
              Oui, annuler
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

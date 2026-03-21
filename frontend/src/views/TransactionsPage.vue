<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { usePersonsStore } from '@/stores/persons'
  import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'
  import { api } from '@/lib/api'
  import type {
    TransactionDto,
    ReimbursementDto,
    CategoryDto,
    PaginationMeta,
  } from '@/lib/api'

  const personsStore = usePersonsStore()
  const categoryAssociationsStore = useCategoryAssociationsStore()

  // Transactions state
  const transactions = ref<TransactionDto[]>([])
  const isLoadingTransactions = ref(false)
  const transactionsError = ref<string | null>(null)
  const transactionsMeta = ref<PaginationMeta | null>(null)

  // Categories state
  const allCategories = ref<CategoryDto[]>([])

  // Reimbursements state (for checking if transaction is assigned)
  const reimbursements = ref<ReimbursementDto[]>([])

  // Selection state
  const isSelectionMode = ref(false)
  const selectedIds = ref<Set<string>>(new Set())

  // LocalStorage key for filters
  const FILTERS_STORAGE_KEY = 'transactions-filters'

  // Load saved filters from localStorage
  function loadSavedFilters(): {
    typeFilter: 'ALL' | 'EXPENSE' | 'INCOME'
    selectedCategory: string | null
    showOnlyNotPointed: boolean
  } {
    try {
      const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          typeFilter: parsed.typeFilter ?? 'ALL',
          selectedCategory: parsed.selectedCategory ?? null,
          showOnlyNotPointed: parsed.showOnlyNotPointed ?? false,
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      typeFilter: 'ALL',
      selectedCategory: null,
      showOnlyNotPointed: false,
    }
  }

  const savedFilters = loadSavedFilters()

  // Filters
  const typeFilter = ref<'ALL' | 'EXPENSE' | 'INCOME'>(savedFilters.typeFilter)
  const selectedCategory = ref<string | null>(savedFilters.selectedCategory)
  const showOnlyNotPointed = ref(savedFilters.showOnlyNotPointed)

  // Save filters to localStorage
  function saveFilters() {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        typeFilter: typeFilter.value,
        selectedCategory: selectedCategory.value,
        showOnlyNotPointed: showOnlyNotPointed.value,
      })
    )
  }

  // Reset all filters
  function resetFilters() {
    typeFilter.value = 'ALL'
    selectedCategory.value = null
    showOnlyNotPointed.value = false
    localStorage.removeItem(FILTERS_STORAGE_KEY)
  }

  // Check if any filter is active
  const hasActiveFilters = computed(() => {
    return (
      typeFilter.value !== 'ALL' ||
      selectedCategory.value !== null ||
      showOnlyNotPointed.value
    )
  })

  // Pagination
  const currentPage = ref(1)
  const pageSize = 20

  // Inline editing state
  const editingNoteId = ref<string | null>(null)
  const editingNoteValue = ref('')
  const editingCategoryId = ref<string | null>(null)

  // Bulk category change modal
  const showBulkCategoryModal = ref(false)
  const bulkCategoryId = ref<string | null>(null)
  const isBulkUpdating = ref(false)

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

  // Mobile: expanded reimbursements state
  const expandedReimbursementsTxId = ref<string | null>(null)

  function toggleReimbursementsExpand(txId: string) {
    if (expandedReimbursementsTxId.value === txId) {
      expandedReimbursementsTxId.value = null
    } else {
      expandedReimbursementsTxId.value = txId
    }
  }

  // Get reimbursement summary for compact display
  function getReimbursementSummary(txId: string): {
    count: number
    totalAmount: number
    allCompleted: boolean
    firstPersonName: string
  } {
    const reimbs = getReimbursementsForTransaction(txId)
    const totalAmount = reimbs.reduce((sum, r) => sum + r.amount, 0)
    const allCompleted = reimbs.every(r => r.status === 'COMPLETED')
    return {
      count: reimbs.length,
      totalAmount,
      allCompleted,
      firstPersonName: reimbs[0]?.personName ?? '',
    }
  }

  // Computed: filtered categories based on type filter
  const filteredCategories = computed(() => {
    if (typeFilter.value === 'ALL') {
      return [...allCategories.value].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    }
    return allCategories.value
      .filter(c => c.type === typeFilter.value)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  // Computed: income categories for reimbursement dropdown (only associated ones)
  const incomeCategories = computed(() => {
    return allCategories.value.filter(
      c =>
        c.type === 'INCOME' &&
        categoryAssociationsStore.associatedIncomeCategoryNames.has(c.name)
    )
  })

  // Computed: total pages
  const totalPages = computed(() => {
    return transactionsMeta.value?.totalPages ?? 0
  })

  // Computed: total transactions count
  const totalTransactions = computed(() => {
    return transactionsMeta.value?.total ?? 0
  })

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

  // Computed: selection state
  const isAllSelected = computed(() => {
    if (transactions.value.length === 0) return false
    return transactions.value.every(tx => selectedIds.value.has(tx.id))
  })

  const isPartiallySelected = computed(() => {
    return selectedIds.value.size > 0 && !isAllSelected.value
  })

  const selectedCount = computed(() => selectedIds.value.size)

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

  // Selection functions
  function toggleSelection(id: string) {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet
  }

  function toggleSelectAll() {
    if (isAllSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(transactions.value.map(tx => tx.id))
    }
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function toggleSelectionMode() {
    isSelectionMode.value = !isSelectionMode.value
    if (!isSelectionMode.value) {
      selectedIds.value = new Set()
    }
  }

  function exitSelectionMode() {
    isSelectionMode.value = false
    selectedIds.value = new Set()
  }

  // Inline note editing
  function startEditNote(tx: TransactionDto) {
    editingNoteId.value = tx.id
    editingNoteValue.value = tx.note ?? ''
  }

  function cancelEditNote() {
    editingNoteId.value = null
    editingNoteValue.value = ''
  }

  async function saveNote(tx: TransactionDto) {
    if (editingNoteValue.value === (tx.note ?? '')) {
      cancelEditNote()
      return
    }

    try {
      const updated = await api.updateTransaction(tx.id, {
        note: editingNoteValue.value || undefined,
      })
      const index = transactions.value.findIndex(t => t.id === tx.id)
      if (index !== -1) {
        transactions.value[index] = updated
      }
      cancelEditNote()
    } catch (err) {
      console.error('Failed to update note:', err)
    }
  }

  // Inline category editing
  function startEditCategory(tx: TransactionDto) {
    editingCategoryId.value = tx.id
  }

  function cancelEditCategory() {
    editingCategoryId.value = null
  }

  async function saveCategory(tx: TransactionDto, newCategoryId: string) {
    if (newCategoryId === tx.categoryId) {
      cancelEditCategory()
      return
    }

    try {
      const updated = await api.updateTransaction(tx.id, {
        categoryId: newCategoryId || undefined,
      })
      const index = transactions.value.findIndex(t => t.id === tx.id)
      if (index !== -1) {
        transactions.value[index] = updated
      }
      cancelEditCategory()
    } catch (err) {
      console.error('Failed to update category:', err)
    }
  }

  // Toggle pointed status
  async function togglePointed(tx: TransactionDto) {
    try {
      const updated = await api.updateTransaction(tx.id, {
        isPointed: !tx.isPointed,
      })
      const index = transactions.value.findIndex(t => t.id === tx.id)
      if (index !== -1) {
        transactions.value[index] = updated
      }
    } catch (err) {
      console.error('Failed to toggle pointed:', err)
    }
  }

  // Bulk actions
  async function bulkTogglePointed(pointed: boolean) {
    if (selectedIds.value.size === 0) return

    try {
      isBulkUpdating.value = true
      await api.bulkUpdateTransactions([...selectedIds.value], {
        isPointed: pointed,
      })
      // Refresh transactions to get updated data
      await fetchTransactions()
      exitSelectionMode()
    } catch (err) {
      console.error('Failed to bulk update pointed:', err)
    } finally {
      isBulkUpdating.value = false
    }
  }

  function openBulkCategoryModal() {
    bulkCategoryId.value = null
    showBulkCategoryModal.value = true
  }

  async function applyBulkCategory() {
    if (selectedIds.value.size === 0 || !bulkCategoryId.value) return

    try {
      isBulkUpdating.value = true
      await api.bulkUpdateTransactions([...selectedIds.value], {
        categoryId: bulkCategoryId.value,
      })
      await fetchTransactions()
      exitSelectionMode()
      showBulkCategoryModal.value = false
    } catch (err) {
      console.error('Failed to bulk update category:', err)
    } finally {
      isBulkUpdating.value = false
    }
  }

  // Refetch when filters change (reset to page 1)
  watch([typeFilter, selectedCategory, showOnlyNotPointed], () => {
    saveFilters()
    const wasOnPage1 = currentPage.value === 1
    currentPage.value = 1
    if (wasOnPage1) {
      fetchTransactions()
    }
  })

  // Refetch when page changes
  watch(currentPage, (newPage, oldPage) => {
    if (newPage !== oldPage) {
      fetchTransactions()
    }
  })

  // Fetch transactions
  async function fetchTransactions() {
    try {
      isLoadingTransactions.value = true
      transactionsError.value = null

      const response = await api.getTransactions({
        page: currentPage.value,
        limit: pageSize,
        type: typeFilter.value === 'ALL' ? undefined : typeFilter.value,
        categoryId: selectedCategory.value || undefined,
        isPointed: showOnlyNotPointed.value ? false : undefined,
      })
      transactions.value = response.data
      transactionsMeta.value = response.meta
      // Clear selection on page change
      clearSelection()
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
      reimbursements.value = await api.getReimbursements()
    } catch (err) {
      console.error('Failed to fetch reimbursements:', err)
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

  // Set amount from divisor
  function setAmountFromDivisor(divisor: number) {
    if (!selectedTransaction.value || divisor <= 0) return
    const baseAmount = Math.abs(selectedTransaction.value.amount)
    const calculatedAmount = Math.round((baseAmount / divisor) * 100) / 100
    const remaining = getRemainingAmount(selectedTransaction.value)
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
    categoryAssociationsStore.load()
    fetchTransactions()
    fetchCategories()
    fetchReimbursements()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Transactions
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Gerez vos transactions, modifiez les categories et assignez des
          remboursements
        </p>
      </div>

      <!-- Filters -->
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 mb-6"
      >
        <div
          class="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-4 md:items-center"
        >
          <!-- Filters row 1: Type + Category (side by side on mobile) -->
          <div class="grid grid-cols-2 gap-3 md:contents">
            <!-- Type filter -->
            <div
              class="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
            >
              <label class="text-xs md:text-sm text-gray-600 dark:text-gray-400"
                >Type:</label
              >
              <select
                v-model="typeFilter"
                class="w-full md:w-auto px-3 py-2 md:py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              >
                <option value="ALL">Toutes</option>
                <option value="EXPENSE">Depenses</option>
                <option value="INCOME">Revenus</option>
              </select>
            </div>

            <!-- Category filter -->
            <div
              class="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
            >
              <label class="text-xs md:text-sm text-gray-600 dark:text-gray-400"
                >Categorie:</label
              >
              <select
                v-model="selectedCategory"
                class="w-full md:w-auto px-3 py-2 md:py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              >
                <option :value="null">Toutes</option>
                <option
                  v-for="cat in filteredCategories"
                  :key="cat.id"
                  :value="cat.id"
                >
                  {{ cat.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Not pointed filter -->
          <label class="flex items-center gap-2 cursor-pointer py-1 md:py-0">
            <input
              v-model="showOnlyNotPointed"
              type="checkbox"
              class="h-5 w-5 md:h-4 md:w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400"
              >Uniquement non pointees</span
            >
          </label>

          <!-- Transaction count and actions (separate row on mobile) -->
          <div
            class="flex items-center justify-between gap-2 pt-3 border-t border-gray-200 dark:border-slate-700 md:border-0 md:pt-0 md:ml-auto md:gap-4"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ totalTransactions }} transaction(s)
            </span>

            <div class="flex items-center gap-2">
              <!-- Reset filters button -->
              <button
                v-if="hasActiveFilters"
                class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-2 md:px-3 md:py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                @click="resetFilters"
              >
                <svg
                  class="h-5 w-5 md:h-4 md:w-4"
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
                <span class="hidden md:inline md:ml-1.5">Reinitialiser</span>
              </button>
              <!-- Selection mode toggle -->
              <button
                class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-2 md:px-3 md:py-1.5 text-sm font-medium rounded-lg transition-colors"
                :class="
                  isSelectionMode
                    ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700'
                    : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600'
                "
                @click="toggleSelectionMode"
              >
                <svg
                  class="h-5 w-5 md:h-4 md:w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                <span class="hidden md:inline md:ml-1.5">{{
                  isSelectionMode
                    ? 'Mode selection actif'
                    : 'Selection multiple'
                }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bulk Actions Bar - Desktop (inline) -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="isSelectionMode"
          class="hidden md:flex bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4 mb-6 items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <span
              class="text-sm font-medium text-indigo-700 dark:text-indigo-300"
            >
              {{ selectedCount }} transaction(s) selectionnee(s)
            </span>
            <button
              class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
              @click="exitSelectionMode"
            >
              Quitter la selection
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              :disabled="isBulkUpdating"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
              @click="bulkTogglePointed(true)"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
              Pointer
            </button>
            <button
              :disabled="isBulkUpdating"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
              @click="bulkTogglePointed(false)"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              Depointer
            </button>
            <button
              :disabled="isBulkUpdating"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
              @click="openBulkCategoryModal"
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
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              Changer categorie
            </button>
          </div>
        </div>
      </Transition>

      <!-- Bulk Actions Bar - Mobile (fixed bottom) -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-full"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-full"
        >
          <div
            v-if="isSelectionMode"
            class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-indigo-50 dark:bg-indigo-900/50 border-t border-indigo-200 dark:border-indigo-700 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span
                  class="text-sm font-medium text-indigo-700 dark:text-indigo-300"
                >
                  {{ selectedCount }} select.
                </span>
                <button
                  class="text-sm text-indigo-600 dark:text-indigo-400 underline"
                  @click="exitSelectionMode"
                >
                  Annuler
                </button>
              </div>

              <div class="flex items-center gap-1">
                <button
                  :disabled="isBulkUpdating"
                  class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg disabled:opacity-50"
                  title="Pointer"
                  @click="bulkTogglePointed(true)"
                >
                  <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  :disabled="isBulkUpdating"
                  class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
                  title="Depointer"
                  @click="bulkTogglePointed(false)"
                >
                  <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  :disabled="isBulkUpdating"
                  class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded-lg disabled:opacity-50"
                  title="Changer categorie"
                  @click="openBulkCategoryModal"
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
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Transactions Table -->
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 overflow-hidden"
      >
        <!-- Error state -->
        <div
          v-if="transactionsError"
          class="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
        >
          {{ transactionsError }}
        </div>

        <!-- Loading state -->
        <div
          v-if="isLoadingTransactions"
          class="flex justify-center items-center py-12"
        >
          <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
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

        <!-- Table -->
        <template v-else-if="!transactionsError">
          <div
            v-if="transactions.length === 0"
            class="text-center py-12 text-gray-500 dark:text-gray-400"
          >
            Aucune transaction trouvee avec les filtres actuels.
          </div>

          <div v-else>
            <!-- Table header -->
            <div
              class="hidden md:grid gap-2 px-4 py-3 bg-gray-50 dark:bg-slate-800 text-sm font-medium text-gray-500 dark:text-gray-400 border-b dark:border-slate-700"
              :class="isSelectionMode ? 'grid-cols-12' : 'grid-cols-11'"
            >
              <div v-if="isSelectionMode" class="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  :indeterminate="isPartiallySelected"
                  class="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                  @change="toggleSelectAll"
                />
              </div>
              <div class="col-span-1">Date</div>
              <div class="col-span-3">Description</div>
              <div class="col-span-2">Note</div>
              <div class="col-span-1 text-right">Montant</div>
              <div class="col-span-2">Categorie</div>
              <div class="col-span-1 text-center">Pointe</div>
              <div class="col-span-1 text-center">Actions</div>
            </div>

            <!-- Transactions rows -->
            <div class="divide-y dark:divide-slate-700">
              <div
                v-for="tx in transactions"
                :key="tx.id"
                class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                :class="{
                  'bg-indigo-50/50 dark:bg-indigo-900/10':
                    isSelectionMode && selectedIds.has(tx.id),
                }"
              >
                <!-- ==================== MOBILE CARD LAYOUT ==================== -->
                <div class="block md:hidden">
                  <!-- Checkbox row (selection mode) -->
                  <div
                    v-if="isSelectionMode"
                    class="flex items-center gap-3 mb-3 pb-2 border-b border-gray-100 dark:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(tx.id)"
                      class="h-5 w-5 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                      @change="toggleSelection(tx.id)"
                    />
                    <span class="text-sm text-gray-500 dark:text-gray-400"
                      >Selectionner cette transaction</span
                    >
                  </div>

                  <!-- Row 1: Date + Amount -->
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{
                      formatDate(tx.date)
                    }}</span>
                    <span
                      class="text-base font-semibold"
                      :class="
                        tx.type === 'EXPENSE'
                          ? 'text-red-600 dark:text-red-500'
                          : 'text-green-600 dark:text-green-500'
                      "
                    >
                      {{ formatCurrency(tx.amount) }}
                    </span>
                  </div>

                  <!-- Row 2: Description -->
                  <div
                    class="text-base font-medium text-gray-900 dark:text-gray-100 truncate mb-2"
                  >
                    {{ tx.description }}
                  </div>

                  <!-- Row 3: Category + Pointed + Actions -->
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <!-- Category badge (clickable) -->
                      <button
                        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors"
                        :class="
                          tx.categoryName
                            ? tx.type === 'EXPENSE'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                        "
                        @click="startEditCategory(tx)"
                      >
                        {{ tx.categoryName || 'Sans categorie' }}
                        <svg
                          class="h-3 w-3 opacity-50"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      <!-- Pointed indicator -->
                      <button
                        class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 p-2 rounded-full transition-colors"
                        :class="
                          tx.isPointed
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-gray-400 dark:text-gray-500'
                        "
                        :title="tx.isPointed ? 'Depointer' : 'Pointer'"
                        @click="togglePointed(tx)"
                      >
                        <svg
                          v-if="tx.isPointed"
                          class="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        <svg
                          v-else
                          class="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>

                    <!-- Action button (assign reimbursement) -->
                    <button
                      v-if="tx.type === 'EXPENSE' && getRemainingAmount(tx) > 0"
                      class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                      @click="openReimbursementModal(tx)"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>
                    <span
                      v-else-if="tx.type === 'EXPENSE'"
                      class="text-xs text-green-600 dark:text-green-400 font-medium px-2"
                    >
                      Assigne
                    </span>
                  </div>

                  <!-- Note section (mobile) -->
                  <div
                    v-if="tx.note || editingNoteId === tx.id"
                    class="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700"
                  >
                    <template v-if="editingNoteId === tx.id">
                      <div class="flex items-center gap-2">
                        <input
                          v-model="editingNoteValue"
                          type="text"
                          class="flex-1 px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                          placeholder="Ajouter une note..."
                          @keyup.enter="saveNote(tx)"
                          @keyup.escape="cancelEditNote"
                        />
                        <button
                          class="min-h-[44px] min-w-[44px] p-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg"
                          @click="saveNote(tx)"
                        >
                          <svg
                            class="h-5 w-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          class="min-h-[44px] min-w-[44px] p-2 text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-700 rounded-lg"
                          @click="cancelEditNote"
                        >
                          <svg
                            class="h-5 w-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <button
                        class="w-full text-left text-sm text-gray-500 dark:text-gray-400 py-1"
                        @click="startEditNote(tx)"
                      >
                        <span class="italic">{{ tx.note }}</span>
                      </button>
                    </template>
                  </div>

                  <!-- Add note button if no note -->
                  <button
                    v-if="!tx.note && editingNoteId !== tx.id"
                    class="mt-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    @click="startEditNote(tx)"
                  >
                    + Ajouter une note
                  </button>

                  <!-- Category edit dropdown (mobile) -->
                  <div v-if="editingCategoryId === tx.id" class="mt-2">
                    <select
                      :value="tx.categoryId ?? ''"
                      class="w-full px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                      @change="
                        saveCategory(
                          tx,
                          ($event.target as HTMLSelectElement).value
                        )
                      "
                      @blur="cancelEditCategory"
                    >
                      <option value="">Sans categorie</option>
                      <option
                        v-for="cat in allCategories.filter(
                          c => c.type === tx.type
                        )"
                        :key="cat.id"
                        :value="cat.id"
                      >
                        {{ cat.name }}
                      </option>
                    </select>
                  </div>

                  <!-- Reimbursements (mobile) - Compact version -->
                  <div
                    v-if="
                      tx.type === 'EXPENSE' &&
                      getReimbursementsForTransaction(tx.id).length > 0
                    "
                    class="mt-2"
                  >
                    <!-- Compact summary badge (clickable to expand) -->
                    <button
                      class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors"
                      :class="
                        getReimbursementSummary(tx.id).allCompleted
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      "
                      @click="toggleReimbursementsExpand(tx.id)"
                    >
                      <div class="flex items-center gap-2">
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
                            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                        <span class="text-xs font-medium">
                          <template
                            v-if="getReimbursementSummary(tx.id).count === 1"
                          >
                            {{ getReimbursementSummary(tx.id).firstPersonName }}
                          </template>
                          <template v-else>
                            {{ getReimbursementSummary(tx.id).count }} remb.
                          </template>
                        </span>
                        <span class="text-xs font-semibold">
                          {{
                            formatCurrency(
                              getReimbursementSummary(tx.id).totalAmount
                            )
                          }}
                        </span>
                        <span
                          v-if="getRemainingAmount(tx) > 0"
                          class="text-xs opacity-75"
                        >
                          (reste {{ formatCurrency(getRemainingAmount(tx)) }})
                        </span>
                      </div>
                      <svg
                        class="h-4 w-4 transition-transform"
                        :class="{
                          'rotate-180': expandedReimbursementsTxId === tx.id,
                        }"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    <!-- Expanded details -->
                    <div
                      v-if="expandedReimbursementsTxId === tx.id"
                      class="mt-2 ml-2 pl-3 border-l-2 border-amber-200 dark:border-amber-700 space-y-1"
                    >
                      <div
                        v-for="reimb in getReimbursementsForTransaction(tx.id)"
                        :key="reimb.id"
                        class="flex items-center justify-between py-1"
                      >
                        <div class="flex items-center gap-2">
                          <span
                            class="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-medium"
                            :class="
                              reimb.status === 'COMPLETED'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            "
                          >
                            {{ reimb.personName.charAt(0).toUpperCase() }}
                          </span>
                          <span
                            class="text-xs text-gray-700 dark:text-gray-300"
                            >{{ reimb.personName }}</span
                          >
                          <span
                            class="text-xs font-medium"
                            :class="
                              reimb.status === 'COMPLETED'
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-amber-700 dark:text-amber-400'
                            "
                          >
                            {{ formatCurrency(reimb.amount) }}
                          </span>
                        </div>
                        <button
                          v-if="reimb.status !== 'COMPLETED'"
                          class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded"
                          title="Supprimer"
                          @click.stop="handleDeleteReimbursement(reimb.id)"
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
                    </div>
                  </div>
                </div>

                <!-- ==================== DESKTOP GRID LAYOUT ==================== -->
                <div
                  class="hidden md:grid gap-2 items-center"
                  :class="isSelectionMode ? 'grid-cols-12' : 'grid-cols-11'"
                >
                  <!-- Checkbox -->
                  <div
                    v-if="isSelectionMode"
                    class="col-span-1 flex items-center"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(tx.id)"
                      class="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                      @change="toggleSelection(tx.id)"
                    />
                  </div>

                  <!-- Date -->
                  <div
                    class="col-span-1 text-sm text-gray-600 dark:text-gray-400"
                  >
                    {{ formatDate(tx.date) }}
                  </div>

                  <!-- Description -->
                  <div
                    class="col-span-3 text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ tx.description }}
                  </div>

                  <!-- Note (editable) -->
                  <div class="col-span-2">
                    <template v-if="editingNoteId === tx.id">
                      <div class="flex items-center gap-1">
                        <input
                          v-model="editingNoteValue"
                          type="text"
                          class="flex-1 px-2 py-1 text-sm border border-indigo-300 dark:border-indigo-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                          @keyup.enter="saveNote(tx)"
                          @keyup.escape="cancelEditNote"
                        />
                        <button
                          class="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                          @click="saveNote(tx)"
                        >
                          <svg
                            class="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          class="p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                          @click="cancelEditNote"
                        >
                          <svg
                            class="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <button
                        class="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 truncate group"
                        :title="tx.note ?? 'Cliquer pour ajouter une note'"
                        @click="startEditNote(tx)"
                      >
                        <span v-if="tx.note" class="block truncate">{{
                          tx.note
                        }}</span>
                        <span
                          v-else
                          class="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500"
                          >+ Note</span
                        >
                      </button>
                    </template>
                  </div>

                  <!-- Amount -->
                  <div class="col-span-1 text-sm font-semibold text-right">
                    <span
                      :class="
                        tx.type === 'EXPENSE'
                          ? 'text-red-600 dark:text-red-500'
                          : 'text-green-600 dark:text-green-500'
                      "
                    >
                      {{ formatCurrency(tx.amount) }}
                    </span>
                  </div>

                  <!-- Category (editable) -->
                  <div class="col-span-2">
                    <template v-if="editingCategoryId === tx.id">
                      <select
                        :value="tx.categoryId ?? ''"
                        class="w-full px-2 py-1 text-sm border border-indigo-300 dark:border-indigo-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                        @change="
                          saveCategory(
                            tx,
                            ($event.target as HTMLSelectElement).value
                          )
                        "
                        @blur="cancelEditCategory"
                      >
                        <option value="">Sans categorie</option>
                        <option
                          v-for="cat in allCategories.filter(
                            c => c.type === tx.type
                          )"
                          :key="cat.id"
                          :value="cat.id"
                        >
                          {{ cat.name }}
                        </option>
                      </select>
                    </template>
                    <template v-else>
                      <button
                        class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors"
                        :class="
                          tx.categoryName
                            ? tx.type === 'EXPENSE'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                        "
                        @click="startEditCategory(tx)"
                      >
                        {{ tx.categoryName || 'Sans categorie' }}
                        <svg
                          class="h-3 w-3 opacity-50"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </template>
                  </div>

                  <!-- Pointed status (toggle) -->
                  <div class="col-span-1 flex justify-center">
                    <button
                      class="p-1 rounded-full transition-colors"
                      :class="
                        tx.isPointed
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-600'
                      "
                      :title="tx.isPointed ? 'Depointer' : 'Pointer'"
                      @click="togglePointed(tx)"
                    >
                      <svg
                        v-if="tx.isPointed"
                        class="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      <svg
                        v-else
                        class="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>

                  <!-- Actions -->
                  <div class="col-span-1 flex justify-center">
                    <button
                      v-if="tx.type === 'EXPENSE' && getRemainingAmount(tx) > 0"
                      class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
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
                    <span
                      v-else-if="tx.type === 'EXPENSE'"
                      class="text-xs text-green-600 dark:text-green-400 font-medium"
                    >
                      Assigne
                    </span>
                  </div>
                </div>

                <!-- Reimbursements for this transaction (DESKTOP ONLY) -->
                <div
                  v-if="
                    tx.type === 'EXPENSE' &&
                    getReimbursementsForTransaction(tx.id).length > 0
                  "
                  class="hidden md:block mt-2 ml-4 md:ml-8 pl-3 md:pl-4 border-l-2 border-amber-200 dark:border-amber-700"
                >
                  <div
                    v-for="reimb in getReimbursementsForTransaction(tx.id)"
                    :key="reimb.id"
                    class="flex items-center justify-between py-1 text-sm"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium"
                        :class="
                          reimb.status === 'COMPLETED'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        "
                      >
                        {{ reimb.personName.charAt(0).toUpperCase() }}
                      </span>
                      <span class="text-gray-700 dark:text-gray-300">{{
                        reimb.personName
                      }}</span>
                      <span class="text-gray-500 dark:text-gray-400">:</span>
                      <span
                        class="font-medium"
                        :class="
                          reimb.status === 'COMPLETED'
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-amber-700 dark:text-amber-400'
                        "
                      >
                        {{ formatCurrency(reimb.amount) }}
                      </span>
                      <span
                        v-if="reimb.status === 'PARTIAL'"
                        class="text-xs text-green-600 dark:text-green-400"
                      >
                        (recu: {{ formatCurrency(reimb.amountReceived) }})
                      </span>
                      <span
                        v-if="reimb.categoryName"
                        class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded"
                      >
                        {{ reimb.categoryName }}
                      </span>
                    </div>
                    <button
                      v-if="reimb.status !== 'COMPLETED'"
                      class="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
                    class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                  >
                    Restant: {{ formatCurrency(getRemainingAmount(tx)) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div
              v-if="totalPages > 1"
              class="flex items-center justify-between px-4 py-4 border-t dark:border-slate-700"
            >
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Page {{ currentPage }} sur {{ totalPages }}
              </div>

              <div class="flex items-center gap-1">
                <!-- Previous button -->
                <button
                  :disabled="currentPage === 1"
                  class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                  :class="
                    currentPage === 1
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
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
                    class="px-2 py-1.5 text-sm text-gray-400 dark:text-gray-500"
                  >
                    ...
                  </span>
                  <button
                    v-else
                    class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                    :class="
                      page === currentPage
                        ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
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
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
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
          class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
        >
          <!-- Header -->
          <h3
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Assigner un remboursement
          </h3>

          <!-- Transaction info -->
          <div class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {{ formatDate(selectedTransaction.date) }} -
              {{ selectedTransaction.description }}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div
                class="bg-white dark:bg-slate-700 rounded-lg p-2 border border-gray-200 dark:border-slate-600"
              >
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                  Montant total
                </div>
                <div
                  class="text-lg font-semibold text-red-600 dark:text-red-500"
                >
                  {{ formatCurrency(selectedTransaction.amount) }}
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
                    getRemainingAmount(selectedTransaction) > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                  "
                >
                  {{ formatCurrency(getRemainingAmount(selectedTransaction)) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Form -->
          <div class="space-y-4">
            <!-- Person select -->
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Personne *
              </label>
              <select
                v-model="reimbursementForm.personId"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
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
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Montant *
              </label>
              <input
                v-model.number="reimbursementForm.amount"
                type="number"
                step="0.01"
                min="0.01"
                :max="getRemainingAmount(selectedTransaction)"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
              />

              <!-- Amount shortcuts -->
              <div class="mt-2">
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Raccourcis (base:
                  {{ formatCurrency(Math.abs(selectedTransaction.amount)) }})
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    @click="setAmountFromDivisor(1)"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    @click="setAmountFromDivisor(2)"
                  >
                    / 2
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    @click="setAmountFromDivisor(3)"
                  >
                    / 3
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-xs font-medium rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    @click="setAmountFromDivisor(4)"
                  >
                    / 4
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

            <!-- Category select -->
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Categorie (optionnel)
              </label>
              <select
                v-model="reimbursementForm.categoryId"
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

            <!-- Note input -->
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Note (optionnel)
              </label>
              <input
                v-model="reimbursementForm.note"
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
                  ? 'bg-amber-600 dark:bg-amber-500 hover:bg-amber-700 dark:hover:bg-amber-600'
                  : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
              "
              @click="handleCreateReimbursement"
            >
              <span v-if="isCreatingReimbursement">Creation...</span>
              <span v-else>Confirmer</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Bulk Category Change Modal -->
    <Teleport to="body">
      <div
        v-if="showBulkCategoryModal"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="showBulkCategoryModal = false"
        />

        <!-- Modal -->
        <div
          class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
        >
          <h3
            class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
          >
            Changer la categorie
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choisissez la nouvelle categorie pour les {{ selectedCount }}
            transaction(s) selectionnee(s).
          </p>

          <select
            v-model="bulkCategoryId"
            class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 mb-4"
          >
            <option :value="null" disabled>Selectionnez une categorie</option>
            <option v-for="cat in allCategories" :key="cat.id" :value="cat.id">
              {{ cat.name }} ({{
                cat.type === 'EXPENSE' ? 'Depense' : 'Revenu'
              }})
            </option>
          </select>

          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              @click="showBulkCategoryModal = false"
            >
              Annuler
            </button>
            <button
              :disabled="!bulkCategoryId || isBulkUpdating"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
              :class="
                bulkCategoryId && !isBulkUpdating
                  ? 'bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600'
                  : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
              "
              @click="applyBulkCategory"
            >
              <span v-if="isBulkUpdating">Application...</span>
              <span v-else>Appliquer</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

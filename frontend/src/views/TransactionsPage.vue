<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { usePersonsStore } from '@/stores/persons'
  import { useAccountsStore } from '@/stores/accounts'
  import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'
  import { api } from '@/lib/api'
  import type {
    TransactionDto,
    TransactionSettlementSummaryDto,
    ReimbursementDto,
    SettlementDto,
    CategoryDto,
    PaginationMeta,
  } from '@/lib/api'
  import CategorySubcategoryModal from '@/components/CategorySubcategoryModal.vue'
  import TransactionReimbursementModal from '@/components/transactions/TransactionReimbursementModal.vue'
  import BulkCategoryModal from '@/components/transactions/BulkCategoryModal.vue'
  import ReimbursementCategoryConfirmModal from '@/components/transactions/ReimbursementCategoryConfirmModal.vue'
  import SettlementDetailModal from '@/components/settlements/SettlementDetailModal.vue'
  import { formatCurrency } from '@/lib/formatters'
  import { useToast } from '@/composables/useToast'

  const toast = useToast()

  const personsStore = usePersonsStore()
  const accountsStore = useAccountsStore()
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
    selectedAccount: string | null
    showOnlyNotPointed: boolean
  } {
    try {
      const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          typeFilter: parsed.typeFilter ?? 'ALL',
          selectedCategory: parsed.selectedCategory ?? null,
          selectedAccount: parsed.selectedAccount ?? null,
          showOnlyNotPointed: parsed.showOnlyNotPointed ?? false,
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      typeFilter: 'ALL',
      selectedCategory: null,
      selectedAccount: null,
      showOnlyNotPointed: false,
    }
  }

  const savedFilters = loadSavedFilters()

  // Filters
  const typeFilter = ref<'ALL' | 'EXPENSE' | 'INCOME'>(savedFilters.typeFilter)
  const selectedCategory = ref<string | null>(savedFilters.selectedCategory)
  const selectedAccount = ref<string | null>(savedFilters.selectedAccount)
  const showOnlyNotPointed = ref(savedFilters.showOnlyNotPointed)

  // Save filters to localStorage
  function saveFilters() {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        typeFilter: typeFilter.value,
        selectedCategory: selectedCategory.value,
        selectedAccount: selectedAccount.value,
        showOnlyNotPointed: showOnlyNotPointed.value,
      })
    )
  }

  // Reset all filters
  function resetFilters() {
    typeFilter.value = 'ALL'
    selectedCategory.value = null
    selectedAccount.value = null
    showOnlyNotPointed.value = false
    localStorage.removeItem(FILTERS_STORAGE_KEY)
  }

  // Check if any filter is active
  const hasActiveFilters = computed(() => {
    return (
      typeFilter.value !== 'ALL' ||
      selectedCategory.value !== null ||
      selectedAccount.value !== null ||
      showOnlyNotPointed.value
    )
  })

  // Pagination
  const currentPage = ref(1)
  const pageSize = 20

  // Inline editing state
  const editingNoteId = ref<string | null>(null)
  const editingNoteValue = ref('')

  // Bulk category change modal
  const showBulkCategoryModal = ref(false)
  const bulkCategoryId = ref<string | null>(null)
  const isBulkUpdating = ref(false)

  // Category/Subcategory selection modal state
  const showCategoryModal = ref(false)
  const editingTransaction = ref<TransactionDto | null>(null)

  // Modal state for adding reimbursement
  const showReimbursementModal = ref(false)
  const selectedTransaction = ref<TransactionDto | null>(null)
  const reimbursementModalRef = ref<{ resetForm: () => void } | null>(null)

  // Modal state for reimbursement category confirmation after a transaction
  // category change.
  const showReimbursementCategoryConfirm = ref(false)
  const reimbursementCategoryConfirmData = ref<{
    transactionId: string
    reimbursements: ReimbursementDto[]
    newExpenseCategoryName: string
    suggestedIncomeCategory: CategoryDto | null
  } | null>(null)
  const isUpdatingReimbursementCategories = ref(false)

  // Modal state for viewing a settlement linked to an income transaction
  const showSettlementDetailModal = ref(false)
  const selectedSettlement = ref<SettlementDto | null>(null)
  const isLoadingSettlement = ref(false)

  async function openSettlementDetail(
    summary: TransactionSettlementSummaryDto
  ): Promise<void> {
    if (isLoadingSettlement.value) return
    isLoadingSettlement.value = true
    try {
      selectedSettlement.value = await api.getSettlement(summary.id)
      showSettlementDetailModal.value = true
    } catch {
      toast.error('Impossible de charger le detail du reglement')
    } finally {
      isLoadingSettlement.value = false
    }
  }

  function closeSettlementDetail(): void {
    showSettlementDetailModal.value = false
    selectedSettlement.value = null
  }

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
    const newNote = editingNoteValue.value
    if (newNote === (tx.note ?? '')) {
      cancelEditNote()
      return
    }

    // Optimistic update
    const index = transactions.value.findIndex(t => t.id === tx.id)
    const previousNote = tx.note
    if (index !== -1) {
      transactions.value[index] = { ...tx, note: newNote || null }
    }
    cancelEditNote()

    try {
      const updated = await api.updateTransaction(tx.id, {
        note: newNote || undefined,
      })
      if (index !== -1) {
        transactions.value[index] = updated
      }
    } catch {
      // Rollback
      if (index !== -1) {
        transactions.value[index] = {
          ...transactions.value[index],
          note: previousNote,
        }
      }
      toast.error('Echec de la mise a jour de la note')
    }
  }

  // Category/Subcategory editing via modal
  function openCategoryModal(tx: TransactionDto) {
    editingTransaction.value = tx
    showCategoryModal.value = true
  }

  function closeCategoryModal() {
    showCategoryModal.value = false
    editingTransaction.value = null
  }

  // Handle category and subcategory selection from modal
  async function handleCategorySubcategorySelect(
    categoryId: string | null,
    subcategoryId: string | null
  ) {
    if (!editingTransaction.value) return

    const tx = editingTransaction.value

    // Check if anything changed
    if (categoryId === tx.categoryId && subcategoryId === tx.subcategoryId) {
      closeCategoryModal()
      return
    }

    // Optimistic update — resolve category name for immediate display
    const index = transactions.value.findIndex(t => t.id === tx.id)
    const previousTx = { ...tx }
    if (index !== -1) {
      const newCategory = categoryId
        ? allCategories.value.find(c => c.id === categoryId)
        : null
      transactions.value[index] = {
        ...tx,
        categoryId: categoryId ?? tx.categoryId,
        categoryName: newCategory?.name ?? tx.categoryName,
        categoryIcon: newCategory?.icon ?? tx.categoryIcon,
        subcategoryId: subcategoryId ?? null,
      }
    }
    closeCategoryModal()

    const previousCategoryId = previousTx.categoryId

    try {
      const updated = await api.updateTransaction(tx.id, {
        categoryId: categoryId || undefined,
        subcategoryId,
      })
      if (index !== -1) {
        transactions.value[index] = updated
      }

      // If the category actually changed and the transaction has reimbursements,
      // ask the user whether to update the reimbursements' category as well.
      if (
        categoryId &&
        categoryId !== previousCategoryId &&
        updated.type === 'EXPENSE'
      ) {
        const linkedReimbursements = getReimbursementsForTransaction(tx.id)
        if (linkedReimbursements.length > 0) {
          const association =
            categoryAssociationsStore.getIncomeCategoryForExpense(categoryId)
          const suggested = association
            ? (allCategories.value.find(
                c => c.id === association.incomeCategoryId
              ) ?? null)
            : null

          reimbursementCategoryConfirmData.value = {
            transactionId: tx.id,
            reimbursements: [...linkedReimbursements],
            newExpenseCategoryName:
              updated.categoryName ?? 'la nouvelle categorie',
            suggestedIncomeCategory: suggested,
          }
          showReimbursementCategoryConfirm.value = true
        }
      }
    } catch {
      // Rollback
      if (index !== -1) {
        transactions.value[index] = previousTx
      }
      toast.error('Echec de la mise a jour de la categorie')
    }
  }

  function closeReimbursementCategoryConfirm(): void {
    showReimbursementCategoryConfirm.value = false
    reimbursementCategoryConfirmData.value = null
  }

  async function applyReimbursementCategoryUpdate(
    newCategoryId: string | null
  ): Promise<void> {
    const data = reimbursementCategoryConfirmData.value
    if (!data || !newCategoryId) {
      closeReimbursementCategoryConfirm()
      return
    }

    const toUpdate = data.reimbursements.filter(
      r => r.categoryId !== newCategoryId
    )
    if (toUpdate.length === 0) {
      closeReimbursementCategoryConfirm()
      return
    }

    try {
      isUpdatingReimbursementCategories.value = true
      const updates = await Promise.all(
        toUpdate.map(r =>
          api.updateReimbursement(r.id, { categoryId: newCategoryId })
        )
      )
      // Replace updated reimbursements in the list
      const updatesById = new Map(updates.map(r => [r.id, r]))
      reimbursements.value = reimbursements.value.map(
        r => updatesById.get(r.id) ?? r
      )
      toast.success(
        `${updates.length} remboursement${updates.length > 1 ? 's' : ''} mis a jour`
      )
    } catch {
      toast.error('Echec de la mise a jour des remboursements')
    } finally {
      isUpdatingReimbursementCategories.value = false
      closeReimbursementCategoryConfirm()
    }
  }

  async function deleteReimbursementsFromConfirm(): Promise<void> {
    const data = reimbursementCategoryConfirmData.value
    if (!data || data.reimbursements.length === 0) {
      closeReimbursementCategoryConfirm()
      return
    }

    const idsToDelete = data.reimbursements.map(r => r.id)

    try {
      isUpdatingReimbursementCategories.value = true
      await Promise.all(idsToDelete.map(id => api.deleteReimbursement(id)))
      // Remove deleted reimbursements from the local list
      const idSet = new Set(idsToDelete)
      reimbursements.value = reimbursements.value.filter(r => !idSet.has(r.id))
      toast.success(
        `${idsToDelete.length} remboursement${idsToDelete.length > 1 ? 's' : ''} supprime${idsToDelete.length > 1 ? 's' : ''}`
      )
    } catch {
      toast.error('Echec de la suppression des remboursements')
    } finally {
      isUpdatingReimbursementCategories.value = false
      closeReimbursementCategoryConfirm()
    }
  }

  // Toggle pointed status
  async function togglePointed(tx: TransactionDto) {
    // Optimistic update
    const index = transactions.value.findIndex(t => t.id === tx.id)
    const previousPointed = tx.isPointed
    if (index !== -1) {
      transactions.value[index] = { ...tx, isPointed: !tx.isPointed }
    }

    try {
      const updated = await api.updateTransaction(tx.id, {
        isPointed: !previousPointed,
      })
      if (index !== -1) {
        transactions.value[index] = updated
      }
    } catch {
      // Rollback
      if (index !== -1) {
        transactions.value[index] = {
          ...transactions.value[index],
          isPointed: previousPointed,
        }
      }
      toast.error('Echec de la mise a jour du pointage')
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
  watch(
    [typeFilter, selectedCategory, selectedAccount, showOnlyNotPointed],
    () => {
      saveFilters()
      const wasOnPage1 = currentPage.value === 1
      currentPage.value = 1
      if (wasOnPage1) {
        fetchTransactions()
      }
    }
  )

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
        account: selectedAccount.value || undefined,
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
    reimbursementModalRef.value?.resetForm()
    showReimbursementModal.value = true
  }

  // Close reimbursement modal
  function closeReimbursementModal() {
    showReimbursementModal.value = false
    selectedTransaction.value = null
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
    accountsStore.load()
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
        data-testid="transactions-filter-area"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-4 mb-6"
      >
        <div
          class="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-4 md:items-center"
        >
          <!-- Filters row: Type + Category + Account -->
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
                data-testid="transactions-type-filter"
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
                data-testid="transactions-category-filter"
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

            <!-- Account filter -->
            <div
              class="col-span-2 md:col-span-1 flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
            >
              <label class="text-xs md:text-sm text-gray-600 dark:text-gray-400"
                >Compte:</label
              >
              <select
                v-model="selectedAccount"
                data-testid="transactions-account-filter"
                class="w-full md:w-auto px-3 py-2 md:py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              >
                <option :value="null">Tous</option>
                <option
                  v-for="account in accountsStore.sortedAccounts"
                  :key="account.id"
                  :value="account.name"
                >
                  {{ account.name }}
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
                  <!-- ── Compact row: icon + description + amount ── -->
                  <div class="flex items-center gap-3 min-h-[52px]">
                    <!-- Selection checkbox (replaces icon in selection mode) -->
                    <div
                      v-if="isSelectionMode"
                      class="flex items-center justify-center w-9 h-9 shrink-0"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedIds.has(tx.id)"
                        class="h-5 w-5 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500 dark:bg-slate-700"
                        @change="toggleSelection(tx.id)"
                      />
                    </div>

                    <!-- Category icon -->
                    <button
                      v-else
                      class="flex items-center justify-center w-9 h-9 rounded-xl text-sm shrink-0 transition-colors"
                      :class="
                        tx.categoryName
                          ? tx.type === 'EXPENSE'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500'
                      "
                      @click="openCategoryModal(tx)"
                    >
                      {{
                        tx.categoryIcon ||
                        (tx.categoryName ? tx.categoryName.charAt(0) : '?')
                      }}
                    </button>

                    <!-- Description + meta line -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline justify-between gap-2">
                        <span
                          class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                        >
                          {{ tx.description }}
                        </span>
                        <span
                          class="text-sm font-semibold shrink-0"
                          :class="
                            tx.type === 'EXPENSE'
                              ? 'text-red-600 dark:text-red-500'
                              : 'text-green-600 dark:text-green-500'
                          "
                        >
                          {{ formatCurrency(tx.amount) }}
                        </span>
                      </div>
                      <div class="flex items-center justify-between mt-0.5">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span
                            class="text-xs text-gray-400 dark:text-gray-500 shrink-0"
                          >
                            {{ formatDate(tx.date) }}
                          </span>
                          <span
                            class="text-xs text-gray-300 dark:text-gray-600 shrink-0"
                            >&middot;</span
                          >
                          <button
                            class="text-xs text-gray-400 dark:text-gray-500 truncate hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            @click="openCategoryModal(tx)"
                          >
                            {{ tx.categoryName || 'Sans categorie' }}
                          </button>
                          <!-- Reimbursement inline badge -->
                          <template
                            v-if="
                              tx.type === 'EXPENSE' &&
                              getReimbursementsForTransaction(tx.id).length > 0
                            "
                          >
                            <span
                              class="text-xs text-gray-300 dark:text-gray-600 shrink-0"
                              >&middot;</span
                            >
                            <button
                              class="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                              :class="
                                getReimbursementSummary(tx.id).allCompleted
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              "
                              @click="toggleReimbursementsExpand(tx.id)"
                            >
                              <svg
                                class="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  v-if="
                                    getReimbursementSummary(tx.id).allCompleted
                                  "
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M5 13l4 4L19 7"
                                />
                                <path
                                  v-else
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span
                                v-if="
                                  getReimbursementSummary(tx.id).allCompleted
                                "
                                >Rembourse</span
                              >
                              <template v-else>
                                {{
                                  formatCurrency(
                                    getReimbursementSummary(tx.id).totalAmount
                                  )
                                }}
                                <span class="opacity-70">en attente</span>
                              </template>
                            </button>
                          </template>
                        </div>
                        <!-- Pointed toggle -->
                        <button
                          class="shrink-0 ml-2 -mr-1 flex items-center justify-center w-7 h-7 rounded-full transition-colors"
                          :class="
                            tx.isPointed
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500'
                          "
                          :title="tx.isPointed ? 'Depointer' : 'Pointer'"
                          @click="togglePointed(tx)"
                        >
                          <svg
                            class="w-4 h-4"
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
                      </div>
                    </div>
                  </div>

                  <!-- ── Inline note (shown only if exists or editing) ── -->
                  <div
                    v-if="tx.note && editingNoteId !== tx.id"
                    class="ml-12 mt-0.5"
                  >
                    <button
                      class="text-xs text-gray-400 dark:text-gray-500 italic truncate max-w-full text-left"
                      @click="startEditNote(tx)"
                    >
                      {{ tx.note }}
                    </button>
                  </div>

                  <!-- Note editor -->
                  <div v-if="editingNoteId === tx.id" class="ml-12 mt-1.5">
                    <div class="flex items-center gap-1.5">
                      <input
                        v-model="editingNoteValue"
                        type="text"
                        class="flex-1 px-2.5 py-1.5 text-xs border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                        placeholder="Ajouter une note..."
                        @keyup.enter="saveNote(tx)"
                        @keyup.escape="cancelEditNote"
                      />
                      <button
                        class="p-1.5 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title="Sauvegarder"
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
                        class="p-1.5 text-gray-400 dark:text-gray-500 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                        title="Annuler"
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
                  </div>

                  <!-- ── Quick action bar (contextual, compact) ── -->
                  <div
                    v-if="!isSelectionMode"
                    class="flex items-center gap-1 ml-12 mt-1"
                  >
                    <!-- Add note -->
                    <button
                      v-if="!tx.note && editingNoteId !== tx.id"
                      class="px-2 py-1 text-[11px] text-gray-400 dark:text-gray-500 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      @click="startEditNote(tx)"
                    >
                      + Note
                    </button>
                    <!-- Assign reimbursement -->
                    <button
                      v-if="tx.type === 'EXPENSE' && getRemainingAmount(tx) > 0"
                      class="px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      @click="openReimbursementModal(tx)"
                    >
                      + Remb.
                    </button>
                    <span
                      v-else-if="
                        tx.type === 'EXPENSE' &&
                        getReimbursementsForTransaction(tx.id).length > 0 &&
                        getRemainingAmount(tx) <= 0
                      "
                      class="px-2 py-1 text-[11px] text-green-500 dark:text-green-400"
                    >
                      Assigne
                    </span>
                    <!-- Settlement links (one per person settled by this income) -->
                    <template v-if="tx.type === 'INCOME' && tx.settlements">
                      <button
                        v-for="settlement in tx.settlements"
                        :key="settlement.id"
                        type="button"
                        class="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                        :disabled="isLoadingSettlement"
                        :title="`Voir le reglement de ${settlement.personName}`"
                        @click="openSettlementDetail(settlement)"
                      >
                        <svg
                          class="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.828-6.828l3-3a4 4 0 015.656 5.656l-1.5 1.5m-9.9 4.244a4 4 0 010-5.656"
                          />
                        </svg>
                        {{ settlement.personName }}
                      </button>
                    </template>
                  </div>

                  <!-- ── Expanded reimbursements ── -->
                  <div
                    v-if="
                      tx.type === 'EXPENSE' &&
                      expandedReimbursementsTxId === tx.id &&
                      getReimbursementsForTransaction(tx.id).length > 0
                    "
                    class="ml-12 mt-1.5 pl-3 border-l-2 border-amber-200 dark:border-amber-700 space-y-1"
                  >
                    <div
                      v-for="reimb in getReimbursementsForTransaction(tx.id)"
                      :key="reimb.id"
                      class="flex items-center justify-between py-0.5"
                    >
                      <div class="flex items-center gap-1.5">
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
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-amber-600 dark:text-amber-400'
                          "
                        >
                          {{ formatCurrency(reimb.amount) }}
                        </span>
                      </div>
                      <button
                        v-if="reimb.status !== 'COMPLETED'"
                        class="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded"
                        title="Supprimer"
                        @click.stop="handleDeleteReimbursement(reimb.id)"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
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

                  <!-- Category (clickable to open modal) -->
                  <div class="col-span-2">
                    <button
                      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors"
                      :class="
                        tx.categoryName
                          ? tx.type === 'EXPENSE'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                      "
                      @click="openCategoryModal(tx)"
                    >
                      {{ tx.categoryIcon ? tx.categoryIcon + ' ' : ''
                      }}{{ tx.categoryName || 'Sans categorie' }}
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
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
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
                    <!-- Settlement links (one per person settled by this income) -->
                    <div
                      v-else-if="tx.type === 'INCOME' && tx.settlements"
                      class="flex flex-wrap justify-center gap-1"
                    >
                      <button
                        v-for="settlement in tx.settlements"
                        :key="settlement.id"
                        type="button"
                        class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                        :disabled="isLoadingSettlement"
                        :title="`Voir le reglement de ${settlement.personName}`"
                        @click="openSettlementDetail(settlement)"
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
                            d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.828-6.828l3-3a4 4 0 015.656 5.656l-1.5 1.5m-9.9 4.244a4 4 0 010-5.656"
                          />
                        </svg>
                        {{ settlement.personName }}
                      </button>
                    </div>
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
    <TransactionReimbursementModal
      ref="reimbursementModalRef"
      :is-open="showReimbursementModal"
      :transaction="selectedTransaction"
      :persons="personsStore.persons"
      :income-categories="incomeCategories"
      :remaining-amount="
        selectedTransaction ? getRemainingAmount(selectedTransaction) : 0
      "
      @close="closeReimbursementModal"
      @created="
        r => {
          reimbursements.push(r)
          closeReimbursementModal()
        }
      "
    />

    <!-- Bulk Category Change Modal -->
    <BulkCategoryModal
      v-model:category-id="bulkCategoryId"
      :is-open="showBulkCategoryModal"
      :categories="allCategories"
      :selected-count="selectedCount"
      :is-updating="isBulkUpdating"
      @close="showBulkCategoryModal = false"
      @apply="applyBulkCategory"
    />

    <!-- Category/Subcategory Selection Modal -->
    <CategorySubcategoryModal
      :is-open="showCategoryModal"
      :transaction-type="editingTransaction?.type ?? 'EXPENSE'"
      :current-category-id="editingTransaction?.categoryId ?? null"
      :current-subcategory-id="editingTransaction?.subcategoryId ?? null"
      @close="closeCategoryModal"
      @select="handleCategorySubcategorySelect"
    />

    <!-- Reimbursement category confirmation after a transaction category change -->
    <ReimbursementCategoryConfirmModal
      v-if="reimbursementCategoryConfirmData"
      :is-open="showReimbursementCategoryConfirm"
      :reimbursements="reimbursementCategoryConfirmData.reimbursements"
      :new-expense-category-name="
        reimbursementCategoryConfirmData.newExpenseCategoryName
      "
      :suggested-income-category="
        reimbursementCategoryConfirmData.suggestedIncomeCategory
      "
      :is-updating="isUpdatingReimbursementCategories"
      @update="applyReimbursementCategoryUpdate"
      @keep="closeReimbursementCategoryConfirm"
      @delete="deleteReimbursementsFromConfirm"
    />

    <!-- Settlement detail (read-only) for income transactions -->
    <SettlementDetailModal
      :is-open="showSettlementDetailModal"
      :settlement="selectedSettlement"
      hide-delete
      @close="closeSettlementDetail"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePersonsStore } from '@/stores/persons'
  import { useAccountsStore } from '@/stores/accounts'
  import { useTagsStore } from '@/stores/tags'
  import { api } from '@/lib/api'
  import type {
    TransactionDto,
    TransactionSettlementSummaryDto,
    ReimbursementDto,
    SettlementDto,
    CategoryDto,
    SubcategoryDto,
    PaginationMeta,
    TransactionQueryParams,
  } from '@/lib/api'
  import CategorySubcategoryModal from '@/components/CategorySubcategoryModal.vue'
  import TransactionReimbursementModal from '@/components/transactions/TransactionReimbursementModal.vue'
  import BulkCategoryModal from '@/components/transactions/BulkCategoryModal.vue'
  import TransactionRow from '@/components/transactions/TransactionRow.vue'
  import SettlementDetailModal from '@/components/settlements/SettlementDetailModal.vue'
  import ToggleSwitch from '@/components/ToggleSwitch.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import FilterChips from '@/components/ui/FilterChips.vue'
  import FilterDisclosure from '@/components/ui/FilterDisclosure.vue'
  import type { FilterChip } from '@/components/ui/FilterChips.vue'
  import { useToast } from '@/composables/useToast'

  const toast = useToast()

  const personsStore = usePersonsStore()
  const accountsStore = useAccountsStore()
  const tagsStore = useTagsStore()

  // Transactions state
  const transactions = ref<TransactionDto[]>([])
  const isLoadingTransactions = ref(false)
  const transactionsError = ref<string | null>(null)
  const transactionsMeta = ref<PaginationMeta | null>(null)

  // Categories state
  const allCategories = ref<CategoryDto[]>([])
  // Every subcategory the user owns; the filter list is derived from it, so a
  // single fetch avoids a round-trip on each category change.
  const allSubcategories = ref<SubcategoryDto[]>([])

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
    selectedSubcategory: string | null
    selectedAccount: string | null
    selectedTag: string | null
    showOnlyNotPointed: boolean
    searchKeyword: string
    filterStartDate: string
    filterEndDate: string
    amountMin: string
    amountMax: string
  } {
    try {
      const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          typeFilter: parsed.typeFilter ?? 'ALL',
          selectedCategory: parsed.selectedCategory ?? null,
          // A saved subcategory is meaningless without its parent category.
          selectedSubcategory: parsed.selectedCategory
            ? (parsed.selectedSubcategory ?? null)
            : null,
          selectedAccount: parsed.selectedAccount ?? null,
          selectedTag: parsed.selectedTag ?? null,
          showOnlyNotPointed: parsed.showOnlyNotPointed ?? false,
          searchKeyword: parsed.searchKeyword ?? '',
          filterStartDate: parsed.filterStartDate ?? '',
          filterEndDate: parsed.filterEndDate ?? '',
          amountMin: parsed.amountMin ?? '',
          amountMax: parsed.amountMax ?? '',
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      typeFilter: 'ALL',
      selectedCategory: null,
      selectedSubcategory: null,
      selectedAccount: null,
      selectedTag: null,
      showOnlyNotPointed: false,
      searchKeyword: '',
      filterStartDate: '',
      filterEndDate: '',
      amountMin: '',
      amountMax: '',
    }
  }

  const savedFilters = loadSavedFilters()

  const route = useRoute()
  const router = useRouter()

  /**
   * The URL is the shareable form of the filters: pasting a link restores
   * the exact view, and the Back button returns to the page that was left.
   * A link that names any filter wins over localStorage — the sender's
   * intent beats this browser's leftovers.
   */
  const QUERY_KEYS = [
    'type',
    'category',
    'subcategory',
    'account',
    'tag',
    'notPointed',
    'review',
    'q',
    'from',
    'to',
    'min',
    'max',
    'page',
  ] as const

  function firstParam(value: unknown): string | null {
    const single = Array.isArray(value) ? value[0] : value
    return typeof single === 'string' && single !== '' ? single : null
  }

  const hasQueryFilters = QUERY_KEYS.some(
    key => firstParam(route.query[key]) !== null
  )

  function filtersFromQuery(): typeof savedFilters {
    const q = route.query
    const type = firstParam(q.type)
    const category = firstParam(q.category)
    return {
      typeFilter: type === 'EXPENSE' || type === 'INCOME' ? type : 'ALL',
      selectedCategory: category,
      // A subcategory is meaningless without its parent category.
      selectedSubcategory: category ? firstParam(q.subcategory) : null,
      selectedAccount: firstParam(q.account),
      selectedTag: firstParam(q.tag),
      showOnlyNotPointed: firstParam(q.notPointed) === '1',
      searchKeyword: firstParam(q.q) ?? '',
      filterStartDate: firstParam(q.from) ?? '',
      filterEndDate: firstParam(q.to) ?? '',
      amountMin: firstParam(q.min) ?? '',
      amountMax: firstParam(q.max) ?? '',
    }
  }

  const initialFilters = hasQueryFilters ? filtersFromQuery() : savedFilters

  // Filters
  const typeFilter = ref<'ALL' | 'EXPENSE' | 'INCOME'>(
    initialFilters.typeFilter
  )
  const selectedCategory = ref<string | null>(initialFilters.selectedCategory)
  // Only selectable once a category is chosen: its options are the
  // subcategories of that category.
  const selectedSubcategory = ref<string | null>(
    initialFilters.selectedSubcategory
  )
  const selectedAccount = ref<string | null>(initialFilters.selectedAccount)
  const selectedTag = ref<string | null>(initialFilters.selectedTag)
  const showOnlyNotPointed = ref(initialFilters.showOnlyNotPointed)
  /**
   * Rows a bank sync inserted or claimed and then lost the reference to —
   * cleared to "aucun", or a correction still pending on the other side of a
   * swap. Not saved to localStorage: this is a one-off "where did they go"
   * check, not a filter meant to stay on across visits.
   */
  const needsBankReview = ref(firstParam(route.query.review) === '1')
  // Advanced search filters (keyword, date window, amount range)
  const searchKeyword = ref(initialFilters.searchKeyword)
  const filterStartDate = ref(initialFilters.filterStartDate)
  const filterEndDate = ref(initialFilters.filterEndDate)
  const amountMin = ref(initialFilters.amountMin)
  const amountMax = ref(initialFilters.amountMax)

  // Save filters to localStorage
  function saveFilters() {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        typeFilter: typeFilter.value,
        selectedCategory: selectedCategory.value,
        selectedSubcategory: selectedSubcategory.value,
        selectedAccount: selectedAccount.value,
        selectedTag: selectedTag.value,
        showOnlyNotPointed: showOnlyNotPointed.value,
        searchKeyword: searchKeyword.value,
        filterStartDate: filterStartDate.value,
        filterEndDate: filterEndDate.value,
        amountMin: amountMin.value,
        amountMax: amountMax.value,
      })
    )
  }

  /**
   * The saved account filter holds a name, and an account can be deleted from
   * the preferences page between two visits. Left alone, the stale name would
   * filter the list down to nothing while the select — having no matching
   * option — looks empty, and localStorage would keep it that way across
   * reloads. Same defensive spirit as dropping a subcategory without its
   * parent category above.
   *
   * Only called once the real list is known, and never after a failed load:
   * an empty list then means "we don't know", not "no accounts".
   */
  function dropUnknownAccountFilter(): void {
    const saved = selectedAccount.value
    if (saved === null || accountsStore.error !== null) return
    if (accountsStore.accounts.some(account => account.name === saved)) return

    // Clearing it is enough: the filter watcher refetches and rewrites the
    // saved filters.
    selectedAccount.value = null
  }

  // Reset all filters
  function resetFilters() {
    typeFilter.value = 'ALL'
    selectedCategory.value = null
    selectedSubcategory.value = null
    selectedAccount.value = null
    selectedTag.value = null
    showOnlyNotPointed.value = false
    searchKeyword.value = ''
    filterStartDate.value = ''
    filterEndDate.value = ''
    amountMin.value = ''
    amountMax.value = ''
    needsBankReview.value = false
    localStorage.removeItem(FILTERS_STORAGE_KEY)
  }

  // Check if any filter is active
  const hasActiveFilters = computed(() => {
    return (
      typeFilter.value !== 'ALL' ||
      selectedCategory.value !== null ||
      selectedSubcategory.value !== null ||
      selectedAccount.value !== null ||
      selectedTag.value !== null ||
      showOnlyNotPointed.value ||
      searchKeyword.value.trim() !== '' ||
      filterStartDate.value !== '' ||
      filterEndDate.value !== '' ||
      amountMin.value !== '' ||
      amountMax.value !== '' ||
      needsBankReview.value
    )
  })

  /**
   * The active filters as removable chips: what the list is currently NOT
   * showing, named in one line under the controls that caused it.
   */
  const activeFilterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    if (typeFilter.value !== 'ALL') {
      chips.push({
        key: 'type',
        label: typeFilter.value === 'EXPENSE' ? 'Dépenses' : 'Revenus',
      })
    }
    if (selectedCategory.value) {
      const name = allCategories.value.find(
        c => c.id === selectedCategory.value
      )?.name
      chips.push({ key: 'category', label: `Catégorie : ${name ?? '…'}` })
    }
    if (selectedSubcategory.value) {
      const name = allSubcategories.value.find(
        sc => sc.id === selectedSubcategory.value
      )?.name
      chips.push({
        key: 'subcategory',
        label: `Sous-catégorie : ${name ?? '…'}`,
      })
    }
    if (selectedAccount.value) {
      chips.push({ key: 'account', label: `Compte : ${selectedAccount.value}` })
    }
    if (selectedTag.value) {
      const name = tagsStore.tags.find(t => t.id === selectedTag.value)?.name
      chips.push({ key: 'tag', label: `Étiquette : ${name ?? '…'}` })
    }
    if (showOnlyNotPointed.value) {
      chips.push({ key: 'notPointed', label: 'Non pointées' })
    }
    if (needsBankReview.value) {
      chips.push({ key: 'review', label: 'À vérifier (banque)' })
    }
    if (searchKeyword.value.trim()) {
      chips.push({ key: 'q', label: `« ${searchKeyword.value.trim()} »` })
    }
    if (filterStartDate.value) {
      chips.push({ key: 'from', label: `Du ${filterStartDate.value}` })
    }
    if (filterEndDate.value) {
      chips.push({ key: 'to', label: `Au ${filterEndDate.value}` })
    }
    if (amountMin.value !== '') {
      chips.push({ key: 'min', label: `≥ ${amountMin.value} €` })
    }
    if (amountMax.value !== '') {
      chips.push({ key: 'max', label: `≤ ${amountMax.value} €` })
    }
    return chips
  })

  function removeFilterChip(key: string): void {
    switch (key) {
      case 'type':
        typeFilter.value = 'ALL'
        break
      case 'category':
        selectedCategory.value = null
        break
      case 'subcategory':
        selectedSubcategory.value = null
        break
      case 'account':
        selectedAccount.value = null
        break
      case 'tag':
        selectedTag.value = null
        break
      case 'notPointed':
        showOnlyNotPointed.value = false
        break
      case 'review':
        needsBankReview.value = false
        break
      case 'q':
        searchKeyword.value = ''
        break
      case 'from':
        filterStartDate.value = ''
        break
      case 'to':
        filterEndDate.value = ''
        break
      case 'min':
        amountMin.value = ''
        break
      case 'max':
        amountMax.value = ''
        break
    }
  }

  // Sort + page size, both shareable via the URL.
  const querySort = firstParam(route.query.sort)
  const sortBy = ref<'date' | 'amount'>(
    querySort === 'amount' ? 'amount' : 'date'
  )
  const sortOrder = ref<'asc' | 'desc'>(
    firstParam(route.query.dir) === 'asc' ? 'asc' : 'desc'
  )

  /** Toggle on the active column, switch column otherwise (desc first). */
  function toggleSort(column: 'date' | 'amount'): void {
    if (sortBy.value === column) {
      sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
    } else {
      sortBy.value = column
      sortOrder.value = 'desc'
    }
  }

  const PAGE_SIZES = [20, 50, 100] as const
  const querySize = Number(firstParam(route.query.size))
  const pageSize = ref<number>(
    (PAGE_SIZES as readonly number[]).includes(querySize) ? querySize : 20
  )

  // Pagination
  const currentPage = ref(
    Math.max(1, parseInt(firstParam(route.query.page) ?? '1', 10) || 1)
  )

  // Inline editing state
  // Which row edits its note — the draft itself lives in the row.
  const editingNoteId = ref<string | null>(null)

  // Bulk category change modal
  const showBulkCategoryModal = ref(false)
  const bulkCategoryId = ref<string | null>(null)
  const bulkSubcategoryId = ref<string | null>(null)
  const isBulkUpdating = ref(false)

  // Category/Subcategory selection modal state
  const showCategoryModal = ref(false)
  const editingTransaction = ref<TransactionDto | null>(null)

  // Modal state for adding reimbursement
  const showReimbursementModal = ref(false)
  const selectedTransaction = ref<TransactionDto | null>(null)
  const reimbursementModalRef = ref<{ resetForm: () => void } | null>(null)

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
      toast.error('Impossible de charger le detail du règlement')
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

  // Computed: subcategories of the selected category — empty (and the select
  // disabled) as long as no category is picked.
  const filteredSubcategories = computed(() => {
    if (!selectedCategory.value) return []
    return allSubcategories.value
      .filter(s => s.categoryId === selectedCategory.value)
      .sort((a, b) => a.name.localeCompare(b.name))
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

  /**
   * The filter the list is showing right now.
   *
   * Extracted from the fetch because a bulk action can target every match
   * rather than the page on screen, and the two must not be able to disagree
   * about what "every match" means.
   */
  const currentFilters = computed<TransactionQueryParams>(() => {
    const parsedMin = amountMin.value !== '' ? Number(amountMin.value) : NaN
    const parsedMax = amountMax.value !== '' ? Number(amountMax.value) : NaN

    return {
      type: typeFilter.value === 'ALL' ? undefined : typeFilter.value,
      categoryId: selectedCategory.value || undefined,
      subcategoryId: selectedCategory.value
        ? selectedSubcategory.value || undefined
        : undefined,
      account: selectedAccount.value || undefined,
      tagId: selectedTag.value || undefined,
      isPointed: showOnlyNotPointed.value ? false : undefined,
      search: searchKeyword.value.trim() || undefined,
      startDate: filterStartDate.value || undefined,
      endDate: filterEndDate.value || undefined,
      amountMin:
        Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : undefined,
      amountMax:
        Number.isFinite(parsedMax) && parsedMax >= 0 ? parsedMax : undefined,
      needsBankReview: needsBankReview.value || undefined,
    }
  })

  // Computed: selection state
  const isAllSelected = computed(() => {
    if (transactions.value.length === 0) return false
    return transactions.value.every(tx => selectedIds.value.has(tx.id))
  })

  const isPartiallySelected = computed(() => {
    return selectedIds.value.size > 0 && !isAllSelected.value
  })

  /**
   * Set when the user escalates from "the rows on this page" to "everything
   * matching the filter". Ticking every box selects fifty; saying so out loud
   * is what lets a bulk action reach the other pages.
   */
  const isWholeFilterSelected = ref(false)

  const matchingCount = computed(() => transactionsMeta.value?.total ?? 0)

  const selectedCount = computed(() =>
    isWholeFilterSelected.value ? matchingCount.value : selectedIds.value.size
  )

  /**
   * Whether to offer the escalation: every visible row is ticked, and there is
   * more behind the current page.
   */
  const canSelectWholeFilter = computed(
    () =>
      !isWholeFilterSelected.value &&
      isAllSelected.value &&
      matchingCount.value > transactions.value.length
  )

  function selectWholeFilter() {
    isWholeFilterSelected.value = true
  }

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
    isWholeFilterSelected.value = false
  }

  function toggleSelectAll() {
    isWholeFilterSelected.value = false
    if (isAllSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(transactions.value.map(tx => tx.id))
    }
  }

  function clearSelection() {
    selectedIds.value = new Set()
    isWholeFilterSelected.value = false
  }

  function toggleSelectionMode() {
    isSelectionMode.value = !isSelectionMode.value
    if (!isSelectionMode.value) {
      selectedIds.value = new Set()
      isWholeFilterSelected.value = false
    }
  }

  function exitSelectionMode() {
    isSelectionMode.value = false
    selectedIds.value = new Set()
    isWholeFilterSelected.value = false
  }

  // Inline note editing
  /**
   * The row for a transaction and the slot it occupies, or null if the list no
   * longer holds it. Returning the row itself — rather than an index the
   * caller then dereferences — is what lets the optimistic updates below read
   * as plain values instead of bounds checks.
   */
  function locate(
    id: string
  ): { current: TransactionDto; index: number } | null {
    const index = transactions.value.findIndex(t => t.id === id)
    const current = transactions.value[index]
    return current ? { current, index } : null
  }

  function startEditNote(tx: TransactionDto) {
    editingNoteId.value = tx.id
  }

  function cancelEditNote() {
    editingNoteId.value = null
  }

  async function saveNote(tx: TransactionDto, newNote: string) {
    if (newNote === (tx.note ?? '')) {
      cancelEditNote()
      return
    }

    // Optimistic update
    const found = locate(tx.id)
    const previousNote = tx.note
    if (found) {
      transactions.value[found.index] = { ...tx, note: newNote || null }
    }
    cancelEditNote()

    try {
      // Omitted rather than sent as `undefined`: clearing a note is saying
      // nothing, not saying nothing-in-particular.
      const updated = await api.updateTransaction(tx.id, {
        ...(newNote && { note: newNote }),
      })
      if (found) {
        transactions.value[found.index] = updated
      }
    } catch {
      // Rollback
      if (found) {
        transactions.value[found.index] = {
          ...found.current,
          note: previousNote ?? null,
        }
      }
      toast.error('Échec de la mise à jour de la note')
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
    const found = locate(tx.id)
    const previousTx = { ...tx }
    if (found) {
      const newCategory = categoryId
        ? allCategories.value.find(c => c.id === categoryId)
        : null
      transactions.value[found.index] = {
        ...tx,
        categoryId: categoryId ?? tx.categoryId ?? null,
        categoryName: newCategory?.name ?? tx.categoryName,
        categoryIcon: newCategory?.icon ?? tx.categoryIcon ?? null,
        subcategoryId: subcategoryId ?? null,
      }
    }
    closeCategoryModal()

    try {
      const updated = await api.updateTransaction(tx.id, {
        ...(categoryId && { categoryId }),
        subcategoryId,
      })
      if (found) {
        transactions.value[found.index] = updated
      }

      // The modal can create subcategories on the fly: refresh the list so the
      // filter dropdown offers them too.
      fetchSubcategories()

      // Nothing to ask about any more. A reimbursement is anchored on this
      // transaction, so it follows the category change on its own — the prompt
      // that used to appear here existed only to keep a duplicated income
      // category in step, and getting it wrong silently credited the deduction
      // to another category.
    } catch {
      // Rollback
      if (found) {
        transactions.value[found.index] = previousTx
      }
      toast.error('Échec de la mise à jour de la catégorie')
    }
  }

  // Toggle pointed status
  async function togglePointed(tx: TransactionDto) {
    // Optimistic update
    const found = locate(tx.id)
    const previousPointed = tx.isPointed
    if (found) {
      transactions.value[found.index] = { ...tx, isPointed: !tx.isPointed }
    }

    try {
      const updated = await api.updateTransaction(tx.id, {
        isPointed: !previousPointed,
      })
      if (found) {
        transactions.value[found.index] = updated
      }
    } catch {
      // Rollback
      if (found) {
        transactions.value[found.index] = {
          ...found.current,
          isPointed: previousPointed,
        }
      }
      toast.error('Échec de la mise à jour du pointage')
    }
  }

  // Bulk actions
  async function bulkTogglePointed(pointed: boolean) {
    if (selectedIds.value.size === 0) return

    try {
      isBulkUpdating.value = true
      await api.bulkUpdateTransactions(bulkSelection(), {
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

  /**
   * What the bulk action applies to. Sending the filter rather than a list of
   * ids is what lets "all 412 results" mean 412 and not the 50 on screen; the
   * count travels with it so the server can refuse a stale selection.
   */
  function bulkSelection():
    | { ids: string[] }
    | { filters: TransactionQueryParams; expectedCount: number } {
    return isWholeFilterSelected.value
      ? { filters: currentFilters.value, expectedCount: matchingCount.value }
      : { ids: [...selectedIds.value] }
  }

  function openBulkCategoryModal() {
    bulkCategoryId.value = null
    bulkSubcategoryId.value = null
    showBulkCategoryModal.value = true
  }

  async function applyBulkCategory(
    categoryId: string,
    subcategoryId: string | null
  ) {
    if (selectedCount.value === 0) return

    try {
      isBulkUpdating.value = true
      const { updated } = await api.bulkUpdateTransactions(bulkSelection(), {
        categoryId,
        subcategoryId,
      })
      await fetchTransactions()
      exitSelectionMode()
      showBulkCategoryModal.value = false
      toast.success(
        `${updated} transaction${updated > 1 ? 's' : ''} deplacee${updated > 1 ? 's' : ''}`
      )
    } catch (err) {
      console.error('Failed to bulk update category:', err)
      // Carries the server's message when the selection went stale, which the
      // user can act on: refresh and try again.
      toast.error(err instanceof Error ? err.message : 'Échec du déplacement')
    } finally {
      isBulkUpdating.value = false
    }
  }

  // Mirror the active filters into the URL. replace, not push: a keystroke
  // in the search box must not add a history entry. Reading happens once at
  // setup, so this cannot loop.
  function syncQuery(): void {
    const query: Record<string, string> = {}
    if (typeFilter.value !== 'ALL') query.type = typeFilter.value
    if (selectedCategory.value) query.category = selectedCategory.value
    if (selectedCategory.value && selectedSubcategory.value)
      query.subcategory = selectedSubcategory.value
    if (selectedAccount.value) query.account = selectedAccount.value
    if (selectedTag.value) query.tag = selectedTag.value
    if (showOnlyNotPointed.value) query.notPointed = '1'
    if (needsBankReview.value) query.review = '1'
    if (searchKeyword.value.trim()) query.q = searchKeyword.value.trim()
    if (filterStartDate.value) query.from = filterStartDate.value
    if (filterEndDate.value) query.to = filterEndDate.value
    if (amountMin.value !== '') query.min = amountMin.value
    if (amountMax.value !== '') query.max = amountMax.value
    if (sortBy.value !== 'date') query.sort = sortBy.value
    if (sortOrder.value !== 'desc') query.dir = sortOrder.value
    if (pageSize.value !== 20) query.size = String(pageSize.value)
    if (currentPage.value > 1) query.page = String(currentPage.value)
    void router.replace({ query })
  }

  // Apply a filter change: persist, jump back to page 1 and refetch. Setting
  // currentPage triggers its own watch (which fetches); when already on page 1
  // that watch won't fire, so we fetch manually.
  function applyFilterChange() {
    saveFilters()
    syncQuery()
    const wasOnPage1 = currentPage.value === 1
    currentPage.value = 1
    if (wasOnPage1) {
      fetchTransactions()
    }
  }

  // A subcategory belongs to one category, so changing the category drops the
  // previous subcategory. Declared before the refetch watcher below so both
  // changes land in the same flush and only one request is fired.
  watch(selectedCategory, () => {
    selectedSubcategory.value = null
  })

  // Refetch immediately when discrete filters change (selects / checkbox / dates)
  watch(
    [
      typeFilter,
      selectedCategory,
      selectedSubcategory,
      selectedAccount,
      selectedTag,
      showOnlyNotPointed,
      needsBankReview,
      filterStartDate,
      filterEndDate,
      sortBy,
      sortOrder,
      pageSize,
    ],
    applyFilterChange
  )

  // Debounce free-text / numeric inputs so we don't fire a request per keystroke
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
  watch([searchKeyword, amountMin, amountMax], () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(applyFilterChange, 350)
  })

  // Refetch when page changes
  watch(currentPage, (newPage, oldPage) => {
    if (newPage !== oldPage) {
      syncQuery()
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
        limit: pageSize.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        ...currentFilters.value,
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

  // Fetch subcategories (all categories at once, for the filter dropdown)
  async function fetchSubcategories() {
    try {
      allSubcategories.value = await api.getSubcategories()
    } catch (err) {
      console.error('Failed to fetch subcategories:', err)
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

  // Go to page
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  // ── Tag attach/detach on a single transaction (optimistic) ──
  async function handleAttachTag(
    tx: TransactionDto,
    tagId: string
  ): Promise<void> {
    const tag = tagsStore.tags.find(t => t.id === tagId)
    const found = locate(tx.id)
    if (!tag || !found) return

    const { current } = found
    if ((current.tags ?? []).some(t => t.id === tagId)) return

    // Optimistic add
    transactions.value[found.index] = {
      ...current,
      tags: [
        ...(current.tags ?? []),
        { id: tag.id, name: tag.name, color: tag.color, icon: tag.icon },
      ],
    }

    const attached = await tagsStore.attachToTransactions(tagId, [tx.id])
    if (attached === 0) {
      // Rollback. Located again rather than reusing the slot above: awaiting
      // the request gives the list time to be replaced under us.
      const after = locate(tx.id)
      if (after) {
        transactions.value[after.index] = {
          ...after.current,
          tags: (after.current.tags ?? []).filter(t => t.id !== tagId),
        }
      }
    }
  }

  async function handleDetachTag(
    tx: TransactionDto,
    tagId: string
  ): Promise<void> {
    const found = locate(tx.id)
    if (!found) return

    const previous = found.current.tags ?? []
    // Optimistic remove
    transactions.value[found.index] = {
      ...found.current,
      tags: previous.filter(t => t.id !== tagId),
    }

    const ok = await tagsStore.detachFromTransaction(tagId, tx.id)
    if (!ok) {
      // Located again: awaiting the request gives the list time to change.
      const after = locate(tx.id)
      if (after) {
        transactions.value[after.index] = { ...after.current, tags: previous }
      }
    }
  }

  async function handleCreateTag(
    tx: TransactionDto,
    name: string
  ): Promise<void> {
    const created = await tagsStore.addTag({ name })
    if (created) await handleAttachTag(tx, created.id)
  }

  onMounted(() => {
    personsStore.fetchPersons()
    // Not awaited before fetchTransactions() on purpose: the list must not wait
    // on the accounts request. In the rare stale case the prune fires a second,
    // corrected fetch.
    void accountsStore.load().then(dropUnknownAccountFilter)
    tagsStore.fetchTags()
    syncQuery()
    fetchTransactions()
    fetchCategories()
    fetchSubcategories()
    fetchReimbursements()
  })
</script>

<template>
  <div
    class="min-h-screen bg-gray-50 dark:bg-slate-800 py-6 sm:py-8 transition-colors"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Transactions"
        subtitle="Gérez vos transactions, modifiez les catégories et assignez des remboursements"
      />

      <!-- Filters: every control on a desk, folded behind « Filtres » on a
           phone (the chips below stay as the summary of what is active). -->
      <FilterDisclosure
        data-testid="transactions-filter-area"
        class="mb-6"
        :active-count="activeFilterChips.length"
      >
        <!-- Keyword search bar -->
        <template #search>
          <div class="relative">
            <svg
              class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 dark:text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              v-model="searchKeyword"
              type="search"
              data-testid="transactions-search-input"
              placeholder="Rechercher par mot-clé (libellé, note, sous-catégorie)..."
              class="w-full pl-10 pr-3 py-3 md:py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
          </div>
        </template>

        <!-- Filter groups: each control carries an uppercase label so the
             different filters can be told apart at a glance. Naturally paired
             ranges (dates, amounts) are grouped with an inline separator, and
             vertical rules cluster the three families. -->
        <div
          class="grid grid-cols-2 gap-x-3 gap-y-3 md:flex md:flex-wrap md:items-end md:gap-x-4 md:gap-y-3"
        >
          <!-- Type -->
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Type</span
            >
            <select
              v-model="typeFilter"
              data-testid="transactions-type-filter"
              class="h-11 md:h-9 w-full md:w-36 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            >
              <option value="ALL">Toutes</option>
              <option value="EXPENSE">Dépenses</option>
              <option value="INCOME">Revenus</option>
            </select>
          </div>

          <!-- Category -->
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Catégorie</span
            >
            <select
              v-model="selectedCategory"
              data-testid="transactions-category-filter"
              class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
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

          <!-- Subcategory: locked until a category narrows down the choices -->
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide"
              :class="
                selectedCategory
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-300 dark:text-gray-600'
              "
              >Sous-catégorie</span
            >
            <select
              v-model="selectedSubcategory"
              :disabled="!selectedCategory"
              data-testid="transactions-subcategory-filter"
              :title="
                selectedCategory
                  ? undefined
                  : 'Selectionnez d\'abord une catégorie'
              "
              class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-slate-800/60 dark:disabled:text-gray-500"
            >
              <option :value="null">
                {{ selectedCategory ? 'Toutes' : 'Choisir une catégorie' }}
              </option>
              <option
                v-for="sub in filteredSubcategories"
                :key="sub.id"
                :value="sub.id"
              >
                {{ sub.name }}
              </option>
            </select>
          </div>

          <!-- Account -->
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Compte</span
            >
            <select
              v-model="selectedAccount"
              data-testid="transactions-account-filter"
              class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
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

          <!-- Tag -->
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Étiquette</span
            >
            <select
              v-model="selectedTag"
              data-testid="transactions-tag-filter"
              class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            >
              <option :value="null">Toutes</option>
              <option
                v-for="tag in tagsStore.tags"
                :key="tag.id"
                :value="tag.id"
              >
                {{ tag.name }}
              </option>
            </select>
          </div>

          <!-- Divider between attribute filters and range filters -->
          <div
            class="hidden md:block w-px h-9 self-end bg-gray-200 dark:bg-slate-700"
            aria-hidden="true"
          ></div>

          <!-- Date window -->
          <div class="col-span-2 flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Période</span
            >
            <div class="flex items-center gap-1.5">
              <input
                v-model="filterStartDate"
                type="date"
                aria-label="Date de debut"
                data-testid="transactions-start-date-filter"
                class="h-11 md:h-9 min-w-0 flex-1 md:w-36 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
              <span class="shrink-0 text-gray-500 dark:text-gray-400">→</span>
              <input
                v-model="filterEndDate"
                type="date"
                aria-label="Date de fin"
                data-testid="transactions-end-date-filter"
                class="h-11 md:h-9 min-w-0 flex-1 md:w-36 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
            </div>
          </div>

          <!-- Amount range -->
          <div class="col-span-2 flex flex-col gap-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Montant (€)</span
            >
            <div class="flex items-center gap-1.5">
              <input
                v-model="amountMin"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                placeholder="min"
                aria-label="Montant minimum"
                data-testid="transactions-amount-min-filter"
                class="h-11 md:h-9 min-w-0 flex-1 md:w-24 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
              <span class="shrink-0 text-gray-500 dark:text-gray-400">–</span>
              <input
                v-model="amountMax"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                placeholder="max"
                aria-label="Montant maximum"
                data-testid="transactions-amount-max-filter"
                class="h-11 md:h-9 min-w-0 flex-1 md:w-24 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
            </div>
          </div>

          <!-- Divider before options -->
          <div
            class="hidden md:block w-px h-9 self-end bg-gray-200 dark:bg-slate-700"
            aria-hidden="true"
          ></div>

          <!-- State toggle -->
          <div class="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Etat</span
            >
            <div
              class="inline-flex h-11 md:h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"
            >
              <ToggleSwitch
                :checked="showOnlyNotPointed"
                label="Afficher uniquement les transactions non pointees"
                @change="showOnlyNotPointed = $event"
              />
              <span
                class="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
                >Non pointees</span
              >
            </div>
          </div>

          <!-- A row a bank sync inserted or claimed and then lost the
               reference to: cleared to "aucun", or a correction still
               pending on the other side of a swap. -->
          <div class="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >Synchro bancaire</span
            >
            <div
              class="inline-flex h-11 md:h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"
            >
              <ToggleSwitch
                :checked="needsBankReview"
                label="Afficher uniquement les transactions a reaffecter"
                data-testid="needs-bank-review-toggle"
                @change="needsBankReview = $event"
              />
              <span
                class="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
                >A reaffecter</span
              >
            </div>
          </div>
        </div>

        <!-- Toolbar: result count + actions -->
        <template #summary>
          <span aria-live="polite">
            <span class="md:hidden">{{ totalTransactions }} résultat(s)</span>
            <span class="hidden md:inline"
              >{{ totalTransactions }} transaction(s)</span
            >
          </span>
        </template>

        <template #actions>
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
            <span class="hidden md:inline md:ml-1.5">Réinitialiser</span>
          </button>
          <!-- Selection mode toggle -->
          <button
            class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-2 md:px-3 md:py-1.5 text-sm font-medium rounded-lg transition-colors"
            :class="
              isSelectionMode
                ? 'text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/40 border border-primary-300 dark:border-primary-700'
                : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600'
            "
            data-testid="toggle-selection-mode"
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
              isSelectionMode ? 'Mode sélection actif' : 'Sélection multiple'
            }}</span>
          </button>
        </template>
      </FilterDisclosure>

      <!-- What the list is currently filtered on, each chip removable -->
      <FilterChips
        v-if="activeFilterChips.length > 0"
        :chips="activeFilterChips"
        class="mb-4 -mt-2"
        @remove="removeFilterChip"
        @clear="resetFilters"
      />

      <!--
        Ticking every box selects the page, not the filter. Saying so — and
        offering the escalation explicitly — is what stops a bulk action from
        silently covering an eighth of what the user meant.
      -->
      <div
        v-if="isSelectionMode && canSelectWholeFilter"
        data-testid="select-whole-filter-banner"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-300"
      >
        <span>
          Les <strong>{{ selectedIds.size }}</strong> transactions de cette page
          sont sélectionnées.
        </span>
        <button
          type="button"
          data-testid="select-whole-filter"
          class="font-semibold underline underline-offset-2 hover:no-underline"
          @click="selectWholeFilter"
        >
          Selectionner les {{ matchingCount }} transactions du filtre
        </button>
      </div>

      <div
        v-else-if="isSelectionMode && isWholeFilterSelected"
        data-testid="whole-filter-selected-banner"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-300"
      >
        <span>
          Les <strong>{{ matchingCount }}</strong> transactions du filtre sont
          sélectionnées, au-delà de cette page.
        </span>
        <button
          type="button"
          class="font-semibold underline underline-offset-2 hover:no-underline"
          @click="clearSelection"
        >
          Annuler la selection
        </button>
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
          class="hidden md:flex bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-4 mb-6 items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <span
              class="text-sm font-medium text-primary-700 dark:text-primary-300"
            >
              {{ selectedCount }} transaction(s) sélectionnée(s)
            </span>
            <button
              class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
              @click="exitSelectionMode"
            >
              Quitter la selection
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              :disabled="isBulkUpdating"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
              data-testid="bulk-pointed"
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
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
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
              Changer de catégorie
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
            class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-primary-50 dark:bg-primary-900/50 border-t border-primary-200 dark:border-primary-700 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span
                  class="text-sm font-medium text-primary-700 dark:text-primary-300"
                >
                  {{ selectedCount }} select.
                </span>
                <button
                  class="text-sm text-primary-600 dark:text-primary-400 underline"
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
                  class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-primary-700 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded-lg disabled:opacity-50"
                  title="Changer de catégorie"
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
          role="alert"
          class="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
        >
          {{ transactionsError }}
        </div>

        <!-- Loading state -->
        <div
          v-if="isLoadingTransactions"
          class="space-y-3 p-4"
          aria-busy="true"
        >
          <SkeletonBlock v-for="n in 8" :key="n" class="h-12" />
        </div>

        <!-- Table -->
        <template v-else-if="!transactionsError">
          <EmptyState
            v-if="transactions.length === 0"
            :title="
              hasActiveFilters
                ? 'Aucune transaction ne correspond aux filtres actifs'
                : 'Aucune transaction pour le moment'
            "
          >
            <template #action>
              <BaseButton
                v-if="hasActiveFilters"
                variant="secondary"
                data-testid="empty-state-reset-filters"
                @click="resetFilters"
              >
                Réinitialiser les filtres
              </BaseButton>
              <RouterLink
                v-else
                to="/import"
                class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 dark:bg-primary-500 rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
              >
                Importer des transactions
              </RouterLink>
            </template>
          </EmptyState>

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
                  class="h-4 w-4 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-slate-600 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:bg-slate-700"
                  data-testid="select-all"
                  @change="toggleSelectAll"
                />
              </div>
              <div class="col-span-1">
                <button
                  type="button"
                  data-testid="sort-by-date"
                  class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  :aria-label="`Trier par date, ${sortBy === 'date' && sortOrder === 'desc' ? 'croissant' : 'décroissant'}`"
                  @click="toggleSort('date')"
                >
                  Date
                  <span v-if="sortBy === 'date'" aria-hidden="true">{{
                    sortOrder === 'desc' ? '↓' : '↑'
                  }}</span>
                </button>
              </div>
              <div class="col-span-3">Description</div>
              <div class="col-span-2">Note</div>
              <div class="col-span-1 text-right">
                <button
                  type="button"
                  data-testid="sort-by-amount"
                  class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  :aria-label="`Trier par montant, ${sortBy === 'amount' && sortOrder === 'desc' ? 'croissant' : 'décroissant'}`"
                  @click="toggleSort('amount')"
                >
                  Montant
                  <span v-if="sortBy === 'amount'" aria-hidden="true">{{
                    sortOrder === 'desc' ? '↓' : '↑'
                  }}</span>
                </button>
              </div>
              <div class="col-span-2">Catégorie</div>
              <div class="col-span-1 text-center">Pointé</div>
              <div class="col-span-1 text-center">Actions</div>
            </div>

            <!-- Transactions rows -->
            <div class="divide-y dark:divide-slate-700">
              <TransactionRow
                v-for="tx in transactions"
                :key="tx.id"
                :transaction="tx"
                :reimbursements="getReimbursementsForTransaction(tx.id)"
                :remaining-amount="getRemainingAmount(tx)"
                :all-tags="tagsStore.tags"
                :selection-mode="isSelectionMode"
                :selected="selectedIds.has(tx.id)"
                :is-editing-note="editingNoteId === tx.id"
                :reimbursements-expanded="expandedReimbursementsTxId === tx.id"
                :settlement-loading="isLoadingSettlement"
                @toggle-select="toggleSelection(tx.id)"
                @open-category="openCategoryModal(tx)"
                @toggle-pointed="togglePointed(tx)"
                @start-note="startEditNote(tx)"
                @save-note="note => saveNote(tx, note)"
                @cancel-note="cancelEditNote"
                @open-reimbursement="openReimbursementModal(tx)"
                @toggle-reimbursements="toggleReimbursementsExpand(tx.id)"
                @open-settlement="openSettlementDetail"
                @delete-reimbursement="handleDeleteReimbursement"
                @attach-tag="id => handleAttachTag(tx, id)"
                @detach-tag="id => handleDetachTag(tx, id)"
                @create-tag="name => handleCreateTag(tx, name)"
              />
            </div>

            <!-- Pagination -->
            <div
              v-if="totalPages > 1"
              class="flex items-center justify-between px-4 py-4 border-t dark:border-slate-700"
            >
              <div
                class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400"
              >
                <span>Page {{ currentPage }} sur {{ totalPages }}</span>
                <label class="inline-flex items-center gap-1.5">
                  <span class="sr-only">Transactions par page</span>
                  <select
                    v-model.number="pageSize"
                    data-testid="page-size-select"
                    class="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300"
                  >
                    <option
                      v-for="size in PAGE_SIZES"
                      :key="size"
                      :value="size"
                    >
                      {{ size }} / page
                    </option>
                  </select>
                </label>
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
                    class="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400"
                  >
                    ...
                  </span>
                  <button
                    v-else
                    class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                    :class="
                      page === currentPage
                        ? 'bg-primary-600 dark:bg-primary-500 text-white'
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
      v-model:subcategory-id="bulkSubcategoryId"
      :is-open="showBulkCategoryModal"
      :categories="allCategories"
      :subcategories="allSubcategories"
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

    <!-- Settlement detail (read-only) for income transactions -->
    <SettlementDetailModal
      :is-open="showSettlementDetailModal"
      :settlement="selectedSettlement"
      hide-delete
      @close="closeSettlementDetail"
    />
  </div>
</template>

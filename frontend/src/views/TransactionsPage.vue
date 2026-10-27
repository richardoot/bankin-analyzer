<script setup lang="ts">
  import { ref, computed, onMounted, nextTick, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePersonsStore } from '@/stores/persons'
  import { useAccountsStore } from '@/stores/accounts'
  import { useTagsStore } from '@/stores/tags'
  import { api, recurrenceFilterKey } from '@/lib/api'
  import type {
    RecurrenceDto,
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
  import MarkRecurringModal, {
    type MarkRecurringChoice,
  } from '@/components/transactions/MarkRecurringModal.vue'
  import BulkCategoryModal from '@/components/transactions/BulkCategoryModal.vue'
  import TransactionAmortizationModal from '@/components/transactions/TransactionAmortizationModal.vue'
  import TransactionRow from '@/components/transactions/TransactionRow.vue'
  import SettlementDetailModal from '@/components/settlements/SettlementDetailModal.vue'
  import SingleSettlementModal from '@/components/settlements/SingleSettlementModal.vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import {
    EXCEPTIONAL_LABEL,
    NATURE_LABEL,
    NO_CATEGORY,
    RHYTHM_LABEL,
    hasTransactionsQuery,
    parseTransactionsQuery,
    sameTransactionsQuery,
    transactionsLink,
    transactionsQuery,
    type ExceptionalFilter,
    type NatureFilter,
    type RhythmFilter,
    type TransactionsLinkFilters,
  } from '@/lib/transactionsLink'
  import FilterChips from '@/components/ui/FilterChips.vue'
  import FilterDisclosure from '@/components/ui/FilterDisclosure.vue'
  import type { FilterChip } from '@/components/ui/FilterChips.vue'
  import { useToast } from '@/composables/useToast'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import SegmentedControl, {
    type SegmentedOption,
  } from '@/components/ui/SegmentedControl.vue'
  import IconCheck from '@/components/icons/IconCheck.vue'
  import IconClipboard from '@/components/icons/IconClipboard.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import IconChevronLeft from '@/components/icons/IconChevronLeft.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import IconSearch from '@/components/icons/IconSearch.vue'
  import IconTag from '@/components/icons/IconTag.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import { rowGridClass } from '@/components/transactions/rowGrid'
  import { useSuppressTabBar } from '@/composables/useMobileNavigation'

  const toast = useToast()

  const personsStore = usePersonsStore()
  const accountsStore = useAccountsStore()
  const tagsStore = useTagsStore()

  // Transactions state
  const transactions = ref<TransactionDto[]>([])
  const isLoadingTransactions = ref(false)
  /**
   * Set once the first answer is in. Before it, the list is a skeleton;
   * after it, every refetch (a sort, a page, a filter) keeps the current
   * rows on screen, dimmed, until the next answer replaces them — no
   * flash of placeholders, no scroll jump.
   */
  const hasLoadedOnce = ref(false)
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
  // The selection bar takes the tab bar's place below lg: one bottom bar.
  useSuppressTabBar(isSelectionMode)

  // LocalStorage key for filters
  const FILTERS_STORAGE_KEY = 'transactions-filters'

  // Load saved filters from localStorage
  function loadSavedFilters(): {
    typeFilter: 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER'
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
  type ClassicFilters = typeof savedFilters

  const route = useRoute()
  const router = useRouter()

  /**
   * The URL is the shareable form of the view: pasting a link restores it,
   * and the Back button returns to the page that was left. A link that
   * names any filter wins over localStorage — and replaces it: the sender's
   * intent beats this browser's leftovers. The format is the one contract
   * in `lib/transactionsLink`; this page only maps it onto its controls.
   */
  function classicFiltersFromLink(
    link: TransactionsLinkFilters
  ): ClassicFilters {
    return {
      typeFilter: link.type ?? 'ALL',
      selectedCategory: link.categoryId ?? null,
      // A subcategory is meaningless without its parent category.
      selectedSubcategory: link.categoryId
        ? (link.subcategoryId ?? null)
        : null,
      selectedAccount: link.account ?? null,
      selectedTag: link.tagId ?? null,
      showOnlyNotPointed: link.notPointed ?? false,
      searchKeyword: link.q ?? '',
      filterStartDate: link.from ?? '',
      filterEndDate: link.to ?? '',
      amountMin: link.min !== undefined ? String(link.min) : '',
      amountMax: link.max !== undefined ? String(link.max) : '',
    }
  }

  const arrivedByLink = hasTransactionsQuery(route.query)
  const initialLink = parseTransactionsQuery(route.query)
  const initialFilters = arrivedByLink
    ? classicFiltersFromLink(initialLink)
    : savedFilters

  // Filters
  const typeFilter = ref<'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER'>(
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
  const needsBankReview = ref(initialLink.review ?? false)
  /**
   * The lines of one recurring charge, reached from the recurrences page.
   * Named by `<amountBucket>:<merchantKey>`, which survives a recompute; the
   * label only names the chip. One-off, like the review filter: not saved.
   */
  const recurrenceFilter = ref<string | null>(initialLink.recurrence ?? null)
  const recurrenceLabel = ref<string | null>(
    initialLink.recurrenceLabel ?? null
  )
  /**
   * The rows of exceptional events, left out (the « Vie courante » reading
   * of the Dashboard and the Budget) or kept alone. A link sets it, the
   * filter panel offers it; not saved, like the review filter: it answers
   * the figure it came from, it is not a way to read the list every day.
   */
  const exceptionalFilter = ref<ExceptionalFilter | null>(
    initialLink.exceptional ?? null
  )
  /**
   * The two attributes the Dashboard reads spending through — nature and
   * rhythm — by the Dashboard's own rule. Not saved either.
   */
  const natureFilter = ref<NatureFilter | null>(initialLink.nature ?? null)
  const rhythmFilter = ref<RhythmFilter | null>(initialLink.rhythm ?? null)
  /**
   * Several categories, several series at once: only a link names them —
   * the « Autres » of a donut, a group of recurrences. The selects above
   * keep picking one; these are named in a chip and dropped from it.
   */
  const categoryIdsFilter = ref<string[]>(initialLink.categoryIds ?? [])
  const recurrencesFilter = ref<string[]>(initialLink.recurrences ?? [])
  /**
   * « Lissées »: only the expenses smoothed over several months. Not saved,
   * like the event filter: a question asked now, not a way to read the list.
   */
  const amortizedFilter = ref(initialLink.amortized ?? false)
  /**
   * The rows of one tag family — any of its tags, each row once. Reached
   * from a family's figures; not saved, like the event filter.
   */
  const tagFamilyFilter = ref<string | null>(initialLink.tagFamilyId ?? null)
  // The chip names the family: its list is only needed once one is asked for.
  watch(
    tagFamilyFilter,
    id => {
      const known = tagsStore.families.some(f => f.id === id)
      if (id && !known && !tagsStore.familiesLoading)
        void tagsStore.fetchFamilies()
    },
    { immediate: true }
  )
  /**
   * The context a link can carry and the controls above cannot express: a
   * person's debts, a settlement, an import, a sync run, an exact list of
   * rows. Named in the banner above the list rather than in a chip, and
   * never saved: they describe where the user came from, not a habit.
   */
  const personFilter = ref<string | null>(initialLink.personId ?? null)
  const reimbursementFilter = ref<'open' | 'all' | null>(
    initialLink.reimbursement ?? null
  )
  const settlementFilter = ref<string | null>(initialLink.settlementId ?? null)
  const importFilter = ref<string | null>(initialLink.importId ?? null)
  const syncRunFilter = ref<string | null>(initialLink.syncRunId ?? null)
  const idsFilter = ref<string[]>(initialLink.ids ?? [])
  /**
   * Rows shown on top of the filters: the smoothed purchases a « Vie
   * courante » figure counts by a slice although they are dated elsewhere.
   */
  const alsoIdsFilter = ref<string[]>(initialLink.alsoIds ?? [])
  /** What the sender called the view, and whether its figure was netted. */
  const contextLabel = ref<string | null>(initialLink.label ?? null)
  const grossAmounts = ref(initialLink.gross ?? false)
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
    recurrenceFilter.value = null
    recurrenceLabel.value = null
    exceptionalFilter.value = null
    natureFilter.value = null
    rhythmFilter.value = null
    categoryIdsFilter.value = []
    recurrencesFilter.value = []
    amortizedFilter.value = false
    tagFamilyFilter.value = null
    clearContext()
    localStorage.removeItem(FILTERS_STORAGE_KEY)
  }

  /** Drop what a link brought that no control can: the context and its note. */
  function clearContext(): void {
    personFilter.value = null
    reimbursementFilter.value = null
    settlementFilter.value = null
    importFilter.value = null
    syncRunFilter.value = null
    idsFilter.value = []
    alsoIdsFilter.value = []
    contextLabel.value = null
    grossAmounts.value = false
  }

  const hasContextFilter = computed(
    () =>
      personFilter.value !== null ||
      reimbursementFilter.value !== null ||
      settlementFilter.value !== null ||
      importFilter.value !== null ||
      syncRunFilter.value !== null ||
      idsFilter.value.length > 0 ||
      alsoIdsFilter.value.length > 0
  )

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
      needsBankReview.value ||
      recurrenceFilter.value !== null ||
      exceptionalFilter.value !== null ||
      natureFilter.value !== null ||
      rhythmFilter.value !== null ||
      categoryIdsFilter.value.length > 0 ||
      recurrencesFilter.value.length > 0 ||
      amortizedFilter.value ||
      tagFamilyFilter.value !== null ||
      hasContextFilter.value
    )
  })

  /**
   * The banner's title: what the sender said, or the context read off the
   * filters. A person is named from the store; the rest is named by kind,
   * the sender being the one who knows the date of a settlement or an
   * import.
   */
  const contextTitle = computed<string | null>(() => {
    if (contextLabel.value) return contextLabel.value
    if (personFilter.value) {
      const name =
        personsStore.persons.find(p => p.id === personFilter.value)?.name ?? '…'
      return reimbursementFilter.value === 'all'
        ? `Toutes les dettes de ${name}`
        : `Dettes ouvertes de ${name}`
    }
    if (reimbursementFilter.value)
      return reimbursementFilter.value === 'all'
        ? 'Toutes les dettes'
        : 'Toutes les dettes ouvertes'
    if (settlementFilter.value) return 'Un règlement'
    if (importFilter.value) return 'Un import'
    if (syncRunFilter.value) return 'Une synchronisation bancaire'
    const count = idsFilter.value.length
    if (count === 1) return 'Une transaction'
    if (count > 1) return `${count} transactions choisies`
    if (alsoIdsFilter.value.length > 0) return 'Le détail d’un total'
    if (grossAmounts.value) return 'Le détail d’un total'
    return null
  })

  /**
   * « Catégories : A, B, C » for a short list, « 5 catégories » beyond: a
   * chip is one line, not an inventory.
   */
  const categoriesChipLabel = computed(() => {
    const ids = categoryIdsFilter.value
    if (ids.length > 3) return `${ids.length} catégories`
    const names = ids.map(id =>
      id === NO_CATEGORY
        ? 'Sans catégorie'
        : (allCategories.value.find(c => c.id === id)?.name ?? '…')
    )
    return `Catégories : ${names.join(', ')}`
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
        label:
          typeFilter.value === 'EXPENSE'
            ? 'Dépenses'
            : typeFilter.value === 'INCOME'
              ? 'Revenus'
              : 'Transferts',
      })
    }
    if (selectedCategory.value === NO_CATEGORY) {
      chips.push({ key: 'category', label: 'Sans catégorie' })
    } else if (selectedCategory.value) {
      const name = allCategories.value.find(
        c => c.id === selectedCategory.value
      )?.name
      chips.push({ key: 'category', label: `Catégorie : ${name ?? '…'}` })
    }
    if (categoryIdsFilter.value.length > 0) {
      chips.push({ key: 'categories', label: categoriesChipLabel.value })
    }
    if (selectedSubcategory.value === NO_CATEGORY) {
      chips.push({ key: 'subcategory', label: 'Sans sous-catégorie' })
    } else if (selectedSubcategory.value) {
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
    if (tagFamilyFilter.value) {
      const name = tagsStore.families.find(
        f => f.id === tagFamilyFilter.value
      )?.name
      chips.push({ key: 'family', label: `Famille : ${name ?? '…'}` })
    }
    if (showOnlyNotPointed.value) {
      chips.push({ key: 'notPointed', label: 'Non pointées' })
    }
    if (needsBankReview.value) {
      chips.push({ key: 'review', label: 'À vérifier (banque)' })
    }
    if (recurrenceFilter.value) {
      chips.push({
        key: 'recurrence',
        label: `Charge récurrente${recurrenceLabel.value ? ` : ${recurrenceLabel.value}` : ''}`,
      })
    }
    if (recurrencesFilter.value.length > 0) {
      const count = recurrencesFilter.value.length
      chips.push({
        key: 'recurrences',
        label:
          count === 1 ? '1 charge récurrente' : `${count} charges récurrentes`,
      })
    }
    if (exceptionalFilter.value) {
      chips.push({
        key: 'exceptional',
        label: EXCEPTIONAL_LABEL[exceptionalFilter.value],
      })
    }
    if (natureFilter.value) {
      chips.push({
        key: 'nature',
        label: `Nature : ${NATURE_LABEL[natureFilter.value]}`,
      })
    }
    if (rhythmFilter.value) {
      chips.push({
        key: 'rhythm',
        label: `Rythme : ${RHYTHM_LABEL[rhythmFilter.value]}`,
      })
    }
    if (amortizedFilter.value) {
      chips.push({ key: 'amortized', label: 'Lissées' })
    }
    if (searchKeyword.value.trim()) {
      chips.push({ key: 'q', label: `« ${searchKeyword.value.trim()} »` })
    }
    if (filterStartDate.value) {
      chips.push({
        key: 'from',
        label: `Du ${formatDate(filterStartDate.value, 'medium')}`,
      })
    }
    if (filterEndDate.value) {
      chips.push({
        key: 'to',
        label: `Au ${formatDate(filterEndDate.value, 'medium')}`,
      })
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
      case 'family':
        tagFamilyFilter.value = null
        break
      case 'notPointed':
        showOnlyNotPointed.value = false
        break
      case 'review':
        needsBankReview.value = false
        break
      case 'recurrence':
        recurrenceFilter.value = null
        break
      case 'exceptional':
        exceptionalFilter.value = null
        break
      case 'categories':
        categoryIdsFilter.value = []
        break
      case 'recurrences':
        recurrencesFilter.value = []
        break
      case 'nature':
        natureFilter.value = null
        break
      case 'rhythm':
        rhythmFilter.value = null
        break
      case 'amortized':
        amortizedFilter.value = false
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
  const sortBy = ref<'date' | 'amount'>(initialLink.sort ?? 'date')
  const sortOrder = ref<'asc' | 'desc'>(initialLink.dir ?? 'desc')

  /** Toggle on the active column, switch column otherwise (desc first). */
  function toggleSort(column: 'date' | 'amount'): void {
    if (sortBy.value === column) {
      sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
    } else {
      sortBy.value = column
      sortOrder.value = 'desc'
    }
  }

  /**
   * The same sort as one choice among four, for the screens that have no
   * table header to click (below `lg`).
   */
  type SortChoice = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
  const SORT_OPTIONS: SegmentedOption<SortChoice>[] = [
    {
      value: 'date-desc',
      label: 'Récentes',
      title: 'Les plus récentes en premier',
      testId: 'sort-choice-date-desc',
    },
    {
      value: 'date-asc',
      label: 'Anciennes',
      title: 'Les plus anciennes en premier',
      testId: 'sort-choice-date-asc',
    },
    {
      value: 'amount-desc',
      label: 'Montant ↓',
      title: 'Les plus gros montants en premier',
      testId: 'sort-choice-amount-desc',
    },
    {
      value: 'amount-asc',
      label: 'Montant ↑',
      title: 'Les plus petits montants en premier',
      testId: 'sort-choice-amount-asc',
    },
  ]
  const sortChoice = computed<SortChoice>({
    get: () => `${sortBy.value}-${sortOrder.value}` as SortChoice,
    set: (choice: SortChoice) => {
      const [column, order] = choice.split('-') as [
        'date' | 'amount',
        'asc' | 'desc',
      ]
      sortBy.value = column
      sortOrder.value = order
    },
  })

  const PAGE_SIZES = [20, 50, 100] as const
  const pageSize = ref<number>(initialLink.size ?? 20)

  // Pagination
  const currentPage = ref(initialLink.page ?? 1)

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
      toast.error('Impossible de charger le détail du règlement')
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

  // « Sans catégorie » is a choice of the category select, not a category:
  // it has no subcategories, and no subcategory select to speak of.
  const hasRealCategory = computed(
    () =>
      selectedCategory.value !== null && selectedCategory.value !== NO_CATEGORY
  )

  // Computed: subcategories of the selected category — empty (and the select
  // disabled) as long as no category is picked.
  const filteredSubcategories = computed(() => {
    if (!hasRealCategory.value) return []
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
      tagFamilyId: tagFamilyFilter.value || undefined,
      isPointed: showOnlyNotPointed.value ? false : undefined,
      search: searchKeyword.value.trim() || undefined,
      startDate: filterStartDate.value || undefined,
      endDate: filterEndDate.value || undefined,
      amountMin:
        Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : undefined,
      amountMax:
        Number.isFinite(parsedMax) && parsedMax >= 0 ? parsedMax : undefined,
      needsBankReview: needsBankReview.value || undefined,
      recurrence: recurrenceFilter.value || undefined,
      ids: idsFilter.value.length > 0 ? idsFilter.value : undefined,
      personId: personFilter.value || undefined,
      reimbursement: reimbursementFilter.value || undefined,
      settlementId: settlementFilter.value || undefined,
      importId: importFilter.value || undefined,
      syncRunId: syncRunFilter.value || undefined,
      exceptional: exceptionalFilter.value || undefined,
      nature: natureFilter.value || undefined,
      rhythm: rhythmFilter.value || undefined,
      categoryIds:
        categoryIdsFilter.value.length > 0
          ? categoryIdsFilter.value
          : undefined,
      recurrences:
        recurrencesFilter.value.length > 0
          ? recurrencesFilter.value
          : undefined,
      amortized: amortizedFilter.value || undefined,
      alsoIds: alsoIdsFilter.value.length > 0 ? alsoIdsFilter.value : undefined,
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
  /**
   * The side the filing dialog opens on. A transfer has no side of its own,
   * so it opens on the one its sign says — and can be filed back there.
   */
  function filingKindOf(
    tx: TransactionDto | null | undefined
  ): 'EXPENSE' | 'INCOME' {
    if (!tx) return 'EXPENSE'
    if (tx.type === 'TRANSFER') return tx.amount < 0 ? 'EXPENSE' : 'INCOME'
    return tx.type
  }

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
        categoryId,
        categoryName: newCategory?.name,
        categoryIcon: newCategory?.icon ?? null,
        subcategoryId: subcategoryId ?? null,
      }
    }
    closeCategoryModal()

    try {
      // Null is a filing too: "à classer". And the type follows the
      // category server-side, so the row that comes back may be a transfer.
      const updated = await api.updateTransaction(tx.id, {
        categoryId,
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
      const { updated: count } = await api.bulkUpdateTransactions(
        bulkSelection(),
        { isPointed: pointed }
      )
      // Refresh transactions to get updated data
      await fetchTransactions()
      exitSelectionMode()
      toast.success(
        pointed
          ? `${count} transaction(s) pointée(s)`
          : `${count} transaction(s) dépointée(s)`
      )
    } catch (err) {
      console.error('Failed to bulk update pointed:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Échec de la mise à jour du pointage'
      )
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
        `${updated} transaction${updated > 1 ? 's' : ''} déplacée${updated > 1 ? 's' : ''}`
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

  /** The whole view, in the contract's terms: what the URL mirrors. */
  function linkFromState(): TransactionsLinkFilters {
    return {
      type: typeFilter.value === 'ALL' ? undefined : typeFilter.value,
      categoryId: selectedCategory.value ?? undefined,
      subcategoryId: selectedSubcategory.value ?? undefined,
      account: selectedAccount.value ?? undefined,
      tagId: selectedTag.value ?? undefined,
      tagFamilyId: tagFamilyFilter.value ?? undefined,
      notPointed: showOnlyNotPointed.value,
      review: needsBankReview.value,
      recurrence: recurrenceFilter.value ?? undefined,
      recurrenceLabel: recurrenceLabel.value ?? undefined,
      q: searchKeyword.value,
      from: filterStartDate.value,
      to: filterEndDate.value,
      min: amountMin.value,
      max: amountMax.value,
      personId: personFilter.value ?? undefined,
      reimbursement: reimbursementFilter.value ?? undefined,
      settlementId: settlementFilter.value ?? undefined,
      importId: importFilter.value ?? undefined,
      syncRunId: syncRunFilter.value ?? undefined,
      ids: idsFilter.value,
      exceptional: exceptionalFilter.value ?? undefined,
      nature: natureFilter.value ?? undefined,
      rhythm: rhythmFilter.value ?? undefined,
      categoryIds: categoryIdsFilter.value,
      recurrences: recurrencesFilter.value,
      amortized: amortizedFilter.value,
      alsoIds: alsoIdsFilter.value,
      label: contextLabel.value ?? undefined,
      gross: grossAmounts.value,
      sort: sortBy.value,
      dir: sortOrder.value,
      size: pageSize.value,
      page: currentPage.value,
    }
  }

  // Mirror the active filters into the URL. replace, not push: a keystroke
  // in the search box must not add a history entry. The route watcher below
  // sees the result, finds it equal to the state, and does nothing: no loop.
  function syncQuery(): void {
    void router.replace({ query: transactionsQuery(linkFromState()) })
  }

  /**
   * True while a link is being poured into the controls. The watchers
   * below stand down for that one flush: a link is applied in one go, not
   * as eleven filter changes each saving, mirroring and fetching — and the
   * category watcher must not wipe the subcategory the link just set.
   */
  let applyingLink = false
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * A link replaces the view: every control takes the link's value, blank
   * where the link says nothing, and the page starts at the link's page.
   * The remembered filters are replaced too — the sender's intent is the
   * new habit, not an overlay on the old one.
   */
  async function applyLink(link: TransactionsLinkFilters): Promise<void> {
    applyingLink = true
    const classic = classicFiltersFromLink(link)
    typeFilter.value = classic.typeFilter
    selectedCategory.value = classic.selectedCategory
    selectedSubcategory.value = classic.selectedSubcategory
    selectedAccount.value = classic.selectedAccount
    selectedTag.value = classic.selectedTag
    showOnlyNotPointed.value = classic.showOnlyNotPointed
    searchKeyword.value = classic.searchKeyword
    filterStartDate.value = classic.filterStartDate
    filterEndDate.value = classic.filterEndDate
    amountMin.value = classic.amountMin
    amountMax.value = classic.amountMax
    needsBankReview.value = link.review ?? false
    recurrenceFilter.value = link.recurrence ?? null
    recurrenceLabel.value = link.recurrenceLabel ?? null
    personFilter.value = link.personId ?? null
    reimbursementFilter.value = link.reimbursement ?? null
    settlementFilter.value = link.settlementId ?? null
    importFilter.value = link.importId ?? null
    syncRunFilter.value = link.syncRunId ?? null
    idsFilter.value = link.ids ?? []
    exceptionalFilter.value = link.exceptional ?? null
    natureFilter.value = link.nature ?? null
    rhythmFilter.value = link.rhythm ?? null
    categoryIdsFilter.value = link.categoryIds ?? []
    recurrencesFilter.value = link.recurrences ?? []
    amortizedFilter.value = link.amortized ?? false
    tagFamilyFilter.value = link.tagFamilyId ?? null
    alsoIdsFilter.value = link.alsoIds ?? []
    contextLabel.value = link.label ?? null
    grossAmounts.value = link.gross ?? false
    // Sort and page size are how the list reads, not what it shows: a link
    // that says nothing about them leaves them be.
    if (link.sort) sortBy.value = link.sort
    if (link.dir) sortOrder.value = link.dir
    if (link.size) pageSize.value = link.size
    currentPage.value = link.page ?? 1
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    // Let the watchers run (and stand down) before acting once.
    await nextTick()
    applyingLink = false
    saveFilters()
    syncQuery()
    void fetchTransactions()
  }

  /**
   * A link reaching this page while it is open — a settlement's rows from a
   * line's dialog, a series from a badge, the Back button returning to an
   * earlier link — is a navigation to react to. The page's own mirroring
   * (`syncQuery`, a replace) comes through here too and is told apart by
   * its content: a query equal to the state is nothing to apply. A bare
   * `/transactions` (the navbar) carries no view and changes nothing.
   */
  watch(
    () => route.query,
    query => {
      if (!hasTransactionsQuery(query)) return
      const incoming = parseTransactionsQuery(query)
      if (
        sameTransactionsQuery(
          transactionsQuery(incoming),
          transactionsQuery(linkFromState())
        )
      )
        return
      void applyLink(incoming)
    }
  )

  // Apply a filter change: persist, jump back to page 1 and refetch. Setting
  // currentPage triggers its own watch (which fetches); when already on page 1
  // that watch won't fire, so we fetch manually.
  function applyFilterChange() {
    if (applyingLink) return
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
    if (applyingLink) return
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
      recurrenceFilter,
      exceptionalFilter,
      natureFilter,
      rhythmFilter,
      categoryIdsFilter,
      recurrencesFilter,
      amortizedFilter,
      tagFamilyFilter,
      alsoIdsFilter,
      personFilter,
      reimbursementFilter,
      settlementFilter,
      importFilter,
      syncRunFilter,
      idsFilter,
      filterStartDate,
      filterEndDate,
      sortBy,
      sortOrder,
      pageSize,
    ],
    applyFilterChange
  )

  // Debounce free-text / numeric inputs so we don't fire a request per keystroke
  watch([searchKeyword, amountMin, amountMax], () => {
    if (applyingLink) return
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(applyFilterChange, 350)
  })

  // Refetch when page changes
  const listCard = ref<InstanceType<typeof BaseCard> | null>(null)
  watch(currentPage, (newPage, oldPage) => {
    if (applyingLink) return
    if (newPage !== oldPage) {
      syncQuery()
      fetchTransactions()
      scrollToListTop()
    }
  })

  /**
   * Turning a page from the pagination at the bottom of a long list: the
   * new page reads from its first row, so the list top comes back under
   * the navbar — only when it had been scrolled past, never otherwise.
   */
  function scrollToListTop(): void {
    const el = listCard.value?.$el as HTMLElement | undefined
    if (!el || typeof el.getBoundingClientRect !== 'function') return
    const top = el.getBoundingClientRect().top
    if (top >= 0) return
    window.scrollBy({ top: top - 72 })
  }

  // The answer to the latest request is the only one that may land: a
  // quick second filter change must not be overwritten by the slow first.
  let fetchSequence = 0

  // Fetch transactions
  async function fetchTransactions() {
    const sequence = ++fetchSequence
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
      if (sequence !== fetchSequence) return
      transactions.value = response.data
      transactionsMeta.value = response.meta
      hasLoadedOnce.value = true
      // Clear selection on page change
      clearSelection()
    } catch (err) {
      if (sequence !== fetchSequence) return
      transactionsError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de charger les transactions'
    } finally {
      if (sequence === fetchSequence) isLoadingTransactions.value = false
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
  /**
   * Show every charge of the series this line belongs to — the series
   * alone, not the series inside the current filters: a link, like any
   * other, that the route watcher applies. Pushed, so Back returns here.
   */
  function showRecurrence(tx: TransactionDto): void {
    if (!tx.recurrence) return
    void router.push(
      transactionsLink({
        recurrence: recurrenceFilterKey(tx.recurrence),
        recurrenceLabel: tx.recurrence.name,
      })
    )
  }

  /** The expense being marked as a recurring charge, while its modal is open. */
  const markRecurringTx = ref<TransactionDto | null>(null)
  const isMarkingRecurring = ref(false)
  /** The series it can be attached to, loaded as the modal opens. */
  const followedRecurrences = ref<RecurrenceDto[] | null>(null)

  async function openMarkRecurring(tx: TransactionDto): Promise<void> {
    markRecurringTx.value = tx
    followedRecurrences.value = null
    try {
      followedRecurrences.value = (await api.getRecurrences()).recurrences
    } catch {
      followedRecurrences.value = []
    }
  }

  async function confirmMarkRecurring(
    choice: MarkRecurringChoice
  ): Promise<void> {
    const tx = markRecurringTx.value
    if (!tx || isMarkingRecurring.value) return
    isMarkingRecurring.value = true
    try {
      if (choice.kind === 'new') {
        await api.markTransactionRecurring({
          transactionId: tx.id,
          period: choice.period,
        })
        toast.success(`« ${tx.description} » suivi comme abonnement`)
      } else {
        const list = await api.linkTransactionToRecurrence({
          transactionId: tx.id,
          merchantKey: choice.merchantKey,
          amountBucket: choice.amountBucket,
        })
        const target = list.recurrences.find(
          r =>
            r.merchantKey === choice.merchantKey &&
            r.amountBucket === choice.amountBucket
        )
        toast.success(`Rattaché à « ${target?.name ?? 'l’abonnement'} »`)
      }
      markRecurringTx.value = null
      // The line now carries its badge.
      await fetchTransactions()
    } catch {
      toast.error("L'abonnement n'a pas pu être enregistré")
    } finally {
      isMarkingRecurring.value = false
    }
  }

  async function unlinkRecurrence(tx: TransactionDto): Promise<void> {
    try {
      await api.unlinkTransactionFromRecurrence(tx.id)
      toast.success(`Détaché de « ${tx.recurrence?.name ?? 'l’abonnement'} »`)
      await fetchTransactions()
    } catch {
      toast.error("La transaction n'a pas pu être détachée")
    }
  }

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

  // Settle one open debt from the expense's list: the same single-line modal
  // as the Remboursements page. The debt comes from `reimbursements`, loaded
  // with its expense (`includeTransaction=true`), which the modal reads.
  // The debt stays set after closing so the modal keeps its content while it
  // fades out, as on the Remboursements page.
  const settlingReimbursement = ref<ReimbursementDto | null>(null)
  const showSettlementModal = ref(false)

  function openSettlement(reimbursement: ReimbursementDto) {
    settlingReimbursement.value =
      reimbursements.value.find(r => r.id === reimbursement.id) ?? reimbursement
    showSettlementModal.value = true
  }

  function closeSettlement() {
    showSettlementModal.value = false
  }

  // No optimistic update: the debt's status and the income's links are tied,
  // and the server is the source for both.
  async function handleSettlementCreated(settlement: SettlementDto) {
    showSettlementModal.value = false
    toast.success(
      `Règlement de ${settlement.personName} enregistré (${formatCurrency(settlement.amountUsed)})`
    )
    await Promise.all([fetchReimbursements(), fetchTransactions()])
  }

  // Delete reimbursement — asked first: one click on a 26 px cross used to
  // drop the debt for good.
  const reimbursementToDelete = ref<ReimbursementDto | null>(null)
  const isDeletingReimbursement = ref(false)

  function handleDeleteReimbursement(id: string) {
    reimbursementToDelete.value =
      reimbursements.value.find(r => r.id === id) ?? null
  }

  function cancelDeleteReimbursement() {
    if (isDeletingReimbursement.value) return
    reimbursementToDelete.value = null
  }

  async function confirmDeleteReimbursement() {
    const target = reimbursementToDelete.value
    if (!target) return
    isDeletingReimbursement.value = true
    try {
      await api.deleteReimbursement(target.id)
      reimbursements.value = reimbursements.value.filter(
        r => r.id !== target.id
      )
      reimbursementToDelete.value = null
      toast.success('Remboursement supprimé')
    } catch (err) {
      console.error('Failed to delete reimbursement:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer le remboursement'
      )
    } finally {
      isDeletingReimbursement.value = false
    }
  }

  // Go to page
  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  // ── Smoothing over several months ──
  /** The expense whose smoothing is being set, while its dialog is open. */
  const amortizationTx = ref<TransactionDto | null>(null)
  const isSavingAmortization = ref(false)
  /** The server's refusal, kept in the dialog rather than a toast. */
  const amortizationError = ref<string | null>(null)

  function openAmortization(tx: TransactionDto): void {
    amortizationTx.value = tx
    amortizationError.value = null
  }

  function closeAmortization(): void {
    if (isSavingAmortization.value) return
    amortizationTx.value = null
  }

  /**
   * The exceptional tags a row carries: the dialog refuses the smoothing
   * with their names before the server has to.
   */
  function exceptionalTagNamesOf(tx: TransactionDto | null): string[] {
    if (!tx) return []
    const exceptional = new Set(
      tagsStore.tags.filter(t => t.isExceptional).map(t => t.id)
    )
    return (tx.tags ?? []).filter(t => exceptional.has(t.id)).map(t => t.name)
  }

  async function saveAmortization(months: number | null): Promise<void> {
    const tx = amortizationTx.value
    if (!tx || isSavingAmortization.value) return
    isSavingAmortization.value = true
    amortizationError.value = null
    try {
      const updated = await api.updateTransaction(tx.id, {
        amortizationMonths: months,
      })
      // Located again: the list may have been replaced while waiting.
      const found = locate(tx.id)
      if (found) transactions.value[found.index] = updated
      toast.success(
        months === null
          ? `« ${tx.description} » n'est plus étalé`
          : `« ${tx.description} » étalé sur ${months} mois`
      )
      amortizationTx.value = null
    } catch (err) {
      amortizationError.value =
        err instanceof Error
          ? err.message
          : "L'étalement n'a pas pu être enregistré"
    } finally {
      isSavingAmortization.value = false
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
    // A link replaces the remembered filters, not only the ones on screen.
    if (arrivedByLink) saveFilters()
    syncQuery()
    fetchTransactions()
    fetchCategories()
    fetchSubcategories()
    fetchReimbursements()
  })
</script>

<template>
  <PageShell width="wide">
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
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 dark:text-gray-400"
          />
          <input
            v-model="searchKeyword"
            type="search"
            data-testid="transactions-search-input"
            aria-label="Rechercher une transaction (libellé, note, sous-catégorie)"
            placeholder="Rechercher…"
            class="w-full pl-10 pr-3 py-3 md:py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500"
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
          <SectionLabel as="span">Type</SectionLabel>
          <select
            v-model="typeFilter"
            data-testid="transactions-type-filter"
            class="h-11 md:h-9 w-full md:w-36 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option value="ALL">Toutes</option>
            <option value="EXPENSE">Dépenses</option>
            <option value="INCOME">Revenus</option>
            <option value="TRANSFER">Transferts</option>
          </select>
        </div>

        <!-- Category -->
        <div class="flex flex-col gap-1">
          <SectionLabel as="span">Catégorie</SectionLabel>
          <select
            v-model="selectedCategory"
            data-testid="transactions-category-filter"
            class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">Toutes</option>
            <option :value="NO_CATEGORY">Sans catégorie</option>
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
              hasRealCategory
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-gray-300 dark:text-gray-600'
            "
            >Sous-catégorie</span
          >
          <select
            v-model="selectedSubcategory"
            :disabled="!hasRealCategory"
            data-testid="transactions-subcategory-filter"
            :title="
              hasRealCategory
                ? undefined
                : 'Sélectionnez d\'abord une catégorie'
            "
            class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-slate-800/60 dark:disabled:text-gray-500"
          >
            <option :value="null">
              {{ hasRealCategory ? 'Toutes' : 'Choisir une catégorie' }}
            </option>
            <option v-if="hasRealCategory" :value="NO_CATEGORY">
              Sans sous-catégorie
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
          <SectionLabel as="span">Compte</SectionLabel>
          <select
            v-model="selectedAccount"
            data-testid="transactions-account-filter"
            class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
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
          <SectionLabel as="span">Étiquette</SectionLabel>
          <select
            v-model="selectedTag"
            data-testid="transactions-tag-filter"
            class="h-11 md:h-9 w-full md:w-40 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">Toutes</option>
            <option v-for="tag in tagsStore.tags" :key="tag.id" :value="tag.id">
              {{ tag.name }}
            </option>
          </select>
        </div>

        <!-- Exceptional events: the « Vie courante » reading of the
               Dashboard and the Budget leaves them out. -->
        <div class="flex flex-col gap-1">
          <SectionLabel as="span">Événements</SectionLabel>
          <select
            v-model="exceptionalFilter"
            data-testid="transactions-exceptional-filter"
            aria-label="Événements exceptionnels"
            class="h-11 md:h-9 w-full md:w-44 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">Tous</option>
            <option value="exclude">Hors événements</option>
            <option value="only">Événements seulement</option>
          </select>
        </div>

        <!-- Nature and rhythm, by the Dashboard's rule: the subcategory's,
               else the category's; a recurrence makes a line committed. -->
        <div class="flex flex-col gap-1">
          <SectionLabel as="span">Nature</SectionLabel>
          <select
            v-model="natureFilter"
            data-testid="transactions-nature-filter"
            aria-label="Nature"
            class="h-11 md:h-9 w-full md:w-36 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">Toutes</option>
            <option value="ESSENTIAL">Essentiel</option>
            <option value="PLEASURE">Plaisir</option>
            <option :value="NO_CATEGORY">À migrer</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <SectionLabel as="span">Rythme</SectionLabel>
          <select
            v-model="rhythmFilter"
            data-testid="transactions-rhythm-filter"
            aria-label="Rythme"
            class="h-11 md:h-9 w-full md:w-36 px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">Tous</option>
            <option value="COMMITTED">Engagé</option>
            <option value="VARIABLE">Variable</option>
            <option :value="NO_CATEGORY">À migrer</option>
          </select>
        </div>

        <!-- Divider between attribute filters and range filters -->
        <div
          class="hidden md:block w-px h-9 self-end bg-gray-200 dark:bg-slate-700"
          aria-hidden="true"
        ></div>

        <!-- Date window -->
        <div class="col-span-2 flex flex-col gap-1">
          <SectionLabel as="span">Période</SectionLabel>
          <div class="flex items-center gap-1.5">
            <input
              v-model="filterStartDate"
              type="date"
              aria-label="Date de début"
              data-testid="transactions-start-date-filter"
              class="h-11 md:h-9 min-w-0 flex-1 md:w-36 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            />
            <span class="shrink-0 text-gray-500 dark:text-gray-400">→</span>
            <input
              v-model="filterEndDate"
              type="date"
              aria-label="Date de fin"
              data-testid="transactions-end-date-filter"
              class="h-11 md:h-9 min-w-0 flex-1 md:w-36 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <!-- Amount range -->
        <div class="col-span-2 flex flex-col gap-1">
          <SectionLabel as="span">Montant (€)</SectionLabel>
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
              class="h-11 md:h-9 min-w-0 flex-1 md:w-24 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500"
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
              class="h-11 md:h-9 min-w-0 flex-1 md:w-24 md:flex-none px-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base md:text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500"
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
          <SectionLabel as="span">État</SectionLabel>
          <div
            class="inline-flex h-11 md:h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"
          >
            <ToggleSwitch
              :checked="showOnlyNotPointed"
              label="Afficher uniquement les transactions non pointées"
              @change="showOnlyNotPointed = $event"
            />
            <span
              class="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
              >Non pointées</span
            >
          </div>
        </div>

        <!-- Expenses smoothed over several months in the everyday reading -->
        <div class="col-span-2 flex flex-col gap-1 md:col-span-1">
          <SectionLabel as="span">Lissage</SectionLabel>
          <div
            class="inline-flex h-11 md:h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"
          >
            <ToggleSwitch
              :checked="amortizedFilter"
              label="Afficher uniquement les dépenses lissées sur plusieurs mois"
              data-testid="transactions-amortized-filter"
              @change="amortizedFilter = $event"
            />
            <span
              class="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
              >Lissées</span
            >
          </div>
        </div>

        <!-- A row a bank sync inserted or claimed and then lost the
               reference to: cleared to "aucun", or a correction still
               pending on the other side of a swap. -->
        <div class="col-span-2 flex flex-col gap-1 md:col-span-1">
          <SectionLabel as="span">Synchro bancaire</SectionLabel>
          <div
            class="inline-flex h-11 md:h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"
          >
            <ToggleSwitch
              :checked="needsBankReview"
              label="Afficher uniquement les transactions à réaffecter"
              data-testid="needs-bank-review-toggle"
              @change="needsBankReview = $event"
            />
            <span
              class="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
              >À réaffecter</span
            >
          </div>
        </div>

        <!-- Sort, for the screens without a table header to click -->
        <div class="col-span-2 flex flex-col gap-1 lg:hidden">
          <SectionLabel id="transactions-sort-label" as="span"
            >Tri</SectionLabel
          >
          <SegmentedControl
            v-model="sortChoice"
            :options="SORT_OPTIONS"
            labelled-by="transactions-sort-label"
            size="sm"
            full-width
            data-testid="transactions-sort-choice"
          />
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
        <!-- Reset filters -->
        <BaseIconButton
          v-if="hasActiveFilters"
          label="Réinitialiser les filtres"
          class="md:hidden"
          @click="resetFilters"
        >
          <IconClose />
        </BaseIconButton>
        <BaseButton
          v-if="hasActiveFilters"
          variant="secondary"
          class="max-md:hidden"
          @click="resetFilters"
        >
          <IconClose class="h-4 w-4" />
          Réinitialiser
        </BaseButton>
        <!-- Selection mode: entered here, left from the selection bar -->
        <BaseButton
          v-if="!isSelectionMode"
          variant="secondary"
          data-testid="toggle-selection-mode"
          @click="toggleSelectionMode"
        >
          <IconClipboard class="h-4 w-4" />
          <span class="sr-only md:not-sr-only">Sélection multiple</span>
        </BaseButton>
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
      Where the user came from, when a link brought a context the controls
      cannot show: a person's debts, a settlement, an import, a chosen list.
      A figure that was netted and shared says so here, because the rows
      below will not add up to it. « Effacer » returns to the plain list.
    -->
    <InlineAlert
      v-if="contextTitle"
      variant="info"
      :title="contextTitle"
      class="mb-4"
      data-testid="transactions-context"
    >
      <span v-if="grossAmounts" data-testid="transactions-context-gross">
        Montants complets, avant votre part du compte joint et les
        remboursements.
      </span>
      <span
        v-if="alsoIdsFilter.length > 0"
        class="block"
        data-testid="transactions-context-smoothed"
      >
        {{
          alsoIdsFilter.length === 1
            ? 'S’y ajoute un achat lissé'
            : `S’y ajoutent ${alsoIdsFilter.length} achats lissés`
        }}
        : le total n'en compte qu'une tranche par mois, même s'ils sont datés
        d'un autre mois.
      </span>
      <template #actions>
        <BaseButton
          variant="secondary"
          size="sm"
          data-testid="transactions-context-clear"
          @click="resetFilters"
        >
          Effacer
        </BaseButton>
      </template>
    </InlineAlert>

    <!--
      The selection bar: one strip for the count, the escalation from « the
      page » to « the whole filter », the three bulk actions and the one
      way out. It sits above the list on a desk and docks to the bottom of
      a phone, where a spacer under the list keeps the last rows and the
      pagination reachable.

      Ticking every box selects the page, not the filter. Saying so — and
      offering the escalation explicitly — is what stops a bulk action from
      silently covering an eighth of what the user meant.
    -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isSelectionMode"
        data-testid="selection-bar"
        role="region"
        aria-label="Sélection"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-primary-200 bg-primary-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:static lg:mb-6 lg:rounded-xl lg:border lg:p-4 lg:shadow-none dark:border-primary-700 dark:bg-primary-900/30 lg:dark:bg-primary-900/30"
      >
        <div
          class="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="flex items-center justify-between gap-2 lg:justify-start">
            <!-- No table header below lg: the page is ticked from here -->
            <input
              type="checkbox"
              :checked="isAllSelected"
              :indeterminate="isPartiallySelected"
              aria-label="Sélectionner toutes les transactions de la page"
              class="h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 lg:hidden dark:border-slate-600 dark:bg-slate-700"
              data-testid="select-all-mobile"
              @change="toggleSelectAll"
            />
            <p
              class="min-w-0 flex-1 text-sm text-primary-800 dark:text-primary-200"
              :data-testid="
                canSelectWholeFilter
                  ? 'select-whole-filter-banner'
                  : isWholeFilterSelected
                    ? 'whole-filter-selected-banner'
                    : 'selection-count'
              "
            >
              <template v-if="selectedCount === 0">
                Aucune transaction sélectionnée
              </template>
              <template v-else>
                <strong class="font-semibold">{{ selectedCount }}</strong>
                {{ selectedCount > 1 ? 'sélectionnées' : 'sélectionnée' }}
              </template>
              <template v-if="isWholeFilterSelected">
                sur toutes les pages du filtre
              </template>
              <template v-else-if="canSelectWholeFilter">
                sur cette page
                <span class="max-lg:hidden">·</span>
                <button
                  type="button"
                  data-testid="select-whole-filter"
                  class="block font-semibold underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:inline"
                  @click="selectWholeFilter"
                >
                  Sélectionner les {{ matchingCount }} du filtre
                </button>
              </template>
            </p>
            <BaseButton
              size="sm"
              variant="ghost"
              class="shrink-0 lg:hidden"
              data-testid="exit-selection"
              @click="exitSelectionMode"
            >
              Quitter la sélection
            </BaseButton>
          </div>

          <div class="flex items-center gap-2">
            <BaseButton
              size="sm"
              variant="tinted"
              class="flex-1 lg:flex-none"
              :disabled="isBulkUpdating"
              data-testid="bulk-pointed"
              @click="bulkTogglePointed(true)"
            >
              <IconCheck class="h-4 w-4" />
              Pointer
            </BaseButton>
            <BaseButton
              size="sm"
              variant="secondary"
              class="flex-1 lg:flex-none"
              :disabled="isBulkUpdating"
              data-testid="bulk-unpointed"
              @click="bulkTogglePointed(false)"
            >
              <IconClose class="h-4 w-4" />
              Dépointer
            </BaseButton>
            <BaseButton
              size="sm"
              variant="tinted"
              class="flex-1 lg:flex-none"
              :disabled="isBulkUpdating"
              data-testid="bulk-category"
              @click="openBulkCategoryModal"
            >
              <IconTag class="h-4 w-4" />
              <span class="lg:hidden">Catégorie</span>
              <span class="hidden lg:inline">Changer de catégorie</span>
            </BaseButton>
            <BaseButton
              size="sm"
              variant="ghost"
              class="max-lg:hidden"
              @click="exitSelectionMode"
            >
              Quitter la sélection
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Transactions Table -->
    <BaseCard ref="listCard" padding="none">
      <!-- No overflow-hidden here: it clipped the tag popover of the last
             rows. The corners are rounded on the edge children instead. -->
      <!-- Error state -->
      <InlineAlert
        v-if="transactionsError"
        data-testid="transactions-error"
        class="rounded-b-none rounded-t-xl border-x-0 border-t-0"
        retry-label="Réessayer"
        retry-test-id="transactions-retry"
        :retrying="isLoadingTransactions"
        @retry="fetchTransactions()"
      >
        {{ transactionsError }}
        <span v-if="transactions.length > 0" class="block text-xs opacity-80"
          >La liste ci-dessous est celle du dernier chargement réussi.</span
        >
      </InlineAlert>

      <!-- First load: a skeleton. Later loads keep the list (below). -->
      <div
        v-if="isLoadingTransactions && !hasLoadedOnce"
        class="space-y-3 p-4"
        aria-busy="true"
        data-testid="transactions-skeleton"
      >
        <SkeletonBlock v-for="n in 8" :key="n" class="h-12" />
      </div>

      <!-- Table -->
      <!-- A failed refresh keeps the last list on screen under the banner. -->
      <div
        v-else-if="!transactionsError || transactions.length > 0"
        class="relative transition-opacity"
        :class="isLoadingTransactions ? 'opacity-60' : ''"
        :aria-busy="isLoadingTransactions ? 'true' : undefined"
        data-testid="transactions-list"
      >
        <!-- A refetch in progress: a thin pulse along the top edge -->
        <div
          v-if="isLoadingTransactions"
          role="status"
          data-testid="transactions-refreshing"
          class="absolute inset-x-0 top-0 h-0.5 animate-pulse rounded-t-xl bg-primary-600"
        >
          <span class="sr-only">Chargement des transactions…</span>
        </div>
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
            <BaseButton v-else to="/import"
              >Importer des transactions</BaseButton
            >
          </template>
        </EmptyState>

        <div v-else>
          <!-- Table header (lg and up); the card layout below has none -->
          <div
            class="hidden items-center gap-2 rounded-t-xl border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-500 lg:grid dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400"
            :class="rowGridClass(isSelectionMode)"
          >
            <div v-if="isSelectionMode" class="flex items-center">
              <input
                type="checkbox"
                :checked="isAllSelected"
                :indeterminate="isPartiallySelected"
                aria-label="Sélectionner toutes les transactions de la page"
                class="h-4 w-4 text-primary-600 dark:text-primary-400 border-gray-300 dark:border-slate-600 rounded focus:ring-primary-500 dark:bg-slate-700"
                data-testid="select-all"
                @change="toggleSelectAll"
              />
            </div>
            <div>
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
            <div>Description</div>
            <div>Note</div>
            <div class="text-right">
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
            <div>Catégorie</div>
            <div class="text-center">Pointé</div>
            <div class="text-center">Actions</div>
          </div>

          <!-- Transactions rows -->
          <div
            class="divide-y divide-gray-100 dark:divide-slate-700"
            :class="totalPages > 1 ? '' : '[&>*:last-child]:rounded-b-xl'"
          >
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
              @settle="openSettlement"
              @attach-tag="id => handleAttachTag(tx, id)"
              @detach-tag="id => handleDetachTag(tx, id)"
              @create-tag="name => handleCreateTag(tx, name)"
              @mark-recurring="openMarkRecurring(tx)"
              @open-amortization="openAmortization(tx)"
              @unlink-recurrence="unlinkRecurrence(tx)"
              @show-recurrence="showRecurrence(tx)"
            />
          </div>

          <!-- Pagination -->
          <div
            v-if="totalPages > 1"
            data-testid="pagination"
            class="flex flex-col-reverse gap-3 px-4 py-4 border-t border-gray-100 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
          >
            <div
              class="flex items-center justify-center gap-3 text-sm text-gray-500 sm:justify-start dark:text-gray-400"
            >
              <span class="hidden sm:inline"
                >Page {{ currentPage }} sur {{ totalPages }}</span
              >
              <label class="inline-flex items-center gap-1.5">
                <span class="sr-only">Transactions par page</span>
                <select
                  v-model.number="pageSize"
                  data-testid="page-size-select"
                  class="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300"
                >
                  <option v-for="size in PAGE_SIZES" :key="size" :value="size">
                    {{ size }} / page
                  </option>
                </select>
              </label>
            </div>

            <!-- On a phone: previous / « 3 / 12 » / next, never wider than
                   the screen. The numbered strip is for wider screens. -->
            <nav
              class="flex items-center justify-between gap-1 sm:justify-end"
              aria-label="Pagination"
            >
              <!-- Previous button -->
              <BaseIconButton
                :disabled="currentPage === 1"
                label="Page précédente"
                data-testid="pagination-previous"
                @click="goToPage(currentPage - 1)"
              >
                <IconChevronLeft />
              </BaseIconButton>

              <span
                class="text-sm font-medium tabular-nums text-gray-700 sm:hidden dark:text-gray-300"
                data-testid="pagination-compact"
              >
                {{ currentPage }} / {{ totalPages }}
              </span>

              <!-- Page numbers -->
              <template v-for="page in visiblePages" :key="page">
                <span
                  v-if="page < 0"
                  class="hidden px-2 py-1.5 text-sm text-gray-500 sm:inline dark:text-gray-400"
                >
                  ...
                </span>
                <button
                  v-else
                  type="button"
                  :aria-current="page === currentPage ? 'page' : undefined"
                  class="relative hidden rounded-lg px-3 py-1.5 text-sm transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:content-[''] sm:inline-block"
                  :class="
                    page === currentPage
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                  "
                  @click="goToPage(page)"
                >
                  {{ page }}
                </button>
              </template>

              <!-- Next button -->
              <BaseIconButton
                :disabled="currentPage === totalPages"
                label="Page suivante"
                data-testid="pagination-next"
                @click="goToPage(currentPage + 1)"
              >
                <IconChevronRight />
              </BaseIconButton>
            </nav>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- Room for the docked selection bar, so the last rows and the
         pagination stay reachable on a phone. -->
    <div v-if="isSelectionMode" class="h-32 lg:hidden" aria-hidden="true"></div>

    <!-- Reimbursement Modal -->
    <MarkRecurringModal
      :open="markRecurringTx !== null"
      :transaction="markRecurringTx"
      :recurrences="followedRecurrences"
      :loading="isMarkingRecurring"
      @cancel="markRecurringTx = null"
      @confirm="confirmMarkRecurring"
    />

    <TransactionAmortizationModal
      :open="amortizationTx !== null"
      :transaction="amortizationTx"
      :reimbursed-amount="
        amortizationTx
          ? Math.abs(amortizationTx.amount) - getRemainingAmount(amortizationTx)
          : 0
      "
      :divisor="
        amortizationTx ? accountsStore.getDivisor(amortizationTx.accountId) : 1
      "
      :exceptional-tag-names="exceptionalTagNamesOf(amortizationTx)"
      :loading="isSavingAmortization"
      :error="amortizationError"
      @cancel="closeAmortization"
      @confirm="saveAmortization"
    />

    <ConfirmDialog
      :open="reimbursementToDelete !== null"
      title="Supprimer ce remboursement ?"
      :loading="isDeletingReimbursement"
      @confirm="confirmDeleteReimbursement"
      @cancel="cancelDeleteReimbursement"
    >
      Le remboursement attendu de
      <span class="font-medium text-gray-900 dark:text-gray-100">{{
        reimbursementToDelete?.personName
      }}</span>
      ({{ formatCurrency(reimbursementToDelete?.amount ?? 0) }}) ne sera plus
      suivi.
    </ConfirmDialog>

    <TransactionReimbursementModal
      ref="reimbursementModalRef"
      :is-open="showReimbursementModal"
      :transaction="selectedTransaction"
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
      :transaction-type="filingKindOf(editingTransaction)"
      :current-category-id="editingTransaction?.categoryId ?? null"
      :current-subcategory-id="editingTransaction?.subcategoryId ?? null"
      @close="closeCategoryModal"
      @select="handleCategorySubcategorySelect"
    />

    <!-- Reimbursement category confirmation after a transaction category change -->

    <!-- Settlement detail (read-only) for income transactions -->
    <SingleSettlementModal
      :is-open="showSettlementModal"
      :reimbursement="settlingReimbursement"
      @close="closeSettlement"
      @confirm="handleSettlementCreated"
    />

    <SettlementDetailModal
      :is-open="showSettlementDetailModal"
      :settlement="selectedSettlement"
      hide-delete
      @close="closeSettlementDetail"
    />
  </PageShell>
</template>

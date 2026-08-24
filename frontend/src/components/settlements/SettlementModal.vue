<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
    type SettlementReimbursementItemDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import {
    availableAmountOf,
    byOldestFirst,
    cascadeAllocate,
    prorataAllocate,
    round2,
    scoreIncomeTransaction,
    toAllocationLine,
    type AllocationLine,
    type SuggestionReason,
  } from '@/lib/settlements'

  const props = defineProps<{
    isOpen: boolean
    personId: string
    personName: string
    /** Every pending reimbursement of this person (amountRemaining > 0). */
    pendingReimbursements: ReimbursementDto[]
    /**
     * Seeds the allocation on a single line, for the per-row "Regler" entry
     * point. Every other line stays visible and selectable.
     */
    focusReimbursementId?: string | null
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [settlement: SettlementDto]
  }>()

  interface LineState {
    selected: boolean
    amount: number
    forceComplete: boolean
  }

  const currentStep = ref<1 | 2>(1)
  const incomeTransactions = ref<TransactionDto[]>([])
  const selectedTransactionId = ref<string | null>(null)
  const allocations = ref<Record<string, LineState>>({})
  const expandedCategories = ref<Set<string>>(new Set())
  const searchQuery = ref('')
  // Mirrors the transaction list's own filters, because the income being
  // looked for is often a year old and the modal only ever holds one page.
  const filterStartDate = ref('')
  const filterEndDate = ref('')
  const filterAmountMin = ref('')
  const filterAmountMax = ref('')
  const showFilters = ref(false)
  const isLoadingTransactions = ref(false)
  /** How many suggestions show before "voir plus". */
  const SUGGESTION_PREVIEW = 3
  const showAllSuggestions = ref(false)
  /** The page size the server is asked for; also what "some are missing" means. */
  const PAGE_SIZE = 100
  const totalMatching = ref(0)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  // --- Debt lines, grouped by category -------------------------------------

  const lines = computed((): AllocationLine[] =>
    props.pendingReimbursements.map(toAllocationLine).sort(byOldestFirst)
  )

  function categoryKey(categoryId: string | null): string {
    return categoryId ?? 'none'
  }

  interface CategoryGroup {
    key: string
    categoryId: string | null
    categoryName: string
    lines: AllocationLine[]
    due: number
    allocated: number
    selectedCount: number
  }

  const groups = computed((): CategoryGroup[] => {
    const byKey = new Map<string, CategoryGroup>()

    for (const line of lines.value) {
      const key = categoryKey(line.categoryId)
      let group = byKey.get(key)
      if (!group) {
        group = {
          key,
          categoryId: line.categoryId,
          categoryName: line.categoryName,
          lines: [],
          due: 0,
          allocated: 0,
          selectedCount: 0,
        }
        byKey.set(key, group)
      }
      group.lines.push(line)
      group.due = round2(group.due + line.amountDue)

      const state = allocations.value[line.reimbursementId]
      if (state?.selected) {
        group.allocated = round2(group.allocated + state.amount)
        group.selectedCount += 1
      }
    }

    return Array.from(byKey.values())
  })

  // --- The pot -------------------------------------------------------------

  const selectedTransaction = computed(() =>
    incomeTransactions.value.find(t => t.id === selectedTransactionId.value)
  )

  const pot = computed(() =>
    selectedTransaction.value ? availableAmountOf(selectedTransaction.value) : 0
  )

  const allocatedTotal = computed(() =>
    round2(
      Object.values(allocations.value)
        .filter(state => state.selected)
        .reduce((sum, state) => sum + state.amount, 0)
    )
  )

  const remainingToAllocate = computed(() =>
    round2(pot.value - allocatedTotal.value)
  )

  const isOverAllocated = computed(() => remainingToAllocate.value < -0.001)

  const canConfirm = computed(
    () =>
      allocatedTotal.value > 0 && !isOverAllocated.value && !isSubmitting.value
  )

  // --- Step 1: ranking the income transactions -----------------------------

  const suggestionContext = computed(() => {
    const pendingCategoryIds = new Set(lines.value.map(line => line.categoryId))
    const categoryTotals = groups.value.map(group => group.due)
    const lineTotals = lines.value.map(line => line.amountDue)
    const grandTotal = round2(
      lines.value.reduce((sum, line) => sum + line.amountDue, 0)
    )
    return {
      personName: props.personName,
      pendingCategoryIds,
      pendingTotals: [grandTotal, ...categoryTotals, ...lineTotals],
    }
  })

  interface RankedTransaction {
    transaction: TransactionDto
    available: number
    score: number
    reasons: SuggestionReason[]
  }

  const rankedTransactions = computed((): RankedTransaction[] =>
    incomeTransactions.value
      .map(transaction => {
        const { score, reasons } = scoreIncomeTransaction(
          transaction,
          suggestionContext.value
        )
        return {
          transaction,
          available: availableAmountOf(transaction),
          score,
          reasons,
        }
      })
      .filter(entry => entry.available > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.transaction.date).getTime() -
            new Date(a.transaction.date).getTime()
      )
  )

  // The search is served by the API now: what came back *is* the result, so
  // filtering it again locally would only re-apply a narrower rule.
  const allSuggestions = computed(() =>
    rankedTransactions.value.filter(entry => entry.score > 0)
  )

  /** Only the strongest few, unless the user asked to see the rest. */
  const suggestions = computed(() =>
    showAllSuggestions.value
      ? allSuggestions.value
      : allSuggestions.value.slice(0, SUGGESTION_PREVIEW)
  )

  const hiddenSuggestionCount = computed(() =>
    Math.max(0, allSuggestions.value.length - suggestions.value.length)
  )

  const otherTransactions = computed(() =>
    rankedTransactions.value.filter(entry => entry.score === 0)
  )

  const REASON_LABELS: Record<SuggestionReason, string> = {
    name: 'nom',
    category: 'categorie',
    amount: 'montant exact',
  }

  // --- Allocation ----------------------------------------------------------

  /**
   * Narrow the auto-allocation to the most likely intent: the focused line when
   * the modal was opened from a row, otherwise the category the income
   * transaction is filed under, otherwise everything.
   */
  function autoAllocationScope(): AllocationLine[] {
    if (props.focusReimbursementId) {
      const focused = lines.value.find(
        line => line.reimbursementId === props.focusReimbursementId
      )
      if (focused) return [focused]
    }

    const categoryId = selectedTransaction.value?.categoryId
    if (categoryId) {
      const matching = lines.value.filter(
        line => line.categoryId === categoryId
      )
      if (matching.length > 0) return matching
    }

    return lines.value
  }

  function applyAutoAllocation(): void {
    const scope = autoAllocationScope()
    const allocated = cascadeAllocate(scope, pot.value)

    const next: Record<string, LineState> = {}
    for (const line of lines.value) {
      const amount = allocated.get(line.reimbursementId) ?? 0
      next[line.reimbursementId] = {
        selected: amount > 0,
        amount,
        forceComplete: false,
      }
    }
    allocations.value = next

    // Open every category that got something: it shows which transactions are
    // being paid, and it is the only place the per-line amount and the
    // "solder cette ligne" shortfall control are reachable.
    expandedCategories.value = new Set(
      groups.value
        .filter(group => group.selectedCount > 0)
        .map(group => group.key)
    )
  }

  function stateOf(reimbursementId: string): LineState {
    return (
      allocations.value[reimbursementId] ?? {
        selected: false,
        amount: 0,
        forceComplete: false,
      }
    )
  }

  function dueOf(reimbursementId: string): number {
    return (
      lines.value.find(line => line.reimbursementId === reimbursementId)
        ?.amountDue ?? 0
    )
  }

  function setLineAmount(reimbursementId: string, rawAmount: number): void {
    const due = dueOf(reimbursementId)
    const amount = round2(Math.min(Math.max(0, rawAmount), due))
    const previous = stateOf(reimbursementId)
    allocations.value[reimbursementId] = {
      selected: amount > 0,
      amount,
      // Crediting the full due makes the "solder" flag meaningless.
      forceComplete:
        amount > 0 && amount < due ? previous.forceComplete : false,
    }
  }

  /**
   * Committed on `change` rather than `input`: the field is value-bound and
   * clamped, so writing back on every keystroke would eat a half-typed "0.".
   */
  function onAmountCommit(reimbursementId: string, event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value)
    setLineAmount(reimbursementId, Number.isFinite(value) ? value : 0)
  }

  function toggleLine(reimbursementId: string): void {
    const state = stateOf(reimbursementId)
    if (state.selected) {
      setLineAmount(reimbursementId, 0)
      return
    }
    // Take what is left in the pot, never more than the line owes.
    const room = Math.max(0, remainingToAllocate.value)
    setLineAmount(reimbursementId, Math.min(dueOf(reimbursementId), room))
  }

  function toggleForceComplete(reimbursementId: string): void {
    const state = stateOf(reimbursementId)
    allocations.value[reimbursementId] = {
      ...state,
      forceComplete: !state.forceComplete,
    }
  }

  function applyToGroup(group: CategoryGroup, budget: number): void {
    const allocated = cascadeAllocate(group.lines, budget)
    for (const line of group.lines) {
      setLineAmount(
        line.reimbursementId,
        allocated.get(line.reimbursementId) ?? 0
      )
    }
  }

  function toggleCategory(group: CategoryGroup): void {
    if (group.selectedCount > 0) {
      applyToGroup(group, 0)
      return
    }
    const room = Math.max(0, remainingToAllocate.value)
    applyToGroup(group, Math.min(group.due, room))
  }

  function onCategoryAmountCommit(group: CategoryGroup, event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value)
    applyToGroup(group, Number.isFinite(value) ? Math.max(0, value) : 0)
  }

  function spreadGroupProrata(group: CategoryGroup): void {
    const allocated = prorataAllocate(group.lines, group.allocated)
    for (const line of group.lines) {
      setLineAmount(
        line.reimbursementId,
        allocated.get(line.reimbursementId) ?? 0
      )
    }
  }

  function clearAll(): void {
    for (const line of lines.value) setLineAmount(line.reimbursementId, 0)
  }

  function allocateEverything(): void {
    const allocated = cascadeAllocate(lines.value, pot.value)
    for (const line of lines.value) {
      setLineAmount(
        line.reimbursementId,
        allocated.get(line.reimbursementId) ?? 0
      )
    }
  }

  function toggleExpanded(key: string): void {
    const next = new Set(expandedCategories.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedCategories.value = next
  }

  // --- Navigation ----------------------------------------------------------

  function resetModal(): void {
    currentStep.value = 1
    incomeTransactions.value = []
    selectedTransactionId.value = null
    allocations.value = {}
    expandedCategories.value = new Set()
    clearFilters()
    showFilters.value = false
    showAllSuggestions.value = false
    totalMatching.value = 0
    error.value = null
    isSubmitting.value = false
  }

  const hasActiveFilters = computed(
    () =>
      searchQuery.value.trim() !== '' ||
      filterStartDate.value !== '' ||
      filterEndDate.value !== '' ||
      filterAmountMin.value !== '' ||
      filterAmountMax.value !== ''
  )

  function clearFilters(): void {
    searchQuery.value = ''
    filterStartDate.value = ''
    filterEndDate.value = ''
    filterAmountMin.value = ''
    filterAmountMax.value = ''
  }

  /**
   * Ask the server rather than filter what is already loaded.
   *
   * The list is one page deep, so a purely local search could only ever find
   * the most recent hundred receipts — which is exactly the transaction a
   * year-old expense is *not* repaid by.
   */
  async function loadIncomeTransactions(): Promise<void> {
    isLoadingTransactions.value = true
    error.value = null
    try {
      const parsedMin = Number(filterAmountMin.value)
      const parsedMax = Number(filterAmountMax.value)

      const response = await api.getTransactions({
        type: 'INCOME',
        limit: PAGE_SIZE,
        search: searchQuery.value.trim() || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
        amountMin:
          filterAmountMin.value !== '' &&
          Number.isFinite(parsedMin) &&
          parsedMin >= 0
            ? parsedMin
            : undefined,
        amountMax:
          filterAmountMax.value !== '' &&
          Number.isFinite(parsedMax) &&
          parsedMax >= 0
            ? parsedMax
            : undefined,
      })
      incomeTransactions.value = response.data
      totalMatching.value = response.meta.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement'
    } finally {
      isLoadingTransactions.value = false
    }
  }

  /** True when the server has more matches than the page we are showing. */
  const hasMoreThanShown = computed(() => totalMatching.value > PAGE_SIZE)

  function selectTransaction(transactionId: string): void {
    selectedTransactionId.value = transactionId
    applyAutoAllocation()
    currentStep.value = 2
  }

  function goBackToTransactions(): void {
    currentStep.value = 1
  }

  function handleClose(): void {
    resetModal()
    emit('close')
  }

  async function handleConfirm(): Promise<void> {
    if (!selectedTransaction.value || !canConfirm.value) return

    isSubmitting.value = true
    error.value = null

    try {
      const reimbursements: SettlementReimbursementItemDto[] = lines.value
        .map(line => ({ line, state: stateOf(line.reimbursementId) }))
        .filter(({ state }) => state.selected && state.amount > 0)
        .map(({ line, state }) => ({
          reimbursementId: line.reimbursementId,
          amountSettled: state.amount,
          ...(state.forceComplete && { forceComplete: true }),
        }))

      const settlement = await api.createSettlement({
        personId: props.personId,
        incomeTransactionId: selectedTransaction.value.id,
        reimbursements,
      })

      emit('confirm', settlement)
      handleClose()
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Erreur lors de la creation'
    } finally {
      isSubmitting.value = false
    }
  }

  watch(
    () => props.isOpen,
    async isOpen => {
      if (!isOpen) return
      resetModal()
      await loadIncomeTransactions()
    }
  )

  // Debounced so typing a description does not fire a request per keystroke.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined
  watch(
    [
      searchQuery,
      filterStartDate,
      filterEndDate,
      filterAmountMin,
      filterAmountMax,
    ],
    () => {
      if (!props.isOpen) return
      showAllSuggestions.value = false
      if (searchDebounce) clearTimeout(searchDebounce)
      searchDebounce = setTimeout(() => {
        void loadIncomeTransactions()
      }, 350)
    }
  )

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

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
                <span v-if="currentStep === 1">
                  &middot; etape 1 sur 2 : d'ou vient l'argent ?</span
                >
                <span v-else>
                  &middot; etape 2 sur 2 : sur quoi l'imputer ?</span
                >
              </p>
            </div>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              aria-label="Fermer"
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

          <div class="flex-1 overflow-y-auto p-6">
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <!-- ================= Step 1: pick the money ================= -->
            <div v-if="currentStep === 1">
              <label
                class="block text-sm text-gray-600 dark:text-gray-400 mb-3"
                for="settlement-search"
              >
                Quelle transaction correspond au paiement de
                {{ personName }} ?
              </label>
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
                  id="settlement-search"
                  v-model="searchQuery"
                  type="text"
                  placeholder="Rechercher une transaction..."
                  data-testid="settlement-search"
                  class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div class="flex flex-wrap items-center gap-3 mb-3 text-sm">
                <button
                  type="button"
                  data-testid="settlement-toggle-filters"
                  class="text-emerald-600 dark:text-emerald-400 hover:underline"
                  @click="showFilters = !showFilters"
                >
                  {{ showFilters ? 'Masquer les filtres' : 'Plus de filtres' }}
                </button>
                <button
                  v-if="hasActiveFilters"
                  type="button"
                  data-testid="settlement-clear-filters"
                  class="text-gray-500 dark:text-gray-400 hover:underline"
                  @click="clearFilters"
                >
                  Reinitialiser
                </button>
              </div>

              <div
                v-if="showFilters"
                data-testid="settlement-filters"
                class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 border border-gray-200 dark:border-slate-700 rounded-lg"
              >
                <label class="text-sm">
                  <span class="block text-gray-600 dark:text-gray-400 mb-1"
                    >Du</span
                  >
                  <input
                    v-model="filterStartDate"
                    type="date"
                    data-testid="settlement-start-date"
                    class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  />
                </label>
                <label class="text-sm">
                  <span class="block text-gray-600 dark:text-gray-400 mb-1"
                    >Au</span
                  >
                  <input
                    v-model="filterEndDate"
                    type="date"
                    data-testid="settlement-end-date"
                    class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  />
                </label>
                <label class="text-sm">
                  <span class="block text-gray-600 dark:text-gray-400 mb-1"
                    >Montant min</span
                  >
                  <input
                    v-model="filterAmountMin"
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="settlement-amount-min"
                    class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  />
                </label>
                <label class="text-sm">
                  <span class="block text-gray-600 dark:text-gray-400 mb-1"
                    >Montant max</span
                  >
                  <input
                    v-model="filterAmountMax"
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="settlement-amount-max"
                    class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  />
                </label>
              </div>

              <div v-if="isLoadingTransactions" class="py-12 text-center">
                <div
                  class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"
                />
                <p class="mt-2 text-gray-600 dark:text-gray-400">
                  Chargement des transactions...
                </p>
              </div>

              <div v-else class="space-y-4">
                <section v-if="suggestions.length > 0">
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
                  >
                    Suggestions
                  </h3>
                  <div class="space-y-2">
                    <button
                      v-for="entry in suggestions"
                      :key="entry.transaction.id"
                      type="button"
                      class="w-full flex items-center gap-3 p-3 text-left border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      @click="selectTransaction(entry.transaction.id)"
                    >
                      <div class="flex-1 min-w-0">
                        <div
                          class="font-medium text-gray-900 dark:text-gray-100 truncate"
                        >
                          {{ entry.transaction.description }}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">
                          {{ formatDate(entry.transaction.date) }} &middot;
                          {{ entry.transaction.account }}
                        </div>
                        <div class="mt-1 flex flex-wrap gap-1">
                          <span
                            v-for="reason in entry.reasons"
                            :key="reason"
                            class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          >
                            {{ REASON_LABELS[reason] }}
                          </span>
                        </div>
                      </div>
                      <div
                        class="text-lg font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                      >
                        +{{ formatCurrency(entry.available) }}
                      </div>
                    </button>
                  </div>
                  <button
                    v-if="hiddenSuggestionCount > 0"
                    type="button"
                    data-testid="settlement-more-suggestions"
                    class="mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                    @click="showAllSuggestions = true"
                  >
                    Voir les {{ hiddenSuggestionCount }} autres suggestions
                  </button>
                </section>

                <section v-if="otherTransactions.length > 0">
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2"
                  >
                    Toutes les transactions recues
                  </h3>
                  <div class="space-y-2 max-h-64 overflow-y-auto">
                    <button
                      v-for="entry in otherTransactions"
                      :key="entry.transaction.id"
                      type="button"
                      class="w-full flex items-center gap-3 p-3 text-left border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      @click="selectTransaction(entry.transaction.id)"
                    >
                      <div class="flex-1 min-w-0">
                        <div
                          class="font-medium text-gray-900 dark:text-gray-100 truncate"
                        >
                          {{ entry.transaction.description }}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">
                          {{ formatDate(entry.transaction.date) }} &middot;
                          {{ entry.transaction.account }}
                        </div>
                      </div>
                      <div
                        class="text-lg font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                      >
                        +{{ formatCurrency(entry.available) }}
                      </div>
                    </button>
                  </div>
                </section>

                <p
                  v-if="rankedTransactions.length === 0"
                  data-testid="settlement-no-results"
                  class="py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  Aucune transaction recue ne correspond. Affinez la recherche
                  ou elargissez la periode.
                </p>

                <!--
                  The list is one page deep. Saying so beats letting the user
                  conclude the transaction does not exist.
                -->
                <p
                  v-else-if="hasMoreThanShown"
                  data-testid="settlement-truncated"
                  class="pt-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  {{ totalMatching }} transactions correspondent, les 100 plus
                  recentes sont affichees. Affinez la recherche pour atteindre
                  les autres.
                </p>
              </div>
            </div>

            <!-- ================= Step 2: allocate ================= -->
            <div v-else>
              <div
                v-if="selectedTransaction"
                class="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <div
                    class="font-medium text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ selectedTransaction.description }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDate(selectedTransaction.date) }} &middot;
                    {{ selectedTransaction.account }}
                  </div>
                </div>
                <div
                  class="text-lg font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                >
                  +{{ formatCurrency(pot) }}
                </div>
              </div>

              <div class="flex justify-end gap-3 mb-2 text-sm">
                <button
                  type="button"
                  class="text-emerald-600 dark:text-emerald-400 hover:underline"
                  @click="allocateEverything"
                >
                  Tout affecter
                </button>
                <span class="text-gray-300 dark:text-gray-600">|</span>
                <button
                  type="button"
                  class="text-gray-600 dark:text-gray-400 hover:underline"
                  @click="clearAll"
                >
                  Tout decocher
                </button>
              </div>

              <div class="space-y-2">
                <div
                  v-for="group in groups"
                  :key="group.key"
                  class="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden"
                >
                  <!-- Category row -->
                  <div
                    class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      class="p-1 text-gray-400 dark:text-gray-500 shrink-0"
                      :aria-label="`Deplier ${group.categoryName}`"
                      :aria-expanded="expandedCategories.has(group.key)"
                      @click="toggleExpanded(group.key)"
                    >
                      <svg
                        class="w-4 h-4 transition-transform duration-200"
                        :class="{
                          'rotate-90': expandedCategories.has(group.key),
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
                    </button>
                    <input
                      type="checkbox"
                      class="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                      :checked="group.selectedCount > 0"
                      :indeterminate="
                        group.selectedCount > 0 &&
                        group.selectedCount < group.lines.length
                      "
                      :aria-label="`Selectionner ${group.categoryName}`"
                      @change="toggleCategory(group)"
                    />
                    <div class="flex-1 min-w-0">
                      <div
                        class="font-medium text-gray-900 dark:text-gray-100 truncate"
                      >
                        {{ group.categoryName }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ group.lines.length }} ligne(s) &middot; du
                        {{ formatCurrency(group.due) }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        :max="group.due"
                        :value="group.allocated"
                        :aria-label="`Montant affecte a ${group.categoryName}`"
                        class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
                        @change="onCategoryAmountCommit(group, $event)"
                      />
                      <span class="text-gray-500 dark:text-gray-400"
                        >&euro;</span
                      >
                    </div>
                  </div>

                  <!-- Lines -->
                  <div
                    v-if="expandedCategories.has(group.key)"
                    class="divide-y divide-gray-100 dark:divide-slate-700"
                  >
                    <div
                      v-for="line in group.lines"
                      :key="line.reimbursementId"
                      class="p-3 pl-10"
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                          :checked="stateOf(line.reimbursementId).selected"
                          :aria-label="`Selectionner ${line.description}`"
                          @change="toggleLine(line.reimbursementId)"
                        />
                        <div class="flex-1 min-w-0">
                          <div
                            class="text-sm text-gray-900 dark:text-gray-100 truncate"
                          >
                            <span class="text-gray-400 dark:text-gray-500"
                              >[{{ formatDate(line.date) }}]</span
                            >
                            {{ line.description }}
                          </div>
                          <div class="text-xs text-gray-500 dark:text-gray-400">
                            du {{ formatCurrency(line.amountDue) }}
                          </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            :max="line.amountDue"
                            :value="stateOf(line.reimbursementId).amount"
                            :aria-label="`Montant affecte a ${line.description}`"
                            class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
                            @change="
                              onAmountCommit(line.reimbursementId, $event)
                            "
                          />
                          <span class="text-gray-500 dark:text-gray-400"
                            >&euro;</span
                          >
                        </div>
                      </div>

                      <!-- Settle-the-shortfall, only when the line stays short -->
                      <label
                        v-if="
                          stateOf(line.reimbursementId).selected &&
                          stateOf(line.reimbursementId).amount < line.amountDue
                        "
                        class="mt-2 ml-6 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          :checked="stateOf(line.reimbursementId).forceComplete"
                          :aria-label="`Solder ${line.description}`"
                          @change="toggleForceComplete(line.reimbursementId)"
                        />
                        Solder cette ligne malgre l'ecart de
                        {{
                          formatCurrency(
                            round2(
                              line.amountDue -
                                stateOf(line.reimbursementId).amount
                            )
                          )
                        }}
                      </label>
                    </div>

                    <div
                      v-if="group.lines.length > 1 && group.allocated > 0"
                      class="px-3 py-2 pl-10 text-right"
                    >
                      <button
                        type="button"
                        class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                        @click="spreadGroupProrata(group)"
                      >
                        Repartir au prorata
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <p
                v-if="groups.length === 0"
                class="py-8 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun remboursement en attente pour {{ personName }}
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="border-t border-gray-200 dark:border-slate-700 p-6 space-y-3"
          >
            <!-- Running balance, step 2 only -->
            <div
              v-if="currentStep === 2"
              class="flex items-center justify-between p-3 rounded-lg"
              :class="{
                'bg-emerald-50 dark:bg-emerald-900/20':
                  Math.abs(remainingToAllocate) < 0.01,
                'bg-amber-50 dark:bg-amber-900/20': remainingToAllocate >= 0.01,
                'bg-red-50 dark:bg-red-900/20': isOverAllocated,
              }"
            >
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Affecte {{ formatCurrency(allocatedTotal) }}
              </span>
              <span
                class="text-sm font-semibold"
                :class="{
                  'text-emerald-700 dark:text-emerald-400':
                    Math.abs(remainingToAllocate) < 0.01,
                  'text-amber-700 dark:text-amber-400':
                    remainingToAllocate >= 0.01,
                  'text-red-700 dark:text-red-400': isOverAllocated,
                }"
              >
                <template v-if="isOverAllocated">
                  Depassement de
                  {{ formatCurrency(Math.abs(remainingToAllocate)) }}
                </template>
                <template v-else-if="remainingToAllocate >= 0.01">
                  {{ formatCurrency(remainingToAllocate) }} resteront
                  disponibles sur cette transaction
                </template>
                <template v-else> Tout est affecte </template>
              </span>
            </div>

            <div class="flex justify-between items-center">
              <button
                v-if="currentStep === 2"
                type="button"
                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                :disabled="isSubmitting"
                @click="goBackToTransactions"
              >
                Retour
              </button>
              <div v-else />

              <div class="flex gap-3">
                <button
                  type="button"
                  class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  :disabled="isSubmitting"
                  @click="handleClose"
                >
                  Annuler
                </button>
                <button
                  v-if="currentStep === 2"
                  type="button"
                  class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="!canConfirm"
                  @click="handleConfirm"
                >
                  <span v-if="isSubmitting" class="flex items-center gap-2">
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

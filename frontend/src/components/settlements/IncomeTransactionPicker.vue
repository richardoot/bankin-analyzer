<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
  import {
    api,
    type TransactionDto,
    type CategoryDto,
    type SubcategoryDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import {
    availableAmountOf,
    personSearchTerms,
    scoreIncomeTransaction,
    type SuggestionContext,
    type SuggestionReason,
  } from '@/lib/settlements'

  const props = defineProps<{
    /**
     * What the person still owes, used to rank the candidates. Reactive on
     * purpose: the selection made upstream changes which receipt is the most
     * likely, and the ranking must follow without a refetch.
     */
    context: SuggestionContext
    /** Highlights the row already chosen, since the list stays on screen. */
    selectedTransactionId?: string | null
  }>()

  const emit = defineEmits<{ select: [transaction: TransactionDto] }>()

  const incomeTransactions = ref<TransactionDto[]>([])
  const searchQuery = ref('')
  // Mirrors the transaction list's own filters, because the income being
  // looked for is often a year old and the modal only ever holds one page.
  const filterStartDate = ref('')
  const filterEndDate = ref('')
  const filterAmountMin = ref('')
  const filterAmountMax = ref('')
  const filterCategoryId = ref<string | null>(null)
  const filterSubcategoryId = ref<string | null>(null)
  const incomeCategories = ref<CategoryDto[]>([])
  const allSubcategories = ref<SubcategoryDto[]>([])
  const showFilters = ref(false)
  const isLoadingTransactions = ref(false)
  /** How many suggestions show before "voir plus". */
  const SUGGESTION_PREVIEW = 3
  const showAllSuggestions = ref(false)
  /** The page size the server is asked for; also what "some are missing" means. */
  const PAGE_SIZE = 100
  const totalMatching = ref(0)
  /** True when at least one of the queries had more matches than it returned. */
  const isTruncated = ref(false)
  /** Drives the wording: the list is not purely "the most recent" any more. */
  const searchedByName = ref(false)
  const error = ref<string | null>(null)

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
          props.context
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
    amount: 'montant exact',
  }

  const hasActiveFilters = computed(
    () =>
      searchQuery.value.trim() !== '' ||
      filterStartDate.value !== '' ||
      filterEndDate.value !== '' ||
      filterAmountMin.value !== '' ||
      filterAmountMax.value !== '' ||
      filterCategoryId.value !== null
  )

  /** A subcategory belongs to one category, so the options follow the choice. */
  const availableSubcategories = computed(() => {
    if (!filterCategoryId.value) return []
    return allSubcategories.value
      .filter(sub => sub.categoryId === filterCategoryId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  function clearFilters(): void {
    searchQuery.value = ''
    filterStartDate.value = ''
    filterEndDate.value = ''
    filterAmountMin.value = ''
    filterAmountMax.value = ''
    filterCategoryId.value = null
    filterSubcategoryId.value = null
  }

  /**
   * Fetched here rather than passed in: the picker already loads its own
   * transactions, and the modals that host it have no use for these lists.
   */
  async function loadFilterOptions(): Promise<void> {
    try {
      const [categories, subcategories] = await Promise.all([
        api.getCategories(),
        api.getSubcategories(),
      ])
      incomeCategories.value = categories
        .filter(category => category.type === 'INCOME')
        .sort((a, b) => a.name.localeCompare(b.name))
      allSubcategories.value = subcategories
    } catch {
      // A missing filter list is a smaller problem than a modal that will not
      // open: the search still works without it.
    }
  }

  /**
   * Ask the server rather than filter what is already loaded.
   *
   * The list is one page deep, so a purely local search could only ever find
   * the most recent hundred receipts — which is exactly the transaction a
   * year-old expense is *not* repaid by.
   *
   * Until the user types something, the recent page is fetched *alongside* one
   * query per spelling of the person's name, and the results are merged. The
   * recent page on its own held the receipt being looked for barely half the
   * time: the money owed on an old expense is repaid by an old transfer, and
   * ranking cannot promote a candidate that was never fetched.
   */
  async function loadIncomeTransactions(): Promise<void> {
    isLoadingTransactions.value = true
    error.value = null
    try {
      const parsedMin = Number(filterAmountMin.value)
      const parsedMax = Number(filterAmountMax.value)

      const filters = {
        type: 'INCOME' as const,
        limit: PAGE_SIZE,
        categoryId: filterCategoryId.value || undefined,
        // The API ignores a subcategory sent without its category, and the
        // select below is disabled until one is picked.
        subcategoryId: filterSubcategoryId.value || undefined,
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
      }

      // What the user typed *is* the query: widening it with the name would
      // hand back rows they just excluded.
      const typedSearch = searchQuery.value.trim()
      const nameTerms = typedSearch
        ? []
        : personSearchTerms(props.context.personName)
      const searches: (string | undefined)[] = typedSearch
        ? [typedSearch]
        : [undefined, ...nameTerms]

      const responses = await Promise.all(
        searches.map(search => api.getTransactions({ ...filters, search }))
      )

      // Merged by id: a receipt bearing the name is usually recent too, and
      // would otherwise appear twice.
      const byId = new Map<string, TransactionDto>()
      for (const response of responses) {
        for (const transaction of response.data) {
          byId.set(transaction.id, transaction)
        }
      }
      incomeTransactions.value = [...byId.values()]

      // The first response is the unfiltered one, so its total is the honest
      // denominator; any query hitting the cap means something was left out.
      totalMatching.value = responses[0]?.meta.total ?? 0
      isTruncated.value = responses.some(
        response => response.meta.total > PAGE_SIZE
      )
      searchedByName.value = nameTerms.length > 0
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement'
    } finally {
      isLoadingTransactions.value = false
    }
  }

  /** True when the server has more matches than the pages we are showing. */
  const hasMoreThanShown = computed(() => isTruncated.value)

  // Changing the category invalidates a subcategory picked under the previous
  // one, exactly as it does everywhere else.
  watch(filterCategoryId, () => {
    filterSubcategoryId.value = null
  })

  // Debounced so typing a description does not fire a request per keystroke.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined
  watch(
    [
      searchQuery,
      filterStartDate,
      filterEndDate,
      filterAmountMin,
      filterAmountMax,
      filterCategoryId,
      filterSubcategoryId,
    ],
    () => {
      showAllSuggestions.value = false
      if (searchDebounce) clearTimeout(searchDebounce)
      searchDebounce = setTimeout(() => {
        void loadIncomeTransactions()
      }, 350)
    }
  )

  onBeforeUnmount(() => {
    if (searchDebounce) clearTimeout(searchDebounce)
  })

  onMounted(() => {
    void loadIncomeTransactions()
    void loadFilterOptions()
  })

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<template>
  <div>
    <div
      v-if="error"
      class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
    >
      {{ error }}
    </div>

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
        <span class="block text-gray-600 dark:text-gray-400 mb-1">Du</span>
        <input
          v-model="filterStartDate"
          type="date"
          data-testid="settlement-start-date"
          class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
        />
      </label>
      <label class="text-sm">
        <span class="block text-gray-600 dark:text-gray-400 mb-1">Au</span>
        <input
          v-model="filterEndDate"
          type="date"
          data-testid="settlement-end-date"
          class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
        />
      </label>
      <label class="text-sm">
        <span class="block text-gray-600 dark:text-gray-400 mb-1"
          >Categorie</span
        >
        <select
          v-model="filterCategoryId"
          data-testid="settlement-category"
          class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
        >
          <option :value="null">Toutes</option>
          <option
            v-for="category in incomeCategories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
      </label>
      <label class="text-sm">
        <span class="block text-gray-600 dark:text-gray-400 mb-1"
          >Sous-categorie</span
        >
        <select
          v-model="filterSubcategoryId"
          data-testid="settlement-subcategory"
          :disabled="!filterCategoryId"
          class="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option :value="null">Toutes</option>
          <option
            v-for="sub in availableSubcategories"
            :key="sub.id"
            :value="sub.id"
          >
            {{ sub.name }}
          </option>
        </select>
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
            data-testid="settlement-transaction"
            class="w-full flex items-center gap-3 p-3 text-left border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            :class="
              selectedTransactionId === entry.transaction.id
                ? 'ring-2 ring-emerald-500'
                : ''
            "
            @click="emit('select', entry.transaction)"
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
            data-testid="settlement-transaction"
            class="w-full flex items-center gap-3 p-3 text-left border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            :class="
              selectedTransactionId === entry.transaction.id
                ? 'ring-2 ring-emerald-500'
                : ''
            "
            @click="emit('select', entry.transaction)"
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
        Aucune transaction recue ne correspond. Affinez la recherche ou
        elargissez la periode.
      </p>

      <!--
        The list is a few pages deep at most. Saying so beats letting the user
        conclude the transaction does not exist.
      -->
      <p
        v-else-if="hasMoreThanShown"
        data-testid="settlement-truncated"
        class="pt-2 text-xs text-gray-500 dark:text-gray-400"
      >
        {{ totalMatching }} transactions correspondent.
        <template v-if="searchedByName">
          Les plus recentes et celles au nom de
          {{ context.personName }} sont affichees.
        </template>
        <template v-else>Les 100 plus recentes sont affichees.</template>
        Affinez la recherche pour atteindre les autres.
      </p>
    </div>
  </div>
</template>

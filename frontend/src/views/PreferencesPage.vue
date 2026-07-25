<script setup lang="ts">
  import { ref, onMounted, computed } from 'vue'
  import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'
  import { useFiltersStore } from '@/stores/filters'
  import { useAccountsStore } from '@/stores/accounts'
  import { api, type CategoryDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import CategoryIcon from '@/components/CategoryIcon.vue'
  import ToggleSwitch from '@/components/ToggleSwitch.vue'

  const categoryAssociationsStore = useCategoryAssociationsStore()
  const filtersStore = useFiltersStore()
  const accountsStore = useAccountsStore()
  const toast = useToast()

  const categories = ref<CategoryDto[]>([])
  const isLoadingCategories = ref(false)
  const isModalOpen = ref(false)
  const isCreating = ref(false)
  const createError = ref<string | null>(null)

  // Form state
  const selectedExpenseCategoryId = ref('')
  const selectedIncomeCategoryId = ref('')

  // Computed categories by type
  const expenseCategories = computed(() =>
    categories.value.filter(c => c.type === 'EXPENSE')
  )

  const incomeCategories = computed(() =>
    categories.value.filter(c => c.type === 'INCOME')
  )

  // Filter out already-associated categories
  const availableExpenseCategories = computed(() => {
    const usedExpenseIds = new Set(
      categoryAssociationsStore.associations.map(a => a.expenseCategoryId)
    )
    return expenseCategories.value.filter(c => !usedExpenseIds.has(c.id))
  })

  const availableIncomeCategories = computed(() => {
    const usedIncomeIds = new Set(
      categoryAssociationsStore.associations.map(a => a.incomeCategoryId)
    )
    return incomeCategories.value.filter(c => !usedIncomeIds.has(c.id))
  })

  // Sorted expense categories (visible first, then hidden)
  const sortedExpenseCategories = computed(() => {
    return [...expenseCategories.value].sort((a, b) => {
      const aHidden = filtersStore.isExpenseCategoryGloballyHidden(a.name)
      const bHidden = filtersStore.isExpenseCategoryGloballyHidden(b.name)
      if (aHidden !== bHidden) return aHidden ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  })

  // Sorted income categories (visible first, then hidden)
  const sortedIncomeCategories = computed(() => {
    return [...incomeCategories.value].sort((a, b) => {
      const aHidden = filtersStore.isIncomeCategoryGloballyHidden(a.name)
      const bHidden = filtersStore.isIncomeCategoryGloballyHidden(b.name)
      if (aHidden !== bHidden) return aHidden ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  })

  // Save hidden categories to backend
  async function saveHiddenCategories(): Promise<void> {
    await filtersStore.saveToBackend()
  }

  // Track in-flight budget-exclusion toggles to disable the control per category
  const togglingBudgetExclusion = ref<Set<string>>(new Set())

  // Toggle whether a category is excluded from budget statistics and plans.
  // Unlike global hiding, the category stays visible in the dashboard.
  async function toggleBudgetExclusion(category: CategoryDto): Promise<void> {
    if (togglingBudgetExclusion.value.has(category.id)) return
    const next = !category.isExcludedFromBudget
    togglingBudgetExclusion.value.add(category.id)
    try {
      const updated = await api.updateCategory(category.id, {
        isExcludedFromBudget: next,
      })
      category.isExcludedFromBudget = updated.isExcludedFromBudget
      toast.success(
        next
          ? `« ${category.name} » exclue du budget`
          : `« ${category.name} » réintégrée au budget`
      )
    } catch (err) {
      console.error('Failed to update category budget exclusion:', err)
      toast.error('Erreur lors de la mise à jour de la catégorie')
    } finally {
      togglingBudgetExclusion.value.delete(category.id)
    }
  }

  // ── Per-category visibility axes ──────────────────────────────────────────
  // Two independent switches per category, dispatched on the category type so
  // the template stays free of expense/income branching:
  //   • Dashboard  → global hiding (removes it from every view)
  //   • Budget     → excludes it from budgets/plans/averages only
  // A globally hidden category is necessarily out of the budget too, so its
  // Budget switch reads as off and is disabled.
  function isGloballyHidden(category: CategoryDto): boolean {
    return category.type === 'EXPENSE'
      ? filtersStore.isExpenseCategoryGloballyHidden(category.name)
      : filtersStore.isIncomeCategoryGloballyHidden(category.name)
  }

  function isDashboardVisible(category: CategoryDto): boolean {
    return !isGloballyHidden(category)
  }

  function toggleDashboardVisible(category: CategoryDto): void {
    if (category.type === 'EXPENSE') {
      filtersStore.toggleGlobalHiddenExpenseCategory(category.name)
    } else {
      filtersStore.toggleGlobalHiddenIncomeCategory(category.name)
    }
  }

  function isBudgetIncluded(category: CategoryDto): boolean {
    return isDashboardVisible(category) && !category.isExcludedFromBudget
  }

  // ── Search & quick filters ────────────────────────────────────────────────
  // Keep long category lists navigable: a name search plus state filters that
  // narrow to the categories the user actually needs to touch.
  type CategoryStateFilter = 'all' | 'hidden' | 'excluded'
  const categorySearch = ref('')
  const categoryStateFilter = ref<CategoryStateFilter>('all')
  const categoryStateOptions: { key: CategoryStateFilter; label: string }[] = [
    { key: 'all', label: 'Toutes' },
    { key: 'hidden', label: 'Masquées' },
    { key: 'excluded', label: 'Hors budget' },
  ]

  /** Lower-case and strip diacritics so "energie" matches "Énergie". */
  function normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
  }

  function matchesFilters(category: CategoryDto): boolean {
    const term = normalize(categorySearch.value.trim())
    if (term && !normalize(category.name).includes(term)) return false
    if (categoryStateFilter.value === 'hidden')
      return isGloballyHidden(category)
    if (categoryStateFilter.value === 'excluded') {
      return category.isExcludedFromBudget || isGloballyHidden(category)
    }
    return true
  }

  // The two grouped, sortable lists rendered by a single template loop, after
  // search + state filtering.
  const categorySections = computed(() => [
    {
      key: 'expense' as const,
      title: 'Catégories de dépenses',
      items: sortedExpenseCategories.value.filter(matchesFilters),
    },
    {
      key: 'income' as const,
      title: 'Catégories de revenus',
      items: sortedIncomeCategories.value.filter(matchesFilters),
    },
  ])

  /** Total categories owned (before filtering) — to distinguish "none" from "no match". */
  const totalCategoryCount = computed(() => categories.value.length)
  /** Categories currently shown after filters. */
  const filteredCategoryCount = computed(() =>
    categorySections.value.reduce((sum, s) => sum + s.items.length, 0)
  )

  function clearCategoryFilters(): void {
    categorySearch.value = ''
    categoryStateFilter.value = 'all'
  }

  const canCreate = computed(
    () =>
      selectedExpenseCategoryId.value !== '' &&
      selectedIncomeCategoryId.value !== ''
  )

  onMounted(async () => {
    await Promise.all([
      loadCategories(),
      accountsStore.load(),
      categoryAssociationsStore.load(),
    ])
  })

  async function loadCategories(): Promise<void> {
    try {
      isLoadingCategories.value = true
      categories.value = await api.getCategories()
    } catch (err) {
      console.error('Failed to load categories:', err)
    } finally {
      isLoadingCategories.value = false
    }
  }

  // Toggle account type between STANDARD and JOINT
  async function toggleAccountType(accountId: string): Promise<void> {
    const account = accountsStore.accounts.find(a => a.id === accountId)
    if (!account) return

    const newType = account.type === 'JOINT' ? 'STANDARD' : 'JOINT'
    await accountsStore.updateType(accountId, newType)
  }

  // ── Rename accounts ─────────────────────────────────────────────────────
  // Local UI state for inline editing of account names. Keyed by account id.
  const renameDrafts = ref<Record<string, string>>({})
  const renameErrors = ref<Record<string, string | null>>({})
  const renameSaving = ref<Record<string, boolean>>({})

  function draftFor(accountId: string, currentName: string): string {
    return renameDrafts.value[accountId] ?? currentName
  }

  function onDraftChange(accountId: string, value: string): void {
    renameDrafts.value[accountId] = value
    renameErrors.value[accountId] = null
  }

  function isDraftDirty(accountId: string, currentName: string): boolean {
    const draft = renameDrafts.value[accountId]
    if (draft === undefined) return false
    return draft.trim() !== currentName && draft.trim().length > 0
  }

  async function submitRename(
    accountId: string,
    currentName: string
  ): Promise<void> {
    const draft = renameDrafts.value[accountId]?.trim() ?? ''
    if (draft.length === 0 || draft === currentName) return

    renameSaving.value[accountId] = true
    renameErrors.value[accountId] = null
    try {
      await accountsStore.rename(accountId, draft)
      delete renameDrafts.value[accountId]
      toast.success(`Compte renommé en « ${draft} »`)
    } catch (err) {
      renameErrors.value[accountId] =
        err instanceof Error ? err.message : 'Erreur lors du renommage'
    } finally {
      renameSaving.value[accountId] = false
    }
  }

  function cancelRename(accountId: string): void {
    delete renameDrafts.value[accountId]
    renameErrors.value[accountId] = null
  }

  function openModal(): void {
    selectedExpenseCategoryId.value = ''
    selectedIncomeCategoryId.value = ''
    createError.value = null
    isModalOpen.value = true
  }

  function closeModal(): void {
    isModalOpen.value = false
  }

  async function handleCreate(): Promise<void> {
    if (!canCreate.value) return

    try {
      isCreating.value = true
      createError.value = null

      const result = await categoryAssociationsStore.create({
        expenseCategoryId: selectedExpenseCategoryId.value,
        incomeCategoryId: selectedIncomeCategoryId.value,
      })

      if (result) {
        closeModal()
      } else {
        createError.value =
          categoryAssociationsStore.error || 'Erreur lors de la creation'
      }
    } catch (err) {
      createError.value =
        err instanceof Error ? err.message : 'Erreur lors de la creation'
    } finally {
      isCreating.value = false
    }
  }

  async function handleDelete(id: string): Promise<void> {
    await categoryAssociationsStore.remove(id)
  }

  const isGeneratingIcons = ref(false)

  async function generateIcons(): Promise<void> {
    try {
      isGeneratingIcons.value = true
      const result = await api.generateCategoryIcons()
      toast.success(`${result.updated} icone(s) generee(s) avec succes`)
      await loadCategories()
    } catch (err) {
      console.error('Failed to generate icons:', err)
      toast.error('Erreur lors de la generation des icones')
    } finally {
      isGeneratingIcons.value = false
    }
  }
</script>

<template>
  <div
    class="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-slate-800 py-12 transition-colors"
  >
    <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Preferences
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Configurez vos parametres et associations
        </p>
      </div>

      <!-- Category Associations Section -->
      <div
        class="rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Associations de categories
            </h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Associez une categorie de depense a une categorie de revenu pour
              les remboursements
            </p>
          </div>
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            :disabled="
              categoryAssociationsStore.isLoading ||
              availableExpenseCategories.length === 0 ||
              availableIncomeCategories.length === 0
            "
            @click="openModal"
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
            Ajouter
          </button>
        </div>

        <!-- Loading State -->
        <div
          v-if="
            categoryAssociationsStore.isLoading &&
            categoryAssociationsStore.associations.length === 0
          "
          class="flex justify-center py-8"
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

        <!-- Empty State -->
        <div
          v-else-if="categoryAssociationsStore.associations.length === 0"
          class="py-8 text-center"
        >
          <svg
            class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            Aucune association
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Creez une association entre une categorie de depense et une
            categorie de revenu pour faciliter le suivi des remboursements.
          </p>
        </div>

        <!-- Associations Table -->
        <div
          v-else
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
        >
          <table
            class="min-w-full divide-y divide-gray-200 dark:divide-slate-700"
          >
            <thead class="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  Categorie de depense
                </th>
                <th
                  class="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                ></th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  Categorie de revenu
                </th>
                <th class="px-6 py-3 text-right">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody
              class="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-900"
            >
              <tr
                v-for="association in categoryAssociationsStore.associations"
                :key="association.id"
              >
                <td
                  class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                >
                  <span
                    class="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1 text-sm font-medium text-red-800 dark:text-red-300"
                  >
                    {{ association.expenseCategoryName }}
                  </span>
                </td>
                <td
                  class="whitespace-nowrap px-6 py-4 text-center text-gray-400 dark:text-gray-600"
                >
                  <svg
                    class="mx-auto h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </td>
                <td
                  class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                >
                  <span
                    class="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-sm font-medium text-emerald-800 dark:text-emerald-300"
                  >
                    {{ association.incomeCategoryName }}
                  </span>
                </td>
                <td
                  class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium"
                >
                  <button
                    type="button"
                    class="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                    @click="handleDelete(association.id)"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Info box -->
        <div
          class="mt-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-blue-700 dark:text-blue-300">
                Les associations permettent de deduire automatiquement les
                remboursements des depenses associees dans le Dashboard, et de
                filtrer les revenus pertinents lors du reglement d'un
                remboursement.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Category Icons Section -->
      <div
        class="mt-8 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Icones de categories
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Generez automatiquement des icones emoji pour les categories qui
            n'en ont pas encore
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white font-medium transition-colors"
          :class="
            isGeneratingIcons
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
          "
          :disabled="isGeneratingIcons"
          @click="generateIcons"
        >
          <svg
            v-if="isGeneratingIcons"
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
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{
            isGeneratingIcons
              ? 'Generation en cours...'
              : 'Generer les icones manquantes'
          }}
        </button>
      </div>

      <!-- Joint Accounts Section -->
      <div
        class="mt-8 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Comptes joints
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Les montants des comptes joints seront divises par 2 dans toute
            l'application
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="accountsStore.isLoading" class="flex justify-center py-8">
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

        <div v-else>
          <div
            v-if="accountsStore.sortedAccounts.length > 0"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="account in accountsStore.sortedAccounts"
              :key="account.id"
              type="button"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="
                account.type === 'JOINT'
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/30'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              "
              @click="toggleAccountType(account.id)"
            >
              <svg
                v-if="account.type === 'JOINT'"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {{ account.name }}
              <span
                v-if="account.type === 'JOINT'"
                class="text-indigo-200 dark:text-indigo-300 font-normal"
                >÷2</span
              >
            </button>
          </div>

          <p
            v-else
            class="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
          >
            Aucun compte disponible. Importez des transactions pour voir vos
            comptes.
          </p>
        </div>

        <!-- Info box -->
        <div
          class="mt-6 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-4"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-indigo-700 dark:text-indigo-300">
                Les depenses et revenus des comptes joints seront
                automatiquement divises par 2 dans le Dashboard, Budget et
                Remboursements.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Rename Accounts Section -->
      <div
        class="mt-8 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Renommer les comptes bancaires
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Utile pour corriger un nom, harmoniser la casse ou fusionner deux
            comptes en doublon (typo, orthographe). Le renommage s'applique
            partout dans l'application.
          </p>
        </div>

        <div v-if="accountsStore.isLoading" class="py-4 text-sm text-gray-500">
          Chargement...
        </div>

        <div v-else-if="accountsStore.sortedAccounts.length === 0">
          <p
            class="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
          >
            Aucun compte disponible. Importez des transactions pour voir vos
            comptes.
          </p>
        </div>

        <ul v-else class="space-y-3">
          <li
            v-for="account in accountsStore.sortedAccounts"
            :key="account.id"
            class="rounded-lg border border-gray-200 dark:border-slate-700 p-3"
          >
            <form
              class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
              @submit.prevent="submitRename(account.id, account.name)"
            >
              <label class="sr-only" :for="`account-name-${account.id}`">
                Nom du compte {{ account.name }}
              </label>
              <input
                :id="`account-name-${account.id}`"
                type="text"
                :value="draftFor(account.id, account.name)"
                :disabled="renameSaving[account.id]"
                maxlength="100"
                class="flex-1 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                @input="
                  onDraftChange(
                    account.id,
                    ($event.target as HTMLInputElement).value
                  )
                "
              />
              <div class="flex gap-2">
                <button
                  type="submit"
                  :disabled="
                    !isDraftDirty(account.id, account.name) ||
                    renameSaving[account.id]
                  "
                  class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {{
                    renameSaving[account.id] ? 'Enregistrement…' : 'Renommer'
                  }}
                </button>
                <button
                  v-if="isDraftDirty(account.id, account.name)"
                  type="button"
                  :disabled="renameSaving[account.id]"
                  class="rounded-md bg-gray-100 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
                  @click="cancelRename(account.id)"
                >
                  Annuler
                </button>
              </div>
            </form>
            <p
              v-if="renameErrors[account.id]"
              class="mt-2 text-sm text-red-600 dark:text-red-400"
            >
              {{ renameErrors[account.id] }}
            </p>
          </li>
        </ul>

        <div
          class="mt-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-200"
        >
          <strong>Fusion :</strong> pour fusionner deux comptes en doublon,
          renommez l'un avec le nom <em>exact</em> de l'autre — un message
          d'erreur s'affichera car le nom existe déjà. Dans ce cas, il faudra
          d'abord supprimer manuellement le compte cible (pas encore possible
          via l'UI), ou renommer ce compte vers un troisième nom unique.
        </div>
      </div>

      <!-- Hidden Categories Section -->
      <div
        class="mt-8 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Categories masquees
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Ces categories seront masquees dans le Dashboard, Budget et
            Remboursements
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingCategories" class="flex justify-center py-8">
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

        <div v-else class="space-y-6">
          <!-- Intro explaining the two per-category visibility axes -->
          <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Choisissez où apparaît chaque catégorie.
            <strong class="text-gray-700 dark:text-gray-300"
              >Tableau de bord</strong
            >
            la retire de toutes les vues ;
            <strong class="text-gray-700 dark:text-gray-300">Budget</strong>
            la retire uniquement des budgets, plans et moyennes (utile pour les
            dépenses exceptionnelles ou les prêts). Une catégorie masquée du
            tableau de bord est aussi exclue du budget.
          </p>

          <!-- Search + quick state filters -->
          <div
            v-if="totalCategoryCount > 0"
            class="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div class="relative flex-1">
              <svg
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
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
                v-model="categorySearch"
                type="text"
                placeholder="Rechercher une catégorie…"
                aria-label="Rechercher une catégorie"
                class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:placeholder-gray-500"
              />
              <button
                v-if="categorySearch"
                type="button"
                aria-label="Effacer la recherche"
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                @click="categorySearch = ''"
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

            <div
              class="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5 dark:border-slate-700"
              role="group"
              aria-label="Filtrer les catégories par état"
            >
              <button
                v-for="opt in categoryStateOptions"
                :key="opt.key"
                type="button"
                :aria-pressed="categoryStateFilter === opt.key"
                class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                :class="
                  categoryStateFilter === opt.key
                    ? 'bg-emerald-500 text-white dark:bg-emerald-600'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                "
                @click="categoryStateFilter = opt.key"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- No-match state (categories exist but filters hide them all) -->
          <div
            v-if="totalCategoryCount > 0 && filteredCategoryCount === 0"
            class="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-gray-400"
          >
            Aucune catégorie ne correspond.
            <button
              type="button"
              class="ml-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              @click="clearCategoryFilters"
            >
              Réinitialiser les filtres
            </button>
          </div>

          <div
            v-for="section in categorySections"
            v-show="section.items.length > 0"
            :key="section.key"
          >
            <!-- Section header with column labels aligned to the switches -->
            <div
              class="mb-1 grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-3 px-3"
            >
              <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ section.title }}
              </h3>
              <span
                class="text-center text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400"
              >
                Tableau de bord
              </span>
              <span
                class="text-center text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400"
              >
                Budget
              </span>
            </div>

            <ul
              class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 dark:divide-slate-700/60 dark:border-slate-700/60"
            >
              <li
                v-for="category in section.items"
                :key="category.id"
                class="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
              >
                <!-- Name + status tag -->
                <div class="flex min-w-0 items-center gap-2">
                  <CategoryIcon :icon="category.icon" :name="category.name">
                    <span
                      class="text-sm"
                      :class="
                        isDashboardVisible(category)
                          ? 'text-gray-800 dark:text-gray-200'
                          : 'text-gray-400 line-through dark:text-gray-500'
                      "
                    >
                      {{ category.name }}
                    </span>
                  </CategoryIcon>
                  <span
                    v-if="!isDashboardVisible(category)"
                    class="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Masquée
                  </span>
                  <span
                    v-else-if="category.isExcludedFromBudget"
                    class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    Hors budget
                  </span>
                </div>

                <!-- Dashboard visibility switch -->
                <div class="flex justify-center">
                  <ToggleSwitch
                    :checked="isDashboardVisible(category)"
                    :aria-label="
                      isDashboardVisible(category)
                        ? `Masquer ${category.name} du tableau de bord`
                        : `Afficher ${category.name} dans le tableau de bord`
                    "
                    @change="toggleDashboardVisible(category)"
                  />
                </div>

                <!-- Budget inclusion switch (disabled when globally hidden) -->
                <div class="flex justify-center">
                  <ToggleSwitch
                    :checked="isBudgetIncluded(category)"
                    :disabled="!isDashboardVisible(category)"
                    :loading="togglingBudgetExclusion.has(category.id)"
                    :aria-label="
                      isBudgetIncluded(category)
                        ? `Exclure ${category.name} du budget`
                        : `Inclure ${category.name} dans le budget`
                    "
                    @change="toggleBudgetExclusion(category)"
                  />
                </div>
              </li>
            </ul>
          </div>

          <!-- Empty State -->
          <div
            v-if="
              sortedExpenseCategories.length === 0 &&
              sortedIncomeCategories.length === 0
            "
            class="py-8 text-center text-gray-500 dark:text-gray-400"
          >
            Aucune categorie disponible. Importez des transactions pour creer
            des categories.
          </div>

          <!-- Save button -->
          <div
            v-if="filtersStore.hasUnsavedChanges"
            class="pt-4 border-t border-gray-200 dark:border-slate-700"
          >
            <button
              type="button"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors"
              :class="
                filtersStore.isSyncing
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
              "
              :disabled="filtersStore.isSyncing"
              @click="saveHiddenCategories"
            >
              <svg
                v-if="filtersStore.isSyncing"
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {{ filtersStore.isSyncing ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </div>

        <!-- Info box -->
        <div
          class="mt-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg
                class="h-5 w-5 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-amber-700 dark:text-amber-300">
                Les categories masquees ne seront plus affichees dans les
                statistiques du Dashboard, dans la page Budget, ni dans les
                remboursements.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Association Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div class="fixed inset-0 bg-black/50" @click="closeModal" />

          <div
            class="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl dark:shadow-slate-900/30"
          >
            <div class="mb-6">
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Nouvelle association
              </h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Associez une categorie de depense a une categorie de revenu
              </p>
            </div>

            <!-- Error message -->
            <div
              v-if="createError"
              class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              {{ createError }}
            </div>

            <div class="space-y-4">
              <!-- Expense Category Select -->
              <div>
                <label
                  for="expense-category"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Categorie de depense
                </label>
                <select
                  id="expense-category"
                  v-model="selectedExpenseCategoryId"
                  class="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-4 py-2 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:outline-none"
                  :disabled="isCreating"
                >
                  <option value="">Selectionnez une categorie</option>
                  <option
                    v-for="category in availableExpenseCategories"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.name }}
                  </option>
                </select>
              </div>

              <!-- Arrow indicator -->
              <div class="flex justify-center text-gray-400 dark:text-gray-600">
                <svg
                  class="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>

              <!-- Income Category Select -->
              <div>
                <label
                  for="income-category"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Categorie de revenu (remboursement)
                </label>
                <select
                  id="income-category"
                  v-model="selectedIncomeCategoryId"
                  class="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-4 py-2 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:outline-none"
                  :disabled="isCreating"
                >
                  <option value="">Selectionnez une categorie</option>
                  <option
                    v-for="category in availableIncomeCategories"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.name }}
                  </option>
                </select>
              </div>
            </div>

            <div class="mt-6 flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
                :disabled="isCreating"
                @click="closeModal"
              >
                Annuler
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canCreate || isCreating"
                @click="handleCreate"
              >
                {{ isCreating ? 'Creation...' : 'Creer' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
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

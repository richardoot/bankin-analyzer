<script setup lang="ts">
  /**
   * One row per category, and everything about that category reachable from
   * it: where it shows up, its subcategories, and its reimbursement pairing.
   * The three former sections (associations, icons, hidden categories) are
   * folded into this single list.
   *
   * Both visibility switches now write through immediately — the dashboard one
   * used to wait for a global "Enregistrer" button while the budget one saved
   * on click, which made two switches on the same row behave differently.
   */
  import { computed, onMounted, ref } from 'vue'
  import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'
  import { useFiltersStore } from '@/stores/filters'
  import { api, type CategoryDto, type SubcategoryDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import CategoryIcon from '@/components/CategoryIcon.vue'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import ToggleSwitch from '@/components/ToggleSwitch.vue'

  const categoryAssociationsStore = useCategoryAssociationsStore()
  const filtersStore = useFiltersStore()
  const toast = useToast()

  const categories = ref<CategoryDto[]>([])
  const subcategories = ref<SubcategoryDto[]>([])
  const isLoadingCategories = ref(false)

  onMounted(async () => {
    await Promise.all([
      loadCategories(),
      loadSubcategories(),
      categoryAssociationsStore.load(),
    ])
  })

  async function loadCategories(): Promise<void> {
    try {
      isLoadingCategories.value = true
      categories.value = await api.getCategories()
    } catch (err) {
      console.error('Failed to load categories:', err)
      toast.error('Erreur lors du chargement des catégories')
    } finally {
      isLoadingCategories.value = false
    }
  }

  async function loadSubcategories(): Promise<void> {
    try {
      subcategories.value = await api.getSubcategories()
    } catch (err) {
      console.error('Failed to load subcategories:', err)
    }
  }

  const expenseCategories = computed(() =>
    categories.value.filter(c => c.type === 'EXPENSE')
  )
  const incomeCategories = computed(() =>
    categories.value.filter(c => c.type === 'INCOME')
  )

  // ── Visibility axes ───────────────────────────────────────────────────────
  // Dashboard → hides the category everywhere; Budget → only removes it from
  // budgets, plans and averages. A globally hidden category is out of the
  // budget too, so its budget switch reads off and is disabled.
  function isGloballyHidden(category: CategoryDto): boolean {
    return category.type === 'EXPENSE'
      ? filtersStore.isExpenseCategoryGloballyHidden(category.id)
      : filtersStore.isIncomeCategoryGloballyHidden(category.id)
  }

  function isDashboardVisible(category: CategoryDto): boolean {
    return !isGloballyHidden(category)
  }

  function isBudgetIncluded(category: CategoryDto): boolean {
    return isDashboardVisible(category) && !category.isExcludedFromBudget
  }

  const savingVisibility = ref<Set<string>>(new Set())
  const savingBudget = ref<Set<string>>(new Set())

  function markSaving(
    set: typeof savingVisibility,
    id: string,
    active: boolean
  ): void {
    const next = new Set(set.value)
    if (active) next.add(id)
    else next.delete(id)
    set.value = next
  }

  async function toggleDashboardVisible(category: CategoryDto): Promise<void> {
    if (savingVisibility.value.has(category.id)) return
    const willBeVisible = !isDashboardVisible(category)

    if (category.type === 'EXPENSE') {
      filtersStore.toggleGlobalHiddenExpenseCategory(category.id)
    } else {
      filtersStore.toggleGlobalHiddenIncomeCategory(category.id)
    }

    markSaving(savingVisibility, category.id, true)
    try {
      const ok = await filtersStore.saveToBackend()
      if (ok) {
        toast.success(
          willBeVisible
            ? `« ${category.name} » de nouveau visible`
            : `« ${category.name} » masquée`
        )
      } else {
        toast.error('Erreur lors de l’enregistrement de la visibilité')
      }
    } finally {
      markSaving(savingVisibility, category.id, false)
    }
  }

  async function toggleBudgetExclusion(category: CategoryDto): Promise<void> {
    if (savingBudget.value.has(category.id)) return
    const next = !category.isExcludedFromBudget
    markSaving(savingBudget, category.id, true)
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
      markSaving(savingBudget, category.id, false)
    }
  }

  // ── Search & quick filters ────────────────────────────────────────────────
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

  /** Visible categories first, then hidden ones, alphabetical within each. */
  function sortForDisplay(list: CategoryDto[]): CategoryDto[] {
    return [...list].sort((a, b) => {
      const aHidden = isGloballyHidden(a)
      const bHidden = isGloballyHidden(b)
      if (aHidden !== bHidden) return aHidden ? 1 : -1
      return a.name.localeCompare(b.name, 'fr')
    })
  }

  const categorySections = computed(() => [
    {
      key: 'expense' as const,
      title: 'Catégories de dépenses',
      items: sortForDisplay(expenseCategories.value).filter(matchesFilters),
    },
    {
      key: 'income' as const,
      title: 'Catégories de revenus',
      items: sortForDisplay(incomeCategories.value).filter(matchesFilters),
    },
  ])

  const totalCategoryCount = computed(() => categories.value.length)
  const filteredCategoryCount = computed(() =>
    categorySections.value.reduce((sum, s) => sum + s.items.length, 0)
  )

  function clearCategoryFilters(): void {
    categorySearch.value = ''
    categoryStateFilter.value = 'all'
  }

  // ── Row expansion: subcategories + association ────────────────────────────
  const expanded = ref<Set<string>>(new Set())

  function isExpanded(categoryId: string): boolean {
    return expanded.value.has(categoryId)
  }

  function toggleExpanded(categoryId: string): void {
    const next = new Set(expanded.value)
    if (next.has(categoryId)) next.delete(categoryId)
    else next.add(categoryId)
    expanded.value = next
  }

  const subcategoriesByCategory = computed(() => {
    const map = new Map<string, SubcategoryDto[]>()
    for (const sub of subcategories.value) {
      const list = map.get(sub.categoryId)
      if (list) list.push(sub)
      else map.set(sub.categoryId, [sub])
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }
    return map
  })

  function subcategoriesFor(categoryId: string): SubcategoryDto[] {
    return subcategoriesByCategory.value.get(categoryId) ?? []
  }

  const newSubcategoryNames = ref<Record<string, string>>({})
  const creatingSubcategory = ref<Set<string>>(new Set())

  async function addSubcategory(category: CategoryDto): Promise<void> {
    const name = newSubcategoryNames.value[category.id]?.trim() ?? ''
    if (name.length === 0 || creatingSubcategory.value.has(category.id)) return

    markSaving(creatingSubcategory, category.id, true)
    try {
      const created = await api.createSubcategory({
        categoryId: category.id,
        name,
      })
      subcategories.value = [...subcategories.value, created]
      newSubcategoryNames.value[category.id] = ''
      toast.success(`Sous-catégorie « ${name} » ajoutée`)
    } catch (err) {
      console.error('Failed to create subcategory:', err)
      toast.error('Erreur lors de la création de la sous-catégorie')
    } finally {
      markSaving(creatingSubcategory, category.id, false)
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  // Transactions, budget plans, associations and the hidden-category
  // preferences all point at the category by id, so they follow a rename on
  // their own. The one exception is the association recap below, which holds a
  // snapshot of both names — reloaded once the write went through.
  const renameDrafts = ref<Record<string, string>>({})
  const renameErrors = ref<Record<string, string | null>>({})
  const renameSaving = ref<Record<string, boolean>>({})

  function renameDraftFor(category: CategoryDto): string {
    return renameDrafts.value[category.id] ?? category.name
  }

  function onRenameDraftChange(categoryId: string, value: string): void {
    renameDrafts.value[categoryId] = value
    renameErrors.value[categoryId] = null
  }

  function isRenameDirty(category: CategoryDto): boolean {
    const draft = renameDrafts.value[category.id]
    if (draft === undefined) return false
    const trimmed = draft.trim()
    return trimmed !== category.name && trimmed.length > 0
  }

  async function submitRename(category: CategoryDto): Promise<void> {
    const draft = renameDrafts.value[category.id]?.trim() ?? ''
    if (draft.length === 0 || draft === category.name) return

    const wasAssociated = associationIdFor(category) !== null
    renameSaving.value[category.id] = true
    renameErrors.value[category.id] = null
    try {
      const updated = await api.updateCategory(category.id, { name: draft })
      category.name = updated.name
      delete renameDrafts.value[category.id]
      if (wasAssociated) await categoryAssociationsStore.load()
      toast.success(`Catégorie renommée en « ${updated.name} »`)
    } catch (err) {
      renameErrors.value[category.id] =
        err instanceof Error ? err.message : 'Erreur lors du renommage'
    } finally {
      renameSaving.value[category.id] = false
    }
  }

  function cancelRename(categoryId: string): void {
    delete renameDrafts.value[categoryId]
    renameErrors.value[categoryId] = null
  }

  // ── Reimbursement associations ────────────────────────────────────────────
  // An association pairs one expense category with one income category, and
  // each side can only be used once — hence the "available" lists.
  const associationByExpenseId = computed(() => {
    const map = new Map<string, string>()
    for (const assoc of categoryAssociationsStore.associations) {
      map.set(assoc.expenseCategoryId, assoc.incomeCategoryName)
    }
    return map
  })

  const associationByIncomeId = computed(() => {
    const map = new Map<string, string>()
    for (const assoc of categoryAssociationsStore.associations) {
      map.set(assoc.incomeCategoryId, assoc.expenseCategoryName)
    }
    return map
  })

  function associatedNameFor(category: CategoryDto): string | null {
    return category.type === 'EXPENSE'
      ? (associationByExpenseId.value.get(category.id) ?? null)
      : (associationByIncomeId.value.get(category.id) ?? null)
  }

  function associationIdFor(category: CategoryDto): string | null {
    const assoc = categoryAssociationsStore.associations.find(a =>
      category.type === 'EXPENSE'
        ? a.expenseCategoryId === category.id
        : a.incomeCategoryId === category.id
    )
    return assoc?.id ?? null
  }

  const availableIncomeCategories = computed(() => {
    const used = new Set(
      categoryAssociationsStore.associations.map(a => a.incomeCategoryId)
    )
    return incomeCategories.value.filter(c => !used.has(c.id))
  })

  const associationDrafts = ref<Record<string, string>>({})
  const savingAssociation = ref<Set<string>>(new Set())

  async function createAssociation(category: CategoryDto): Promise<void> {
    const incomeCategoryId = associationDrafts.value[category.id] ?? ''
    if (incomeCategoryId === '' || savingAssociation.value.has(category.id))
      return

    markSaving(savingAssociation, category.id, true)
    try {
      const created = await categoryAssociationsStore.create({
        expenseCategoryId: category.id,
        incomeCategoryId,
      })
      if (created) {
        associationDrafts.value[category.id] = ''
        toast.success(
          `« ${category.name} » associée à « ${created.incomeCategoryName} »`
        )
      } else {
        toast.error(
          categoryAssociationsStore.error ?? 'Erreur lors de l’association'
        )
      }
    } finally {
      markSaving(savingAssociation, category.id, false)
    }
  }

  async function removeAssociation(category: CategoryDto): Promise<void> {
    const id = associationIdFor(category)
    if (id === null || savingAssociation.value.has(category.id)) return

    markSaving(savingAssociation, category.id, true)
    try {
      const ok = await categoryAssociationsStore.remove(id)
      if (ok) toast.success(`Association de « ${category.name} » supprimée`)
      else toast.error('Erreur lors de la suppression de l’association')
    } finally {
      markSaving(savingAssociation, category.id, false)
    }
  }

  // ── Create a category ─────────────────────────────────────────────────────
  const isCreateModalOpen = ref(false)
  const newCategoryName = ref('')
  const newCategoryType = ref<'EXPENSE' | 'INCOME'>('EXPENSE')
  const isCreatingCategory = ref(false)
  const createError = ref<string | null>(null)

  function openCreateModal(): void {
    newCategoryName.value = ''
    newCategoryType.value = 'EXPENSE'
    createError.value = null
    isCreateModalOpen.value = true
  }

  function closeCreateModal(): void {
    isCreateModalOpen.value = false
  }

  async function createCategory(): Promise<void> {
    const name = newCategoryName.value.trim()
    if (name.length === 0 || isCreatingCategory.value) return

    isCreatingCategory.value = true
    createError.value = null
    try {
      const created = await api.createCategory({
        name,
        type: newCategoryType.value,
      })
      categories.value = [...categories.value, created]
      closeCreateModal()
      toast.success(`Catégorie « ${created.name} » créée`)
    } catch (err) {
      createError.value =
        err instanceof Error ? err.message : 'Erreur lors de la création'
    } finally {
      isCreatingCategory.value = false
    }
  }

  // ── Icons ─────────────────────────────────────────────────────────────────
  const missingIconCount = computed(
    () => categories.value.filter(c => !c.icon).length
  )
  const isGeneratingIcons = ref(false)

  async function generateIcons(): Promise<void> {
    if (isGeneratingIcons.value) return
    try {
      isGeneratingIcons.value = true
      const result = await api.generateCategoryIcons()
      toast.success(`${result.updated} icône(s) générée(s)`)
      await Promise.all([loadCategories(), loadSubcategories()])
    } catch (err) {
      console.error('Failed to generate icons:', err)
      toast.error('Erreur lors de la génération des icônes')
    } finally {
      isGeneratingIcons.value = false
    }
  }

  /**
   * Changing the icon and deleting still need endpoints the API lacks —
   * PATCH /categories accepts the name and the budget flag, nothing else.
   */
  const UNAVAILABLE_HINT =
    'Pas encore disponible : cette action nécessite un nouvel endpoint côté serveur.'
</script>

<template>
  <div class="space-y-8">
    <SettingsCard
      title="Catégories"
      description="Choisissez où apparaît chaque catégorie, gérez ses sous-catégories et son association de remboursement."
    >
      <template #action>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            data-testid="open-create-category"
            @click="openCreateModal"
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
            Nouvelle catégorie
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
            :disabled="isGeneratingIcons || missingIconCount === 0"
            :title="
              missingIconCount === 0
                ? 'Toutes les catégories ont une icône'
                : `${missingIconCount} catégorie(s) sans icône`
            "
            data-testid="generate-icons"
            @click="generateIcons"
          >
            <span>✨</span>
            {{
              isGeneratingIcons
                ? 'Génération…'
                : `Générer les icônes (${missingIconCount})`
            }}
          </button>
        </div>
      </template>

      <div v-if="isLoadingCategories && totalCategoryCount === 0" class="py-8">
        <p class="text-center text-sm text-gray-500 dark:text-gray-400">
          Chargement…
        </p>
      </div>

      <div v-else class="space-y-6">
        <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          <strong class="text-gray-700 dark:text-gray-300"
            >Tableau de bord</strong
          >
          retire la catégorie de toutes les vues ;
          <strong class="text-gray-700 dark:text-gray-300">Budget</strong>
          la retire uniquement des budgets, plans et moyennes (utile pour les
          dépenses exceptionnelles ou les prêts). Une catégorie masquée du
          tableau de bord est aussi exclue du budget. Chaque changement est
          enregistré immédiatement.
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

        <!-- No-match state -->
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
              data-testid="category-row"
            >
              <div
                class="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
              >
                <!-- Name, badges, expander -->
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    class="shrink-0 rounded p-1 text-gray-400 transition-transform hover:text-gray-600 dark:hover:text-gray-300"
                    :class="isExpanded(category.id) ? 'rotate-90' : ''"
                    :aria-expanded="isExpanded(category.id)"
                    :aria-label="`Détails de ${category.name}`"
                    @click="toggleExpanded(category.id)"
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
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
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
                  <span
                    v-if="associatedNameFor(category)"
                    class="hidden shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 sm:inline dark:bg-emerald-900/30 dark:text-emerald-400"
                    :title="`Associée à « ${associatedNameFor(category)} »`"
                  >
                    ↔ {{ associatedNameFor(category) }}
                  </span>
                  <span
                    v-if="subcategoriesFor(category.id).length > 0"
                    class="hidden shrink-0 text-[10px] text-gray-400 sm:inline dark:text-gray-500"
                  >
                    {{ subcategoriesFor(category.id).length }} sous-cat.
                  </span>
                </div>

                <div class="flex justify-center">
                  <ToggleSwitch
                    :checked="isDashboardVisible(category)"
                    :loading="savingVisibility.has(category.id)"
                    :aria-label="
                      isDashboardVisible(category)
                        ? `Masquer ${category.name} du tableau de bord`
                        : `Afficher ${category.name} dans le tableau de bord`
                    "
                    @change="toggleDashboardVisible(category)"
                  />
                </div>

                <div class="flex justify-center">
                  <ToggleSwitch
                    :checked="isBudgetIncluded(category)"
                    :disabled="!isDashboardVisible(category)"
                    :loading="savingBudget.has(category.id)"
                    :aria-label="
                      isBudgetIncluded(category)
                        ? `Exclure ${category.name} du budget`
                        : `Inclure ${category.name} dans le budget`
                    "
                    @change="toggleBudgetExclusion(category)"
                  />
                </div>
              </div>

              <!-- Detail panel -->
              <div
                v-show="isExpanded(category.id)"
                class="space-y-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-slate-700/60 dark:bg-slate-800/40"
              >
                <!-- Name -->
                <div>
                  <label
                    :for="`category-name-${category.id}`"
                    class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    Nom
                  </label>
                  <form
                    class="flex flex-col gap-2 sm:flex-row sm:items-center"
                    @submit.prevent="submitRename(category)"
                  >
                    <input
                      :id="`category-name-${category.id}`"
                      type="text"
                      maxlength="100"
                      :value="renameDraftFor(category)"
                      :disabled="renameSaving[category.id]"
                      data-testid="rename-input"
                      class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                      @input="
                        onRenameDraftChange(
                          category.id,
                          ($event.target as HTMLInputElement).value
                        )
                      "
                    />
                    <div class="flex gap-2">
                      <button
                        type="submit"
                        :disabled="
                          !isRenameDirty(category) || renameSaving[category.id]
                        "
                        class="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {{
                          renameSaving[category.id]
                            ? 'Enregistrement…'
                            : 'Renommer'
                        }}
                      </button>
                      <button
                        v-if="isRenameDirty(category)"
                        type="button"
                        :disabled="renameSaving[category.id]"
                        class="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600"
                        @click="cancelRename(category.id)"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                  <p
                    v-if="renameErrors[category.id]"
                    class="mt-2 text-sm text-red-600 dark:text-red-400"
                    data-testid="rename-error"
                  >
                    {{ renameErrors[category.id] }}
                  </p>
                  <p
                    v-else
                    class="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400"
                  >
                    Transactions, budgets, associations et sous-catégories
                    suivent la catégorie renommée. Seul un futur import CSV
                    portant l'ancien nom recréerait une catégorie distincte.
                  </p>
                </div>

                <!-- Subcategories -->
                <div>
                  <h4
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    Sous-catégories
                  </h4>
                  <ul
                    v-if="subcategoriesFor(category.id).length > 0"
                    class="mb-2 flex flex-wrap gap-1.5"
                  >
                    <li
                      v-for="sub in subcategoriesFor(category.id)"
                      :key="sub.id"
                      class="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-gray-300 dark:ring-slate-700"
                    >
                      <CategoryIcon :icon="sub.icon" :name="sub.name">
                        {{ sub.name }}
                      </CategoryIcon>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="mb-2 text-xs italic text-gray-500 dark:text-gray-400"
                  >
                    Aucune sous-catégorie.
                  </p>

                  <form
                    class="flex gap-2"
                    @submit.prevent="addSubcategory(category)"
                  >
                    <input
                      v-model="newSubcategoryNames[category.id]"
                      type="text"
                      :placeholder="`Ajouter une sous-catégorie à ${category.name}…`"
                      :aria-label="`Nouvelle sous-catégorie de ${category.name}`"
                      class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                    />
                    <button
                      type="submit"
                      :disabled="
                        !newSubcategoryNames[category.id]?.trim() ||
                        creatingSubcategory.has(category.id)
                      "
                      class="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </form>
                </div>

                <!-- Association -->
                <div>
                  <h4
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    Association de remboursement
                  </h4>

                  <div
                    v-if="associatedNameFor(category)"
                    class="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span>
                      Associée à
                      <strong>« {{ associatedNameFor(category) }} »</strong>
                    </span>
                    <button
                      type="button"
                      :disabled="savingAssociation.has(category.id)"
                      class="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      @click="removeAssociation(category)"
                    >
                      Dissocier
                    </button>
                  </div>

                  <form
                    v-else-if="category.type === 'EXPENSE'"
                    class="flex flex-col gap-2 sm:flex-row"
                    @submit.prevent="createAssociation(category)"
                  >
                    <select
                      v-model="associationDrafts[category.id]"
                      :aria-label="`Catégorie de revenu associée à ${category.name}`"
                      class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                    >
                      <option value="">
                        Associer à une catégorie de revenu…
                      </option>
                      <option
                        v-for="income in availableIncomeCategories"
                        :key="income.id"
                        :value="income.id"
                      >
                        {{ income.name }}
                      </option>
                    </select>
                    <button
                      type="submit"
                      :disabled="
                        !associationDrafts[category.id] ||
                        savingAssociation.has(category.id)
                      "
                      class="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Associer
                    </button>
                  </form>

                  <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                    Une association se crée depuis la catégorie de dépense
                    correspondante.
                  </p>
                </div>

                <!-- Not yet wired: no endpoint for the icon nor the deletion -->
                <div
                  class="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-slate-700"
                >
                  <button
                    type="button"
                    disabled
                    :title="UNAVAILABLE_HINT"
                    class="cursor-not-allowed rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-400 dark:border-slate-700 dark:text-gray-500"
                  >
                    Changer l'icône
                  </button>
                  <button
                    type="button"
                    disabled
                    :title="UNAVAILABLE_HINT"
                    class="cursor-not-allowed rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-400 dark:border-slate-700 dark:text-gray-500"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div
          v-if="totalCategoryCount === 0"
          class="py-8 text-center text-gray-500 dark:text-gray-400"
        >
          Aucune catégorie disponible. Importez des transactions ou créez-en
          une.
        </div>
      </div>
    </SettingsCard>

    <!-- Association recap -->
    <SettingsCard
      title="Associations de remboursement"
      description="Récapitulatif des paires dépense ↔ revenu. Elles déduisent automatiquement les remboursements dans le tableau de bord."
    >
      <p
        v-if="categoryAssociationsStore.associations.length === 0"
        class="rounded-lg bg-gray-50 p-4 text-sm italic text-gray-500 dark:bg-slate-800 dark:text-gray-400"
      >
        Aucune association. Dépliez une catégorie de dépense ci-dessus pour en
        créer une.
      </p>

      <ul v-else class="space-y-2">
        <li
          v-for="association in categoryAssociationsStore.associations"
          :key="association.id"
          class="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700"
        >
          <span
            class="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300"
          >
            {{ association.expenseCategoryName }}
          </span>
          <span class="text-gray-400">→</span>
          <span
            class="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            {{ association.incomeCategoryName }}
          </span>
          <button
            type="button"
            class="ml-auto text-xs font-medium text-red-600 hover:underline dark:text-red-400"
            :aria-label="`Supprimer l'association ${association.expenseCategoryName}`"
            @click="categoryAssociationsStore.remove(association.id)"
          >
            Supprimer
          </button>
        </li>
      </ul>
    </SettingsCard>

    <!-- Create category modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isCreateModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div class="fixed inset-0 bg-black/50" @click="closeCreateModal" />

          <div
            class="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Nouvelle catégorie
            </h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Elle sera disponible immédiatement pour classer vos transactions.
            </p>

            <div
              v-if="createError"
              class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ createError }}
            </div>

            <form class="mt-4 space-y-4" @submit.prevent="createCategory">
              <div>
                <label
                  for="new-category-name"
                  class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Nom
                </label>
                <input
                  id="new-category-name"
                  v-model="newCategoryName"
                  type="text"
                  maxlength="100"
                  :disabled="isCreatingCategory"
                  class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                />
              </div>

              <div>
                <span
                  class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Type
                </span>
                <div
                  class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-slate-700"
                  role="group"
                  aria-label="Type de la catégorie"
                >
                  <button
                    type="button"
                    :aria-pressed="newCategoryType === 'EXPENSE'"
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      newCategoryType === 'EXPENSE'
                        ? 'bg-emerald-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                    "
                    @click="newCategoryType = 'EXPENSE'"
                  >
                    Dépense
                  </button>
                  <button
                    type="button"
                    :aria-pressed="newCategoryType === 'INCOME'"
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    :class="
                      newCategoryType === 'INCOME'
                        ? 'bg-emerald-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                    "
                    @click="newCategoryType = 'INCOME'"
                  >
                    Revenu
                  </button>
                </div>
              </div>

              <div class="flex gap-3 pt-2">
                <button
                  type="button"
                  class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-800"
                  :disabled="isCreatingCategory"
                  @click="closeCreateModal"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!newCategoryName.trim() || isCreatingCategory"
                >
                  {{ isCreatingCategory ? 'Création…' : 'Créer' }}
                </button>
              </div>
            </form>
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

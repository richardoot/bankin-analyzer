<script setup lang="ts">
  /**
   * One row per category, and everything about that category reachable from
   * it: where it shows up, its subcategories, and what the framework lets
   * the user do with it.
   *
   * The vocabulary is the catalogue's: a category carrying a catalogue key
   * cannot be renamed, re-iconed or deleted, and no category is created here
   * any more — the one level the user still writes to is the subcategory,
   * inside a catalogue category, with the two attributes every calculation
   * reads. A category without a key predates the catalogue: it keeps its old
   * powers until the assistant has emptied it, and that is where the page
   * sends it.
   */
  import { computed, onMounted, ref } from 'vue'
  import { useFiltersStore } from '@/stores/filters'
  import { api } from '@/lib/api'
  import type {
    CategoryDto,
    CategoryNature,
    CategoryRhythm,
    SubcategoryDto,
  } from '@/lib/api'
  import {
    KIND_LABELS,
    NATURE_LABELS,
    RHYTHM_LABELS,
    isCatalogCategory,
    isLegacyCategory,
    kindOf,
    normalizeForSearch,
  } from '@/lib/categories'
  import type { CategoryKind } from '@/lib/categories'
  import { useToast } from '@/composables/useToast'
  import CategoryIcon from '@/components/CategoryIcon.vue'
  import CategoryAttributeBadges from '@/components/settings/CategoryAttributeBadges.vue'
  import DeleteCategoryModal from '@/components/settings/DeleteCategoryModal.vue'
  import LegacyMigrationBanner from '@/components/settings/LegacyMigrationBanner.vue'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import ToggleSwitch from '@/components/ToggleSwitch.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

  const filtersStore = useFiltersStore()
  const toast = useToast()

  const categories = ref<CategoryDto[]>([])
  const subcategories = ref<SubcategoryDto[]>([])
  const isLoadingCategories = ref(false)

  onMounted(async () => {
    await Promise.all([loadCategories(), loadSubcategories()])
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

  const legacyCategories = computed(() =>
    categories.value.filter(isLegacyCategory)
  )
  const hasLegacy = computed(() => legacyCategories.value.length > 0)

  // ── Visibility ────────────────────────────────────────────────────────────
  // Dashboard → hides the category everywhere. A display preference only:
  // keeping spending out of the budget and the averages is the exceptional
  // tag's job, per transaction.
  function isGloballyHidden(category: CategoryDto): boolean {
    return category.type === 'EXPENSE'
      ? filtersStore.isExpenseCategoryGloballyHidden(category.id)
      : filtersStore.isIncomeCategoryGloballyHidden(category.id)
  }

  function isDashboardVisible(category: CategoryDto): boolean {
    return !isGloballyHidden(category)
  }

  const savingVisibility = ref<Set<string>>(new Set())

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

  // ── Search & quick filters ────────────────────────────────────────────────
  type CategoryStateFilter = 'all' | 'hidden' | 'legacy'
  const categorySearch = ref('')
  const categoryStateFilter = ref<CategoryStateFilter>('all')
  const categoryStateOptions = computed<
    { key: CategoryStateFilter; label: string }[]
  >(() => [
    { key: 'all', label: 'Toutes' },
    { key: 'hidden', label: 'Masquées' },
    ...(hasLegacy.value ? [{ key: 'legacy' as const, label: 'À migrer' }] : []),
  ])

  /** A category matches when its name does, or one of its subcategories'. */
  function matchesFilters(category: CategoryDto): boolean {
    const term = normalizeForSearch(categorySearch.value)
    if (term) {
      const inName = normalizeForSearch(category.name).includes(term)
      const inSubcategories = subcategoriesFor(category.id).some(sub =>
        normalizeForSearch(sub.name).includes(term)
      )
      if (!inName && !inSubcategories) return false
    }
    if (categoryStateFilter.value === 'hidden')
      return isGloballyHidden(category)
    if (categoryStateFilter.value === 'legacy')
      return isLegacyCategory(category)
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

  /**
   * The legacy categories come first, as one section whatever their type:
   * they are what needs doing. The catalogue follows, by kind.
   */
  const categorySections = computed(() => {
    const sections: { key: string; title: string; items: CategoryDto[] }[] = []
    sections.push({
      key: 'legacy',
      title: 'À migrer vers le catalogue',
      items: sortForDisplay(legacyCategories.value.filter(matchesFilters)),
    })
    for (const kind of ['EXPENSE', 'INCOME', 'TRANSFER'] as CategoryKind[]) {
      sections.push({
        key: kind.toLowerCase(),
        title: KIND_LABELS[kind],
        items: sortForDisplay(
          categories.value.filter(
            c => isCatalogCategory(c) && kindOf(c) === kind && matchesFilters(c)
          )
        ),
      })
    }
    return sections
  })

  const totalCategoryCount = computed(() => categories.value.length)
  const filteredCategoryCount = computed(() =>
    categorySections.value.reduce((sum, s) => sum + s.items.length, 0)
  )

  function clearCategoryFilters(): void {
    categorySearch.value = ''
    categoryStateFilter.value = 'all'
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────
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

  // ── Subcategories ─────────────────────────────────────────────────────────
  const subcategoriesByCategory = computed(() => {
    const map = new Map<string, SubcategoryDto[]>()
    for (const sub of subcategories.value) {
      const list = map.get(sub.categoryId)
      if (list) list.push(sub)
      else map.set(sub.categoryId, [sub])
    }
    for (const list of map.values()) {
      // "Autre" last, then by name.
      list.sort((a, b) => {
        const aOther = a.catalogKey?.endsWith('.other') ? 1 : 0
        const bOther = b.catalogKey?.endsWith('.other') ? 1 : 0
        if (aOther !== bOther) return aOther - bOther
        return a.name.localeCompare(b.name, 'fr')
      })
    }
    return map
  })

  function subcategoriesFor(categoryId: string): SubcategoryDto[] {
    return subcategoriesByCategory.value.get(categoryId) ?? []
  }

  function isLockedSubcategory(sub: SubcategoryDto): boolean {
    return typeof sub.catalogKey === 'string' && sub.catalogKey !== ''
  }

  /** Transfers are flat: nothing is filed under one but the category itself. */
  function acceptsSubcategories(category: CategoryDto): boolean {
    return kindOf(category) !== 'TRANSFER'
  }

  const newSubcategoryNames = ref<Record<string, string>>({})
  const newSubcategoryNature = ref<Record<string, CategoryNature>>({})
  const newSubcategoryRhythm = ref<Record<string, CategoryRhythm>>({})
  const creatingSubcategory = ref<Set<string>>(new Set())

  /** The parent's defaults, shown as the initial choice so the user sees them. */
  function natureDraftFor(category: CategoryDto): CategoryNature | '' {
    return (
      newSubcategoryNature.value[category.id] ?? category.defaultNature ?? ''
    )
  }

  function rhythmDraftFor(category: CategoryDto): CategoryRhythm | '' {
    return (
      newSubcategoryRhythm.value[category.id] ?? category.defaultRhythm ?? ''
    )
  }

  async function addSubcategory(category: CategoryDto): Promise<void> {
    const name = newSubcategoryNames.value[category.id]?.trim() ?? ''
    if (name.length === 0 || creatingSubcategory.value.has(category.id)) return

    const nature = natureDraftFor(category)
    const rhythm = rhythmDraftFor(category)
    const isExpense = kindOf(category) === 'EXPENSE'
    markSaving(creatingSubcategory, category.id, true)
    try {
      const created = await api.createSubcategory({
        categoryId: category.id,
        name,
        ...(isExpense && nature ? { nature } : {}),
        ...(isExpense && rhythm ? { rhythm } : {}),
      })
      if (subcategories.value.some(s => s.id === created.id)) {
        toast.success(`« ${created.name} » existe déjà dans ${category.name}`)
      } else {
        subcategories.value = [...subcategories.value, created]
        toast.success(`Sous-catégorie « ${created.name} » ajoutée`)
      }
      newSubcategoryNames.value[category.id] = ''
    } catch (err) {
      console.error('Failed to create subcategory:', err)
      toast.error('Erreur lors de la création de la sous-catégorie')
    } finally {
      markSaving(creatingSubcategory, category.id, false)
    }
  }

  // Deleting a subcategory never loses a transaction: the rows go to the
  // category's "Autre", and the dialog says so before asking.
  const subcategoryPendingDeletion = ref<SubcategoryDto | null>(null)
  const isDeletingSubcategory = ref(false)

  function askDeleteSubcategory(sub: SubcategoryDto): void {
    subcategoryPendingDeletion.value = sub
  }

  async function confirmDeleteSubcategory(): Promise<void> {
    const sub = subcategoryPendingDeletion.value
    if (!sub || isDeletingSubcategory.value) return
    isDeletingSubcategory.value = true
    try {
      const result = await api.deleteSubcategory(sub.id)
      subcategories.value = subcategories.value.filter(s => s.id !== sub.id)
      subcategoryPendingDeletion.value = null
      const where = result.fallbackSubcategoryName
        ? `reclassée(s) dans « ${result.fallbackSubcategoryName} »`
        : 'reclassée(s) à la catégorie seule'
      toast.success(
        result.refiledTransactions > 0
          ? `« ${sub.name} » supprimée — ${result.refiledTransactions} transaction(s) ${where}`
          : `« ${sub.name} » supprimée`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erreur lors de la suppression'
      )
    } finally {
      isDeletingSubcategory.value = false
    }
  }

  // ── Rename (legacy only) ──────────────────────────────────────────────────
  // Transactions, budget plans and the hidden-category preferences all point
  // at the category by id, so they follow a rename on their own.
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

    renameSaving.value[category.id] = true
    renameErrors.value[category.id] = null
    try {
      const updated = await api.updateCategory(category.id, { name: draft })
      category.name = updated.name
      delete renameDrafts.value[category.id]
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

  // ── Icons ─────────────────────────────────────────────────────────────────
  const missingIconCount = computed(
    () =>
      categories.value.filter(c => !c.icon).length +
      subcategories.value.filter(s => !s.icon).length
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

  // ── Deletion (legacy only) ────────────────────────────────────────────────
  // The modal owns the impact inventory and the confirmation; the page only
  // opens it and cleans up once the deletion went through.
  const categoryPendingDeletion = ref<CategoryDto | null>(null)

  function askDelete(category: CategoryDto): void {
    categoryPendingDeletion.value = category
  }

  function cancelDelete(): void {
    categoryPendingDeletion.value = null
  }

  async function onDeleted(payload: {
    category: CategoryDto
    uncategorizedTransactions: number
  }): Promise<void> {
    const { category, uncategorizedTransactions } = payload
    categoryPendingDeletion.value = null
    categories.value = categories.value.filter(c => c.id !== category.id)
    expanded.value = new Set(
      [...expanded.value].filter(id => id !== category.id)
    )
    filtersStore.forgetCategory(category.id, category.type)

    await loadSubcategories()

    toast.success(
      uncategorizedTransactions > 0
        ? `« ${category.name} » supprimée — ${uncategorizedTransactions} transaction(s) sans catégorie`
        : `« ${category.name} » supprimée`
    )
  }
</script>

<template>
  <div class="space-y-8">
    <LegacyMigrationBanner v-if="hasLegacy" :count="legacyCategories.length" />

    <SettingsCard
      title="Catégories"
      description="Le catalogue impose les catégories ; à l'intérieur, vos sous-catégories restent les vôtres. Choisissez où chaque catégorie apparaît."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto dark:border-primary-800 dark:text-primary-300 dark:hover:bg-primary-900/20"
          :disabled="isGeneratingIcons || missingIconCount === 0"
          :title="
            missingIconCount === 0
              ? 'Tout a une icône'
              : `${missingIconCount} sans icône`
          "
          data-testid="generate-icons"
          @click="generateIcons"
        >
          <span>✨</span>
          <span>
            {{
              isGeneratingIcons
                ? 'Génération…'
                : `Générer les icônes (${missingIconCount})`
            }}
          </span>
        </button>
      </template>

      <div v-if="isLoadingCategories && totalCategoryCount === 0" class="py-8">
        <p class="text-center text-sm text-gray-500 dark:text-gray-400">
          Chargement…
        </p>
      </div>

      <div v-else class="space-y-6">
        <p
          class="hidden text-xs leading-relaxed text-gray-500 sm:block dark:text-gray-400"
        >
          <strong class="text-gray-700 dark:text-gray-300"
            >Tableau de bord</strong
          >
          retire la catégorie de toutes les vues. Pour tenir une dépense
          ponctuelle hors des moyennes et du budget, utilisez un tag
          exceptionnel sur la transaction. Chaque changement est enregistré
          immédiatement.
        </p>

        <!-- Search + quick state filters -->
        <div
          v-if="totalCategoryCount > 0"
          class="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div class="relative flex-1">
            <svg
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
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
              placeholder="Rechercher une catégorie ou une sous-catégorie…"
              aria-label="Rechercher une catégorie"
              class="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-base text-gray-800 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:placeholder-gray-500"
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
            class="flex shrink-0 rounded-lg border border-gray-200 p-0.5 sm:inline-flex dark:border-slate-700"
            role="group"
            aria-label="Filtrer les catégories par état"
          >
            <button
              v-for="opt in categoryStateOptions"
              :key="opt.key"
              type="button"
              :aria-pressed="categoryStateFilter === opt.key"
              class="min-h-[40px] flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:flex-none"
              :class="
                categoryStateFilter === opt.key
                  ? 'bg-primary-500 text-white dark:bg-primary-600'
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
            class="ml-1 font-medium text-primary-600 hover:underline dark:text-primary-400"
            @click="clearCategoryFilters"
          >
            Réinitialiser les filtres
          </button>
        </div>

        <div
          v-for="section in categorySections"
          v-show="section.items.length > 0"
          :key="section.key"
          :data-testid="`category-section-${section.key}`"
        >
          <div
            class="mb-1 grid grid-cols-[1fr_3rem] items-end gap-3 px-3 sm:grid-cols-[1fr_5.5rem]"
          >
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ section.title }}
            </h3>
            <span
              class="text-center text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400"
            >
              <span class="sm:hidden">Visible</span>
              <span class="hidden sm:inline">Tableau de bord</span>
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
                class="grid grid-cols-[1fr_3rem] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 sm:grid-cols-[1fr_5.5rem] sm:py-2 dark:hover:bg-slate-800/50"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    class="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
                    :aria-expanded="isExpanded(category.id)"
                    :aria-label="
                      isExpanded(category.id)
                        ? `Replier ${category.name}`
                        : `Déplier ${category.name}`
                    "
                    @click="toggleExpanded(category.id)"
                  >
                    <svg
                      class="h-4 w-4 transition-transform"
                      :class="isExpanded(category.id) ? 'rotate-90' : ''"
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
                    v-if="isCatalogCategory(category)"
                    class="shrink-0 text-gray-400 dark:text-gray-500"
                    title="Catégorie du catalogue : ni renommée, ni supprimée"
                    data-testid="category-lock"
                    aria-label="Catégorie du catalogue"
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
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </span>
                  <span
                    v-else
                    class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    data-testid="category-legacy"
                  >
                    À migrer
                  </span>
                  <span
                    v-if="!isDashboardVisible(category)"
                    class="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Masquée
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
                    :label="
                      isDashboardVisible(category)
                        ? `Masquer ${category.name} du tableau de bord`
                        : `Afficher ${category.name} dans le tableau de bord`
                    "
                    @change="toggleDashboardVisible(category)"
                  />
                </div>
              </div>

              <!-- Detail panel -->
              <div
                v-show="isExpanded(category.id)"
                class="space-y-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-slate-700/60 dark:bg-slate-800/40"
              >
                <!-- Legacy: the assistant, and the old powers until then -->
                <template v-if="isLegacyCategory(category)">
                  <div
                    class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300"
                  >
                    Cette catégorie date d'avant le catalogue. L'assistant
                    replace ses transactions dans le catalogue, ligne par ligne,
                    et la supprime une fois vide.
                    <RouterLink
                      to="/settings/categories/migration"
                      class="ml-1 font-medium underline"
                      :data-testid="`migrate-category-${category.id}`"
                    >
                      Ouvrir l'assistant
                    </RouterLink>
                  </div>

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
                        class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
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
                            !isRenameDirty(category) ||
                            renameSaving[category.id]
                          "
                          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  </div>
                </template>

                <!-- Catalogue: what it is, in two words -->
                <div
                  v-else
                  class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                  data-testid="catalog-note"
                >
                  <span>Catégorie du catalogue.</span>
                  <template v-if="kindOf(category) === 'EXPENSE'">
                    <span>
                      Par défaut pour une transaction sans sous-catégorie :
                    </span>
                    <CategoryAttributeBadges
                      :nature="category.defaultNature"
                      :rhythm="category.defaultRhythm"
                    />
                  </template>
                  <span v-else-if="kindOf(category) === 'TRANSFER'">
                    Un transfert n'est ni une dépense ni un revenu ; il se
                    classe à la catégorie seule.
                  </span>
                </div>

                <!-- Subcategories -->
                <div v-if="acceptsSubcategories(category)">
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
                      class="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-gray-300 dark:ring-slate-700"
                      data-testid="subcategory-chip"
                    >
                      <CategoryIcon :icon="sub.icon" :name="sub.name">
                        {{ sub.name }}
                      </CategoryIcon>
                      <CategoryAttributeBadges
                        v-if="kindOf(category) === 'EXPENSE'"
                        :nature="sub.nature"
                        :rhythm="sub.rhythm"
                      />
                      <button
                        v-if="!isLockedSubcategory(sub)"
                        type="button"
                        class="-mr-1 rounded-full p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        :aria-label="`Supprimer la sous-catégorie ${sub.name}`"
                        :data-testid="`delete-subcategory-${sub.id}`"
                        @click="askDeleteSubcategory(sub)"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="mb-2 text-xs italic text-gray-500 dark:text-gray-400"
                  >
                    Aucune sous-catégorie.
                  </p>

                  <form
                    class="flex flex-col gap-2 sm:flex-row"
                    @submit.prevent="addSubcategory(category)"
                  >
                    <input
                      v-model="newSubcategoryNames[category.id]"
                      type="text"
                      :placeholder="`Ajouter une sous-catégorie à ${category.name}…`"
                      :aria-label="`Nouvelle sous-catégorie de ${category.name}`"
                      class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                    />
                    <template v-if="kindOf(category) === 'EXPENSE'">
                      <select
                        :value="natureDraftFor(category)"
                        :aria-label="`Nature de la nouvelle sous-catégorie de ${category.name}`"
                        class="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                        @change="
                          newSubcategoryNature[category.id] = (
                            $event.target as HTMLSelectElement
                          ).value as CategoryNature
                        "
                      >
                        <option
                          v-for="(label, value) in NATURE_LABELS"
                          :key="value"
                          :value="value"
                        >
                          {{ label }}
                        </option>
                      </select>
                      <select
                        :value="rhythmDraftFor(category)"
                        :aria-label="`Rythme de la nouvelle sous-catégorie de ${category.name}`"
                        class="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                        @change="
                          newSubcategoryRhythm[category.id] = (
                            $event.target as HTMLSelectElement
                          ).value as CategoryRhythm
                        "
                      >
                        <option
                          v-for="(label, value) in RHYTHM_LABELS"
                          :key="value"
                          :value="value"
                        >
                          {{ label }}
                        </option>
                      </select>
                    </template>
                    <button
                      type="submit"
                      :disabled="
                        !newSubcategoryNames[category.id]?.trim() ||
                        creatingSubcategory.has(category.id)
                      "
                      class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </form>
                </div>

                <div
                  v-if="isLegacyCategory(category)"
                  class="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-slate-700"
                >
                  <button
                    type="button"
                    :data-testid="`delete-category-${category.id}`"
                    class="min-h-[40px] flex-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 sm:min-h-0 sm:flex-none dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                    @click="askDelete(category)"
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
          Aucune catégorie. Le catalogue est créé à la première connexion.
        </div>
      </div>
    </SettingsCard>

    <DeleteCategoryModal
      :category="categoryPendingDeletion"
      @close="cancelDelete"
      @deleted="onDeleted"
    />

    <ConfirmDialog
      :open="subcategoryPendingDeletion !== null"
      title="Supprimer la sous-catégorie ?"
      :loading="isDeletingSubcategory"
      @confirm="confirmDeleteSubcategory"
      @cancel="subcategoryPendingDeletion = null"
    >
      Les transactions classées dans « {{ subcategoryPendingDeletion?.name }} »
      seront reclassées dans « Autre » de la même catégorie. Aucune ne perd sa
      catégorie.
    </ConfirmDialog>
  </div>
</template>

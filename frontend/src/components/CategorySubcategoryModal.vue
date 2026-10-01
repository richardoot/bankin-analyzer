<script setup lang="ts">
  /**
   * Filing one transaction: the catalogue as a tree, searched across both
   * levels — typing "loyer" surfaces Logement › Loyer, not just categories
   * whose name says "loyer".
   *
   * No category is created here any more: the vocabulary is the catalogue's.
   * A subcategory of the user's own can still be added on the spot, inside
   * the chosen category, and takes that category's default attributes. A
   * category from before the catalogue is shown greyed with the reason: new
   * filings go to the catalogue, the assistant deals with the old ones.
   */
  import { ref, watch, computed } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'
  import { api, type CategoryDto, type SubcategoryDto } from '@/lib/api'
  import {
    isCatalogCategory,
    isLegacyCategory,
    kindOf,
    normalizeForSearch,
  } from '@/lib/categories'
  import CategoryAttributeBadges from '@/components/settings/CategoryAttributeBadges.vue'

  const props = defineProps<{
    isOpen: boolean
    transactionType: 'EXPENSE' | 'INCOME'
    currentCategoryId: string | null
    currentSubcategoryId: string | null
  }>()

  const emit = defineEmits<{
    close: []
    select: [categoryId: string | null, subcategoryId: string | null]
  }>()

  // Escape closes, Tab stays inside, focus returns to the opener after.
  const modalPanelRef = ref<HTMLElement | null>(null)
  useModalA11y({
    isOpen: () => props.isOpen,
    onClose: () => handleClose(),
    panel: modalPanelRef,
  })

  const categories = ref<CategoryDto[]>([])
  const subcategories = ref<SubcategoryDto[]>([])
  const selectedCategoryId = ref<string | null>(null)
  const selectedSubcategoryId = ref<string | null>(null)
  const isLoading = ref(false)
  const isCreatingSubcategory = ref(false)
  const error = ref<string | null>(null)
  const newSubcategoryName = ref('')
  const searchQuery = ref('')

  const subcategoriesByCategory = computed(() => {
    const map = new Map<string, SubcategoryDto[]>()
    for (const sub of subcategories.value) {
      const list = map.get(sub.categoryId)
      if (list) list.push(sub)
      else map.set(sub.categoryId, [sub])
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aOther = a.catalogKey?.endsWith('.other') ? 1 : 0
        const bOther = b.catalogKey?.endsWith('.other') ? 1 : 0
        if (aOther !== bOther) return aOther - bOther
        return a.name.localeCompare(b.name, 'fr')
      })
    }
    return map
  })

  function subcategoriesOf(categoryId: string): SubcategoryDto[] {
    return subcategoriesByCategory.value.get(categoryId) ?? []
  }

  const term = computed(() => normalizeForSearch(searchQuery.value))

  /** The subcategories of a category whose name matches the search. */
  function matchingSubcategories(category: CategoryDto): SubcategoryDto[] {
    if (!term.value) return []
    return subcategoriesOf(category.id).filter(sub =>
      normalizeForSearch(sub.name).includes(term.value)
    )
  }

  function matches(category: CategoryDto): boolean {
    if (!term.value) return true
    return (
      normalizeForSearch(category.name).includes(term.value) ||
      matchingSubcategories(category).length > 0
    )
  }

  const ofType = computed(() =>
    categories.value.filter(c => c.type === props.transactionType)
  )

  /**
   * Transfers accept a row from either side: filing under one is what turns
   * a purchase-looking row into money moved, and the type follows.
   */
  const transferCategories = computed(() =>
    categories.value
      .filter(
        c => isCatalogCategory(c) && kindOf(c) === 'TRANSFER' && matches(c)
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  )

  /** The catalogue, the only place a new filing goes. */
  const catalogCategories = computed(() =>
    ofType.value
      .filter(c => isCatalogCategory(c) && matches(c))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  )

  /**
   * The categories from before the catalogue. Shown, greyed, so the current
   * filing stays legible when it is one of them; not selectable, so no new
   * filing lands there.
   */
  const legacyCategories = computed(() =>
    ofType.value
      .filter(c => isLegacyCategory(c) && matches(c))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  )

  const selectedCategory = computed(() =>
    categories.value.find(c => c.id === selectedCategoryId.value)
  )

  const selectedSubcategories = computed(() =>
    selectedCategoryId.value ? subcategoriesOf(selectedCategoryId.value) : []
  )

  const canAddSubcategory = computed(
    () =>
      selectedCategory.value !== undefined &&
      isCatalogCategory(selectedCategory.value) &&
      kindOf(selectedCategory.value) !== 'TRANSFER'
  )

  const hasChanges = computed(
    () =>
      selectedCategoryId.value !== props.currentCategoryId ||
      selectedSubcategoryId.value !== props.currentSubcategoryId
  )

  watch(
    () => props.isOpen,
    async isOpen => {
      if (isOpen) {
        await load()
        selectedCategoryId.value = props.currentCategoryId
        selectedSubcategoryId.value = props.currentSubcategoryId
      } else {
        selectedCategoryId.value = null
        selectedSubcategoryId.value = null
        newSubcategoryName.value = ''
        searchQuery.value = ''
        error.value = null
      }
    },
    { immediate: true }
  )

  async function load() {
    isLoading.value = true
    error.value = null
    try {
      const [cats, subs] = await Promise.all([
        api.getCategories(),
        api.getSubcategories(),
      ])
      categories.value = cats
      subcategories.value = subs
    } catch (e) {
      error.value = 'Erreur lors du chargement des catégories'
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  async function createSubcategory() {
    const name = newSubcategoryName.value.trim()
    if (!name || !selectedCategoryId.value || !canAddSubcategory.value) return

    isCreatingSubcategory.value = true
    error.value = null
    try {
      const created = await api.createSubcategory({
        categoryId: selectedCategoryId.value,
        name,
      })
      if (!subcategories.value.some(s => s.id === created.id)) {
        subcategories.value = [...subcategories.value, created]
      }
      selectedSubcategoryId.value = created.id
      newSubcategoryName.value = ''
    } catch (e) {
      error.value = 'Erreur lors de la création de la sous-catégorie'
      console.error(e)
    } finally {
      isCreatingSubcategory.value = false
    }
  }

  function selectCategory(
    categoryId: string | null,
    subcategoryId: string | null = null
  ) {
    if (categoryId !== selectedCategoryId.value) {
      selectedCategoryId.value = categoryId
      newSubcategoryName.value = ''
    }
    selectedSubcategoryId.value = subcategoryId
  }

  function selectSubcategory(subcategoryId: string | null) {
    selectedSubcategoryId.value = subcategoryId
  }

  function confirmSelection() {
    emit('select', selectedCategoryId.value, selectedSubcategoryId.value)
  }

  function handleClose() {
    emit('close')
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      >
        <div
          class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          @click="handleClose"
        />

        <Transition name="modal-content" appear>
          <div
            ref="modalPanelRef"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
            class="relative z-10 flex h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[75vh] sm:rounded-2xl dark:bg-slate-900 dark:shadow-black/40"
          >
            <!-- Header -->
            <div class="relative px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
              <div class="flex items-start justify-between">
                <div>
                  <h2
                    id="category-modal-title"
                    class="text-lg font-semibold text-gray-900 dark:text-white"
                  >
                    Modifier la catégorie
                  </h2>
                  <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    {{ transactionType === 'EXPENSE' ? 'Dépense' : 'Revenu' }}
                  </p>
                </div>
                <button
                  aria-label="Fermer"
                  class="-m-2 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-slate-800 dark:hover:text-gray-300"
                  @click="handleClose"
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

              <div class="relative mt-4">
                <svg
                  class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
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
                  v-model="searchQuery"
                  type="text"
                  aria-label="Rechercher une catégorie ou une sous-catégorie"
                  placeholder="Rechercher une catégorie ou une sous-catégorie…"
                  class="w-full rounded-xl border-0 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-shadow focus:ring-2 focus:ring-primary-500 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-primary-400"
                />
              </div>
            </div>

            <div
              v-if="error"
              role="alert"
              class="mx-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ error }}
            </div>

            <!-- Content: two scrollable halves -->
            <div class="flex flex-1 flex-col overflow-hidden">
              <div
                v-if="isLoading"
                class="flex flex-1 flex-col items-center justify-center py-12"
              >
                <div
                  class="border-3 h-10 w-10 animate-spin rounded-full border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400"
                />
                <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Chargement...
                </p>
              </div>

              <!-- Categories -->
              <div v-else class="flex min-h-0 flex-[2] flex-col pt-2">
                <div
                  class="mb-2 flex shrink-0 items-center justify-between px-6"
                >
                  <span
                    class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Catégorie
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ catalogCategories.length }} option{{
                      catalogCategories.length > 1 ? 's' : ''
                    }}
                  </span>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
                  <div class="grid grid-cols-1 gap-2 py-1 sm:grid-cols-2">
                    <!-- No category -->
                    <button
                      type="button"
                      class="group relative flex items-center gap-2 rounded-xl p-3 text-left transition-all duration-150"
                      :class="
                        selectedCategoryId === null
                          ? 'bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-500/10 dark:ring-primary-400'
                          : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700'
                      "
                      @click="selectCategory(null)"
                    >
                      <span
                        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                        :class="
                          selectedCategoryId === null
                            ? 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                            : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-gray-400'
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
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </span>
                      <span
                        class="truncate text-sm font-medium"
                        :class="
                          selectedCategoryId === null
                            ? 'text-primary-700 dark:text-primary-300'
                            : 'text-gray-600 dark:text-gray-400'
                        "
                      >
                        À classer
                      </span>
                    </button>

                    <!-- Catalogue -->
                    <button
                      v-for="cat in catalogCategories"
                      :key="cat.id"
                      type="button"
                      class="group relative flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-all duration-150"
                      :class="
                        selectedCategoryId === cat.id
                          ? 'bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-500/10 dark:ring-primary-400'
                          : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700'
                      "
                      :data-testid="`pick-category-${cat.id}`"
                      @click="selectCategory(cat.id)"
                    >
                      <span class="flex w-full items-center gap-2">
                        <span
                          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-semibold"
                          :class="[
                            cat.icon ? 'text-lg' : 'text-sm',
                            selectedCategoryId === cat.id
                              ? transactionType === 'EXPENSE'
                                ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                                : 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                              : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-gray-400',
                          ]"
                        >
                          {{ cat.icon || cat.name.charAt(0).toUpperCase() }}
                        </span>
                        <span
                          class="truncate text-sm font-medium"
                          :class="
                            selectedCategoryId === cat.id
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          "
                        >
                          {{ cat.name }}
                        </span>
                      </span>
                      <!-- The subcategories the search found, one click each -->
                      <span
                        v-if="matchingSubcategories(cat).length > 0"
                        class="flex flex-wrap gap-1"
                        data-testid="search-hits"
                      >
                        <span
                          v-for="sub in matchingSubcategories(cat)"
                          :key="sub.id"
                          class="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-700 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-slate-900 dark:text-gray-300 dark:ring-slate-700"
                          role="button"
                          tabindex="0"
                          @click.stop="selectCategory(cat.id, sub.id)"
                          @keydown.enter.stop="selectCategory(cat.id, sub.id)"
                        >
                          › {{ sub.name }}
                        </span>
                      </span>
                    </button>

                    <!-- Transfers: neither side, both sides -->
                    <div
                      v-if="transferCategories.length > 0"
                      class="col-span-1 mt-2 text-[11px] font-medium uppercase tracking-wider text-gray-500 sm:col-span-2 dark:text-gray-400"
                    >
                      Transferts
                    </div>
                    <button
                      v-for="cat in transferCategories"
                      :key="cat.id"
                      type="button"
                      class="group relative flex items-center gap-2 rounded-xl p-3 text-left transition-all duration-150"
                      :class="
                        selectedCategoryId === cat.id
                          ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-500/10 dark:ring-indigo-400'
                          : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700'
                      "
                      :data-testid="`pick-category-${cat.id}`"
                      @click="selectCategory(cat.id)"
                    >
                      <span
                        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-semibold"
                        :class="[
                          cat.icon ? 'text-lg' : 'text-sm',
                          selectedCategoryId === cat.id
                            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                            : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-gray-400',
                        ]"
                      >
                        {{ cat.icon || cat.name.charAt(0).toUpperCase() }}
                      </span>
                      <span
                        class="truncate text-sm font-medium"
                        :class="
                          selectedCategoryId === cat.id
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        "
                      >
                        {{ cat.name }}
                      </span>
                    </button>

                    <!-- Legacy, greyed -->
                    <div
                      v-for="cat in legacyCategories"
                      :key="cat.id"
                      class="relative flex items-center gap-2 rounded-xl border border-dashed border-amber-200 p-3 text-left opacity-70 dark:border-amber-900/50"
                      :class="
                        selectedCategoryId === cat.id
                          ? 'bg-amber-50 dark:bg-amber-900/20'
                          : 'bg-gray-50 dark:bg-slate-800'
                      "
                      :title="'Catégorie d’avant le catalogue : à migrer depuis les réglages'"
                      data-testid="legacy-category"
                    >
                      <span
                        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm font-semibold text-gray-500 dark:bg-slate-700 dark:text-gray-400"
                      >
                        {{ cat.icon || cat.name.charAt(0).toUpperCase() }}
                      </span>
                      <span class="min-w-0">
                        <span
                          class="block truncate text-sm font-medium text-gray-600 dark:text-gray-400"
                        >
                          {{ cat.name }}
                        </span>
                        <span
                          class="block text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          À migrer
                        </span>
                      </span>
                    </div>

                    <div
                      v-if="
                        catalogCategories.length === 0 &&
                        transferCategories.length === 0 &&
                        legacyCategories.length === 0 &&
                        searchQuery
                      "
                      class="col-span-2 py-6 text-center"
                    >
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        Rien ne correspond à "{{ searchQuery }}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Subcategories -->
              <div
                v-if="!isLoading"
                class="flex min-h-0 flex-1 flex-col border-t border-gray-100 pb-2 dark:border-slate-800"
              >
                <template v-if="selectedCategory">
                  <div
                    class="mb-2 flex shrink-0 items-center justify-between px-6 pt-2"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                        >Sous-catégorie</span
                      >
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        :class="
                          transactionType === 'EXPENSE'
                            ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                            : 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400'
                        "
                      >
                        <span v-if="selectedCategory.icon" class="mr-0.5">{{
                          selectedCategory.icon
                        }}</span>
                        {{ selectedCategory.name }}
                      </span>
                    </div>
                  </div>
                  <div
                    class="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-1 sm:px-6"
                  >
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        class="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 sm:min-h-0"
                        :class="
                          selectedSubcategoryId === null
                            ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-1 dark:bg-primary-500/20 dark:text-primary-300 dark:ring-primary-400 dark:ring-offset-slate-900'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700'
                        "
                        @click="selectSubcategory(null)"
                      >
                        Catégorie seule
                      </button>
                      <button
                        v-for="sub in selectedSubcategories"
                        :key="sub.id"
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150"
                        :class="
                          selectedSubcategoryId === sub.id
                            ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-1 dark:bg-primary-500/20 dark:text-primary-300 dark:ring-primary-400 dark:ring-offset-slate-900'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
                        "
                        :data-testid="`pick-subcategory-${sub.id}`"
                        @click="selectSubcategory(sub.id)"
                      >
                        <span v-if="sub.icon" class="mr-0.5">{{
                          sub.icon
                        }}</span>
                        {{ sub.name }}
                        <CategoryAttributeBadges
                          v-if="transactionType === 'EXPENSE'"
                          :nature="sub.nature"
                          :rhythm="sub.rhythm"
                        />
                      </button>
                    </div>
                    <div v-if="canAddSubcategory" class="mt-3 flex gap-2">
                      <div class="relative flex-1">
                        <svg
                          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
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
                        <input
                          v-model="newSubcategoryName"
                          type="text"
                          aria-label="Nouvelle sous-catégorie"
                          placeholder="Nouvelle sous-catégorie…"
                          class="w-full rounded-xl border-0 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-shadow focus:ring-2 focus:ring-primary-500 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-primary-400"
                          @keyup.enter="createSubcategory"
                        />
                      </div>
                      <button
                        type="button"
                        class="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
                        :disabled="
                          isCreatingSubcategory || !newSubcategoryName.trim()
                        "
                        data-testid="create-subcategory"
                        @click="createSubcategory"
                      >
                        <span>{{
                          isCreatingSubcategory ? 'Création…' : 'Créer'
                        }}</span>
                      </button>
                    </div>
                    <p
                      v-else-if="
                        selectedCategory && isLegacyCategory(selectedCategory)
                      "
                      class="mt-3 text-xs text-amber-700 dark:text-amber-400"
                    >
                      Catégorie d'avant le catalogue : choisissez une catégorie
                      du catalogue, ou migrez celle-ci depuis les réglages.
                    </p>
                  </div>
                </template>
                <div v-else class="flex flex-1 items-center justify-center">
                  <p
                    class="text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    Sélectionnez une catégorie pour voir les sous-catégories
                  </p>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="border-t border-gray-100 bg-gray-50 px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <div
                class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs text-gray-500 dark:text-gray-400">
                    <template v-if="selectedCategory">
                      <span v-if="selectedCategory.icon" class="mr-0.5">{{
                        selectedCategory.icon
                      }}</span>
                      {{ selectedCategory.name }}
                      <template v-if="selectedSubcategoryId">
                        <span class="mx-1">/</span>
                        {{
                          subcategories.find(
                            s => s.id === selectedSubcategoryId
                          )?.name
                        }}
                      </template>
                    </template>
                    <template v-else> À classer </template>
                  </p>
                </div>

                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="min-h-[44px] px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 sm:min-h-0 dark:text-gray-300 dark:hover:text-white"
                    @click="handleClose"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    class="min-h-[44px] flex-1 rounded-xl bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none dark:bg-primary-500 dark:hover:bg-primary-600"
                    :disabled="!hasChanges"
                    data-testid="confirm-filing"
                    @click="confirmSelection"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .modal-backdrop-enter-active,
  .modal-backdrop-leave-active {
    transition: opacity 0.2s ease;
  }
  .modal-backdrop-enter-from,
  .modal-backdrop-leave-to {
    opacity: 0;
  }

  .modal-content-enter-active {
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .modal-content-leave-active {
    transition: all 0.15s ease-in;
  }
  .modal-content-enter-from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  .modal-content-leave-to {
    opacity: 0;
    transform: scale(0.98);
  }

  ::-webkit-scrollbar {
    width: 4px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 2px;
  }
  .dark ::-webkit-scrollbar-thumb {
    background: #334155;
  }

  .border-3 {
    border-width: 3px;
  }
</style>

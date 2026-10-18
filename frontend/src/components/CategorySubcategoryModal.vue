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
   *
   * One scrolling body: the categories, then the subcategories of the chosen
   * one, which scroll into view when a category is picked. Two nested
   * scroll areas left the subcategory pane 190px tall on a phone.
   */
  import { ref, watch, computed, nextTick } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import IconSpinner from '@/components/icons/IconSpinner.vue'
  import IconXCircle from '@/components/icons/IconXCircle.vue'
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

  const categories = ref<CategoryDto[]>([])
  const subcategories = ref<SubcategoryDto[]>([])
  const selectedCategoryId = ref<string | null>(null)
  const selectedSubcategoryId = ref<string | null>(null)
  const isLoading = ref(false)
  const isCreatingSubcategory = ref(false)
  const error = ref<string | null>(null)
  const newSubcategoryName = ref('')
  const searchQuery = ref('')
  const subcategoryPanelRef = ref<HTMLElement | null>(null)

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

  const nothingMatches = computed(
    () =>
      searchQuery.value !== '' &&
      catalogCategories.value.length === 0 &&
      transferCategories.value.length === 0 &&
      legacyCategories.value.length === 0
  )

  const selectedCategory = computed(() =>
    categories.value.find(c => c.id === selectedCategoryId.value)
  )

  const selectedSubcategories = computed(() =>
    selectedCategoryId.value ? subcategoriesOf(selectedCategoryId.value) : []
  )

  const selectedSubcategoryName = computed(
    () =>
      subcategories.value.find(s => s.id === selectedSubcategoryId.value)?.name
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
    // The subcategories sit under the grid; a pick must bring them on screen
    // rather than leave the user wondering where the second level went.
    if (categoryId !== null) {
      void nextTick(() => {
        subcategoryPanelRef.value?.scrollIntoView?.({ block: 'nearest' })
      })
    }
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

  const CARD_BASE =
    'flex w-full items-center gap-2 rounded-xl p-3 text-left transition-colors'
  const CARD_IDLE =
    'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700'
  const CARD_SELECTED =
    'bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-500/10 dark:ring-primary-400'
  const BADGE_IDLE =
    'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-gray-400'
  const CHIP_BASE =
    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0'
  const CHIP_IDLE =
    'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
  const CHIP_SELECTED =
    'bg-primary-100 text-primary-700 ring-2 ring-primary-500 ring-offset-1 dark:bg-primary-500/20 dark:text-primary-300 dark:ring-primary-400 dark:ring-offset-slate-900'
</script>

<template>
  <BaseModal
    :open="isOpen"
    title="Modifier la catégorie"
    :subtitle="transactionType === 'EXPENSE' ? 'Dépense' : 'Revenu'"
    max-width="lg"
    tall
    @close="handleClose"
  >
    <template #subheader>
      <BaseField
        v-model="searchQuery"
        type="search"
        size="sm"
        label="Rechercher une catégorie ou une sous-catégorie"
        label-hidden
        placeholder="Rechercher une catégorie ou une sous-catégorie…"
        data-testid="category-search"
      />
    </template>

    <InlineAlert v-if="error" class="mb-4">{{ error }}</InlineAlert>

    <div
      v-if="isLoading"
      class="flex flex-col items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400"
    >
      <IconSpinner class="h-8 w-8 text-primary-500" />
      <p class="mt-3">Chargement…</p>
    </div>

    <template v-else>
      <!-- Categories -->
      <div class="mb-2 flex items-center justify-between">
        <SectionLabel>Catégorie</SectionLabel>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ catalogCategories.length }} option{{
            catalogCategories.length > 1 ? 's' : ''
          }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-2 py-1 sm:grid-cols-2">
        <!-- No category -->
        <button
          type="button"
          :class="[
            CARD_BASE,
            selectedCategoryId === null ? CARD_SELECTED : CARD_IDLE,
          ]"
          :aria-pressed="selectedCategoryId === null"
          @click="selectCategory(null)"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            :class="
              selectedCategoryId === null
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400'
                : BADGE_IDLE
            "
          >
            <IconXCircle class="h-4 w-4" />
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

        <!-- Catalogue: the card is a button; the search hits are their own buttons beside it -->
        <div
          v-for="cat in catalogCategories"
          :key="cat.id"
          class="flex flex-col gap-1 rounded-xl"
          :class="selectedCategoryId === cat.id ? CARD_SELECTED : CARD_IDLE"
        >
          <button
            type="button"
            :class="CARD_BASE"
            :aria-pressed="selectedCategoryId === cat.id"
            :data-testid="`pick-category-${cat.id}`"
            @click="selectCategory(cat.id)"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-semibold"
              :class="[
                cat.icon ? 'text-lg' : 'text-sm',
                selectedCategoryId === cat.id
                  ? transactionType === 'EXPENSE'
                    ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    : 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400'
                  : BADGE_IDLE,
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
              :title="cat.name"
            >
              {{ cat.name }}
            </span>
          </button>
          <!-- The subcategories the search found, one click each -->
          <div
            v-if="matchingSubcategories(cat).length > 0"
            class="flex flex-wrap gap-1 px-3 pb-3"
            data-testid="search-hits"
          >
            <button
              v-for="sub in matchingSubcategories(cat)"
              :key="sub.id"
              type="button"
              class="rounded-full bg-white px-2 py-1 text-[11px] text-gray-700 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-slate-900 dark:text-gray-300 dark:ring-slate-700 dark:hover:bg-primary-900/20"
              @click="selectCategory(cat.id, sub.id)"
            >
              › {{ sub.name }}
            </button>
          </div>
        </div>

        <!-- Transfers: neither side, both sides -->
        <SectionLabel
          v-if="transferCategories.length > 0"
          class="col-span-1 mt-2 sm:col-span-2"
        >
          Transferts
        </SectionLabel>
        <button
          v-for="cat in transferCategories"
          :key="cat.id"
          type="button"
          :class="[
            CARD_BASE,
            selectedCategoryId === cat.id ? CARD_SELECTED : CARD_IDLE,
          ]"
          :aria-pressed="selectedCategoryId === cat.id"
          :data-testid="`pick-category-${cat.id}`"
          @click="selectCategory(cat.id)"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-semibold"
            :class="[
              cat.icon ? 'text-lg' : 'text-sm',
              selectedCategoryId === cat.id
                ? 'bg-white text-gray-700 dark:bg-slate-700 dark:text-gray-200'
                : BADGE_IDLE,
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
            :title="cat.name"
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
          title="Catégorie d'avant le catalogue : à migrer depuis les réglages"
          data-testid="legacy-category"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm font-semibold text-gray-500 dark:bg-slate-700 dark:text-gray-400"
          >
            {{ cat.icon || cat.name.charAt(0).toUpperCase() }}
          </span>
          <span class="min-w-0">
            <span
              class="block truncate text-sm font-medium text-gray-600 dark:text-gray-400"
            >
              {{ cat.name }}
            </span>
            <span class="block text-[10px] text-amber-700 dark:text-amber-400">
              À migrer
            </span>
          </span>
        </div>

        <p
          v-if="nothingMatches"
          class="col-span-full py-6 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Rien ne correspond à « {{ searchQuery }} »
        </p>
      </div>

      <!-- Subcategories -->
      <div
        ref="subcategoryPanelRef"
        class="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800"
      >
        <template v-if="selectedCategory">
          <div class="mb-2 flex items-center gap-2">
            <SectionLabel>Sous-catégorie</SectionLabel>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              :class="
                transactionType === 'EXPENSE'
                  ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                  : 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400'
              "
            >
              <span v-if="selectedCategory.icon" class="mr-0.5">{{
                selectedCategory.icon
              }}</span>
              {{ selectedCategory.name }}
            </span>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              :class="[
                CHIP_BASE,
                selectedSubcategoryId === null ? CHIP_SELECTED : CHIP_IDLE,
              ]"
              :aria-pressed="selectedSubcategoryId === null"
              @click="selectSubcategory(null)"
            >
              Catégorie seule
            </button>
            <button
              v-for="sub in selectedSubcategories"
              :key="sub.id"
              type="button"
              :class="[
                CHIP_BASE,
                selectedSubcategoryId === sub.id ? CHIP_SELECTED : CHIP_IDLE,
              ]"
              :aria-pressed="selectedSubcategoryId === sub.id"
              :data-testid="`pick-subcategory-${sub.id}`"
              @click="selectSubcategory(sub.id)"
            >
              <span v-if="sub.icon" class="mr-0.5">{{ sub.icon }}</span>
              {{ sub.name }}
              <CategoryAttributeBadges
                v-if="transactionType === 'EXPENSE'"
                :nature="sub.nature"
                :rhythm="sub.rhythm"
              />
            </button>
          </div>

          <div v-if="canAddSubcategory" class="mt-3 flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <BaseField
                v-model="newSubcategoryName"
                type="text"
                size="sm"
                label="Nouvelle sous-catégorie"
                label-hidden
                placeholder="Nouvelle sous-catégorie…"
                data-testid="new-subcategory-name"
                @keyup.enter="createSubcategory"
              />
            </div>
            <BaseButton
              size="sm"
              class="min-h-[38px]"
              :disabled="!newSubcategoryName.trim()"
              :loading="isCreatingSubcategory"
              data-testid="create-subcategory"
              @click="createSubcategory"
            >
              Créer
            </BaseButton>
          </div>
          <p
            v-else-if="isLegacyCategory(selectedCategory)"
            class="mt-3 text-xs text-amber-700 dark:text-amber-400"
          >
            Catégorie d'avant le catalogue : choisissez une catégorie du
            catalogue, ou migrez celle-ci depuis les réglages.
          </p>
        </template>
        <p
          v-else
          class="py-4 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Sélectionnez une catégorie pour voir les sous-catégories
        </p>
      </div>
    </template>

    <template #footer-start>
      <p class="truncate text-gray-500 dark:text-gray-400">
        <template v-if="selectedCategory">
          <span v-if="selectedCategory.icon" class="mr-0.5">{{
            selectedCategory.icon
          }}</span>
          {{ selectedCategory.name }}
          <template v-if="selectedSubcategoryId">
            <span class="mx-1">/</span>
            {{ selectedSubcategoryName }}
          </template>
        </template>
        <template v-else>À classer</template>
      </p>
    </template>

    <template #footer>
      <BaseButton variant="secondary" @click="handleClose">Annuler</BaseButton>
      <BaseButton
        :disabled="!hasChanges"
        data-testid="confirm-filing"
        @click="confirmSelection"
      >
        Confirmer
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, watch, computed } from 'vue'
  import { api, type CategoryDto, type SubcategoryDto } from '@/lib/api'

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
  const isLoadingCategories = ref(false)
  const isLoadingSubcategories = ref(false)
  const isCreatingSubcategory = ref(false)
  const error = ref<string | null>(null)
  const newSubcategoryName = ref('')
  const searchQuery = ref('')

  // Filter categories by transaction type and search
  const filteredCategories = computed(() => {
    let filtered = categories.value.filter(
      c => c.type === props.transactionType
    )

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase().trim()
      filtered = filtered.filter(c => c.name.toLowerCase().includes(query))
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  })

  // Get selected category
  const selectedCategory = computed(() => {
    return categories.value.find(c => c.id === selectedCategoryId.value)
  })

  // Check if selection has changed
  const hasChanges = computed(() => {
    return (
      selectedCategoryId.value !== props.currentCategoryId ||
      selectedSubcategoryId.value !== props.currentSubcategoryId
    )
  })

  // Load categories when modal opens
  watch(
    () => props.isOpen,
    async isOpen => {
      if (isOpen) {
        await loadCategories()
        selectedCategoryId.value = props.currentCategoryId
        if (props.currentCategoryId) {
          await loadSubcategories()
        }
        // Set subcategory AFTER subcategories are loaded
        selectedSubcategoryId.value = props.currentSubcategoryId
      } else {
        selectedCategoryId.value = null
        selectedSubcategoryId.value = null
        subcategories.value = []
        newSubcategoryName.value = ''
        searchQuery.value = ''
        error.value = null
      }
    },
    { immediate: true }
  )

  async function loadCategories() {
    isLoadingCategories.value = true
    error.value = null

    try {
      categories.value = await api.getCategories()
    } catch (e) {
      error.value = 'Erreur lors du chargement des categories'
      console.error(e)
    } finally {
      isLoadingCategories.value = false
    }
  }

  async function loadSubcategories() {
    if (!selectedCategoryId.value) return

    isLoadingSubcategories.value = true
    error.value = null

    try {
      subcategories.value = await api.getSubcategoriesByCategory(
        selectedCategoryId.value
      )
    } catch (e) {
      error.value = 'Erreur lors du chargement des sous-categories'
      console.error(e)
    } finally {
      isLoadingSubcategories.value = false
    }
  }

  async function createSubcategory() {
    const name = newSubcategoryName.value.trim()
    if (!name || !selectedCategoryId.value) return

    isCreatingSubcategory.value = true
    error.value = null

    try {
      const created = await api.createSubcategory({
        categoryId: selectedCategoryId.value,
        name,
      })
      subcategories.value.push(created)
      subcategories.value.sort((a, b) => a.name.localeCompare(b.name))
      selectedSubcategoryId.value = created.id
      newSubcategoryName.value = ''
    } catch (e) {
      error.value = 'Erreur lors de la creation de la sous-categorie'
      console.error(e)
    } finally {
      isCreatingSubcategory.value = false
    }
  }

  async function selectCategory(categoryId: string | null) {
    if (categoryId === selectedCategoryId.value) return

    selectedCategoryId.value = categoryId
    selectedSubcategoryId.value = null
    newSubcategoryName.value = ''

    if (categoryId) {
      await loadSubcategories()
    } else {
      subcategories.value = []
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
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop with blur -->
        <div
          class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          @click="handleClose"
        />

        <!-- Modal -->
        <Transition name="modal-content" appear>
          <div
            role="dialog"
            aria-labelledby="category-modal-title"
            class="relative z-10 w-full max-w-md max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl dark:shadow-black/40 flex flex-col"
          >
            <!-- Header -->
            <div class="relative px-6 pt-6 pb-4">
              <div class="flex items-start justify-between">
                <div>
                  <h2
                    id="category-modal-title"
                    class="text-lg font-semibold text-gray-900 dark:text-white"
                  >
                    Modifier la categorie
                  </h2>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ transactionType === 'EXPENSE' ? 'Depense' : 'Revenu' }}
                  </p>
                </div>
                <button
                  aria-label="Fermer"
                  class="p-2 -m-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  @click="handleClose"
                >
                  <svg
                    class="w-5 h-5"
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

              <!-- Search -->
              <div class="mt-4 relative">
                <svg
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
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
                  aria-label="Rechercher une categorie"
                  placeholder="Rechercher une categorie..."
                  class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto px-6 pb-4">
              <!-- Loading state -->
              <div
                v-if="isLoadingCategories"
                class="flex flex-col items-center justify-center py-12"
              >
                <div
                  class="w-10 h-10 border-3 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"
                />
                <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Chargement...
                </p>
              </div>

              <div v-else class="space-y-4">
                <!-- Categories Section -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span
                      class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Categorie
                    </span>
                    <span class="text-xs text-gray-400 dark:text-gray-500">
                      {{ filteredCategories.length }} option{{
                        filteredCategories.length > 1 ? 's' : ''
                      }}
                    </span>
                  </div>

                  <div
                    class="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1 -mr-1"
                  >
                    <!-- No category option -->
                    <button
                      type="button"
                      class="group relative flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-150"
                      :class="
                        selectedCategoryId === null
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-2 ring-indigo-500 dark:ring-indigo-400'
                          : 'bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700'
                      "
                      @click="selectCategory(null)"
                    >
                      <span
                        class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        :class="
                          selectedCategoryId === null
                            ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                            : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500'
                        "
                      >
                        <svg
                          class="w-4 h-4"
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
                        class="text-sm font-medium truncate"
                        :class="
                          selectedCategoryId === null
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-600 dark:text-gray-400'
                        "
                      >
                        Aucune
                      </span>
                      <span
                        v-if="selectedCategoryId === null"
                        class="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400"
                      />
                    </button>

                    <!-- Categories -->
                    <button
                      v-for="cat in filteredCategories"
                      :key="cat.id"
                      type="button"
                      class="group relative flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-150"
                      :class="
                        selectedCategoryId === cat.id
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-2 ring-indigo-500 dark:ring-indigo-400'
                          : 'bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700'
                      "
                      @click="selectCategory(cat.id)"
                    >
                      <span
                        class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-semibold"
                        :class="[
                          cat.icon ? 'text-lg' : 'text-sm',
                          selectedCategoryId === cat.id
                            ? transactionType === 'EXPENSE'
                              ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                              : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400',
                        ]"
                      >
                        {{ cat.icon || cat.name.charAt(0).toUpperCase() }}
                      </span>
                      <span
                        class="text-sm font-medium truncate"
                        :class="
                          selectedCategoryId === cat.id
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        "
                      >
                        {{ cat.name }}
                      </span>
                      <span
                        v-if="selectedCategoryId === cat.id"
                        class="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400"
                      />
                    </button>
                  </div>

                  <!-- Empty search state -->
                  <div
                    v-if="filteredCategories.length === 0 && searchQuery"
                    class="text-center py-6"
                  >
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      Aucune categorie trouvee pour "{{ searchQuery }}"
                    </p>
                  </div>
                </div>

                <!-- Subcategories Section -->
                <Transition name="subcategory-section">
                  <div
                    v-if="selectedCategoryId"
                    class="pt-4 border-t border-gray-100 dark:border-slate-800"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span
                          class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Sous-categorie
                        </span>
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          :class="
                            transactionType === 'EXPENSE'
                              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          "
                        >
                          <span v-if="selectedCategory?.icon" class="mr-0.5">{{
                            selectedCategory.icon
                          }}</span>
                          {{ selectedCategory?.name }}
                        </span>
                      </div>
                    </div>

                    <!-- Loading subcategories -->
                    <div
                      v-if="isLoadingSubcategories"
                      class="flex justify-center py-6"
                    >
                      <div
                        class="w-6 h-6 border-2 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"
                      />
                    </div>

                    <div v-else class="space-y-2">
                      <!-- Subcategory chips -->
                      <div class="flex flex-wrap gap-2">
                        <!-- No subcategory option -->
                        <button
                          type="button"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150"
                          :class="
                            selectedSubcategoryId === null
                              ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500 dark:ring-indigo-400 ring-offset-1 dark:ring-offset-slate-900'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                          "
                          @click="selectSubcategory(null)"
                        >
                          <svg
                            class="w-3.5 h-3.5"
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
                          Aucune
                        </button>

                        <!-- Existing subcategories -->
                        <button
                          v-for="sub in subcategories"
                          :key="sub.id"
                          type="button"
                          class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150"
                          :class="
                            selectedSubcategoryId === sub.id
                              ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500 dark:ring-indigo-400 ring-offset-1 dark:ring-offset-slate-900'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                          "
                          @click="selectSubcategory(sub.id)"
                        >
                          <span v-if="sub.icon" class="mr-0.5">{{
                            sub.icon
                          }}</span>
                          {{ sub.name }}
                        </button>
                      </div>

                      <!-- Create new subcategory -->
                      <div class="flex gap-2 mt-3">
                        <div class="relative flex-1">
                          <svg
                            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
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
                            placeholder="Nouvelle sous-categorie..."
                            class="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow"
                            @keyup.enter="createSubcategory"
                          />
                        </div>
                        <button
                          type="button"
                          class="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          :disabled="
                            isCreatingSubcategory || !newSubcategoryName.trim()
                          "
                          @click="createSubcategory"
                        >
                          <svg
                            v-if="isCreatingSubcategory"
                            class="w-4 h-4 animate-spin"
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
                          <span>Creer</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Error message -->
              <Transition name="error">
                <div
                  v-if="error"
                  class="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl flex items-center gap-2"
                >
                  <svg
                    class="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p class="text-sm text-red-600 dark:text-red-400">
                    {{ error }}
                  </p>
                </div>
              </Transition>
            </div>

            <!-- Footer -->
            <div
              class="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800"
            >
              <div class="flex items-center justify-between gap-3">
                <!-- Selection summary -->
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
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
                    <template v-else> Aucune categorie </template>
                  </p>
                </div>

                <!-- Buttons -->
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    @click="handleClose"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    :disabled="!hasChanges"
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
  /* Backdrop transition */
  .modal-backdrop-enter-active,
  .modal-backdrop-leave-active {
    transition: opacity 0.2s ease;
  }
  .modal-backdrop-enter-from,
  .modal-backdrop-leave-to {
    opacity: 0;
  }

  /* Modal content transition */
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

  /* Subcategory section transition */
  .subcategory-section-enter-active {
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .subcategory-section-leave-active {
    transition: all 0.2s ease-in;
  }
  .subcategory-section-enter-from {
    opacity: 0;
    transform: translateY(-8px);
  }
  .subcategory-section-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  /* Error transition */
  .error-enter-active {
    transition: all 0.2s ease-out;
  }
  .error-leave-active {
    transition: all 0.15s ease-in;
  }
  .error-enter-from,
  .error-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  /* Custom scrollbar */
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
  ::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
  .dark ::-webkit-scrollbar-thumb {
    background: #334155;
  }
  .dark ::-webkit-scrollbar-thumb:hover {
    background: #475569;
  }

  /* Spinner border */
  .border-3 {
    border-width: 3px;
  }
</style>

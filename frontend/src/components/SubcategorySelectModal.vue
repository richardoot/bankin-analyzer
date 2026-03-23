<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { api, type SubcategoryDto } from '@/lib/api'

  const props = defineProps<{
    isOpen: boolean
    categoryId: string
    categoryName: string
    currentSubcategoryId?: string | null
  }>()

  const emit = defineEmits<{
    close: []
    select: [subcategoryId: string | null]
  }>()

  const subcategories = ref<SubcategoryDto[]>([])
  const selectedId = ref<string | null>(null)
  const isLoading = ref(false)
  const isCreating = ref(false)
  const error = ref<string | null>(null)
  const newSubcategoryName = ref('')

  // Load subcategories when modal opens
  watch(
    () => [props.isOpen, props.categoryId],
    async ([isOpen, categoryId]) => {
      if (isOpen && categoryId) {
        await loadSubcategories()
        // Pre-select current subcategory if any
        selectedId.value = props.currentSubcategoryId ?? null
      }
    },
    { immediate: true }
  )

  async function loadSubcategories() {
    if (!props.categoryId) return

    isLoading.value = true
    error.value = null

    try {
      subcategories.value = await api.getSubcategoriesByCategory(
        props.categoryId
      )
    } catch (e) {
      error.value = 'Erreur lors du chargement des sous-categories'
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  async function createSubcategory() {
    const name = newSubcategoryName.value.trim()
    if (!name || !props.categoryId) return

    isCreating.value = true
    error.value = null

    try {
      const created = await api.createSubcategory({
        categoryId: props.categoryId,
        name,
      })
      subcategories.value.push(created)
      subcategories.value.sort((a, b) => a.name.localeCompare(b.name))
      selectedId.value = created.id
      newSubcategoryName.value = ''
    } catch (e) {
      error.value = 'Erreur lors de la creation de la sous-categorie'
      console.error(e)
    } finally {
      isCreating.value = false
    }
  }

  function confirmSelection() {
    emit('select', selectedId.value)
  }

  function handleClose() {
    emit('close')
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
          class="relative z-10 w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between p-6 border-b dark:border-slate-700"
          >
            <div>
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Choisir une sous-categorie
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Categorie : {{ categoryName }}
              </p>
            </div>
            <button
              class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              @click="handleClose"
            >
              <svg
                class="w-6 h-6"
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

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Loading state -->
            <div v-if="isLoading" class="flex justify-center py-8">
              <svg
                class="animate-spin h-8 w-8 text-indigo-600 dark:text-indigo-400"
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
            </div>

            <!-- Subcategories list -->
            <div v-else class="space-y-2">
              <!-- No subcategory option -->
              <label
                class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="
                  selectedId === null
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500 dark:ring-indigo-400'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                "
              >
                <input
                  v-model="selectedId"
                  type="radio"
                  :value="null"
                  class="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                />
                <span class="text-gray-500 dark:text-gray-400 italic">
                  Aucune sous-categorie
                </span>
              </label>

              <!-- Existing subcategories -->
              <label
                v-for="sub in subcategories"
                :key="sub.id"
                class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="
                  selectedId === sub.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500 dark:ring-indigo-400'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                "
              >
                <input
                  v-model="selectedId"
                  type="radio"
                  :value="sub.id"
                  class="h-4 w-4 text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                />
                <span class="text-gray-900 dark:text-gray-100">
                  {{ sub.name }}
                </span>
              </label>

              <!-- Empty state -->
              <p
                v-if="subcategories.length === 0"
                class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
              >
                Aucune sous-categorie pour cette categorie.
                <br />
                Creez-en une ci-dessous.
              </p>
            </div>

            <!-- Create new subcategory -->
            <div class="mt-6 pt-6 border-t dark:border-slate-700">
              <p
                class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
              >
                Creer une nouvelle sous-categorie
              </p>
              <div class="flex gap-2">
                <input
                  v-model="newSubcategoryName"
                  type="text"
                  placeholder="Nom de la sous-categorie..."
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-sm"
                  @keyup.enter="createSubcategory"
                />
                <button
                  type="button"
                  class="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                  :disabled="isCreating || !newSubcategoryName.trim()"
                  @click="createSubcategory"
                >
                  <svg
                    v-if="isCreating"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Ajouter
                </button>
              </div>
            </div>

            <!-- Error message -->
            <div
              v-if="error"
              class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex items-center justify-end gap-3 p-6 border-t dark:border-slate-700 bg-gray-50 dark:bg-slate-800"
          >
            <button
              type="button"
              class="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              @click="handleClose"
            >
              Annuler
            </button>
            <button
              type="button"
              class="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
              @click="confirmSelection"
            >
              Confirmer
            </button>
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

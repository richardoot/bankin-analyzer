<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import type { CategorySuggestionDto } from '@/lib/api'
  import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'

  const props = defineProps<{
    isOpen: boolean
    suggestions: CategorySuggestionDto[]
  }>()

  const emit = defineEmits<{
    close: []
    applied: [count: number]
  }>()

  const categoryAssociationsStore = useCategoryAssociationsStore()

  const selectedIds = ref<Set<string>>(new Set())
  const isApplying = ref(false)
  const error = ref<string | null>(null)

  // Pre-select all suggestions by default
  watch(
    () => props.suggestions,
    suggestions => {
      selectedIds.value = new Set(suggestions.map(s => s.expenseCategoryId))
    },
    { immediate: true }
  )

  const selectedCount = computed(() => selectedIds.value.size)

  const allSelected = computed(
    () =>
      props.suggestions.length > 0 &&
      selectedIds.value.size === props.suggestions.length
  )

  const someSelected = computed(
    () =>
      selectedIds.value.size > 0 &&
      selectedIds.value.size < props.suggestions.length
  )

  function toggleSelection(expenseCategoryId: string) {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(expenseCategoryId)) {
      newSet.delete(expenseCategoryId)
    } else {
      newSet.add(expenseCategoryId)
    }
    selectedIds.value = newSet
  }

  function toggleAll() {
    if (allSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(
        props.suggestions.map(s => s.expenseCategoryId)
      )
    }
  }

  async function applySelected() {
    if (selectedIds.value.size === 0) return

    isApplying.value = true
    error.value = null
    let successCount = 0

    const selectedSuggestions = props.suggestions.filter(s =>
      selectedIds.value.has(s.expenseCategoryId)
    )

    for (const suggestion of selectedSuggestions) {
      try {
        await categoryAssociationsStore.create({
          expenseCategoryId: suggestion.expenseCategoryId,
          incomeCategoryId: suggestion.suggestedIncomeCategoryId,
        })
        successCount++
      } catch (e) {
        // Ignore 409 Conflict errors (duplicate associations)
        const errorMessage = e instanceof Error ? e.message : String(e)
        if (!errorMessage.includes('existe deja')) {
          console.error('Failed to create association:', e)
        }
      }
    }

    isApplying.value = false
    emit('applied', successCount)
  }

  function handleClose() {
    emit('close')
  }

  function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && suggestions.length > 0"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

        <div
          class="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between p-6 border-b dark:border-slate-700"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30"
              >
                <svg
                  class="h-6 w-6 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <h2
                  class="text-xl font-semibold text-gray-900 dark:text-gray-100"
                >
                  Suggestions IA
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Associations de categories detectees
                </p>
              </div>
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
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              L'IA a identifie des associations possibles entre vos categories
              de depenses et de remboursement. Selectionnez celles que vous
              souhaitez creer.
            </p>

            <!-- Select all -->
            <div class="flex items-center justify-between pb-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  class="h-4 w-4 text-indigo-600 dark:text-indigo-500 rounded border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                  @change="toggleAll"
                />
                <span
                  class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >Tout selectionner</span
                >
              </label>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ selectedCount }} / {{ suggestions.length }} selectionnees
              </span>
            </div>

            <!-- Suggestions list -->
            <div class="space-y-3">
              <div
                v-for="suggestion in suggestions"
                :key="suggestion.expenseCategoryId"
                class="border dark:border-slate-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                :class="{
                  'ring-2 ring-indigo-500 dark:ring-indigo-400 border-transparent':
                    selectedIds.has(suggestion.expenseCategoryId),
                }"
              >
                <label class="flex items-start gap-4 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(suggestion.expenseCategoryId)"
                    class="mt-1 h-4 w-4 text-indigo-600 dark:text-indigo-500 rounded border-gray-300 dark:border-slate-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-slate-700"
                    @change="toggleSelection(suggestion.expenseCategoryId)"
                  />
                  <div class="flex-1 min-w-0">
                    <!-- Categories with arrow -->
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      >
                        {{ suggestion.expenseCategoryName }}
                      </span>
                      <svg
                        class="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
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
                      <span
                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      >
                        {{ suggestion.suggestedIncomeCategoryName }}
                      </span>
                      <span
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      >
                        {{ formatConfidence(suggestion.confidence) }}
                      </span>
                    </div>
                    <!-- Reasoning -->
                    <p
                      class="mt-1.5 text-sm text-gray-500 dark:text-gray-400 italic"
                    >
                      {{ suggestion.reasoning }}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Error message -->
            <div
              v-if="error"
              class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
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
              class="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              :disabled="isApplying"
              @click="handleClose"
            >
              Ignorer
            </button>
            <button
              type="button"
              class="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              :disabled="isApplying || selectedCount === 0"
              @click="applySelected"
            >
              <svg
                v-if="isApplying"
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
              {{
                isApplying
                  ? 'Application...'
                  : `Appliquer ${selectedCount} association${selectedCount > 1 ? 's' : ''}`
              }}
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

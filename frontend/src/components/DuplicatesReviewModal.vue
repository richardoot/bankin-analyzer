<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import type { ImportPreviewResultDto } from '@/lib/api'

  const props = defineProps<{
    isOpen: boolean
    loading: boolean
    previewResult: ImportPreviewResultDto | null
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [selectedIndices: Set<number>]
  }>()

  // Track selected indices for internal duplicates (which ones to import)
  const selectedInternalIndices = ref<Set<number>>(new Set())
  // Track selected indices for external duplicates (force import)
  const selectedExternalIndices = ref<Set<number>>(new Set())

  // Initialize selections when preview result changes
  watch(
    () => props.previewResult,
    result => {
      if (result) {
        // For internal duplicates: select first occurrence of each group by default
        const internalDefaults = new Set<number>()
        for (const group of result.internalDuplicates) {
          if (group.indices.length > 0) {
            internalDefaults.add(group.indices[0])
          }
        }
        selectedInternalIndices.value = internalDefaults
        // For external duplicates: don't select any by default
        selectedExternalIndices.value = new Set()
      }
    },
    { immediate: true }
  )

  const totalToImport = computed(() => {
    if (!props.previewResult) return 0
    return (
      props.previewResult.newCount +
      selectedInternalIndices.value.size +
      selectedExternalIndices.value.size
    )
  })

  const totalSkipped = computed(() => {
    if (!props.previewResult) return 0
    // Count internal duplicates not selected
    let internalSkipped = 0
    for (const group of props.previewResult.internalDuplicates) {
      for (const idx of group.indices) {
        if (!selectedInternalIndices.value.has(idx)) {
          internalSkipped++
        }
      }
    }
    // Count external duplicates not selected
    const externalSkipped =
      props.previewResult.externalDuplicateCount -
      selectedExternalIndices.value.size
    return internalSkipped + externalSkipped
  })

  // Get all internal duplicate indices (flattened from all groups)
  const allInternalIndices = computed(() => {
    if (!props.previewResult) return []
    return props.previewResult.internalDuplicates.flatMap(
      group => group.indices
    )
  })

  // Check if all internal duplicates are selected
  const allInternalSelected = computed(() => {
    if (allInternalIndices.value.length === 0) return false
    return allInternalIndices.value.every(idx =>
      selectedInternalIndices.value.has(idx)
    )
  })

  // Check if some (but not all) internal duplicates are selected
  const someInternalSelected = computed(() => {
    if (allInternalIndices.value.length === 0) return false
    const selectedCount = selectedInternalIndices.value.size
    return selectedCount > 0 && selectedCount < allInternalIndices.value.length
  })

  // Check if all external duplicates are selected
  const allExternalSelected = computed(() => {
    if (
      !props.previewResult ||
      props.previewResult.externalDuplicates.length === 0
    ) {
      return false
    }
    return props.previewResult.externalDuplicates.every(dup =>
      selectedExternalIndices.value.has(dup.uploaded.index)
    )
  })

  // Check if some (but not all) external duplicates are selected
  const someExternalSelected = computed(() => {
    if (
      !props.previewResult ||
      props.previewResult.externalDuplicates.length === 0
    ) {
      return false
    }
    const selectedCount = selectedExternalIndices.value.size
    return (
      selectedCount > 0 &&
      selectedCount < props.previewResult.externalDuplicates.length
    )
  })

  function toggleInternalIndex(index: number) {
    const newSet = new Set(selectedInternalIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    selectedInternalIndices.value = newSet
  }

  function toggleAllInternalDuplicates() {
    if (allInternalSelected.value) {
      // Deselect all
      selectedInternalIndices.value = new Set()
    } else {
      // Select all
      selectedInternalIndices.value = new Set(allInternalIndices.value)
    }
  }

  function toggleExternalIndex(index: number) {
    const newSet = new Set(selectedExternalIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    selectedExternalIndices.value = newSet
  }

  function toggleAllExternalDuplicates() {
    if (!props.previewResult) return

    if (allExternalSelected.value) {
      // Deselect all
      selectedExternalIndices.value = new Set()
    } else {
      // Select all
      const allIndices = new Set(
        props.previewResult.externalDuplicates.map(dup => dup.uploaded.index)
      )
      selectedExternalIndices.value = allIndices
    }
  }

  function handleClose() {
    emit('close')
  }

  function handleConfirm() {
    // Combine all selected indices that need forceImport
    const allSelected = new Set([
      ...selectedInternalIndices.value,
      ...selectedExternalIndices.value,
    ])
    emit('confirm', allSelected)
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR')
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && previewResult"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

        <div
          class="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100"
              >
                <svg
                  class="h-6 w-6 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 class="text-xl font-semibold text-gray-900">
                Doublons detectes
              </h2>
            </div>
            <button
              class="text-gray-400 hover:text-gray-600"
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
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Summary -->
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-900 mb-3">Resume</h3>
              <div class="grid grid-cols-3 gap-4 text-sm">
                <div class="text-center">
                  <div class="text-2xl font-bold text-green-600">
                    {{ previewResult.newCount }}
                  </div>
                  <div class="text-gray-600">Nouvelles</div>
                </div>
                <div class="text-center">
                  <div class="text-2xl font-bold text-amber-600">
                    {{ previewResult.internalDuplicateCount }}
                  </div>
                  <div class="text-gray-600">Doublons internes</div>
                </div>
                <div class="text-center">
                  <div class="text-2xl font-bold text-red-600">
                    {{ previewResult.externalDuplicateCount }}
                  </div>
                  <div class="text-gray-600">Deja importees</div>
                </div>
              </div>
            </div>

            <!-- Internal Duplicates -->
            <div
              v-if="previewResult.internalDuplicates.length > 0"
              class="space-y-4"
            >
              <div class="flex items-center justify-between">
                <h3 class="font-medium text-gray-900 flex items-center gap-2">
                  <svg
                    class="w-5 h-5 text-amber-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  Doublons internes (dans ce fichier)
                </h3>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="allInternalSelected"
                    :indeterminate="someInternalSelected"
                    class="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    @change="toggleAllInternalDuplicates"
                  />
                  <span class="text-sm text-gray-600">Tout selectionner</span>
                </label>
              </div>
              <p class="text-sm text-gray-500">
                Ces transactions apparaissent plusieurs fois dans votre fichier.
                Selectionnez celles a importer.
              </p>

              <div
                v-for="(group, groupIdx) in previewResult.internalDuplicates"
                :key="group.hash"
                class="border rounded-lg overflow-hidden"
              >
                <div class="bg-amber-50 px-4 py-2 border-b">
                  <span class="text-sm font-medium text-amber-800">
                    Groupe {{ groupIdx + 1 }}: {{ group.indices.length }}
                    transactions identiques
                  </span>
                </div>
                <div class="divide-y">
                  <div
                    v-for="tx in group.transactions"
                    :key="tx.index"
                    class="px-4 py-3 flex items-center gap-4 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedInternalIndices.has(tx.index)"
                      class="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      @change="toggleInternalIndex(tx.index)"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-gray-400"
                          >#{{ tx.index + 1 }}</span
                        >
                        <span
                          class="font-semibold"
                          :class="
                            tx.amount < 0 ? 'text-red-600' : 'text-green-600'
                          "
                        >
                          {{ formatAmount(tx.amount) }}
                        </span>
                      </div>
                      <div class="font-medium text-gray-900 truncate">
                        {{ tx.description }}
                      </div>
                      <div class="text-sm text-gray-500">
                        {{ formatDate(tx.date) }} - {{ tx.category }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- External Duplicates -->
            <div
              v-if="previewResult.externalDuplicates.length > 0"
              class="space-y-4"
            >
              <div class="flex items-center justify-between">
                <h3 class="font-medium text-gray-900 flex items-center gap-2">
                  <svg
                    class="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  Deja en base de donnees
                </h3>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="allExternalSelected"
                    :indeterminate="someExternalSelected"
                    class="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    @change="toggleAllExternalDuplicates"
                  />
                  <span class="text-sm text-gray-600">Tout selectionner</span>
                </label>
              </div>
              <p class="text-sm text-gray-500">
                Ces transactions existent deja dans votre historique. Cochez
                pour les importer quand meme.
              </p>

              <div
                v-for="dup in previewResult.externalDuplicates"
                :key="dup.hash"
                class="border rounded-lg overflow-hidden"
              >
                <div class="bg-red-50 px-4 py-2 border-b">
                  <span class="text-sm font-medium text-red-800">
                    Transaction #{{ dup.uploaded.index + 1 }} existe deja
                  </span>
                </div>

                <!-- Side by side comparison -->
                <div class="grid grid-cols-2 divide-x">
                  <!-- Uploaded -->
                  <div class="p-4">
                    <div
                      class="text-xs font-medium text-gray-500 uppercase mb-2"
                    >
                      Dans l'import
                    </div>
                    <div class="space-y-1 text-sm">
                      <div>
                        <span class="text-gray-500">Date:</span>
                        {{ formatDate(dup.uploaded.date) }}
                      </div>
                      <div class="truncate">
                        <span class="text-gray-500">Description:</span>
                        {{ dup.uploaded.description }}
                      </div>
                      <div>
                        <span class="text-gray-500">Montant:</span>
                        <span
                          :class="
                            dup.uploaded.amount < 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          "
                        >
                          {{ formatAmount(dup.uploaded.amount) }}
                        </span>
                      </div>
                      <div>
                        <span class="text-gray-500">Categorie:</span>
                        {{ dup.uploaded.category }}
                      </div>
                    </div>
                  </div>

                  <!-- Existing -->
                  <div class="p-4 bg-gray-50">
                    <div
                      class="text-xs font-medium text-gray-500 uppercase mb-2"
                    >
                      En base
                    </div>
                    <div class="space-y-1 text-sm">
                      <div>
                        <span class="text-gray-500">Date:</span>
                        {{ formatDate(dup.existing.date) }}
                      </div>
                      <div class="truncate">
                        <span class="text-gray-500">Description:</span>
                        {{ dup.existing.description }}
                      </div>
                      <div>
                        <span class="text-gray-500">Montant:</span>
                        <span
                          :class="
                            dup.existing.amount < 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          "
                        >
                          {{ formatAmount(dup.existing.amount) }}
                        </span>
                      </div>
                      <div>
                        <span class="text-gray-500">Categorie:</span>
                        {{ dup.existing.categoryName || '-' }}
                      </div>
                      <div class="text-xs text-gray-400">
                        Importe le {{ formatDate(dup.existing.createdAt) }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Force import checkbox -->
                <div class="px-4 py-3 bg-gray-50 border-t">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="selectedExternalIndices.has(dup.uploaded.index)"
                      class="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      @change="toggleExternalIndex(dup.uploaded.index)"
                    />
                    <span class="text-sm text-gray-700"
                      >Importer quand meme</span
                    >
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex items-center justify-between p-6 border-t bg-gray-50"
          >
            <div class="text-sm text-gray-600">
              <span class="font-medium text-green-600">{{
                totalToImport
              }}</span>
              a importer,
              <span class="font-medium text-gray-500">{{ totalSkipped }}</span>
              ignores
            </div>
            <div class="flex gap-3">
              <button
                type="button"
                class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                :disabled="loading"
                @click="handleClose"
              >
                Annuler
              </button>
              <button
                type="button"
                class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || totalToImport === 0"
                @click="handleConfirm"
              >
                {{
                  loading
                    ? 'Import en cours...'
                    : `Importer ${totalToImport} transactions`
                }}
              </button>
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

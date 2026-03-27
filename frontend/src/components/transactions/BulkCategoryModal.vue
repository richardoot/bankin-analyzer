<script setup lang="ts">
  import type { CategoryDto } from '@/lib/api'

  defineProps<{
    isOpen: boolean
    categories: CategoryDto[]
    selectedCount: number
    isUpdating: boolean
  }>()

  const emit = defineEmits<{
    close: []
    apply: [categoryId: string]
  }>()

  const selectedCategoryId = defineModel<string | null>('categoryId', {
    default: null,
  })

  function handleApply(): void {
    if (selectedCategoryId.value) {
      emit('apply', selectedCategoryId.value)
    }
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

      <div
        role="dialog"
        aria-labelledby="bulk-category-modal-title"
        class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
      >
        <h3
          id="bulk-category-modal-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Changer la categorie
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Choisissez la nouvelle categorie pour les {{ selectedCount }}
          transaction(s) selectionnee(s).
        </p>

        <select
          v-model="selectedCategoryId"
          class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 mb-4"
        >
          <option :value="null" disabled>Selectionnez une categorie</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }} ({{ cat.type === 'EXPENSE' ? 'Depense' : 'Revenu' }})
          </option>
        </select>

        <div class="flex gap-3">
          <button
            class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            @click="emit('close')"
          >
            Annuler
          </button>
          <button
            :disabled="!selectedCategoryId || isUpdating"
            class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
            :class="
              selectedCategoryId && !isUpdating
                ? 'bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600'
                : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
            "
            @click="handleApply"
          >
            <span v-if="isUpdating">Application...</span>
            <span v-else>Appliquer</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

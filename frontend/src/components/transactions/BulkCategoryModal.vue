<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'
  import type { CategoryDto, SubcategoryDto } from '@/lib/api'

  const props = defineProps<{
    isOpen: boolean
    categories: CategoryDto[]
    subcategories: SubcategoryDto[]
    selectedCount: number
    isUpdating: boolean
  }>()

  const emit = defineEmits<{
    close: []
    apply: [categoryId: string, subcategoryId: string | null]
  }>()

  // Escape closes, Tab stays inside, focus returns to the opener after.
  const modalPanelRef = ref<HTMLElement | null>(null)
  useModalA11y({
    isOpen: () => props.isOpen,
    onClose: () => emit('close'),
    panel: modalPanelRef,
  })

  const selectedCategoryId = defineModel<string | null>('categoryId', {
    default: null,
  })
  const selectedSubcategoryId = defineModel<string | null>('subcategoryId', {
    default: null,
  })

  /** A subcategory belongs to one category, so the options follow the choice. */
  const availableSubcategories = computed(() => {
    if (!selectedCategoryId.value) return []
    return props.subcategories
      .filter(s => s.categoryId === selectedCategoryId.value)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  // Changing the category invalidates whatever subcategory was picked under the
  // previous one — keeping it would recreate the very mismatch this modal has
  // to avoid.
  watch(selectedCategoryId, () => {
    selectedSubcategoryId.value = null
  })

  function handleApply(): void {
    if (selectedCategoryId.value) {
      emit('apply', selectedCategoryId.value, selectedSubcategoryId.value)
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
        ref="modalPanelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-category-modal-title"
        class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-slate-900/30 max-w-md w-full mx-4 p-6"
      >
        <h3
          id="bulk-category-modal-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Deplacer {{ selectedCount }} transaction{{
            selectedCount > 1 ? 's' : ''
          }}
        </h3>

        <label
          for="bulk-category"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Catégorie
        </label>
        <select
          id="bulk-category"
          v-model="selectedCategoryId"
          data-testid="bulk-category-select"
          class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 mb-4"
        >
          <option :value="null" disabled>Sélectionnez une catégorie</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }} ({{ cat.type === 'EXPENSE' ? 'Dépense' : 'Revenu' }})
          </option>
        </select>

        <label
          for="bulk-subcategory"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Sous-catégorie
        </label>
        <select
          id="bulk-subcategory"
          v-model="selectedSubcategoryId"
          data-testid="bulk-subcategory-select"
          :disabled="!selectedCategoryId"
          class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 mb-3"
        >
          <option :value="null">Aucune</option>
          <option
            v-for="sub in availableSubcategories"
            :key="sub.id"
            :value="sub.id"
          >
            {{ sub.name }}
          </option>
        </select>

        <!--
          There is no correct default when the category changes: the old
          subcategory belongs elsewhere and cannot come along. Saying so beats
          letting the user discover it in the dashboard afterwards.
        -->
        <p
          v-if="selectedCategoryId"
          data-testid="bulk-subcategory-warning"
          class="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2 mb-4"
        >
          <template v-if="selectedSubcategoryId">
            Les sous-categories actuelles seront remplacees par celle choisie
            ci-dessus.
          </template>
          <template v-else>
            Les sous-categories actuelles seront retirees : elles
            n'appartiennent pas à la catégorie choisie.
          </template>
        </p>

        <div class="flex gap-3">
          <button
            class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            @click="emit('close')"
          >
            Annuler
          </button>
          <button
            :disabled="!selectedCategoryId || isUpdating"
            data-testid="bulk-category-apply"
            class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
            :class="
              selectedCategoryId && !isUpdating
                ? 'bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600'
                : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
            "
            @click="handleApply"
          >
            <span v-if="isUpdating">Application...</span>
            <span v-else>Deplacer {{ selectedCount }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

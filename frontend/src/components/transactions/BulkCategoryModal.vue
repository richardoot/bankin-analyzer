<script setup lang="ts">
  import { computed, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import type { CategoryDto, SubcategoryDto } from '@/lib/api'
  import { KIND_LABELS, isCatalogCategory, kindOf } from '@/lib/categories'
  import type { CategoryKind } from '@/lib/categories'

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

  const selectedCategoryId = defineModel<string | null>('categoryId', {
    default: null,
  })
  const selectedSubcategoryId = defineModel<string | null>('subcategoryId', {
    default: null,
  })

  /**
   * The catalogue only, by kind: a bulk move is a new filing, and new filings
   * never land in a category from before the catalogue. Filing under a
   * transfer turns the whole batch into transfers — the type follows.
   */
  const groups = computed(() =>
    (['EXPENSE', 'INCOME', 'TRANSFER'] as CategoryKind[])
      .map(kind => ({
        kind,
        label: KIND_LABELS[kind],
        items: props.categories
          .filter(c => isCatalogCategory(c) && kindOf(c) === kind)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      }))
      .filter(group => group.items.length > 0)
  )

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

  const title = computed(
    () =>
      `Déplacer ${props.selectedCount} transaction${props.selectedCount > 1 ? 's' : ''}`
  )

  function handleApply(): void {
    if (selectedCategoryId.value) {
      emit('apply', selectedCategoryId.value, selectedSubcategoryId.value)
    }
  }
</script>

<template>
  <BaseModal
    :open="isOpen"
    :title="title"
    max-width="md"
    :closable="!isUpdating"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <BaseField
        v-model="selectedCategoryId"
        as="select"
        label="Catégorie"
        data-testid="bulk-category-select"
      >
        <option :value="null" disabled>Sélectionnez une catégorie</option>
        <optgroup
          v-for="group in groups"
          :key="group.kind"
          :label="group.label"
        >
          <option v-for="cat in group.items" :key="cat.id" :value="cat.id">
            {{ cat.icon ? cat.icon + ' ' : '' }}{{ cat.name }}
          </option>
        </optgroup>
      </BaseField>

      <BaseField
        v-model="selectedSubcategoryId"
        as="select"
        label="Sous-catégorie"
        data-testid="bulk-subcategory-select"
        :disabled="!selectedCategoryId"
      >
        <option :value="null">Catégorie seule</option>
        <option
          v-for="sub in availableSubcategories"
          :key="sub.id"
          :value="sub.id"
        >
          {{ sub.name }}
        </option>
      </BaseField>

      <!--
        There is no correct default when the category changes: the old
        subcategory belongs elsewhere and cannot come along. Saying so beats
        letting the user discover it in the dashboard afterwards.
      -->
      <InlineAlert
        v-if="selectedCategoryId"
        variant="warning"
        data-testid="bulk-subcategory-warning"
      >
        <template v-if="selectedSubcategoryId">
          Les sous-catégories actuelles seront remplacées par celle choisie
          ci-dessus.
        </template>
        <template v-else>
          Les sous-catégories actuelles seront retirées : elles n'appartiennent
          pas à la catégorie choisie.
        </template>
      </InlineAlert>
    </div>

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="isUpdating"
        @click="emit('close')"
      >
        Annuler
      </BaseButton>
      <BaseButton
        class="flex-1"
        :disabled="!selectedCategoryId"
        :loading="isUpdating"
        data-testid="bulk-category-apply"
        @click="handleApply"
      >
        Déplacer {{ selectedCount }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

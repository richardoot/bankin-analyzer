import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  api,
  type DbCategoryAssociationDto,
  type CreateCategoryAssociationDto,
} from '@/lib/api'
import { useAsyncAction } from '@/composables/useAsyncAction'

export const useCategoryAssociationsStore = defineStore(
  'categoryAssociations',
  () => {
    const associations = ref<DbCategoryAssociationDto[]>([])
    const { isLoading, error, run } = useAsyncAction()

    // Computed helpers for quick lookups
    const associationByExpenseCategoryId = computed(() => {
      const map = new Map<string, DbCategoryAssociationDto>()
      for (const assoc of associations.value) {
        map.set(assoc.expenseCategoryId, assoc)
      }
      return map
    })

    const associationByIncomeCategoryId = computed(() => {
      const map = new Map<string, DbCategoryAssociationDto>()
      for (const assoc of associations.value) {
        map.set(assoc.incomeCategoryId, assoc)
      }
      return map
    })

    // Set of income category ids that have associations
    const associatedIncomeCategoryIds = computed(() => {
      const ids = new Set<string>()
      for (const assoc of associations.value) {
        ids.add(assoc.incomeCategoryId)
      }
      return ids
    })

    async function load(): Promise<void> {
      await run(async () => {
        associations.value = await api.getCategoryAssociations()
      }, 'Failed to load associations')
    }

    async function create(
      dto: CreateCategoryAssociationDto
    ): Promise<DbCategoryAssociationDto | null> {
      return await run(async () => {
        const newAssociation = await api.createCategoryAssociation(dto)
        associations.value = [...associations.value, newAssociation]
        return newAssociation
      }, 'Failed to create association')
    }

    async function remove(id: string): Promise<boolean> {
      const result = await run(async () => {
        await api.deleteCategoryAssociation(id)
        associations.value = associations.value.filter(a => a.id !== id)
        return true
      }, 'Failed to delete association')
      return result ?? false
    }

    function getIncomeCategoryForExpense(
      expenseCategoryId: string
    ): DbCategoryAssociationDto | undefined {
      return associationByExpenseCategoryId.value.get(expenseCategoryId)
    }

    function getExpenseCategoryForIncome(
      incomeCategoryId: string
    ): DbCategoryAssociationDto | undefined {
      return associationByIncomeCategoryId.value.get(incomeCategoryId)
    }

    function isIncomeCategoryAssociated(categoryId: string): boolean {
      return associatedIncomeCategoryIds.value.has(categoryId)
    }

    function reset(): void {
      associations.value = []
      error.value = null
    }

    return {
      associations,
      isLoading,
      error,
      associatedIncomeCategoryIds,
      load,
      create,
      remove,
      getIncomeCategoryForExpense,
      getExpenseCategoryForIncome,
      isIncomeCategoryAssociated,
      reset,
    }
  }
)

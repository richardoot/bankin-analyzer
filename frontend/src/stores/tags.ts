import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type {
  CreateTagDto,
  CreateTagFamilyDto,
  TagDto,
  TagFamilyDto,
  UpdateTagDto,
  UpdateTagFamilyDto,
} from '@/lib/api'
import { useAsyncAction } from '@/composables/useAsyncAction'

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<TagDto[]>([])
  const { isLoading, error, run, clearError } = useAsyncAction()

  /**
   * The user's tag families. Kept beside the tags because a family's name
   * and colour are shown on its tags, and deleting it orphans them: one
   * store keeps both readings in step. Its own loading state, so fetching
   * the families never passes for the tags loading.
   */
  const families = ref<TagFamilyDto[]>([])
  const familiesAction = useAsyncAction()

  function sortTags(): void {
    tags.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function fetchTags(): Promise<void> {
    await run(async () => {
      tags.value = await api.getTags()
    }, 'Impossible de charger les étiquettes')
  }

  async function addTag(dto: CreateTagDto): Promise<TagDto | null> {
    const result = await run(async () => {
      const created = await api.createTag(dto)
      tags.value.push(created)
      sortTags()
      return created
    }, "Impossible de créer l'étiquette")
    return result ?? null
  }

  async function updateTag(id: string, dto: UpdateTagDto): Promise<boolean> {
    const result = await run(async () => {
      const updated = await api.updateTag(id, dto)
      const index = tags.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tags.value[index] = updated
        sortTags()
      }
      return true
    }, "Impossible de modifier l'étiquette")
    return result ?? false
  }

  async function removeTag(id: string): Promise<boolean> {
    const result = await run(async () => {
      await api.deleteTag(id)
      tags.value = tags.value.filter(t => t.id !== id)
      return true
    }, "Impossible de supprimer l'étiquette")
    return result ?? false
  }

  /** Attach a tag to transactions and bump the local count optimistically. */
  async function attachToTransactions(
    tagId: string,
    transactionIds: string[]
  ): Promise<number> {
    const result = await run(async () => {
      const { attached } = await api.attachTagToTransactions(
        tagId,
        transactionIds
      )
      const tag = tags.value.find(t => t.id === tagId)
      if (tag) tag.transactionCount += attached
      return attached
    }, "Impossible d'ajouter l'étiquette")
    return result ?? 0
  }

  /** Detach a tag from a single transaction and decrement the local count. */
  async function detachFromTransaction(
    tagId: string,
    transactionId: string
  ): Promise<boolean> {
    const result = await run(async () => {
      await api.detachTagFromTransaction(tagId, transactionId)
      const tag = tags.value.find(t => t.id === tagId)
      if (tag && tag.transactionCount > 0) tag.transactionCount -= 1
      return true
    }, "Impossible de retirer l'étiquette")
    return result ?? false
  }

  function sortFamilies(): void {
    families.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function fetchFamilies(): Promise<void> {
    await familiesAction.run(async () => {
      families.value = await api.getTagFamilies()
    }, "Impossible de charger les familles d'étiquettes")
  }

  async function addFamily(
    dto: CreateTagFamilyDto
  ): Promise<TagFamilyDto | null> {
    const result = await familiesAction.run(async () => {
      const created = await api.createTagFamily(dto)
      families.value.push(created)
      sortFamilies()
      return created
    }, 'Impossible de créer la famille')
    return result ?? null
  }

  /** Renamed or recoloured: the tags that name it follow. */
  async function updateFamily(
    id: string,
    dto: UpdateTagFamilyDto
  ): Promise<boolean> {
    const result = await familiesAction.run(async () => {
      const updated = await api.updateTagFamily(id, dto)
      families.value = families.value.map(f => (f.id === id ? updated : f))
      sortFamilies()
      for (const tag of tags.value) {
        if (tag.familyId === id) {
          tag.family = { id, name: updated.name, color: updated.color }
        }
      }
      return true
    }, 'Impossible de modifier la famille')
    return result ?? false
  }

  /** Deleted: its tags stay, without a family, as the server leaves them. */
  async function removeFamily(id: string): Promise<boolean> {
    const result = await familiesAction.run(async () => {
      await api.deleteTagFamily(id)
      families.value = families.value.filter(f => f.id !== id)
      for (const tag of tags.value) {
        if (tag.familyId === id) {
          tag.familyId = null
          tag.family = null
        }
      }
      return true
    }, 'Impossible de supprimer la famille')
    return result ?? false
  }

  return {
    tags,
    families,
    familiesLoading: familiesAction.isLoading,
    familiesError: familiesAction.error,
    fetchFamilies,
    addFamily,
    updateFamily,
    removeFamily,
    isLoading,
    error,
    fetchTags,
    addTag,
    updateTag,
    removeTag,
    attachToTransactions,
    detachFromTransaction,
    clearError,
  }
})

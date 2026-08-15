import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { CreateTagDto, TagDto, UpdateTagDto } from '@/lib/api'
import { useAsyncAction } from '@/composables/useAsyncAction'

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<TagDto[]>([])
  const { isLoading, error, run, clearError } = useAsyncAction()

  function sortTags(): void {
    tags.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function fetchTags(): Promise<void> {
    await run(async () => {
      tags.value = await api.getTags()
    }, 'Failed to fetch tags')
  }

  async function addTag(dto: CreateTagDto): Promise<TagDto | null> {
    const result = await run(async () => {
      const created = await api.createTag(dto)
      tags.value.push(created)
      sortTags()
      return created
    }, 'Failed to create tag')
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
    }, 'Failed to update tag')
    return result ?? false
  }

  async function removeTag(id: string): Promise<boolean> {
    const result = await run(async () => {
      await api.deleteTag(id)
      tags.value = tags.value.filter(t => t.id !== id)
      return true
    }, 'Failed to delete tag')
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
    }, 'Failed to attach tag')
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
    }, 'Failed to detach tag')
    return result ?? false
  }

  return {
    tags,
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

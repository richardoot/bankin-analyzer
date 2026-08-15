import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTagsStore } from './tags'
import type { TagDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    attachTagToTransactions: vi.fn(),
    detachTagFromTransaction: vi.fn(),
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    toasts: { value: [] },
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
  }),
}))

import { api } from '@/lib/api'

const mockedApi = vi.mocked(api)

function makeTag(overrides: Partial<TagDto> = {}): TagDto {
  return {
    id: '1',
    name: 'Vacances',
    color: '#ef4444',
    icon: null,
    transactionCount: 0,
    isExceptional: false,
    eventStartDate: null,
    eventEndDate: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('useTagsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchTags() loads tags from API', async () => {
    const tags = [makeTag({ id: '1' }), makeTag({ id: '2', name: 'Anniv' })]
    mockedApi.getTags.mockResolvedValue(tags)

    const store = useTagsStore()
    await store.fetchTags()

    expect(store.tags).toEqual(tags)
    expect(mockedApi.getTags).toHaveBeenCalledOnce()
  })

  it('addTag() adds to list and sorts by name', async () => {
    const store = useTagsStore()
    store.tags = [makeTag({ id: '1', name: 'Charlie' })]

    const created = makeTag({ id: '2', name: 'Alpha' })
    mockedApi.createTag.mockResolvedValue(created)

    const result = await store.addTag({ name: 'Alpha' })

    expect(result).toEqual(created)
    expect(store.tags).toHaveLength(2)
    expect(store.tags[0]?.name).toBe('Alpha')
  })

  it('addTag() returns null on failure', async () => {
    mockedApi.createTag.mockRejectedValue(new Error('conflict'))

    const store = useTagsStore()
    const result = await store.addTag({ name: 'x' })

    expect(result).toBeNull()
  })

  it('updateTag() replaces the tag in the list', async () => {
    const store = useTagsStore()
    store.tags = [makeTag({ id: '1', name: 'Old' })]

    const updated = makeTag({ id: '1', name: 'New', color: '#22c55e' })
    mockedApi.updateTag.mockResolvedValue(updated)

    const ok = await store.updateTag('1', { name: 'New', color: '#22c55e' })

    expect(ok).toBe(true)
    expect(store.tags[0]?.name).toBe('New')
    expect(store.tags[0]?.color).toBe('#22c55e')
  })

  it('removeTag() removes from list', async () => {
    const store = useTagsStore()
    store.tags = [makeTag({ id: '1' }), makeTag({ id: '2' })]
    mockedApi.deleteTag.mockResolvedValue(undefined)

    const ok = await store.removeTag('1')

    expect(ok).toBe(true)
    expect(store.tags).toHaveLength(1)
    expect(store.tags[0]?.id).toBe('2')
  })

  it('attachToTransactions() bumps the local count', async () => {
    const store = useTagsStore()
    store.tags = [makeTag({ id: '1', transactionCount: 2 })]
    mockedApi.attachTagToTransactions.mockResolvedValue({ attached: 3 })

    const attached = await store.attachToTransactions('1', ['a', 'b', 'c'])

    expect(attached).toBe(3)
    expect(store.tags[0]?.transactionCount).toBe(5)
  })

  it('detachFromTransaction() decrements the local count', async () => {
    const store = useTagsStore()
    store.tags = [makeTag({ id: '1', transactionCount: 2 })]
    mockedApi.detachTagFromTransaction.mockResolvedValue(undefined)

    const ok = await store.detachFromTransaction('1', 'tx-1')

    expect(ok).toBe(true)
    expect(store.tags[0]?.transactionCount).toBe(1)
  })
})

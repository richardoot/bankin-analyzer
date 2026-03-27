import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePersonsStore } from './persons'

vi.mock('@/lib/api', () => ({
  api: {
    getPersons: vi.fn(),
    createPerson: vi.fn(),
    updatePerson: vi.fn(),
    deletePerson: vi.fn(),
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

describe('usePersonsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchPersons() loads persons from API', async () => {
    const mockPersons = [
      { id: '1', name: 'Alice', email: null, createdAt: '', updatedAt: '' },
      {
        id: '2',
        name: 'Bob',
        email: 'bob@test.com',
        createdAt: '',
        updatedAt: '',
      },
    ]
    mockedApi.getPersons.mockResolvedValue(mockPersons)

    const store = usePersonsStore()
    await store.fetchPersons()

    expect(store.persons).toEqual(mockPersons)
    expect(mockedApi.getPersons).toHaveBeenCalledOnce()
  })

  it('fetchPersons() sets error on failure', async () => {
    mockedApi.getPersons.mockRejectedValue(new Error('Network error'))

    const store = usePersonsStore()
    await store.fetchPersons()

    expect(store.error).toBe('Network error')
  })

  it('addPerson() adds to list and sorts by name', async () => {
    const store = usePersonsStore()
    store.persons = [
      { id: '1', name: 'Charlie', email: null, createdAt: '', updatedAt: '' },
    ]

    const newPerson = {
      id: '2',
      name: 'Alice',
      email: null,
      createdAt: '',
      updatedAt: '',
    }
    mockedApi.createPerson.mockResolvedValue(newPerson)

    const result = await store.addPerson('Alice')

    expect(result).toBe(true)
    expect(store.persons).toHaveLength(2)
    expect(store.persons[0].name).toBe('Alice')
    expect(store.persons[1].name).toBe('Charlie')
  })

  it('addPerson() returns false on failure', async () => {
    mockedApi.createPerson.mockRejectedValue(new Error('fail'))

    const store = usePersonsStore()
    const result = await store.addPerson('Test')

    expect(result).toBe(false)
  })

  it('updatePerson() updates in list', async () => {
    const store = usePersonsStore()
    store.persons = [
      { id: '1', name: 'Alice', email: null, createdAt: '', updatedAt: '' },
    ]

    const updated = {
      id: '1',
      name: 'Alice Updated',
      email: 'a@b.com',
      createdAt: '',
      updatedAt: '',
    }
    mockedApi.updatePerson.mockResolvedValue(updated)

    const result = await store.updatePerson('1', 'Alice Updated', 'a@b.com')

    expect(result).toBe(true)
    expect(store.persons[0].name).toBe('Alice Updated')
    expect(store.persons[0].email).toBe('a@b.com')
  })

  it('removePerson() removes from list', async () => {
    const store = usePersonsStore()
    store.persons = [
      { id: '1', name: 'Alice', email: null, createdAt: '', updatedAt: '' },
      { id: '2', name: 'Bob', email: null, createdAt: '', updatedAt: '' },
    ]

    mockedApi.deletePerson.mockResolvedValue(undefined)

    const result = await store.removePerson('1')

    expect(result).toBe(true)
    expect(store.persons).toHaveLength(1)
    expect(store.persons[0].id).toBe('2')
  })
})

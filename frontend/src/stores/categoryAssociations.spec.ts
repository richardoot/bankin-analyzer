import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCategoryAssociationsStore } from './categoryAssociations'
import { type DbCategoryAssociationDto } from '@/lib/api'

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    getCategoryAssociations: vi.fn(),
    createCategoryAssociation: vi.fn(),
    deleteCategoryAssociation: vi.fn(),
  },
}))

// Import the mocked api after the mock is set up
import { api } from '@/lib/api'
const mockApi = vi.mocked(api)

describe('categoryAssociations store', () => {
  let store: ReturnType<typeof useCategoryAssociationsStore>

  const mockAssociation: DbCategoryAssociationDto = {
    id: 'assoc-1',
    expenseCategoryId: 'cat-expense-1',
    expenseCategoryName: 'Sante',
    incomeCategoryId: 'cat-income-1',
    incomeCategoryName: 'Remboursement Mutuelle',
  }

  const mockAssociation2: DbCategoryAssociationDto = {
    id: 'assoc-2',
    expenseCategoryId: 'cat-expense-2',
    expenseCategoryName: 'Transport',
    incomeCategoryId: 'cat-income-2',
    incomeCategoryName: 'Remboursement Transport',
  }

  beforeEach(() => {
    store = useCategoryAssociationsStore()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have empty associations', () => {
      expect(store.associations).toEqual([])
    })

    it('should have isLoading as false', () => {
      expect(store.isLoading).toBe(false)
    })

    it('should have no error', () => {
      expect(store.error).toBeNull()
    })
  })

  describe('load', () => {
    it('should load associations from API', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([
        mockAssociation,
        mockAssociation2,
      ])

      await store.load()

      expect(mockApi.getCategoryAssociations).toHaveBeenCalled()
      expect(store.associations).toHaveLength(2)
      expect(store.associations).toContainEqual(mockAssociation)
      expect(store.associations).toContainEqual(mockAssociation2)
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('should set error on API failure', async () => {
      mockApi.getCategoryAssociations.mockRejectedValue(
        new Error('Network error')
      )

      await store.load()

      expect(store.associations).toEqual([])
      expect(store.error).toBe('Network error')
      expect(store.isLoading).toBe(false)
    })

    it('should set loading state during load', async () => {
      let resolvePromise: (value: DbCategoryAssociationDto[]) => void
      mockApi.getCategoryAssociations.mockReturnValue(
        new Promise(resolve => {
          resolvePromise = resolve
        })
      )

      const loadPromise = store.load()
      expect(store.isLoading).toBe(true)

      resolvePromise!([])
      await loadPromise

      expect(store.isLoading).toBe(false)
    })
  })

  describe('create', () => {
    it('should create an association and add it to the store', async () => {
      mockApi.createCategoryAssociation.mockResolvedValue(mockAssociation)

      const result = await store.create({
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })

      expect(mockApi.createCategoryAssociation).toHaveBeenCalledWith({
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })
      expect(result).toEqual(mockAssociation)
      expect(store.associations).toContainEqual(mockAssociation)
    })

    it('should return null and set error on failure', async () => {
      mockApi.createCategoryAssociation.mockRejectedValue(new Error('Conflict'))

      const result = await store.create({
        expenseCategoryId: 'cat-expense-1',
        incomeCategoryId: 'cat-income-1',
      })

      expect(result).toBeNull()
      expect(store.error).toBe('Conflict')
    })
  })

  describe('remove', () => {
    it('should remove an association from the store', async () => {
      // First, add an association
      mockApi.getCategoryAssociations.mockResolvedValue([
        mockAssociation,
        mockAssociation2,
      ])
      await store.load()

      mockApi.deleteCategoryAssociation.mockResolvedValue(undefined)

      const result = await store.remove('assoc-1')

      expect(mockApi.deleteCategoryAssociation).toHaveBeenCalledWith('assoc-1')
      expect(result).toBe(true)
      expect(store.associations).toHaveLength(1)
      expect(store.associations).not.toContainEqual(mockAssociation)
      expect(store.associations).toContainEqual(mockAssociation2)
    })

    it('should return false and set error on failure', async () => {
      mockApi.deleteCategoryAssociation.mockRejectedValue(
        new Error('Not found')
      )

      const result = await store.remove('assoc-1')

      expect(result).toBe(false)
      expect(store.error).toBe('Not found')
    })
  })

  describe('getIncomeCategoryForExpense', () => {
    it('should return association for expense category', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([mockAssociation])
      await store.load()

      const result = store.getIncomeCategoryForExpense('cat-expense-1')

      expect(result).toEqual(mockAssociation)
    })

    it('should return undefined if no association exists', () => {
      const result = store.getIncomeCategoryForExpense('non-existent')

      expect(result).toBeUndefined()
    })
  })

  describe('getExpenseCategoryForIncome', () => {
    it('should return association for income category', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([mockAssociation])
      await store.load()

      const result = store.getExpenseCategoryForIncome('cat-income-1')

      expect(result).toEqual(mockAssociation)
    })

    it('should return undefined if no association exists', () => {
      const result = store.getExpenseCategoryForIncome('non-existent')

      expect(result).toBeUndefined()
    })
  })

  describe('getIncomeCategoryNameForExpense', () => {
    it('should return income category name for expense category', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([mockAssociation])
      await store.load()

      const result = store.getIncomeCategoryNameForExpense('cat-expense-1')

      expect(result).toBe('Remboursement Mutuelle')
    })

    it('should return null if no association exists', () => {
      const result = store.getIncomeCategoryNameForExpense('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getExpenseCategoryNameForIncome', () => {
    it('should return expense category name for income category', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([mockAssociation])
      await store.load()

      const result = store.getExpenseCategoryNameForIncome('cat-income-1')

      expect(result).toBe('Sante')
    })

    it('should return null if no association exists', () => {
      const result = store.getExpenseCategoryNameForIncome('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('reset', () => {
    it('should clear associations and error', async () => {
      mockApi.getCategoryAssociations.mockResolvedValue([mockAssociation])
      await store.load()

      store.reset()

      expect(store.associations).toEqual([])
      expect(store.error).toBeNull()
    })
  })
})

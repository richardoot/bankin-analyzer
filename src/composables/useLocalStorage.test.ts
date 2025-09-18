import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLocalStorage } from './useLocalStorage'

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }
})()

// Mock window.localStorage
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

describe('useLocalStorage', () => {
  let storage: ReturnType<typeof useLocalStorage>

  beforeEach(() => {
    // Clear localStorage completely before each test
    mockLocalStorage.clear()
    vi.clearAllMocks()
    // Create a fresh storage instance
    storage = useLocalStorage()
  })

  afterEach(() => {
    // Clean up after each test
    mockLocalStorage.clear()
  })

  describe('API de base', () => {
    describe('isAvailable', () => {
      it('devrait retourner true si localStorage est disponible', () => {
        expect(storage.isAvailable()).toBe(true)
      })

      it('devrait retourner false si localStorage lève une erreur', () => {
        const originalSetItem = localStorage.setItem
        localStorage.setItem = vi.fn(() => {
          throw new Error('Storage disabled')
        })

        expect(storage.isAvailable()).toBe(false)

        localStorage.setItem = originalSetItem
      })
    })

    describe('setItem et getItem', () => {
      it('devrait sauvegarder et récupérer une valeur simple', () => {
        const testData = { name: 'Test', value: 42 }

        expect(storage.setItem('test', testData)).toBe(true)
        expect(storage.getItem('test')).toEqual(testData)
      })

      it('devrait utiliser le préfixe par défaut', () => {
        storage.setItem('test', 'value')

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'bankin-analyzer-test',
          '"value"'
        )
      })

      it('devrait utiliser un préfixe personnalisé', () => {
        storage.setItem('test', 'value', { prefix: 'custom-' })

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'custom-test',
          '"value"'
        )
      })

      it("devrait retourner la valeur fallback si la clé n'existe pas", () => {
        const fallback = { default: true }
        const result = storage.getItem('nonexistent', { fallback })

        expect(result).toEqual(fallback)
      })

      it('devrait utiliser un validator personnalisé', () => {
        storage.setItem('test', { valid: false })

        const validator = (data: unknown): data is { valid: boolean } =>
          typeof data === 'object' &&
          data !== null &&
          'valid' in data &&
          (data as { valid: boolean }).valid === true
        const result = storage.getItem('test', { validator, fallback: null })

        expect(result).toBeNull()
      })

      it('devrait gérer les erreurs de parsing JSON', () => {
        mockLocalStorage.setItem('bankin-analyzer-invalid', 'invalid json')

        const result = storage.getItem('invalid', { fallback: 'fallback' })
        expect(result).toBe('fallback')
      })
    })

    describe('removeItem', () => {
      it('devrait supprimer un élément', () => {
        storage.setItem('test', 'value')
        expect(storage.removeItem('test')).toBe(true)
        expect(storage.getItem('test')).toBeNull()
      })

      it('devrait utiliser le bon préfixe lors de la suppression', () => {
        storage.removeItem('test')

        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
          'bankin-analyzer-test'
        )
      })
    })

    describe('hasItem', () => {
      it("devrait retourner true si l'élément existe", () => {
        storage.setItem('test', 'value')
        expect(storage.hasItem('test')).toBe(true)
      })

      it("devrait retourner false si l'élément n'existe pas", () => {
        expect(storage.hasItem('nonexistent')).toBe(false)
      })
    })

    describe('clear', () => {
      it('devrait supprimer tous les éléments avec le préfixe par défaut', () => {
        storage.setItem('test1', 'value1')
        storage.setItem('test2', 'value2')
        mockLocalStorage.setItem('other-key', 'other-value')

        expect(storage.clear()).toBe(true)

        expect(storage.hasItem('test1')).toBe(false)
        expect(storage.hasItem('test2')).toBe(false)
        expect(mockLocalStorage.getItem('other-key')).toBe('other-value')
      })

      it('devrait supprimer seulement les éléments avec le préfixe personnalisé', () => {
        mockLocalStorage.setItem('custom-test1', 'value1')
        mockLocalStorage.setItem('bankin-analyzer-test2', 'value2')

        expect(storage.clear({ prefix: 'custom-' })).toBe(true)

        expect(mockLocalStorage.getItem('custom-test1')).toBeNull()
        expect(mockLocalStorage.getItem('bankin-analyzer-test2')).toBe('value2')
      })
    })

    describe('getKeys', () => {
      it('devrait retourner toutes les clés avec le préfixe', () => {
        storage.setItem('test1', 'value1')
        storage.setItem('test2', 'value2')
        mockLocalStorage.setItem('other-key', 'other-value')

        const keys = storage.getKeys()

        expect(keys).toContain('test1')
        expect(keys).toContain('test2')
        expect(keys).not.toContain('other-key')
      })
    })

    describe('getItemSize', () => {
      it("devrait retourner la taille d'un élément", () => {
        storage.setItem('test', 'hello')

        const size = storage.getItemSize('test')
        expect(size).toBeGreaterThan(0)
      })

      it('devrait retourner 0 pour un élément inexistant', () => {
        const size = storage.getItemSize('nonexistent')
        expect(size).toBe(0)
      })
    })
  })

  describe('API réactive', () => {
    describe('useStorageItem', () => {
      it('devrait créer un ref réactif', () => {
        const item = storage.useStorageItem('test', { count: 0 })

        expect(item.data.value).toEqual({ count: 0 })
        expect(item.exists()).toBe(false)
      })

      it('devrait sauvegarder automatiquement lors des changements', async () => {
        const item = storage.useStorageItem('test', { count: 0 })

        item.data.value.count = 5
        await nextTick()

        expect(storage.getItem('test')).toEqual({ count: 5 })
      })

      it('devrait charger les données existantes', () => {
        storage.setItem('existing', { loaded: true })

        const item = storage.useStorageItem('existing', { loaded: false })

        expect(item.data.value).toEqual({ loaded: true })
      })

      it('devrait utiliser la valeur par défaut si les données sont invalides', () => {
        storage.setItem('test-invalid', { invalid: true })

        const validator = (data: unknown): data is { valid: boolean } =>
          typeof data === 'object' &&
          data !== null &&
          'valid' in data &&
          (data as { valid: boolean }).valid === true
        const item = storage.useStorageItem(
          'test-invalid',
          { valid: true },
          { validator }
        )

        expect(item.data.value).toEqual({ valid: true })
      })

      describe("méthodes d'instance", () => {
        it('save() devrait sauvegarder manuellement', () => {
          const item = storage.useStorageItem('test-save', { value: 'initial' })
          item.data.value.value = 'updated'

          expect(item.save()).toBe(true)
          expect(storage.getItem('test-save')).toEqual({ value: 'updated' })
        })

        it('reload() devrait recharger depuis localStorage', () => {
          const item = storage.useStorageItem('test-reload', {
            value: 'initial',
          })
          storage.setItem('test-reload', { value: 'external' })

          expect(item.reload()).toBe(true)
          expect(item.data.value).toEqual({ value: 'external' })
        })

        it('remove() devrait supprimer et reset', () => {
          const item = storage.useStorageItem('test-remove', {
            value: 'initial',
          })
          item.data.value = { value: 'updated' }

          expect(item.remove()).toBe(true)
          expect(item.data.value).toEqual({ value: 'initial' })
          expect(storage.hasItem('test-remove')).toBe(false)
        })

        it("exists() devrait vérifier l'existence", () => {
          const item = storage.useStorageItem('test-exists', {
            value: 'initial',
          })

          expect(item.exists()).toBe(false)

          item.save()
          expect(item.exists()).toBe(true)
        })

        it('size() devrait retourner la taille', () => {
          const item = storage.useStorageItem('test-size', { value: 'hello' })
          item.save()

          expect(item.size()).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('Utilitaires spécialisés', () => {
    describe('usePersonsStorage', () => {
      it('devrait créer un storage pour les personnes', async () => {
        const persons = storage.usePersonsStorage()

        expect(persons.data.value).toEqual([])

        const testPerson = {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
        }
        persons.data.value.push(testPerson)

        // Attendre que la sauvegarde automatique se fasse
        await nextTick()

        const storedPersons = storage.getItem('persons')
        expect(storedPersons).toEqual([testPerson])
      })

      it('devrait valider les données des personnes', () => {
        // Assurer que localStorage est vide au début
        storage.removeItem('persons')
        storage.setItem('persons', [{ invalid: true }])

        const persons = storage.usePersonsStorage()
        expect(persons.data.value).toEqual([])
      })

      it('devrait accepter des personnes valides', () => {
        // Assurer que localStorage est vide au début
        storage.removeItem('persons')
        const validPersons = [
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane' },
        ]
        storage.setItem('persons', validPersons)

        const persons = storage.usePersonsStorage()
        expect(persons.data.value).toEqual(validPersons)
      })
    })

    describe('useReimbursementCategoriesStorage', () => {
      it('devrait créer un storage pour les catégories', () => {
        const categories = storage.useReimbursementCategoriesStorage()

        expect(categories.data.value).toEqual([])
      })

      it('devrait valider les données des catégories', () => {
        storage.setItem('reimbursement-categories', [{ invalid: true }])

        const categories = storage.useReimbursementCategoriesStorage()
        expect(categories.data.value).toEqual([])
      })
    })

    describe('useExpenseAssignmentsStorage', () => {
      it('devrait créer un storage pour les assignations', () => {
        const assignments = storage.useExpenseAssignmentsStorage()

        expect(assignments.data.value).toEqual([])
      })
    })
  })

  describe('Migration', () => {
    describe('migrateOldData', () => {
      it('devrait migrer les anciennes données', () => {
        mockLocalStorage.setItem('bankin-analyzer-persons', '[]')

        storage.migrateOldData()

        expect(mockLocalStorage.getItem('bankin-analyzer-persons')).toEqual(
          '[]'
        )
        expect(
          mockLocalStorage.getItem('bankin-analyzer-persons')
        ).not.toBeNull()
      })

      it('ne devrait pas écraser les nouvelles données', () => {
        mockLocalStorage.setItem('bankin-analyzer-persons', '[{"old": true}]')
        storage.setItem('persons', [{ new: true }])

        storage.migrateOldData()

        expect(storage.getItem('persons')).toEqual([{ new: true }])
      })

      it('devrait gérer les erreurs de migration', () => {
        mockLocalStorage.setItem('bankin-analyzer-persons', 'invalid json')

        // Ne devrait pas lever d'erreur
        expect(() => storage.migrateOldData()).not.toThrow()
      })
    })
  })

  describe("Gestion d'erreur", () => {
    it('devrait gérer localStorage indisponible', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage disabled')
      })

      expect(storage.setItem('test', 'value')).toBe(false)
      expect(storage.getItem('test')).toBeNull()

      localStorage.setItem = originalSetItem
    })

    it("devrait respecter l'option silentErrors", () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      storage.getItem('nonexistent', { silentErrors: true })

      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('devrait logger les erreurs par défaut', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error')
      })

      storage.getItem('test')

      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('Options avancées', () => {
    it('devrait respecter les préfixes personnalisés dans tous les contexts', () => {
      const customStorage = useLocalStorage()
      const options = { prefix: 'app-' }

      customStorage.setItem('test', 'value', options)
      expect(customStorage.getItem('test', options)).toBe('value')
      expect(customStorage.hasItem('test', options)).toBe(true)

      const keys = customStorage.getKeys(options)
      expect(keys).toContain('test')
    })

    it('devrait gérer les validateurs complexes', () => {
      const complexValidator = (
        data: unknown
      ): data is { items: number[]; meta: { version: number } } => {
        return (
          typeof data === 'object' &&
          data !== null &&
          'items' in data &&
          'meta' in data &&
          Array.isArray((data as Record<string, unknown>).items) &&
          typeof (data as Record<string, unknown>).meta === 'object'
        )
      }

      const validData = { items: [1, 2, 3], meta: { version: 1 } }
      const invalidData = { items: 'not array' }

      storage.setItem('valid', validData)
      storage.setItem('invalid', invalidData)

      expect(storage.getItem('valid', { validator: complexValidator })).toEqual(
        validData
      )

      expect(
        storage.getItem('invalid', {
          validator: complexValidator,
          fallback: null,
        })
      ).toBeNull()
    })
  })
})

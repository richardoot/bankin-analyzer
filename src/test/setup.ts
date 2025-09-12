import { expect, vi } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { config } from '@vue/test-utils'
import type { ComponentPublicInstance as _ComponentPublicInstance } from 'vue'

// Étendre les matchers expect avec jest-dom
expect.extend(matchers)

// Configuration globale pour Vue Test Utils
config.global = {
  // Stubs pour les composants externes et async components
  stubs: {
    // Stub des transitions Vue pour les tests
    transition: false,
    'transition-group': false,
    // Stub pour les composants async qui posent problème
    Suspense: false,
  },

  // Configuration des plugins globaux
  plugins: [],

  // Mixins globaux
  mixins: [],

  // Directives globales
  directives: {},
}

// Helper pour gérer les composants async dans les tests
export const waitForAsyncComponent = async (
  wrapper: Record<string, unknown>,
  timeout = 1000
): Promise<void> => {
  const checkAsync = async (): Promise<boolean> => {
    try {
      // Force update du wrapper
      if (wrapper.vm && typeof wrapper.vm.$nextTick === 'function') {
        await wrapper.vm.$nextTick()
      }

      // Vérifier si les composants async sont montés
      const hasAsyncErrors = wrapper.vm?.$el?.querySelector?.(
        '.async-component-error'
      )
      const hasAsyncLoading = wrapper.vm?.$el?.querySelector?.(
        '.async-component-loading'
      )

      return !hasAsyncErrors && !hasAsyncLoading
    } catch {
      return false
    }
  }

  const startTime = Date.now()

  const pollAsync = async (): Promise<void> => {
    if (await checkAsync()) {
      // Attendre une frame supplémentaire pour s'assurer du rendu
      return new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      )
    }

    if (Date.now() - startTime < timeout) {
      return new Promise<void>((resolve, reject) => 
        setTimeout(() => pollAsync().then(resolve).catch(reject), 10)
      )
    }
  }

  return pollAsync() || Promise.resolve()
}

// Mock du localStorage avec isolation entre tests
class MockStorage {
  private store = new Map<string, string>()

  getItem = vi.fn((key: string) => this.store.get(key) ?? null)
  setItem = vi.fn((key: string, value: string) => {
    this.store.set(key, value)
    this.dispatchStorageEvent(key, value)
  })
  removeItem = vi.fn((key: string) => {
    this.store.delete(key)
    this.dispatchStorageEvent(key, null)
  })
  clear = vi.fn(() => {
    this.store.clear()
  })
  key = vi.fn((index: number) => {
    const keys = Array.from(this.store.keys())
    return keys[index] ?? null
  })
  get length() {
    return this.store.size
  }

  // Dispatch des événements storage pour les tests d'intégration
  private dispatchStorageEvent(key: string, newValue: string | null) {
    const oldValue = this.store.get(key) ?? null
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        newValue,
        oldValue,
        storageArea: this as Storage,
      })
    )
  }

  // Méthode pour nettoyer entre les tests
  reset() {
    this.store.clear()
    this.getItem.mockClear()
    this.setItem.mockClear()
    this.removeItem.mockClear()
    this.clear.mockClear()
    this.key.mockClear()
  }
}

const localStorageMock = new MockStorage()
const sessionStorageMock = new MockStorage()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
})

// Exposition globale pour les tests
// @ts-expect-error - DOM manipulation needed for test utilities
global.mockStorage = {
  localStorage: localStorageMock,
  sessionStorage: sessionStorageMock,
}

// Mock de window.matchMedia pour les media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock de ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock de IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock de URL.createObjectURL pour les tests de fichiers
global.URL.createObjectURL = vi.fn().mockReturnValue('mock-url')
global.URL.revokeObjectURL = vi.fn()

// Mock de FileReader pour les tests d'upload
interface MockFileWithContent extends File {
  mockContent?: string
}

interface FileReaderEvent {
  target: { result: string | ArrayBuffer | null }
}

global.FileReader = class MockFileReader {
  onload: ((event: FileReaderEvent) => void) | null = null
  onerror: ((event: FileReaderEvent) => void) | null = null
  result: string | ArrayBuffer | null = null

  readAsText(file: File) {
    // Simulation de lecture asynchrone avec contenu réel du fichier
    setTimeout(() => {
      // Lire le contenu du fichier mockFile si disponible
      const mockFile = file as MockFileWithContent
      if (mockFile.mockContent) {
        this.result = mockFile.mockContent
      } else {
        // Contenu par défaut pour les tests
        this.result = file.name.includes('bankin')
          ? `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;Test Transaction;Compte Courant;-50.00;Alimentation;Supermarché;Test;Non`
          : 'Invalid CSV Content'
      }

      if (this.onload) {
        this.onload({ target: { result: this.result } })
      }
    }, 10)
  }

  readAsDataURL(_file: File) {
    setTimeout(() => {
      this.result = 'data:text/csv;base64,mock-data'
      if (this.onload) {
        this.onload({ target: { result: this.result } })
      }
    }, 10)
  }
} as unknown as typeof FileReader

// Configuration des timeouts pour les tests
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000,
})

// Hook global pour nettoyer entre les tests
import { beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  // Nettoyer les mocks localStorage entre chaque test
  // @ts-expect-error - DOM manipulation needed for test utilities
  global.mockStorage.localStorage.reset()
  // @ts-expect-error - DOM manipulation needed for test utilities
  global.mockStorage.sessionStorage.reset()

  // Nettoyer les mocks DOM
  vi.clearAllMocks()
})

afterEach(() => {
  // Nettoyer les timers et les observateurs
  vi.clearAllTimers()
  vi.useRealTimers()
})

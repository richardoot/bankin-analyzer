import { expect, vi } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { config } from '@vue/test-utils'

// Étendre les matchers expect avec jest-dom
expect.extend(matchers)

// Configuration globale pour Vue Test Utils
config.global = {
  // Stubs pour les composants externes
  stubs: {
    // Stub des transitions Vue pour les tests
    transition: false,
    'transition-group': false,
  },

  // Configuration des plugins globaux
  plugins: [],

  // Mixins globaux
  mixins: [],

  // Directives globales
  directives: {},
}

// Mock du localStorage pour les tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock du sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
})

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

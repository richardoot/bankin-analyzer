import type { VueWrapper } from '@vue/test-utils'
import { mount, shallowMount } from '@vue/test-utils'
import type { Component } from 'vue'
import { vi } from 'vitest'
import type { CsvAnalysisResult, Person, ReimbursementCategory } from '@/types'

/**
 * Options de montage étendues pour les composants
 */
export interface ExtendedMountOptions {
  props?: Record<string, unknown>
  global?: {
    plugins?: unknown[]
    stubs?: Record<string, unknown>
    mocks?: Record<string, unknown>
    provide?: Record<string, unknown>
  }
  attachTo?: Element
  shallow?: boolean
}

/**
 * Helper pour monter des composants Vue avec des options par défaut
 */
export class VueTestHelper {
  /**
   * Monte un composant avec des options par défaut
   */
  static mountComponent<T extends Component>(
    component: T,
    options: ExtendedMountOptions = {}
  ): VueWrapper<ComponentPublicInstance> {
    const defaultOptions = {
      global: {
        stubs: {
          // Stub des composants externes ou complexes
          'router-link': true,
          'router-view': true,
          transition: false,
          'transition-group': false,
        },
        mocks: {
          // Mocks globaux
          $router: {
            push: vi.fn(),
            replace: vi.fn(),
            go: vi.fn(),
            back: vi.fn(),
            forward: vi.fn(),
          },
          $route: {
            path: '/',
            params: {},
            query: {},
            hash: '',
            name: 'home',
          },
        },
        provide: {
          // Provide des dépendances globales
        },
      },
    }

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      global: {
        ...defaultOptions.global,
        ...options.global,
        stubs: {
          ...defaultOptions.global.stubs,
          ...options.global?.stubs,
        },
        mocks: {
          ...defaultOptions.global.mocks,
          ...options.global?.mocks,
        },
      },
    }

    return options.shallow
      ? shallowMount(component, mergedOptions)
      : mount(component, mergedOptions)
  }

  /**
   * Trouve un élément par son attribut data-testid
   */
  static findByTestId(
    wrapper: VueWrapper<ComponentPublicInstance>,
    testId: string
  ) {
    return wrapper.find(`[data-testid="${testId}"]`)
  }

  /**
   * Trouve tous les éléments par leur attribut data-testid
   */
  static findAllByTestId(
    wrapper: VueWrapper<ComponentPublicInstance>,
    testId: string
  ) {
    return wrapper.findAll(`[data-testid="${testId}"]`)
  }

  /**
   * Simule un événement de fichier (pour les tests d'upload)
   */
  static async simulateFileInput(
    wrapper: VueWrapper<ComponentPublicInstance>,
    file: File,
    selector: string = 'input[type="file"]'
  ) {
    const fileInput = wrapper.find(selector)

    // Mock de l'événement change
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      writable: false,
    })

    await fileInput.trigger('change')
    return fileInput
  }

  /**
   * Simule un drag & drop de fichier
   */
  static async simulateFileDrop(
    wrapper: VueWrapper<ComponentPublicInstance>,
    files: File[],
    selector: string = '[data-testid="drop-zone"]'
  ) {
    const dropZone = wrapper.find(selector)

    const dataTransfer = {
      files,
      types: ['Files'],
      getData: vi.fn(),
      setData: vi.fn(),
      clearData: vi.fn(),
      effectAllowed: 'all',
      dropEffect: 'copy',
    }

    // Simule dragover
    await dropZone.trigger('dragover', {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })

    // Simule drop
    await dropZone.trigger('drop', {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })

    return dropZone
  }

  /**
   * Attend qu'un élément soit visible
   */
  static async waitForElement(
    wrapper: VueWrapper<ComponentPublicInstance>,
    selector: string,
    timeout: number = 3000
  ): Promise<DOMWrapper<Element>> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      // eslint-disable-next-line no-await-in-loop
      await wrapper.vm.$nextTick()
      const element = wrapper.find(selector)

      if (element.exists() && element.isVisible()) {
        return element
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 50)
      })
    }

    throw new Error(
      `Element ${selector} not found or not visible after ${timeout}ms`
    )
  }

  /**
   * Attend qu'un texte apparaisse dans le wrapper
   */
  static async waitForText(
    wrapper: VueWrapper<ComponentPublicInstance>,
    text: string,
    timeout: number = 3000
  ): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      // eslint-disable-next-line no-await-in-loop
      await wrapper.vm.$nextTick()

      if (wrapper.text().includes(text)) {
        return
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 50)
      })
    }

    throw new Error(`Text "${text}" not found after ${timeout}ms`)
  }

  /**
   * Simule la saisie dans un input
   */
  static async typeInInput(
    wrapper: VueWrapper<ComponentPublicInstance>,
    selector: string,
    value: string
  ) {
    const input = wrapper.find(selector)
    await input.setValue(value)
    await input.trigger('input')
    await wrapper.vm.$nextTick()
    return input
  }

  /**
   * Simule un clic sur un bouton avec attente
   */
  static async clickButton(
    wrapper: VueWrapper<ComponentPublicInstance>,
    selector: string
  ) {
    const button = wrapper.find(selector)
    expect(button.exists()).toBe(true)

    await button.trigger('click')
    await wrapper.vm.$nextTick()
    return button
  }

  /**
   * Vérifie qu'un composant émet un événement avec les bonnes données
   */
  static expectEmitted(
    wrapper: VueWrapper<ComponentPublicInstance>,
    eventName: string,
    expectedData?: unknown
  ) {
    const emitted = wrapper.emitted(eventName)
    expect(emitted).toBeDefined()
    expect(emitted).toHaveLength(1)

    if (expectedData !== undefined) {
      expect(emitted?.[0]).toEqual([expectedData])
    }

    return emitted?.[0]
  }

  /**
   * Vérifie qu'un composant a les props attendues
   */
  static expectProps(
    wrapper: VueWrapper<ComponentPublicInstance>,
    expectedProps: Record<string, unknown>
  ) {
    Object.entries(expectedProps).forEach(([key, value]) => {
      expect(wrapper.props(key)).toEqual(value)
    })
  }

  /**
   * Mock d'un composable pour les tests
   */
  static mockComposable<T>(composable: () => T, mockReturn: Partial<T>): T {
    return {
      ...composable(),
      ...mockReturn,
    }
  }
}

/**
 * Factory pour créer des props de test pour les composants spécifiques
 */
export class ComponentPropsFactory {
  /**
   * Props pour les composants de graphiques
   */
  static chartProps(overrides: Record<string, unknown> = {}) {
    return {
      chartData: {
        months: [
          {
            month: 'Jan',
            year: 2024,
            expenses: 1200,
            income: 2500,
            net: 1300,
            transactionCount: 15,
          },
          {
            month: 'Fév',
            year: 2024,
            expenses: 1100,
            income: 2500,
            net: 1400,
            transactionCount: 12,
          },
          {
            month: 'Mar',
            year: 2024,
            expenses: 1300,
            income: 2500,
            net: 1200,
            transactionCount: 18,
          },
        ],
        maxValue: 2500,
        minValue: 0,
        totalExpenses: 3600,
        totalIncome: 7500,
        totalNet: 3900,
      },
      title: 'Test Chart',
      formatAmount: (amount: number) => `${amount.toFixed(2)}€`,
      ...overrides,
    }
  }

  /**
   * Props pour les composants de upload
   */
  static uploadProps(overrides: Record<string, unknown> = {}) {
    return {
      accept: '.csv',
      multiple: false,
      maxSize: 10 * 1024 * 1024, // 10MB
      ...overrides,
    }
  }

  /**
   * Props pour les composants d'analyse
   */
  static analysisProps(
    analysisResult?: CsvAnalysisResult,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      analysisResult: analysisResult || {
        isValid: true,
        transactionCount: 100,
        categoryCount: 5,
        categories: ['Alimentation', 'Transport', 'Loisirs'],
        dateRange: { start: '01/01/2024', end: '31/12/2024' },
        totalAmount: 1500,
        expenses: {
          totalAmount: 3600,
          transactionCount: 85,
          categories: ['Alimentation', 'Transport', 'Loisirs'],
          categoriesData: {},
        },
        income: {
          totalAmount: 5100,
          transactionCount: 15,
          categories: ['Salaire'],
          categoriesData: {},
        },
        transactions: [],
      },
      ...overrides,
    }
  }

  /**
   * Props pour les composants de remboursement
   */
  static reimbursementProps(overrides: Record<string, unknown> = {}) {
    return {
      persons: [
        { id: '1', name: 'John Doe', email: 'john@example.com' },
        { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
      ] as Person[],
      categories: [
        {
          id: '1',
          name: 'Alimentation',
          description: 'Frais de nourriture',
          icon: '🍽️',
          color: '#ef4444',
          keywords: ['restaurant', 'supermarché'],
          isDefault: true,
          createdAt: new Date(),
        },
      ] as ReimbursementCategory[],
      ...overrides,
    }
  }
}

/**
 * Matchers personnalisés pour les tests
 */
export const customMatchers = {
  /**
   * Vérifie qu'un élément a une classe CSS
   */
  toHaveClass(received: unknown, expected: string) {
    const element = received.element || received
    const classes = element.className || element.classList?.toString() || ''

    return {
      pass: classes.includes(expected),
      message: () =>
        `Expected element to have class "${expected}", but got "${classes}"`,
    }
  },

  /**
   * Vérifie qu'un wrapper contient un texte
   */
  toContainText(
    received: VueWrapper<ComponentPublicInstance>,
    expected: string
  ) {
    const text = received.text()

    return {
      pass: text.includes(expected),
      message: () =>
        `Expected wrapper to contain text "${expected}", but got "${text}"`,
    }
  },

  /**
   * Vérifie qu'un composant a émis un événement
   */
  toHaveEmitted(
    received: VueWrapper<ComponentPublicInstance>,
    eventName: string
  ) {
    const emitted = received.emitted(eventName)

    return {
      pass: !!emitted && emitted.length > 0,
      message: () => `Expected component to have emitted "${eventName}" event`,
    }
  },
}

// Étendre les matchers de expect
declare global {
  interface Vi {
    AsymmetricMatchersContaining: {
      toHaveClass(expected: string): unknown
      toContainText(expected: string): unknown
      toHaveEmitted(eventName: string): unknown
    }
  }
}

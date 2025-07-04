import type {
  Transaction,
  CsvAnalysisResult,
  Person,
  ReimbursementCategory,
} from '@/types'

/**
 * Factory pour créer des transactions de test
 */
export class TransactionFactory {
  static create(overrides: Partial<Transaction> = {}): Transaction {
    return {
      date: '15/12/2024',
      description: 'Test Transaction',
      amount: -50.0,
      category: 'Alimentation',
      account: 'Compte Courant',
      type: 'expense',
      note: '',
      isPointed: false,
      ...overrides,
    }
  }

  static createExpense(overrides: Partial<Transaction> = {}): Transaction {
    return this.create({
      amount: -Math.abs(overrides.amount || 50),
      type: 'expense',
      category: 'Alimentation',
      ...overrides,
    })
  }

  static createIncome(overrides: Partial<Transaction> = {}): Transaction {
    return this.create({
      amount: Math.abs(overrides.amount || 2500),
      type: 'income',
      category: 'Salaire',
      ...overrides,
    })
  }

  static createMultiple(
    count: number,
    overrides: Partial<Transaction> = {}
  ): Transaction[] {
    return Array.from({ length: count }, (_, index) =>
      this.create({
        description: `Transaction ${index + 1}`,
        amount: -((index + 1) * 10),
        ...overrides,
      })
    )
  }

  static createMonthlyData(): Transaction[] {
    return [
      // Janvier 2024
      this.create({
        date: '01/01/2024',
        amount: -120,
        category: 'Alimentation',
      }),
      this.create({
        date: '15/01/2024',
        amount: 2500,
        category: 'Salaire',
        type: 'income',
      }),
      this.create({ date: '30/01/2024', amount: -80, category: 'Transport' }),

      // Février 2024
      this.create({
        date: '05/02/2024',
        amount: -150,
        category: 'Alimentation',
      }),
      this.create({
        date: '15/02/2024',
        amount: 2500,
        category: 'Salaire',
        type: 'income',
      }),
      this.create({ date: '28/02/2024', amount: -200, category: 'Loisirs' }),

      // Mars 2024
      this.create({
        date: '10/03/2024',
        amount: -90,
        category: 'Alimentation',
      }),
      this.create({
        date: '15/03/2024',
        amount: 2500,
        category: 'Salaire',
        type: 'income',
      }),
      this.create({ date: '25/03/2024', amount: -500, category: 'Logement' }),
    ]
  }
}

/**
 * Factory pour créer des résultats d'analyse CSV
 */
export class CsvAnalysisResultFactory {
  static create(overrides: Partial<CsvAnalysisResult> = {}): CsvAnalysisResult {
    const transactions = overrides.transactions || []
    const expenses = transactions.filter(t => t.type === 'expense')
    const income = transactions.filter(t => t.type === 'income')

    return {
      isValid: true,
      transactionCount: transactions.length,
      categoryCount: 5,
      categories: [
        'Alimentation',
        'Transport',
        'Loisirs',
        'Logement',
        'Salaire',
      ],
      dateRange: {
        start: '01/01/2024',
        end: '31/12/2024',
      },
      totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
      expenses: {
        totalAmount: expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        transactionCount: expenses.length,
        categories: ['Alimentation', 'Transport', 'Loisirs', 'Logement'],
        categoriesData: {
          Alimentation: 360,
          Transport: 80,
          Loisirs: 200,
          Logement: 500,
        },
      },
      income: {
        totalAmount: income.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: income.length,
        categories: ['Salaire'],
        categoriesData: {
          Salaire: 7500,
        },
      },
      transactions,
      errors: [],
      ...overrides,
    }
  }

  static createInvalid(
    errors: string[] = ['Format invalide']
  ): CsvAnalysisResult {
    return {
      isValid: false,
      transactionCount: 0,
      categoryCount: 0,
      categories: [],
      dateRange: { start: '', end: '' },
      totalAmount: 0,
      expenses: {
        totalAmount: 0,
        transactionCount: 0,
        categories: [],
        categoriesData: {},
      },
      income: {
        totalAmount: 0,
        transactionCount: 0,
        categories: [],
        categoriesData: {},
      },
      transactions: [],
      errors,
    }
  }
}

/**
 * Factory pour créer des personnes de test
 */
export class PersonFactory {
  static create(overrides: Partial<Person> = {}): Person {
    return {
      id: 'person-' + Math.random().toString(36).substr(2, 9),
      name: 'John Doe',
      email: 'john.doe@example.com',
      ...overrides,
    }
  }

  static createMultiple(count: number): Person[] {
    return Array.from({ length: count }, (_, index) =>
      this.create({
        name: `Person ${index + 1}`,
        email: `person${index + 1}@example.com`,
      })
    )
  }
}

/**
 * Factory pour créer des catégories de remboursement
 */
export class ReimbursementCategoryFactory {
  static create(
    overrides: Partial<ReimbursementCategory> = {}
  ): ReimbursementCategory {
    return {
      id: 'category-' + Math.random().toString(36).substr(2, 9),
      name: 'Alimentation',
      description: 'Frais de nourriture et boisson',
      icon: '🍽️',
      color: '#ef4444',
      keywords: ['restaurant', 'supermarché', 'boulangerie'],
      isDefault: true,
      createdAt: new Date(),
      ...overrides,
    }
  }

  static createDefaultCategories(): ReimbursementCategory[] {
    return [
      this.create({
        name: 'Alimentation',
        description: 'Frais de nourriture et boisson',
        icon: '🍽️',
        color: '#ef4444',
        keywords: ['restaurant', 'supermarché', 'boulangerie'],
      }),
      this.create({
        name: 'Transport',
        description: 'Frais de transport et carburant',
        icon: '🚗',
        color: '#3b82f6',
        keywords: ['essence', 'transport', 'taxi', 'métro'],
      }),
      this.create({
        name: 'Loisirs',
        description: 'Activités de loisir et divertissement',
        icon: '🎮',
        color: '#10b981',
        keywords: ['cinéma', 'sport', 'jeux', 'voyage'],
      }),
      this.create({
        name: 'Logement',
        description: 'Frais liés au logement',
        icon: '🏠',
        color: '#f59e0b',
        keywords: ['loyer', 'charges', 'électricité', 'eau'],
      }),
      this.create({
        name: 'Santé',
        description: 'Frais médicaux et de santé',
        icon: '🏥',
        color: '#8b5cf6',
        keywords: ['médecin', 'pharmacie', 'dentiste', 'mutuelle'],
      }),
    ]
  }
}

/**
 * Factory pour créer des fichiers de test
 */
export class FileFactory {
  static createCsvFile(content: string = '', name: string = 'test.csv'): File {
    const file = new File([content], name, {
      type: 'text/csv',
      lastModified: Date.now(),
    })
    // Ajouter le contenu pour notre mock FileReader
    ;(file as File & { mockContent?: string }).mockContent = content
    return file
  }

  static createValidBankinCsv(): File {
    const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;Supermarché Casino;Compte Courant;-45.67;Alimentation;Supermarché;Courses hebdomadaires;Non
14/12/2024;Salaire mensuel;Compte Courant;2500.00;Revenus;Salaire;Salaire décembre;Oui
13/12/2024;Station essence;Compte Courant;-52.30;Transport;Carburant;Plein d'essence;Non
12/12/2024;Restaurant;Compte Courant;-28.90;Alimentation;Restaurant;Déjeuner d'affaires;Non`
    return this.createCsvFile(csvContent, 'bankin-export.csv')
  }

  static createInvalidCsv(): File {
    const csvContent = `Invalid;CSV;Format
This;Is;Not;A;Valid;Bankin;Export`
    return this.createCsvFile(csvContent, 'invalid.csv')
  }

  static createLargeCsv(transactionCount: number = 1000): File {
    const headers =
      'Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée\n'
    const transactions = Array.from(
      { length: transactionCount },
      (_, index) => {
        const date = new Date(2024, 0, 1 + (index % 365))
        const dateStr = date.toLocaleDateString('fr-FR')
        return `${dateStr};Transaction ${index + 1};Compte Courant;-${(Math.random() * 100).toFixed(2)};Alimentation;Supermarché;Test transaction;Non`
      }
    ).join('\n')

    return this.createCsvFile(headers + transactions, 'large-export.csv')
  }
}

/**
 * Helpers pour les tests
 */
export class TestHelpers {
  /**
   * Attend qu'une promesse soit résolue dans les tests
   */
  static async waitFor(
    callback: () => boolean,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      if (callback()) {
        return
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(() => resolve(undefined), 10)
      })
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`)
  }

  /**
   * Simule un délai dans les tests
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => resolve(undefined), ms)
    })
  }

  /**
   * Génère un ID unique pour les tests
   */
  static generateId(): string {
    return 'test-' + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Mock du localStorage pour les tests
   */
  static mockLocalStorage() {
    const store: Record<string, string> = {}

    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key]
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach(key => delete store[key])
      }),
      get store() {
        return store
      },
    }
  }

  /**
   * Vérifie qu'un objet a les propriétés attendues
   */
  static expectObjectToHaveProperties<T extends Record<string, unknown>>(
    obj: T,
    properties: (keyof T)[]
  ): void {
    properties.forEach(prop => {
      expect(obj).toHaveProperty(prop)
    })
  }

  /**
   * Vérifie qu'un nombre est dans une plage
   */
  static expectNumberInRange(value: number, min: number, max: number): void {
    expect(value).toBeGreaterThanOrEqual(min)
    expect(value).toBeLessThanOrEqual(max)
  }
}

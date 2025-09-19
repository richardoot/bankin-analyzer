import type { ImportSession, CsvAnalysisResult } from '@/types'

/**
 * Données de test pour simuler des sessions d'import multiples
 */

// Exemple d'analysisResult pour les tests
const createMockAnalysisResult = (
  transactionCount: number,
  totalAmount: number,
  categories: string[]
): CsvAnalysisResult => ({
  isValid: true,
  transactionCount,
  categoryCount: categories.length,
  categories,
  dateRange: {
    start: '2024-01-01',
    end: '2024-12-31',
  },
  totalAmount,
  expenses: {
    totalAmount: Math.abs(totalAmount * 0.7),
    transactionCount: Math.floor(transactionCount * 0.8),
    categories: categories.slice(0, Math.floor(categories.length * 0.6)),
    categoriesData: categories.slice(0, 3).reduce(
      (acc, cat, _idx) => ({
        ...acc,
        [cat]: Math.random() * 1000 + 100,
      }),
      {}
    ),
  },
  income: {
    totalAmount: Math.abs(totalAmount * 0.3),
    transactionCount: Math.floor(transactionCount * 0.2),
    categories: categories.slice(Math.floor(categories.length * 0.6)),
    categoriesData: categories.slice(3, 6).reduce(
      (acc, cat, _idx) => ({
        ...acc,
        [cat]: Math.random() * 500 + 50,
      }),
      {}
    ),
  },
  transactions: Array.from({ length: transactionCount }, (_, idx) => ({
    date: `2024-${String(Math.floor(idx / 30) + 1).padStart(2, '0')}-${String((idx % 30) + 1).padStart(2, '0')}`,
    description: `Transaction ${idx + 1}`,
    amount: (Math.random() - 0.5) * 1000,
    category: categories[idx % categories.length],
    account: `Compte ${Math.floor(idx / 10) + 1}`,
    type: Math.random() > 0.7 ? 'income' : 'expense',
    note: `Note ${idx + 1}`,
  })),
})

// Sessions de test
export const mockSessions: ImportSession[] = [
  {
    id: 'session-test-1',
    name: 'Import 1 (bankin-janvier-2024)',
    fileName: 'bankin-janvier-2024.csv',
    originalFileName: 'bankin-janvier-2024.csv',
    uploadDate: new Date('2024-01-15T10:30:00'),
    lastAccessDate: new Date('2024-01-20T14:15:00'),
    isActive: false,
    analysisResult: createMockAnalysisResult(156, -2450.75, [
      'Alimentation',
      'Transport',
      'Logement',
      'Salaire',
      'Remboursement',
      'Loisirs',
    ]),
  },
  {
    id: 'session-test-2',
    name: 'Import 2 (bankin-fevrier-2024)',
    fileName: 'bankin-fevrier-2024.csv',
    originalFileName: 'bankin-fevrier-2024.csv',
    uploadDate: new Date('2024-02-12T09:45:00'),
    lastAccessDate: new Date('2024-02-15T16:20:00'),
    isActive: false,
    analysisResult: createMockAnalysisResult(203, -1890.3, [
      'Alimentation',
      'Transport',
      'Santé',
      'Salaire',
      'Prime',
      'Abonnements',
    ]),
  },
  {
    id: 'session-test-3',
    name: 'Import 3 (bankin-mars-2024)',
    fileName: 'bankin-mars-2024.csv',
    originalFileName: 'bankin-mars-2024.csv',
    uploadDate: new Date('2024-03-08T11:20:00'),
    lastAccessDate: new Date('2024-03-10T08:30:00'),
    isActive: true,
    analysisResult: createMockAnalysisResult(178, -3120.6, [
      'Alimentation',
      'Transport',
      'Logement',
      'Shopping',
      'Salaire',
      'Freelance',
      'Remboursement',
    ]),
  },
]

/**
 * Initialise les données de test dans le localStorage
 */
export function initializeTestData(): void {
  const testData = {
    sessions: mockSessions,
    activeSessionId: 'session-test-3',
    nextSessionNumber: 4,
  }

  localStorage.setItem(
    'bankin-analyzer-import-manager',
    JSON.stringify(testData)
  )
  console.log(
    '🧪 Données de test initialisées:',
    testData.sessions.length,
    'sessions'
  )
}

/**
 * Nettoie les données de test
 */
export function clearTestData(): void {
  localStorage.removeItem('bankin-analyzer-import-manager')
  console.log('🗑️ Données de test supprimées')
}

/**
 * Vérifie si des données de test sont présentes
 */
export function hasTestData(): boolean {
  const stored = localStorage.getItem('bankin-analyzer-import-manager')
  return !!stored
}

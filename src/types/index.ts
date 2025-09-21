/**
 * Types principaux pour l'analyseur financier Bankin
 */

export interface CsvFile {
  file: File
  name: string
  size: number
  lastModified: number
}

export interface UploadState {
  isUploading: boolean
  isSuccess: boolean
  error: string | null
}

export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  account: string
  type: 'expense' | 'income'
  note: string
  isPointed?: boolean
}

export interface CsvAnalysisResult {
  isValid: boolean
  transactionCount: number
  categoryCount: number
  categories: string[]
  dateRange: {
    start: string
    end: string
  }
  totalAmount: number
  // Nouvelles propriétés pour séparer dépenses et revenus
  expenses: {
    totalAmount: number
    transactionCount: number
    categories: string[]
    categoriesData: Record<string, number> // Montants par catégorie
  }
  income: {
    totalAmount: number
    transactionCount: number
    categories: string[]
    categoriesData: Record<string, number> // Montants par catégorie
  }
  // Ajout des transactions individuelles pour l'histogramme mensuel
  transactions: Transaction[]
  // Comptes joints pour diviser les montants par 2
  jointAccounts?: string[]
  errors?: string[]
}

export interface ValidationModalData {
  isOpen: boolean
  csvResult: CsvAnalysisResult | null
}

// Types pour la gestion des personnes et remboursements
export interface Person {
  id: string
  name: string
  email?: string
}

export interface ReimbursementCategory {
  id: string
  name: string
  description: string
  icon: string
  color: string
  keywords: string[]
  isDefault: boolean
  createdAt: Date
}

export interface PersonAssignment {
  personId: string
  amount: number
  categoryId?: string
}

// Types pour la gestion multi-imports
export interface ImportSession {
  id: string
  name: string
  fileName: string
  originalFileName: string
  uploadDate: Date
  lastAccessDate: Date
  isActive: boolean
  analysisResult: CsvAnalysisResult
}

export interface ImportManagerState {
  sessions: ImportSession[]
  activeSessionId: string | null
  nextSessionNumber: number
}

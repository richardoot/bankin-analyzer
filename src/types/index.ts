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

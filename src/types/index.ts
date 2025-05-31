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

// Types pour le module de remboursement
export interface Person {
  id: string
  name: string
  email?: string
  avatar?: string
  createdAt: string
  updatedAt: string
}

export interface ReimbursementTransaction {
  id: string
  transactionId: string // ID de la transaction originale
  personId: string
  amount: number
  description: string
  date: string
  category: string
  isReimbursed: boolean
  reimbursedAt?: string
  note?: string
  createdAt: string
}

// Interface pour les associations partagées
export interface SharedTransactionAssociation {
  id: string
  transactionId: string // ID de la transaction originale
  people: Array<{
    personId: string
    amount: number
    isReimbursed: boolean
    reimbursedAt?: string
    note?: string
  }>
  description: string
  date: string
  category: string
  totalAmount: number
  createdAt: string
  updatedAt: string
}

export interface PersonDebt {
  personId: string
  personName: string
  totalAmount: number
  transactionCount: number
  lastTransactionDate: string
  transactions: ReimbursementTransaction[]
}

export interface ReimbursementSummary {
  totalDebt: number
  totalReimbursed: number
  pendingAmount: number
  peopleCount: number
  transactionCount: number
  debts: PersonDebt[]
}

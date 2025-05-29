import type {
  CsvAnalysisResult,
  CsvFile,
  Transaction,
  UploadState,
} from '@/types'
import { computed, ref } from 'vue'

/**
 * Analyse un fichier CSV Bankin et extrait les informations
 */
const analyzeCsvFile = async (file: File): Promise<CsvAnalysisResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          resolve({
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
            errors: [
              'Le fichier CSV doit contenir au moins une ligne de données',
            ],
          })
          return
        }

        // Vérification des en-têtes Bankin (séparateur point-virgule)
        const headerLine = lines[0]
        if (!headerLine) {
          resolve({
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
            errors: ['Fichier CSV vide ou en-têtes manquants'],
          })
          return
        }

        const headers = headerLine
          .split(';')
          .map(h => h.replace(/"/g, '').trim())

        // En-têtes attendus pour un export Bankin
        const expectedHeaders = [
          'Date',
          'Description',
          'Compte',
          'Montant',
          'Catégorie',
          'Sous-Catégorie',
          'Note',
          'Pointée',
        ]
        const hasValidHeaders = expectedHeaders.every(header =>
          headers.some(h => h.toLowerCase() === header.toLowerCase())
        )

        if (!hasValidHeaders) {
          resolve({
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
            errors: [
              'Format CSV Bankin non reconnu. En-têtes attendus : ' +
                expectedHeaders.join(', '),
            ],
          })
          return
        }

        // Analyse des données selon le format Bankin
        const dataLines = lines.slice(1)
        const categories = new Set<string>()
        const amounts: number[] = []
        const dates: string[] = []

        // Collecte des transactions individuelles
        const transactions: Transaction[] = []

        // Séparation des dépenses et revenus
        const expenseCategories = new Set<string>()
        const incomeCategories = new Set<string>()
        const expenseAmounts: number[] = []
        const incomeAmounts: number[] = []

        // Agrégation des montants par catégorie
        const expenseCategoriesData: Record<string, number> = {}
        const incomeCategoriesData: Record<string, number> = {}

        // Index des colonnes
        const dateIndex = headers.findIndex(h => h.toLowerCase() === 'date')
        const amountIndex = headers.findIndex(
          h => h.toLowerCase() === 'montant'
        )
        const categoryIndex = headers.findIndex(
          h => h.toLowerCase() === 'catégorie'
        )
        const subCategoryIndex = headers.findIndex(
          h => h.toLowerCase() === 'sous-catégorie'
        )
        const descriptionIndex = headers.findIndex(
          h => h.toLowerCase() === 'description'
        )
        const accountIndex = headers.findIndex(
          h => h.toLowerCase() === 'compte'
        )
        const noteIndex = headers.findIndex(h => h.toLowerCase() === 'note')

        dataLines.forEach(line => {
          if (!line.trim()) return

          // Parsing CSV avec séparateur point-virgule et gestion des guillemets
          const parts = line
            .split(';')
            .map(part => part.replace(/^"|"$/g, '').trim())

          if (parts.length >= headers.length) {
            const date = dateIndex >= 0 ? parts[dateIndex] || '' : ''
            const description =
              descriptionIndex >= 0 ? parts[descriptionIndex] || '' : ''
            const account = accountIndex >= 0 ? parts[accountIndex] || '' : ''
            const note = noteIndex >= 0 ? parts[noteIndex] || '' : ''

            // Extraction de la date
            if (date) {
              dates.push(date)
            }

            // Extraction du montant
            if (amountIndex >= 0 && parts[amountIndex]) {
              const amount = parseFloat(parts[amountIndex].replace(',', '.'))
              if (!isNaN(amount)) {
                amounts.push(amount)

                // Gestion des catégories selon les règles Bankin :
                // - Pour les dépenses (montant négatif) : utiliser "Catégorie"
                // - Pour les revenus (montant positif) : utiliser "Sous-Catégorie"
                let category = ''
                let transactionType: 'expense' | 'income' = 'expense'

                if (amount < 0 && categoryIndex >= 0 && parts[categoryIndex]) {
                  category = parts[categoryIndex] || ''
                  if (category) {
                    transactionType = 'expense'
                    categories.add(category)
                    expenseCategories.add(category)
                    expenseAmounts.push(Math.abs(amount)) // Valeur absolue pour les dépenses

                    // Agrégation par catégorie pour les dépenses
                    expenseCategoriesData[category] =
                      (expenseCategoriesData[category] || 0) + Math.abs(amount)
                  }
                } else if (
                  amount > 0 &&
                  subCategoryIndex >= 0 &&
                  parts[subCategoryIndex]
                ) {
                  category = parts[subCategoryIndex] || ''
                  if (category) {
                    transactionType = 'income'
                    categories.add(category)
                    incomeCategories.add(category)
                    incomeAmounts.push(amount)

                    // Agrégation par catégorie pour les revenus
                    incomeCategoriesData[category] =
                      (incomeCategoriesData[category] || 0) + amount
                  }
                }

                // Collecte de la transaction individuelle
                if (date && description && category) {
                  transactions.push({
                    date,
                    description,
                    amount,
                    category,
                    account,
                    type: transactionType,
                    note,
                  })
                }
              }
            }
          }
        })

        const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0)
        const totalExpenses = expenseAmounts.reduce(
          (sum, amount) => sum + amount,
          0
        )
        const totalIncome = incomeAmounts.reduce(
          (sum, amount) => sum + amount,
          0
        )
        const sortedDates = dates.filter(d => d).sort()

        resolve({
          isValid: true,
          transactionCount: dataLines.filter(line => line.trim()).length,
          categoryCount: categories.size,
          categories: Array.from(categories),
          dateRange: {
            start: sortedDates[0] || '',
            end: sortedDates[sortedDates.length - 1] || '',
          },
          totalAmount,
          expenses: {
            totalAmount: totalExpenses,
            transactionCount: expenseAmounts.length,
            categories: Array.from(expenseCategories),
            categoriesData: expenseCategoriesData,
          },
          income: {
            totalAmount: totalIncome,
            transactionCount: incomeAmounts.length,
            categories: Array.from(incomeCategories),
            categoriesData: incomeCategoriesData,
          },
          transactions,
          errors: [],
        })
      } catch (_error) {
        resolve({
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
          errors: ["Erreur lors de l'analyse du fichier CSV"],
        })
      }
    }

    reader.onerror = () => {
      reject(new Error('Erreur lors de la lecture du fichier'))
    }

    reader.readAsText(file, 'utf-8')
  })
}

/**
 * Composable pour gérer l'upload de fichiers CSV Bankin
 * Respecte le principe de responsabilité unique et externalise la logique métier
 */
export function useFileUpload() {
  const uploadState = ref<UploadState>({
    isUploading: false,
    isSuccess: false,
    error: null,
  })

  const uploadedFile = ref<CsvFile | null>(null)
  const analysisResult = ref<CsvAnalysisResult | null>(null)

  /**
   * Valide le type de fichier CSV
   */
  const isValidCsvFile = (file: File): boolean => {
    const validTypes = ['text/csv', 'application/csv', '.csv']
    const hasValidType = validTypes.some(
      type => file.type === type || file.name.toLowerCase().endsWith('.csv')
    )
    const maxSize = 10 * 1024 * 1024 // 10MB

    return hasValidType && file.size <= maxSize
  }

  /**
   * Gère l'upload du fichier CSV
   */
  const handleFileUpload = async (file: File): Promise<void> => {
    uploadState.value = {
      isUploading: true,
      isSuccess: false,
      error: null,
    }

    try {
      // Validation du fichier
      if (!isValidCsvFile(file)) {
        throw new Error(
          'Veuillez sélectionner un fichier CSV valide (max 10MB)'
        )
      }

      // Analyse du contenu CSV
      const result = await analyzeCsvFile(file)
      analysisResult.value = result

      if (!result.isValid) {
        throw new Error(result.errors?.join(', ') || 'Fichier CSV invalide')
      }

      // Stockage des informations du fichier
      uploadedFile.value = {
        file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      }

      uploadState.value = {
        isUploading: false,
        isSuccess: true,
        error: null,
      }
    } catch (_error) {
      const error = _error as Error
      uploadState.value = {
        isUploading: false,
        isSuccess: false,
        error: error.message || "Erreur lors de l'upload",
      }
      analysisResult.value = null
    }
  }

  /**
   * Remet à zéro l'état de l'upload
   */
  const resetUpload = (): void => {
    uploadState.value = {
      isUploading: false,
      isSuccess: false,
      error: null,
    }
    uploadedFile.value = null
    analysisResult.value = null
  }

  // Computed properties pour l'interface
  const canUpload = computed(() => !uploadState.value.isUploading)
  const hasError = computed(() => uploadState.value.error !== null)
  const isComplete = computed(
    () => uploadState.value.isSuccess && uploadedFile.value !== null
  )

  return {
    uploadState: uploadState.value,
    uploadedFile,
    analysisResult,
    handleFileUpload,
    resetUpload,
    canUpload,
    hasError,
    isComplete,
    isValidCsvFile,
  }
}

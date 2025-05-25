import { ref, computed } from 'vue'
import type { CsvFile, UploadState, CsvAnalysisResult } from '@/types'

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
            errors: [
              'Le fichier CSV doit contenir au moins une ligne de données',
            ],
          })
          return
        }

        // Vérification des en-têtes typiques Bankin
        const headers = lines[0]?.toLowerCase() || ''
        const requiredHeaders = ['date', 'libelle', 'montant', 'catégorie']
        const hasValidHeaders = requiredHeaders.some(
          header =>
            headers.includes(header) ||
            headers.includes(header.replace('é', 'e'))
        )

        if (!hasValidHeaders) {
          resolve({
            isValid: false,
            transactionCount: 0,
            categoryCount: 0,
            categories: [],
            dateRange: { start: '', end: '' },
            totalAmount: 0,
            errors: ['Format CSV Bankin non reconnu. Vérifiez les en-têtes.'],
          })
          return
        }

        // Analyse des données (simulation basique)
        const dataLines = lines.slice(1)
        const categories = new Set<string>()
        const amounts: number[] = []
        const dates: string[] = []

        dataLines.forEach(line => {
          const parts = line.split(',')
          if (parts.length >= 4) {
            // Extraction basique (à améliorer selon le format exact Bankin)
            categories.add(parts[3]?.trim() || 'Non catégorisé')
            const amount = parseFloat(parts[2]?.replace(',', '.') || '0')
            if (!isNaN(amount)) amounts.push(amount)
            dates.push(parts[0]?.trim() || '')
          }
        })

        const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0)
        const sortedDates = dates.filter(d => d).sort()

        resolve({
          isValid: true,
          transactionCount: dataLines.length,
          categoryCount: categories.size,
          categories: Array.from(categories),
          dateRange: {
            start: sortedDates[0] || '',
            end: sortedDates[sortedDates.length - 1] || '',
          },
          totalAmount,
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

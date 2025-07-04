import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileUpload } from './useFileUpload'
import { FileFactory } from '@/test/factories'

describe('useFileUpload', () => {
  let fileUpload: ReturnType<typeof useFileUpload>

  beforeEach(() => {
    fileUpload = useFileUpload()
    // Reset des mocks
    vi.clearAllMocks()
  })

  describe('Validation des fichiers', () => {
    it('devrait accepter un fichier CSV valide', () => {
      const file = FileFactory.createCsvFile('test,content', 'test.csv')

      const isValid = fileUpload.isValidCsvFile(file)

      expect(isValid).toBe(true)
    })

    it('devrait rejeter un fichier non-CSV', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })

      const isValid = fileUpload.isValidCsvFile(file)

      expect(isValid).toBe(false)
    })

    it('devrait rejeter un fichier trop volumineux', () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024) // 11MB
      const file = FileFactory.createCsvFile(largeContent, 'large.csv')

      const isValid = fileUpload.isValidCsvFile(file)

      expect(isValid).toBe(false)
    })

    it('devrait accepter les fichiers avec extension .csv même sans type MIME', () => {
      const file = new File(['csv,content'], 'test.csv', { type: '' })

      const isValid = fileUpload.isValidCsvFile(file)

      expect(isValid).toBe(true)
    })
  })

  describe('Analyse des fichiers CSV Bankin', () => {
    it('devrait analyser correctement un CSV Bankin valide', async () => {
      const file = FileFactory.createValidBankinCsv()

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.uploadState.value.isSuccess).toBe(true)
      expect(fileUpload.uploadState.value.error).toBeNull()
      expect(fileUpload.analysisResult.value).toBeDefined()
      expect(fileUpload.analysisResult.value?.isValid).toBe(true)
      expect(fileUpload.analysisResult.value?.transactionCount).toBeGreaterThan(
        0
      )
    })

    it('devrait rejeter un CSV au format invalide', async () => {
      const file = FileFactory.createInvalidCsv()

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      expect(fileUpload.uploadState.value.error).toBeDefined()
      expect(fileUpload.uploadState.value.error).not.toBeNull()
      if (fileUpload.uploadState.value.error) {
        expect(fileUpload.uploadState.value.error).toContain(
          'Format CSV Bankin non reconnu'
        )
      }
      // L'analysisResult peut être null en cas d'erreur de format
      if (fileUpload.analysisResult.value) {
        expect(fileUpload.analysisResult.value.isValid).toBe(false)
      }
    })

    it('devrait parser correctement les transactions avec montants négatifs (dépenses)', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;Supermarché;Compte Courant;-45.67;Alimentation;Supermarché;Test;Non`
      const file = FileFactory.createCsvFile(csvContent, 'test.csv')

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.analysisResult.value?.transactions).toHaveLength(1)
      const transaction = fileUpload.analysisResult.value?.transactions[0]
      expect(transaction?.type).toBe('expense')
      expect(transaction?.amount).toBe(-45.67)
      expect(transaction?.category).toBe('Alimentation')
    })

    it('devrait parser correctement les transactions avec montants positifs (revenus)', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;Salaire;Compte Courant;2500.00;Revenus;Salaire;Test;Oui`
      const file = FileFactory.createCsvFile(csvContent, 'test.csv')

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.analysisResult.value?.transactions).toHaveLength(1)
      const transaction = fileUpload.analysisResult.value?.transactions[0]
      expect(transaction?.type).toBe('income')
      expect(transaction?.amount).toBe(2500.0)
      expect(transaction?.category).toBe('Salaire')
    })

    it('devrait gérer les dates au format français DD/MM/YYYY', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
31/12/2024;Test;Compte Courant;-10.00;Test;Test;Test;Non`
      const file = FileFactory.createCsvFile(csvContent, 'test.csv')

      await fileUpload.handleFileUpload(file)

      const result = fileUpload.analysisResult.value
      expect(result?.dateRange.start).toBe('31/12/2024')
      expect(result?.dateRange.end).toBe('31/12/2024')
    })

    it('devrait calculer correctement les totaux par catégorie', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;Supermarché 1;Compte Courant;-30.00;Alimentation;Supermarché;Test;Non
16/12/2024;Supermarché 2;Compte Courant;-20.00;Alimentation;Supermarché;Test;Non
17/12/2024;Restaurant;Compte Courant;-25.00;Alimentation;Restaurant;Test;Non`
      const file = FileFactory.createCsvFile(csvContent, 'test.csv')

      await fileUpload.handleFileUpload(file)

      const result = fileUpload.analysisResult.value
      expect(result?.expenses.categoriesData['Alimentation']).toBe(75.0)
      expect(result?.expenses.totalAmount).toBe(75.0)
      expect(result?.expenses.transactionCount).toBe(3)
    })

    it('devrait gérer les champs avec guillemets et retours à la ligne', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
15/12/2024;"Description avec ""guillemets""";Compte Courant;-10.00;Test;Test;"Note avec
retour à la ligne";Non`
      const file = FileFactory.createCsvFile(csvContent, 'test.csv')

      await fileUpload.handleFileUpload(file)

      const transaction = fileUpload.analysisResult.value?.transactions[0]
      expect(transaction?.description).toContain('guillemets')
      expect(transaction?.note).toContain('retour à la ligne')
    })
  })

  describe('Gestion des états', () => {
    it("devrait être dans l'état initial correct", () => {
      expect(fileUpload.uploadState.value.isUploading).toBe(false)
      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      expect(fileUpload.uploadState.value.error).toBeNull()
      expect(fileUpload.canUpload.value).toBe(true)
      expect(fileUpload.hasError.value).toBe(false)
      expect(fileUpload.isComplete.value).toBe(false)
    })

    it("devrait passer en état de chargement pendant l'upload", async () => {
      const file = FileFactory.createValidBankinCsv()

      const uploadPromise = fileUpload.handleFileUpload(file)

      // Vérifier l'état pendant le chargement
      expect(fileUpload.uploadState.value.isUploading).toBe(true)
      expect(fileUpload.canUpload.value).toBe(false)

      await uploadPromise

      // Vérifier l'état après le chargement
      expect(fileUpload.uploadState.value.isUploading).toBe(false)
      expect(fileUpload.canUpload.value).toBe(true)
    })

    it('devrait gérer les erreurs correctement', async () => {
      const invalidFile = new File(['invalid'], 'test.txt', {
        type: 'text/plain',
      })

      await fileUpload.handleFileUpload(invalidFile)

      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      expect(fileUpload.uploadState.value.error).toBeDefined()
      expect(fileUpload.hasError.value).toBe(true)
      expect(fileUpload.isComplete.value).toBe(false)
    })

    it("devrait permettre de reset l'état", () => {
      // Simuler un état après upload
      fileUpload.uploadedFile.value = {
        file: FileFactory.createCsvFile(),
        name: 'test.csv',
        size: 1000,
        lastModified: Date.now(),
      }
      fileUpload.uploadState.value.isSuccess = true

      fileUpload.resetUpload()

      expect(fileUpload.uploadState.value.isUploading).toBe(false)
      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      expect(fileUpload.uploadState.value.error).toBeNull()
      expect(fileUpload.uploadedFile.value).toBeNull()
      expect(fileUpload.analysisResult.value).toBeNull()
    })
  })

  describe('Performance avec gros fichiers', () => {
    it('devrait traiter un gros fichier sans timeout', async () => {
      const largeFile = FileFactory.createLargeCsv(1000)

      const startTime = Date.now()
      await fileUpload.handleFileUpload(largeFile)
      const endTime = Date.now()

      expect(fileUpload.uploadState.value.isSuccess).toBe(true)
      expect(fileUpload.analysisResult.value?.transactionCount).toBe(1000)

      // Vérifier que ça prend moins de 5 secondes
      expect(endTime - startTime).toBeLessThan(5000)
    }, 10000) // Timeout de 10 secondes pour ce test
  })

  describe('Gestion des erreurs spécifiques', () => {
    it('devrait gérer une erreur de lecture de fichier', async () => {
      // Mock FileReader pour simuler une erreur
      const originalFileReader = global.FileReader
      global.FileReader = class MockFileReader {
        onerror: ((event: ProgressEvent<FileReader>) => void) | null = null

        readAsText() {
          setTimeout(() => {
            if (this.onerror) {
              const errorEvent = new Error(
                'Read error'
              ) as unknown as ProgressEvent<FileReader>
              this.onerror(errorEvent)
            }
          }, 10)
        }
      } as unknown as typeof FileReader

      const file = FileFactory.createValidBankinCsv()

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      expect(fileUpload.uploadState.value.error).toContain(
        'Erreur lors de la lecture du fichier'
      )

      // Restaurer FileReader
      global.FileReader = originalFileReader
    })

    it('devrait rejeter un fichier vide', async () => {
      const emptyFile = FileFactory.createCsvFile('', 'empty.csv')

      await fileUpload.handleFileUpload(emptyFile)

      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      // Pour un fichier vide, l'erreur peut être dans uploadState.error ou analysisResult
      expect(
        fileUpload.uploadState.value.error ||
          fileUpload.analysisResult.value?.errors?.length
      ).toBeDefined()
    })

    it('devrait rejeter un fichier avec seulement des en-têtes', async () => {
      const csvContent =
        'Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée'
      const file = FileFactory.createCsvFile(csvContent, 'headers-only.csv')

      await fileUpload.handleFileUpload(file)

      expect(fileUpload.uploadState.value.isSuccess).toBe(false)
      // Pour un fichier avec seulement des en-têtes, l'erreur peut être gérée différemment
      expect(
        fileUpload.uploadState.value.error ||
          (fileUpload.analysisResult.value &&
            !fileUpload.analysisResult.value.isValid)
      ).toBeTruthy()
    })
  })

  describe('Computed properties', () => {
    it("canUpload devrait être false pendant l'upload", async () => {
      expect(fileUpload.canUpload.value).toBe(true)

      const file = FileFactory.createValidBankinCsv()
      const uploadPromise = fileUpload.handleFileUpload(file)

      expect(fileUpload.canUpload.value).toBe(false)

      await uploadPromise
      expect(fileUpload.canUpload.value).toBe(true)
    })

    it("hasError devrait refléter la présence d'erreurs", async () => {
      expect(fileUpload.hasError.value).toBe(false)

      const invalidFile = new File(['invalid'], 'test.txt', {
        type: 'text/plain',
      })
      await fileUpload.handleFileUpload(invalidFile)

      expect(fileUpload.hasError.value).toBe(true)
    })

    it('isComplete devrait être true après un upload réussi', async () => {
      expect(fileUpload.isComplete.value).toBe(false)

      const file = FileFactory.createValidBankinCsv()
      await fileUpload.handleFileUpload(file)

      expect(fileUpload.isComplete.value).toBe(true)
    })
  })
})

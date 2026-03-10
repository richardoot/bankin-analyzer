<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    api,
    type ImportTransactionDto,
    type ImportPreviewResultDto,
  } from '@/lib/api'
  import {
    useChunkedImport,
    PartialImportError,
  } from '@/composables/useChunkedImport'
  import DuplicatesReviewModal from '@/components/DuplicatesReviewModal.vue'

  const router = useRouter()
  const {
    progress,
    chunkedPreviewImport,
    chunkedImportTransactions,
    resetProgress,
  } = useChunkedImport()

  const file = ref<File | null>(null)
  const isDragOver = ref(false)
  const isUploading = ref(false)
  const isPreviewLoading = ref(false)
  const error = ref<string | null>(null)
  const parsedTransactions = ref<ImportTransactionDto[]>([])
  const showPreview = ref(false)
  const showDuplicatesModal = ref(false)
  const previewResult = ref<ImportPreviewResultDto | null>(null)
  const partialImportError = ref<PartialImportError | null>(null)

  // Show progress bar during chunking
  const showProgressBar = computed(() => {
    return (
      progress.value.phase === 'hashing' ||
      progress.value.phase === 'previewing' ||
      progress.value.phase === 'importing'
    )
  })

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    isDragOver.value = true
  }

  function handleDragLeave() {
    isDragOver.value = false
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragOver.value = false
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
      processFile(input.files[0])
    }
  }

  async function processFile(selectedFile: File) {
    if (!selectedFile.name.endsWith('.csv')) {
      error.value = 'Veuillez sélectionner un fichier CSV'
      return
    }

    file.value = selectedFile
    error.value = null

    try {
      const text = await selectedFile.text()
      const transactions = parseCSV(text)
      parsedTransactions.value = transactions
      showPreview.value = true
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du parsing du CSV'
    }
  }

  function parseCSV(csvText: string): ImportTransactionDto[] {
    const lines = csvText.split('\n')
    if (lines.length < 2) {
      throw new Error('Le fichier CSV est vide ou invalide')
    }

    // Parse header - Bankin format uses semicolon
    const headerLine = lines[0].replace(/"/g, '').trim()
    const headers = headerLine.split(';').map(h => h.toLowerCase().trim())

    // Expected headers: Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
    const dateIdx = headers.findIndex(h => h === 'date')
    const descIdx = headers.findIndex(h => h === 'description')
    const accountIdx = headers.findIndex(h => h === 'compte')
    const amountIdx = headers.findIndex(h => h === 'montant')
    const categoryIdx = headers.findIndex(
      h => h.includes('cat') && !h.includes('sous')
    )
    const subcategoryIdx = headers.findIndex(
      h => h.includes('sous-cat') || h.includes('sous cat')
    )
    const noteIdx = headers.findIndex(h => h === 'note')
    const pointedIdx = headers.findIndex(h => h.includes('point'))

    if (dateIdx === -1 || amountIdx === -1) {
      throw new Error(
        'Format CSV invalide: colonnes Date ou Montant manquantes'
      )
    }

    const transactions: ImportTransactionDto[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Parse CSV line with quoted fields
      const values = parseCSVLine(line)
      if (values.length < headers.length) continue

      const rawDate = values[dateIdx] || ''
      const description = values[descIdx] || ''
      const account = values[accountIdx] || ''
      const rawAmount = values[amountIdx] || '0'
      const rawCategory = values[categoryIdx] || 'Autre'
      const subcategory = values[subcategoryIdx] || undefined
      const note = values[noteIdx] || undefined
      const rawPointed = values[pointedIdx] || 'Non'

      // Parse amount - handle Unicode minus sign (U+2212) used by Bankin
      const amount = parseFloat(
        rawAmount
          .replace(/\s/g, '')
          .replace(',', '.')
          .replace(/[€$£]/g, '')
          .replace('−', '-')
      )
      if (isNaN(amount)) continue

      // Parse date DD/MM/YYYY to ISO
      const dateParts = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (!dateParts) continue
      const isoDate = new Date(
        parseInt(dateParts[3]),
        parseInt(dateParts[2]) - 1,
        parseInt(dateParts[1])
      ).toISOString()

      // Parse pointed
      const isPointed = rawPointed.toLowerCase() === 'oui'

      // For income transactions, use subcategory as category
      // (Bankin always uses "Entrées d'argent" as category for income)
      const isIncome = amount >= 0
      const category = isIncome && subcategory ? subcategory : rawCategory

      transactions.push({
        date: isoDate,
        description,
        amount,
        category,
        subcategory: subcategory || undefined,
        account,
        type: isIncome ? 'INCOME' : 'EXPENSE',
        note: note || undefined,
        isPointed,
      })
    }

    if (transactions.length === 0) {
      throw new Error('Aucune transaction valide trouvée dans le fichier')
    }

    return transactions
  }

  function parseCSVLine(line: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ';' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    values.push(current.trim())
    return values
  }

  async function submitImport() {
    if (parsedTransactions.value.length === 0) return

    isPreviewLoading.value = true
    error.value = null
    partialImportError.value = null
    resetProgress()

    try {
      // Step 1: Chunked preview to detect duplicates
      const preview = await chunkedPreviewImport(parsedTransactions.value)

      // If duplicates detected, show modal
      if (
        preview.internalDuplicateCount > 0 ||
        preview.externalDuplicateCount > 0
      ) {
        // Convert ConsolidatedPreview to ImportPreviewResultDto format
        previewResult.value = preview as ImportPreviewResultDto
        showDuplicatesModal.value = true
        return
      }

      // No duplicates → Direct import
      await performImport(new Set())
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Erreur lors du preview'
    } finally {
      isPreviewLoading.value = false
    }
  }

  async function performImport(forceIndices: Set<number>) {
    isUploading.value = true
    error.value = null
    partialImportError.value = null
    resetProgress()

    // Start import history BEFORE importing transactions
    const importHistory = await api.startImport({
      totalInFile: parsedTransactions.value.length,
      fileName: file.value?.name,
    })

    try {
      // Chunked import with automatic retry, passing importHistoryId
      const result = await chunkedImportTransactions(
        parsedTransactions.value,
        forceIndices,
        importHistory.id
      )

      // Get unique categories and accounts
      const uniqueCategories = new Set(
        parsedTransactions.value.map(t => t.category)
      )
      const uniqueAccounts = [
        ...new Set(parsedTransactions.value.map(t => t.account)),
      ]

      // Calculate date range from transactions
      const dates = parsedTransactions.value.map(t =>
        new Date(t.date).getTime()
      )
      const dateRangeStart = new Date(Math.min(...dates)).toISOString()
      const dateRangeEnd = new Date(Math.max(...dates)).toISOString()

      // Finalize import history with final stats
      await api.finalizeImport(importHistory.id, {
        transactionsImported: result.imported,
        categoriesCreated: 0, // Categories are created on backend, we don't track new ones here
        duplicatesSkipped: result.duplicates,
        dateRangeStart,
        dateRangeEnd,
        accounts: uniqueAccounts,
      })

      // Navigate to recap page with result
      router.push({
        name: 'import-recap',
        query: {
          imported: result.imported.toString(),
          duplicates: result.duplicates.toString(),
          total: result.total.toString(),
          categories: uniqueCategories.size.toString(),
        },
      })
    } catch (err) {
      if (err instanceof PartialImportError) {
        // Partial import failure - show retry UI
        // The import history stays in IN_PROGRESS status
        // User can delete it from the history page if needed
        partialImportError.value = err
        error.value = `Import echoue au chunk ${err.details.failedAtChunk + 1}/${err.details.chunksTotal}. ${err.details.imported} transactions importees sur ${err.details.total}.`
      } else {
        error.value =
          err instanceof Error ? err.message : "Erreur lors de l'import"
      }
    } finally {
      isUploading.value = false
      showDuplicatesModal.value = false
    }
  }

  function handleDuplicatesConfirm(selectedIndices: Set<number>) {
    performImport(selectedIndices)
  }

  function handleDuplicatesClose() {
    showDuplicatesModal.value = false
    previewResult.value = null
  }

  function cancelImport() {
    file.value = null
    parsedTransactions.value = []
    showPreview.value = false
    error.value = null
    partialImportError.value = null
    resetProgress()
  }

  function retryImport() {
    // Retry the full import - thanks to idempotent design,
    // already imported transactions will be detected as duplicates
    partialImportError.value = null
    error.value = null
    submitImport()
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }
</script>

<template>
  <div
    class="min-h-screen bg-gray-50 dark:bg-slate-800 py-12 transition-colors"
  >
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Import de transactions
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Importez vos transactions depuis un export CSV Bankin
        </p>
      </div>

      <!-- Progress bar during chunking -->
      <div
        v-if="showProgressBar"
        class="mb-6 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="text-sm font-medium text-indigo-700 dark:text-indigo-400"
          >
            {{ progress.message }}
          </span>
          <span class="text-sm text-indigo-600 dark:text-indigo-400"
            >{{ progress.percent }}%</span
          >
        </div>
        <div
          class="w-full bg-indigo-100 dark:bg-indigo-900/30 rounded-full h-2.5"
        >
          <div
            class="bg-indigo-600 dark:bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
            :style="{ width: `${progress.percent}%` }"
          ></div>
        </div>
        <div
          v-if="progress.totalChunks > 1"
          class="mt-2 text-xs text-indigo-500 dark:text-indigo-400"
        >
          Chunk {{ progress.completedChunks }}/{{ progress.totalChunks }}
        </div>
      </div>

      <!-- Partial import error with retry -->
      <div
        v-if="partialImportError"
        class="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4"
      >
        <div class="flex items-start gap-3">
          <svg
            class="w-6 h-6 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div class="flex-1">
            <h3 class="font-medium text-amber-800 dark:text-amber-400">
              Import partiel
            </h3>
            <p class="text-sm text-amber-700 dark:text-amber-400/80 mt-1">
              {{ partialImportError.details.imported }} transactions importees
              sur {{ partialImportError.details.total }}.
            </p>
            <p class="text-xs text-amber-600 dark:text-amber-500 mt-2">
              Vous pouvez reessayer sans risque de dupliquer les transactions
              deja importees.
            </p>
            <div class="mt-3 flex gap-2">
              <button
                class="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
                @click="retryImport"
              >
                Reessayer l'import
              </button>
              <button
                class="px-3 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                @click="cancelImport"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <div
        v-if="error && !partialImportError"
        class="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
      >
        {{ error }}
      </div>

      <!-- File upload zone -->
      <div
        v-if="!showPreview"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 border-2 border-dashed transition-colors"
        :class="
          isDragOver
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
            : 'border-gray-300 dark:border-slate-600'
        "
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <label
          class="flex flex-col items-center justify-center py-16 cursor-pointer"
        >
          <svg
            class="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span class="text-lg font-medium text-gray-700 dark:text-gray-300">
            Glissez-déposez votre fichier CSV ici
          </span>
          <span class="text-sm text-gray-500 dark:text-gray-400 mt-1"
            >ou cliquez pour parcourir</span
          >
          <input
            type="file"
            accept=".csv"
            class="hidden"
            @change="handleFileSelect"
          />
        </label>
      </div>

      <!-- Preview -->
      <div
        v-if="showPreview"
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
      >
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Aperçu de l'import
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ file?.name }}
            </p>
          </div>
          <button
            class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            @click="cancelImport"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div
            class="bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-4 text-center"
          >
            <div
              class="text-2xl font-bold text-indigo-600 dark:text-indigo-400"
            >
              {{ parsedTransactions.length }}
            </div>
            <div class="text-sm text-indigo-800 dark:text-indigo-300">
              Transactions
            </div>
          </div>
          <div
            class="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 text-center"
          >
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">
              {{ new Set(parsedTransactions.map(t => t.category)).size }}
            </div>
            <div class="text-sm text-green-800 dark:text-green-300">
              Catégories
            </div>
          </div>
          <div
            class="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-4 text-center"
          >
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {{ new Set(parsedTransactions.map(t => t.account)).size }}
            </div>
            <div class="text-sm text-amber-800 dark:text-amber-300">
              Comptes
            </div>
          </div>
        </div>

        <!-- Transaction preview list -->
        <div
          class="border dark:border-slate-700 rounded-lg overflow-hidden mb-6"
        >
          <div
            class="bg-gray-50 dark:bg-slate-800 px-4 py-2 border-b dark:border-slate-700"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Aperçu des 5 premières transactions
            </span>
          </div>
          <div class="divide-y dark:divide-slate-700 max-h-64 overflow-y-auto">
            <div
              v-for="(tx, index) in parsedTransactions.slice(0, 5)"
              :key="index"
              class="px-4 py-3 flex items-center justify-between bg-white dark:bg-slate-900"
            >
              <div>
                <div
                  class="font-medium text-gray-900 dark:text-gray-100 text-sm"
                >
                  {{ tx.description }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ new Date(tx.date).toLocaleDateString('fr-FR') }} -
                  {{ tx.category }}
                </div>
              </div>
              <div
                class="font-semibold"
                :class="
                  tx.amount < 0
                    ? 'text-red-600 dark:text-red-500'
                    : 'text-green-600 dark:text-green-500'
                "
              >
                {{ formatAmount(tx.amount) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-4">
          <button
            class="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            @click="cancelImport"
          >
            Annuler
          </button>
          <button
            :disabled="isUploading || isPreviewLoading"
            class="flex-1 px-4 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            @click="submitImport"
          >
            <span v-if="isPreviewLoading">Analyse en cours...</span>
            <span v-else-if="isUploading">Import en cours...</span>
            <span v-else
              >Importer {{ parsedTransactions.length }} transactions</span
            >
          </button>
        </div>
      </div>
    </div>

    <!-- Duplicates Review Modal -->
    <DuplicatesReviewModal
      :is-open="showDuplicatesModal"
      :loading="isUploading"
      :preview-result="previewResult"
      @close="handleDuplicatesClose"
      @confirm="handleDuplicatesConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { api, type ImportTransactionDto } from '@/lib/api'

  const router = useRouter()

  const file = ref<File | null>(null)
  const isDragOver = ref(false)
  const isUploading = ref(false)
  const error = ref<string | null>(null)
  const parsedTransactions = ref<ImportTransactionDto[]>([])
  const showPreview = ref(false)

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
      const category = values[categoryIdx] || 'Autre'
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

      transactions.push({
        date: isoDate,
        description,
        amount,
        category,
        subcategory: subcategory || undefined,
        account,
        type: amount < 0 ? 'EXPENSE' : 'INCOME',
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

    isUploading.value = true
    error.value = null

    try {
      const result = await api.importTransactions(parsedTransactions.value)

      // Get unique categories count
      const uniqueCategories = new Set(
        parsedTransactions.value.map(t => t.category)
      )

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
      error.value =
        err instanceof Error ? err.message : "Erreur lors de l'import"
    } finally {
      isUploading.value = false
    }
  }

  function cancelImport() {
    file.value = null
    parsedTransactions.value = []
    showPreview.value = false
    error.value = null
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Import de transactions</h1>
        <p class="mt-2 text-gray-600">
          Importez vos transactions depuis un export CSV Bankin
        </p>
      </div>

      <!-- Error message -->
      <div
        v-if="error"
        class="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"
      >
        {{ error }}
      </div>

      <!-- File upload zone -->
      <div
        v-if="!showPreview"
        class="bg-white rounded-xl shadow-sm border-2 border-dashed transition-colors"
        :class="
          isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
        "
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <label
          class="flex flex-col items-center justify-center py-16 cursor-pointer"
        >
          <svg
            class="w-16 h-16 text-gray-400 mb-4"
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
          <span class="text-lg font-medium text-gray-700">
            Glissez-déposez votre fichier CSV ici
          </span>
          <span class="text-sm text-gray-500 mt-1"
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
      <div v-if="showPreview" class="bg-white rounded-xl shadow-sm p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">
              Aperçu de l'import
            </h2>
            <p class="text-sm text-gray-500">{{ file?.name }}</p>
          </div>
          <button
            @click="cancelImport"
            class="text-gray-500 hover:text-gray-700"
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
          <div class="bg-indigo-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-indigo-600">
              {{ parsedTransactions.length }}
            </div>
            <div class="text-sm text-indigo-800">Transactions</div>
          </div>
          <div class="bg-green-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-green-600">
              {{ new Set(parsedTransactions.map(t => t.category)).size }}
            </div>
            <div class="text-sm text-green-800">Catégories</div>
          </div>
          <div class="bg-amber-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-amber-600">
              {{ new Set(parsedTransactions.map(t => t.account)).size }}
            </div>
            <div class="text-sm text-amber-800">Comptes</div>
          </div>
        </div>

        <!-- Transaction preview list -->
        <div class="border rounded-lg overflow-hidden mb-6">
          <div class="bg-gray-50 px-4 py-2 border-b">
            <span class="text-sm font-medium text-gray-700">
              Aperçu des 5 premières transactions
            </span>
          </div>
          <div class="divide-y max-h-64 overflow-y-auto">
            <div
              v-for="(tx, index) in parsedTransactions.slice(0, 5)"
              :key="index"
              class="px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div class="font-medium text-gray-900 text-sm">
                  {{ tx.description }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ new Date(tx.date).toLocaleDateString('fr-FR') }} -
                  {{ tx.category }}
                </div>
              </div>
              <div
                class="font-semibold"
                :class="tx.amount < 0 ? 'text-red-600' : 'text-green-600'"
              >
                {{ formatAmount(tx.amount) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-4">
          <button
            @click="cancelImport"
            class="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            @click="submitImport"
            :disabled="isUploading"
            class="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isUploading">Import en cours...</span>
            <span v-else
              >Importer {{ parsedTransactions.length }} transactions</span
            >
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

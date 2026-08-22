/**
 * Composable for chunked transaction imports.
 * Handles large imports (>1000 transactions) by:
 * 1. Pre-deduplicating internal duplicates client-side
 * 2. Chunking into 200-transaction batches
 * 3. Automatic retry with exponential backoff
 * 4. Consolidating responses
 */

import { ref } from 'vue'
import { api } from '@/lib/api'
import { computeAllHashes } from '@/lib/hashUtils'
import type {
  ImportTransactionDto,
  ImportPreviewResultDto,
  ImportResultDto,
  InternalDuplicateDto,
  ExternalDuplicateDto,
  UploadedTransactionDto,
} from '@/lib/api'

// Constants
const CHUNK_SIZE = 200 // ~50KB per chunk (well under 100KB limit)
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // Exponential backoff: 1s, 2s, 4s

// Types
export interface ChunkProgress {
  phase: 'idle' | 'hashing' | 'previewing' | 'importing' | 'done' | 'error'
  totalChunks: number
  completedChunks: number
  percent: number
  message: string
  error?: {
    chunkIndex: number
    message: string
    retryCount: number
  }
}

export interface ConsolidatedPreview {
  newCount: number
  internalDuplicateCount: number
  externalDuplicateCount: number
  total: number
  internalDuplicates: InternalDuplicateDto[]
  externalDuplicates: ExternalDuplicateDto[]
}

export class PartialImportError extends Error {
  constructor(
    public details: {
      imported: number
      duplicates: number
      total: number
      failedAtChunk: number
      chunksCompleted: number
      chunksTotal: number
      lastError: Error
    }
  ) {
    super(
      `Import failed at chunk ${details.failedAtChunk + 1}/${details.chunksTotal}`
    )
    this.name = 'PartialImportError'
  }
}

interface PreDeduplicationResult {
  deduplicated: ImportTransactionDto[]
  internalDuplicates: InternalDuplicateDto[]
  indexMapping: Map<number, number> // original index -> deduplicated index
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Pre-deduplicate transactions by computing hashes client-side.
 * Detects internal duplicates (same transaction appearing multiple times in the file).
 */
async function preDeduplicateTransactions(
  transactions: ImportTransactionDto[]
): Promise<PreDeduplicationResult> {
  if (transactions.length === 0) {
    return {
      deduplicated: [],
      internalDuplicates: [],
      indexMapping: new Map(),
    }
  }

  const hashed = await computeAllHashes(transactions)

  // Group by hash to find duplicates
  const hashToIndices = new Map<string, number[]>()
  hashed.forEach(({ hash }, index) => {
    const indices = hashToIndices.get(hash) ?? []
    indices.push(index)
    hashToIndices.set(hash, indices)
  })

  // Build results
  const internalDuplicates: InternalDuplicateDto[] = []
  const deduplicated: ImportTransactionDto[] = []
  const indexMapping = new Map<number, number>()
  const seenHashes = new Set<string>()

  hashed.forEach(({ transaction, hash }, index) => {
    if (seenHashes.has(hash)) return // duplicate already seen -> skip

    const indices = hashToIndices.get(hash) ?? []
    indexMapping.set(index, deduplicated.length)
    deduplicated.push(transaction)
    seenHashes.add(hash)

    if (indices.length > 1) {
      internalDuplicates.push({
        hash,
        indices,
        transactions: indices.map(idx =>
          toUploadedDto(hashed[idx]?.transaction ?? transaction, idx)
        ),
      })
    }
  })

  return { deduplicated, internalDuplicates, indexMapping }
}

/**
 * Convert transaction to UploadedTransactionDto format
 */
function toUploadedDto(
  tx: ImportTransactionDto,
  index: number
): UploadedTransactionDto {
  return {
    index,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    account: tx.account,
    category: tx.category,
    type: tx.type,
    ...(tx.subcategory && { subcategory: tx.subcategory }),
    ...(tx.note && { note: tx.note }),
  }
}

/**
 * Consolidate preview results from multiple chunks
 */
function consolidatePreviewResults(
  chunkResults: ImportPreviewResultDto[],
  frontendInternalDuplicates: InternalDuplicateDto[],
  originalTotal: number
): ConsolidatedPreview {
  let newCount = 0
  let externalDuplicateCount = 0
  const allExternalDuplicates: ExternalDuplicateDto[] = []

  for (const result of chunkResults) {
    newCount += result.newCount
    externalDuplicateCount += result.externalDuplicateCount
    allExternalDuplicates.push(...result.externalDuplicates)
    // Internal duplicates from backend are ignored (we pre-deduplicated)
  }

  return {
    newCount,
    internalDuplicateCount: frontendInternalDuplicates.length,
    externalDuplicateCount,
    total: originalTotal,
    internalDuplicates: frontendInternalDuplicates,
    externalDuplicates: allExternalDuplicates,
  }
}

export function useChunkedImport() {
  const progress = ref<ChunkProgress>({
    phase: 'idle',
    totalChunks: 0,
    completedChunks: 0,
    percent: 0,
    message: '',
  })

  /**
   * Preview import with chunking.
   * Pre-deduplicates on client, then sends chunks to server for external duplicate detection.
   */
  async function chunkedPreviewImport(
    transactions: ImportTransactionDto[]
  ): Promise<ConsolidatedPreview> {
    progress.value = {
      phase: 'hashing',
      totalChunks: 0,
      completedChunks: 0,
      percent: 0,
      message: 'Analyse des transactions...',
    }

    // Pre-deduplicate
    const { deduplicated, internalDuplicates } =
      await preDeduplicateTransactions(transactions)

    const chunks = chunkArray(deduplicated, CHUNK_SIZE)

    progress.value = {
      phase: 'previewing',
      totalChunks: chunks.length,
      completedChunks: 0,
      percent: 0,
      message: `Preview 0/${chunks.length}...`,
    }

    const results: ImportPreviewResultDto[] = []

    for (const [i, chunk] of chunks.entries()) {
      const result = await api.previewImport(chunk)
      results.push(result)

      progress.value = {
        phase: 'previewing',
        totalChunks: chunks.length,
        completedChunks: i + 1,
        percent: Math.round(((i + 1) / chunks.length) * 100),
        message: `Preview ${i + 1}/${chunks.length}...`,
      }
    }

    progress.value = {
      phase: 'done',
      totalChunks: chunks.length,
      completedChunks: chunks.length,
      percent: 100,
      message: 'Analyse terminee',
    }

    return consolidatePreviewResults(
      results,
      internalDuplicates,
      transactions.length
    )
  }

  /**
   * Import transactions with chunking and automatic retry.
   * @param transactions All transactions from CSV
   * @param forceImportIndices Indices of transactions to force-import (bypass duplicate check)
   * @param importHistoryId Optional import history ID to link transactions to
   */
  async function chunkedImportTransactions(
    transactions: ImportTransactionDto[],
    forceImportIndices: Set<number> = new Set(),
    importHistoryId?: string
  ): Promise<ImportResultDto> {
    progress.value = {
      phase: 'hashing',
      totalChunks: 0,
      completedChunks: 0,
      percent: 0,
      message: "Preparation de l'import...",
    }

    // Apply forceImport flags to selected transactions
    const withForceFlags = transactions.map((tx, idx) => ({
      ...tx,
      forceImport: forceImportIndices.has(idx),
    }))

    // Pre-deduplicate (keeping forceImport transactions)
    const { deduplicated } = await preDeduplicateTransactions(withForceFlags)

    const chunks = chunkArray(deduplicated, CHUNK_SIZE)

    progress.value = {
      phase: 'importing',
      totalChunks: chunks.length,
      completedChunks: 0,
      percent: 0,
      message: `Import 0/${chunks.length}...`,
    }

    let totalImported = 0
    let totalDuplicates = 0

    for (const [i, chunk] of chunks.entries()) {
      let success = false
      let lastError: Error | null = null

      // Retry loop with exponential backoff
      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          if (attempt > 0) {
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
            progress.value = {
              ...progress.value,
              message: `Retry ${attempt}/${MAX_RETRIES} chunk ${i + 1}...`,
              error: {
                chunkIndex: i,
                message: lastError?.message || 'Unknown error',
                retryCount: attempt,
              },
            }
            await sleep(delay)
          }

          const result = await api.importTransactions(chunk, importHistoryId)
          totalImported += result.imported
          totalDuplicates += result.duplicates
          success = true

          progress.value = {
            phase: 'importing',
            totalChunks: chunks.length,
            completedChunks: i + 1,
            percent: Math.round(((i + 1) / chunks.length) * 100),
            message: `Import ${i + 1}/${chunks.length}...`,
          }
        } catch (error) {
          lastError = error as Error
        }
      }

      if (!success) {
        progress.value = {
          phase: 'error',
          totalChunks: chunks.length,
          completedChunks: i,
          percent: Math.round((i / chunks.length) * 100),
          message: `Echec au chunk ${i + 1}/${chunks.length}`,
          error: {
            chunkIndex: i,
            message: lastError?.message || 'Unknown error',
            retryCount: MAX_RETRIES,
          },
        }

        throw new PartialImportError({
          imported: totalImported,
          duplicates: totalDuplicates,
          total: transactions.length,
          failedAtChunk: i,
          chunksCompleted: i,
          chunksTotal: chunks.length,
          lastError: lastError ?? new Error('Unknown error'),
        })
      }
    }

    progress.value = {
      phase: 'done',
      totalChunks: chunks.length,
      completedChunks: chunks.length,
      percent: 100,
      message: 'Import termine',
    }

    return {
      imported: totalImported,
      duplicates: totalDuplicates,
      total: transactions.length,
    }
  }

  /**
   * Reset progress state
   */
  function resetProgress() {
    progress.value = {
      phase: 'idle',
      totalChunks: 0,
      completedChunks: 0,
      percent: 0,
      message: '',
    }
  }

  return {
    progress,
    chunkedPreviewImport,
    chunkedImportTransactions,
    resetProgress,
    CHUNK_SIZE,
    PartialImportError,
  }
}

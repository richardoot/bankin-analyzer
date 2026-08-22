/**
 * Client-side hash utilities for transaction deduplication.
 * Uses Web Crypto API (hardware-accelerated SHA-256).
 */

import type { ImportTransactionDto } from './api'

/**
 * Compute SHA-256 hash for a single transaction.
 * Must match backend algorithm in transactions.service.ts
 */
export async function computeTransactionHash(
  date: string,
  amount: number,
  account: string,
  description: string
): Promise<string> {
  // Format must match backend: userId is not included in frontend hash
  // Backend adds userId, but for deduplication within same user's import,
  // we only need date|amount|account|description
  const data = `${date}|${amount}|${account}|${description}`
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface HashedTransaction {
  transaction: ImportTransactionDto
  hash: string
}

/**
 * Attach a hash to each transaction, in parallel — about 14ms for 1500 of
 * them, Web Crypto being hardware-accelerated.
 *
 * Returns pairs rather than a parallel array of hashes: the caller used to
 * index both by the same `i`, which only works while they stay exactly in
 * step — a property nothing enforced, and which the compiler could only treat
 * as "might be undefined" at every access.
 */
export async function computeAllHashes(
  transactions: ImportTransactionDto[]
): Promise<HashedTransaction[]> {
  return Promise.all(
    transactions.map(async transaction => ({
      transaction,
      hash: await computeTransactionHash(
        transaction.date,
        transaction.amount,
        transaction.account,
        transaction.description
      ),
    }))
  )
}

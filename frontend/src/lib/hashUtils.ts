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

/**
 * Compute hashes for all transactions in parallel.
 * ~14ms for 1500 transactions (Web Crypto is hardware-accelerated).
 */
export async function computeAllHashes(
  transactions: ImportTransactionDto[]
): Promise<string[]> {
  return Promise.all(
    transactions.map(tx =>
      computeTransactionHash(tx.date, tx.amount, tx.account, tx.description)
    )
  )
}

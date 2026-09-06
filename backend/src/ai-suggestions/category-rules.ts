/**
 * Filing a transaction the way this user already files transactions like it —
 * before ever asking the model.
 *
 * ## Why this comes first
 *
 * The user has already answered this question, over and over, for every
 * transaction already in their ledger. "CARTE FITNESS PARK" has been filed
 * under Sport a dozen times; asking a language model what it might be is
 * both slower and less sure than reading the answer already given. This is
 * the same reasoning `account-mapping.ts` uses to propose which account a
 * bank account is, applied to which category a transaction is.
 *
 * ## What it refuses to do
 *
 * Propose a category it is not sure of. A merchant that has moved between
 * categories over time — the same shop for both weekly groceries and a
 * one-off appliance — is exactly the case a low agreement share reports as
 * `null` rather than guesses at; a person, or the model with more to go on
 * than a bare label, decides instead.
 */

import { labelSimilarity } from '../bank-sync/reconciliation'

/** A transaction already filed, as evidence for filing the next one like it. */
export interface CategorizedHistoryRow {
  description: string
  type: 'EXPENSE' | 'INCOME'
  categoryId: string
  categoryName: string
  subcategoryId: string | null
  subcategoryName: string | null
}

export interface CategoryRuleMatch {
  categoryId: string
  categoryName: string
  subcategoryId: string | null
  subcategoryName: string | null
  /** Share of the similar history that agreed on this filing. */
  confidence: number
  /** How many similar rows this was decided from. */
  matches: number
}

export interface CategoryRuleOptions {
  /**
   * Two labels count as the same merchant above this score. 0.5 already
   * demands most of the shorter label's words to reappear in the other —
   * loose enough for a repeated card line's padding to differ, tight enough
   * to keep two unrelated merchants apart.
   */
  similarityThreshold?: number
  /** Share of the similar history that must agree before this proposes anything. */
  minimumConfidence?: number
  /** Similar rows needed before agreement means something. */
  minimumMatches?: number
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.5
const DEFAULT_MINIMUM_CONFIDENCE = 0.75
const DEFAULT_MINIMUM_MATCHES = 3

/**
 * Find, for one description, the history rows close enough to call the same
 * merchant — same sign (a purchase is never evidence for a transfer in), at
 * or above the similarity floor.
 */
function similarTo(
  description: string,
  type: 'EXPENSE' | 'INCOME',
  history: CategorizedHistoryRow[],
  similarityThreshold: number
): CategorizedHistoryRow[] {
  return history.filter(
    row =>
      row.type === type &&
      labelSimilarity(description, row.description) >= similarityThreshold
  )
}

/**
 * Propose a category for `description` from how similar rows were filed
 * before, or `null` when the history is too thin or too divided to trust.
 */
export function proposeCategoryFromHistory(
  description: string,
  type: 'EXPENSE' | 'INCOME',
  history: CategorizedHistoryRow[],
  options: CategoryRuleOptions = {}
): CategoryRuleMatch | null {
  const similarityThreshold =
    options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD
  const minimumConfidence =
    options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE
  const minimumMatches = options.minimumMatches ?? DEFAULT_MINIMUM_MATCHES

  const similar = similarTo(description, type, history, similarityThreshold)
  if (similar.length < minimumMatches) return null

  const countByFiling = new Map<string, number>()
  for (const row of similar) {
    const key = `${row.categoryId}|${row.subcategoryId ?? ''}`
    countByFiling.set(key, (countByFiling.get(key) ?? 0) + 1)
  }

  let bestKey: string | null = null
  let bestCount = 0
  for (const [key, count] of countByFiling) {
    if (count > bestCount) {
      bestKey = key
      bestCount = count
    }
  }
  if (!bestKey) return null

  const confidence = bestCount / similar.length
  if (confidence < minimumConfidence) return null

  const winner = similar.find(
    row => `${row.categoryId}|${row.subcategoryId ?? ''}` === bestKey
  )
  if (!winner) return null

  return {
    categoryId: winner.categoryId,
    categoryName: winner.categoryName,
    subcategoryId: winner.subcategoryId,
    subcategoryName: winner.subcategoryName,
    confidence,
    matches: similar.length,
  }
}

/**
 * The similar rows this user has already filed, ranked closest first — few
 * enough to ground a model's prompt without inflating it, and only ever
 * shown for a description a rule was not already sure enough about to file
 * on its own.
 */
export function findSimilarExamples(
  description: string,
  type: 'EXPENSE' | 'INCOME',
  history: CategorizedHistoryRow[],
  options: { limit?: number; minimumSimilarity?: number } = {}
): CategorizedHistoryRow[] {
  const limit = options.limit ?? 2
  const minimumSimilarity = options.minimumSimilarity ?? 0.3

  return history
    .filter(row => row.type === type)
    .map(row => ({ row, score: labelSimilarity(description, row.description) }))
    .filter(({ score }) => score >= minimumSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row)
}

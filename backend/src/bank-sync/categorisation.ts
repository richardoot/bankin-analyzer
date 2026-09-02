/**
 * Filing a synced transaction by looking at how its like were filed before.
 *
 * ## Why the history first, and the model second
 *
 * The bank sends a label and nothing else — phase 2 measured
 * `merchant_category_code` at zero across Revolut, CIC and Boursorama — so
 * something has to infer the category. There is a language model wired into
 * this project already, and it would do it.
 *
 * It should not do it first. The ledger holds thousands of transactions the
 * user filed themselves, and most synced rows are the same handful of
 * merchants over again: a gym subscription, a toll, a supermarket. For those
 * the answer is not a judgement call, it is a lookup — free, instant,
 * deterministic, and closer to the user's own habits than any model, because
 * it *is* the user's own habits. The model is worth its cost on what is
 * genuinely new.
 *
 * ## The rule it inherits
 *
 * The same one `transaction-categorizer.ts` states for the model: a wrong
 * category is worse than none. An unfiled transaction is visible and takes one
 * click to fix; a confidently wrong one is invisible and quietly distorts
 * every total it touches. So this proposes nothing rather than something
 * plausible.
 */

import { labelSimilarity, normalizeLabel } from './reconciliation'

export type TransactionKind = 'EXPENSE' | 'INCOME'

/** A transaction the user has already filed, reduced to what teaches us. */
export interface FiledExample {
  description: string
  /**
   * Categories carry a sign in this schema, and a category of the wrong sign
   * is not a near miss: it files a refund as a purchase and moves two totals
   * at once.
   */
  type: TransactionKind
  categoryId: string
  subcategoryId: string | null
  subcategoryName: string | null
}

/** Where a transaction should go, and how sure we are. */
export interface FilingProposal {
  categoryId: string
  subcategoryId: string | null
  subcategoryName: string | null
  /** Share of the supporting examples that agreed. */
  confidence: number
  /** How many past transactions back it. */
  support: number
  /**
   * How it was reached. Worth reporting: a decision from an identical merchant
   * label is a different claim from one reached by resemblance.
   */
  basis: 'sameMerchant' | 'similarMerchant'
}

export interface CategorisationOptions {
  /** Share of supporting examples that must agree. */
  minimumConfidence?: number
  /** Past transactions needed before their agreement counts. */
  minimumSupport?: number
  /**
   * Past transactions needed when the merchant only *resembles* a known one.
   *
   * Higher than `minimumSupport` on purpose. One precedent under an identical
   * merchant name is a fact about that merchant; one precedent under a
   * merchant that merely looks similar is a coincidence with a sample size of
   * one, and filing on it is how a category spreads by contagion.
   */
  minimumSupportForResemblance?: number
  /**
   * How alike two labels must be to count as the same merchant when no exact
   * match exists.
   */
  minimumSimilarity?: number
}

const DEFAULT_MINIMUM_CONFIDENCE = 0.7
const DEFAULT_MINIMUM_SUPPORT = 1
const DEFAULT_MINIMUM_SUPPORT_FOR_RESEMBLANCE = 3
const DEFAULT_MINIMUM_SIMILARITY = 0.6

/**
 * The merchant a label names, as a key two sources can agree on.
 *
 * Normalising is not enough on its own. Bankin writes `CB Fitness Park` where
 * the bank writes `CARTE 26/08/26 FITNESS PARK CB*7962`; both survive
 * normalisation with a different leading `CB`, and keying on the result files
 * one merchant under two names. Keeping only the words long enough to mean
 * something — the same filter the similarity uses — collapses them, and
 * sorting makes the order the sources chose irrelevant.
 */
export function merchantKey(label: string): string {
  return normalizeLabel(label)
    .split(' ')
    .filter(word => word.length > 2)
    .sort()
    .join(' ')
}

/**
 * Past transactions grouped by merchant.
 *
 * `CARTE 06/08/26 FITNESS PARK CB*7962` and `CB Fitness Park` are one merchant
 * seen twice, from two sources that word it differently.
 */
export type MerchantIndex = Map<string, FiledExample[]>

export function buildMerchantIndex(examples: FiledExample[]): MerchantIndex {
  const index: MerchantIndex = new Map()
  for (const example of examples) {
    const key = merchantKey(example.description)
    if (key === '') continue
    const bucket = index.get(key)
    if (bucket) bucket.push(example)
    else index.set(key, [example])
  }
  return index
}

/** The filing most of a group agrees on, with the share that agreed. */
function majorityFiling(
  examples: FiledExample[]
): { filing: FiledExample; confidence: number } | null {
  if (examples.length === 0) return null

  const counts = new Map<string, { example: FiledExample; count: number }>()
  for (const example of examples) {
    // Grouped on the pair: filing a transaction under the right category but
    // the wrong subcategory is still filing it wrong.
    const key = `${example.categoryId}|${example.subcategoryId ?? ''}`
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { example, count: 1 })
  }

  const ranked = [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.example.categoryId.localeCompare(b.example.categoryId)
  )
  const best = ranked[0]
  if (!best) return null

  return { filing: best.example, confidence: best.count / examples.length }
}

/**
 * Propose where a label belongs, or nothing.
 *
 * Tries the identical merchant first and settles for a resemblance only when
 * there is no identical one — a recurring charge should never be filed by
 * analogy when the user has already filed it by name thirty times.
 */
export function proposeFiling(
  label: string,
  type: TransactionKind,
  index: MerchantIndex,
  options: CategorisationOptions = {}
): FilingProposal | null {
  const minimumConfidence =
    options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE
  const minimumSupport = options.minimumSupport ?? DEFAULT_MINIMUM_SUPPORT
  const minimumSimilarity =
    options.minimumSimilarity ?? DEFAULT_MINIMUM_SIMILARITY
  const minimumSupportForResemblance =
    options.minimumSupportForResemblance ??
    DEFAULT_MINIMUM_SUPPORT_FOR_RESEMBLANCE

  const key = merchantKey(label)
  if (key === '') return null

  // Only precedents of the same sign teach anything here. A merchant can
  // legitimately appear on both sides — a shop that also refunds — and the
  // categories the user files each under are different by construction.
  const ofSameKind = (examples: FiledExample[]): FiledExample[] =>
    examples.filter(example => example.type === type)

  const exact = ofSameKind(index.get(key) ?? [])
  if (exact.length >= minimumSupport) {
    const majority = majorityFiling(exact)
    if (majority && majority.confidence >= minimumConfidence) {
      return {
        categoryId: majority.filing.categoryId,
        subcategoryId: majority.filing.subcategoryId,
        subcategoryName: majority.filing.subcategoryName,
        confidence: majority.confidence,
        support: exact.length,
        basis: 'sameMerchant',
      }
    }
    // An identical merchant the user files inconsistently is not a case for
    // guessing: they disagree with themselves, and so should we.
    return null
  }

  // No identical merchant. Fall back to the closest one, if it is close.
  let bestKey: string | null = null
  let bestScore = 0
  for (const [candidate, examples] of index) {
    if (ofSameKind(examples).length === 0) continue
    const score = labelSimilarity(key, candidate)
    if (score > bestScore) {
      bestScore = score
      bestKey = candidate
    }
  }

  if (bestKey === null || bestScore < minimumSimilarity) return null

  const neighbours = ofSameKind(index.get(bestKey) ?? [])
  if (neighbours.length < minimumSupportForResemblance) return null

  const majority = majorityFiling(neighbours)
  if (!majority || majority.confidence < minimumConfidence) return null

  return {
    categoryId: majority.filing.categoryId,
    subcategoryId: majority.filing.subcategoryId,
    subcategoryName: majority.filing.subcategoryName,
    // Discounted by how alike the labels were: a resemblance is a weaker claim
    // than a name, and the number that gets reported should say so.
    confidence: majority.confidence * bestScore,
    support: neighbours.length,
    basis: 'similarMerchant',
  }
}

export interface CategorisationSummary {
  total: number
  sameMerchant: number
  similarMerchant: number
  unresolved: number
}

/** Count the outcomes — what decides whether a model is worth calling at all. */
export function summarise(
  proposals: (FilingProposal | null)[]
): CategorisationSummary {
  return {
    total: proposals.length,
    sameMerchant: proposals.filter(p => p?.basis === 'sameMerchant').length,
    similarMerchant: proposals.filter(p => p?.basis === 'similarMerchant')
      .length,
    unresolved: proposals.filter(p => p === null).length,
  }
}

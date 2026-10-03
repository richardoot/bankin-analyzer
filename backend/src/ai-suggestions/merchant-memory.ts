/**
 * What every user, together, has already said about a merchant.
 *
 * ## Why it exists
 *
 * `category-rules.ts` answers from one user's own ledger: "CARREFOUR" is
 * groceries because this user filed it so a dozen times. A new account has
 * no ledger, so its first import goes straight to the model for the most
 * ordinary labels there are. But the catalogue gives every user the same
 * headings under the same keys — `food.supermarket` is the same thing in
 * every account — so what one user filed under a key is readable by all,
 * and a merchant filed the same way across accounts is as sure a rule as a
 * merchant filed the same way across months.
 *
 * ## What it knows, and nothing more
 *
 * A label, a sign, a catalogue key, how many times that pairing was made
 * and by whom — the "whom" being opaque user ids, kept in process memory
 * only so that two labels of the same merchant can be told to come from two
 * users rather than one, and reduced to a count before anything leaves
 * here. Never an amount, a date, an account or a name. A user-created
 * subcategory has no key and so never enters it; neither does a legacy
 * category, nor a transfer.
 *
 * ## What it refuses to do
 *
 * The same as the rules: propose a filing it is not sure of. A label that
 * several users file in different ways reports null, and the model, with
 * the catalogue's descriptions to go on, decides instead.
 */

import { normalizeLabel } from '../bank-sync/reconciliation'
import type {
  CategoryChoice,
  SubcategoryChoice,
} from './transaction-categorizer'

/** One aggregate row, as the database answers it: per user and label. */
export interface MerchantFilingRow {
  description: string
  type: 'EXPENSE' | 'INCOME'
  categoryKey: string
  subcategoryKey: string | null
  count: number
  userId: string
}

interface MerchantFiling {
  categoryKey: string
  subcategoryKey: string | null
  count: number
  userIds: Set<string>
}

/** Every filing seen for one merchant and sign, by `${type}|${merchantKey}`. */
export type MerchantMemory = Map<string, MerchantFiling[]>

export interface MerchantMemoryMatch {
  categoryKey: string
  subcategoryKey: string | null
  /** Share of the merchant's filings that agreed on this one. */
  confidence: number
  /** How many filings were counted for the merchant. */
  count: number
  /** How many users stand behind the winning filing. */
  users: number
}

export interface MerchantMemoryOptions {
  /** Share of the merchant's filings that must agree before this proposes anything. */
  minimumConfidence?: number
  /** Filings of the winning kind needed before agreement means something. */
  minimumCount?: number
  /**
   * Users behind the winning filing. Two makes it shared knowledge; one is
   * a single user's habit, which their own rules already carry.
   */
  minimumUsers?: number
  /**
   * Two merchant keys count as the same merchant above this score — the
   * same Jaccard measure the rules use on labels, applied to the words left
   * once the bank's noise is gone.
   */
  similarityThreshold?: number
}

const DEFAULT_MINIMUM_CONFIDENCE = 0.8
const DEFAULT_MINIMUM_COUNT = 5
const DEFAULT_MINIMUM_USERS = 2
const DEFAULT_SIMILARITY_THRESHOLD = 0.5

/** What a bank writes about the movement, not about the merchant. */
const NOISE_WORDS = new Set([
  'carte',
  'paiement',
  'achat',
  'prlv',
  'prelevement',
  'sepa',
  'vir',
  'virement',
  'inst',
  'instantane',
  'ref',
  'reference',
  'facture',
  'echeance',
  'remboursement',
  'remb',
  'web',
  'internet',
  'mandat',
  'france',
  'fra',
  'par',
  'pour',
  'des',
  'les',
  'the',
  'and',
])

/**
 * The merchant a bank label names, once the bank's own noise is gone:
 * card-line prefixes, card numbers, references, dates and amounts, and the
 * words that describe the movement rather than the counterparty. Sorted,
 * so two orderings of the same words meet.
 */
export function merchantKey(description: string): string {
  const words = normalizeLabel(description)
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 2 && !/\d/.test(word))
    .filter(word => !NOISE_WORDS.has(word))
  return [...new Set(words)].sort().join(' ')
}

/** Fold the aggregate rows into one entry per merchant and sign. */
export function buildMerchantMemory(rows: MerchantFilingRow[]): MerchantMemory {
  const memory: MerchantMemory = new Map()
  for (const row of rows) {
    const key = merchantKey(row.description)
    if (key === '') continue
    const entryKey = `${row.type}|${key}`
    const filings = memory.get(entryKey) ?? []
    const same = filings.find(
      f =>
        f.categoryKey === row.categoryKey &&
        f.subcategoryKey === row.subcategoryKey
    )
    if (same) {
      same.count += row.count
      same.userIds.add(row.userId)
    } else {
      filings.push({
        categoryKey: row.categoryKey,
        subcategoryKey: row.subcategoryKey,
        count: row.count,
        userIds: new Set([row.userId]),
      })
    }
    memory.set(entryKey, filings)
  }
  return memory
}

/** The words of a merchant key, for comparing two of them. */
function wordsOf(key: string): Set<string> {
  return new Set(key.split(' ').filter(word => word !== ''))
}

/** Jaccard index over the merchant words, the same measure the rules use. */
function keySimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared++
  return shared / (left.size + right.size - shared)
}

/**
 * Propose a catalogue filing for `description` from how everyone filed the
 * merchant, or `null` when nobody did, or not enough, or not alike.
 *
 * The lookup is by resemblance, not identity: "CARREFOUR MARKET BORDEAUX"
 * and "CARREFOUR MARKET" are the same merchant with a city appended, so
 * every remembered label close enough to the description is pooled before
 * the vote, exactly as the rules pool a user's own similar rows.
 */
export function proposeFromMerchantMemory(
  description: string,
  type: 'EXPENSE' | 'INCOME',
  memory: MerchantMemory,
  options: MerchantMemoryOptions = {}
): MerchantMemoryMatch | null {
  const minimumConfidence =
    options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE
  const minimumCount = options.minimumCount ?? DEFAULT_MINIMUM_COUNT
  const minimumUsers = options.minimumUsers ?? DEFAULT_MINIMUM_USERS
  const similarityThreshold =
    options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD

  const key = merchantKey(description)
  if (key === '') return null
  const words = wordsOf(key)
  const prefix = `${type}|`

  const pooled = new Map<string, MerchantFiling>()
  for (const [entryKey, filings] of memory) {
    if (!entryKey.startsWith(prefix)) continue
    const entryWords = wordsOf(entryKey.slice(prefix.length))
    if (keySimilarity(words, entryWords) < similarityThreshold) continue
    for (const filing of filings) {
      const id = `${filing.categoryKey}|${filing.subcategoryKey ?? ''}`
      const current = pooled.get(id)
      if (current) {
        current.count += filing.count
        for (const userId of filing.userIds) current.userIds.add(userId)
      } else {
        pooled.set(id, { ...filing, userIds: new Set(filing.userIds) })
      }
    }
  }
  if (pooled.size === 0) return null

  let total = 0
  let best: MerchantFiling | null = null
  for (const filing of pooled.values()) {
    total += filing.count
    if (!best || filing.count > best.count) best = filing
  }
  if (!best) return null
  if (best.count < minimumCount || best.userIds.size < minimumUsers) {
    return null
  }

  const confidence = best.count / total
  if (confidence < minimumConfidence) return null

  return {
    categoryKey: best.categoryKey,
    subcategoryKey: best.subcategoryKey,
    confidence,
    count: total,
    users: best.userIds.size,
  }
}

/**
 * The user's own rows for a catalogue filing, or `null` when the user does
 * not carry the key — a catalogue not yet provisioned, or a subcategory
 * the catalogue dropped since. The category alone is kept when only the
 * subcategory is missing: the coarse filing is still worth having.
 */
export function resolveCatalogFiling(
  match: { categoryKey: string; subcategoryKey: string | null },
  categories: CategoryChoice[],
  subcategories: SubcategoryChoice[]
): {
  categoryId: string
  subcategoryId: string | null
  subcategoryName: string | null
} | null {
  const category = categories.find(c => c.catalogKey === match.categoryKey)
  if (!category) return null
  const subcategory = match.subcategoryKey
    ? subcategories.find(
        s =>
          s.categoryId === category.id && s.catalogKey === match.subcategoryKey
      )
    : undefined
  return {
    categoryId: category.id,
    subcategoryId: subcategory?.id ?? null,
    subcategoryName: subcategory?.name ?? null,
  }
}

/**
 * Turning what the model answered into filing the database will accept.
 *
 * ## Why it is separate
 *
 * The model is asked to pick from a list, but nothing about a language model
 * guarantees it will. It can answer with a category that does not exist, one
 * that belongs to the other sign, a subcategory from a different parent, or an
 * index for a transaction that was never in the batch. Every one of those has
 * to be dropped rather than written, and that is ordinary logic — no API call,
 * no Prisma — so it lives here where each rule can be tested on its own.
 *
 * The rule throughout is the same: a wrong category is worse than none. An
 * unfiled transaction is visible and takes one click to fix; a confidently
 * wrong one is invisible and quietly distorts every total it touches.
 */

export interface CategoryChoice {
  id: string
  name: string
  type: 'EXPENSE' | 'INCOME'
}

export interface SubcategoryChoice {
  id: string
  name: string
  categoryId: string
}

export interface CategorizableTransaction {
  /** Position in the batch; what the model answers with. */
  index: number
  description: string
  amount: number
  type: 'EXPENSE' | 'INCOME'
}

/** One line as the model returned it, before anything is trusted. */
export interface RawAssignment {
  index: number
  category: string
  subcategory?: string | null | undefined
}

export interface ResolvedAssignment {
  index: number
  categoryId: string
  subcategoryId: string | null
  /** The denormalized label the dashboard groups on. */
  subcategoryName: string | null
}

/** Fold case, accents and stray spacing, so a near-miss on spelling still lands. */
export function matchKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split into batches, so one oversized prompt cannot swallow a whole import. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1')
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

/**
 * Keep only the answers that name something real, of the right sign, for a
 * transaction that was actually asked about.
 *
 * A subcategory belonging to another category is dropped on its own rather
 * than taking the category down with it: the coarse filing is still worth
 * having when the fine one is wrong.
 */
export function resolveAssignments(
  raw: RawAssignment[],
  transactions: CategorizableTransaction[],
  categories: CategoryChoice[],
  subcategories: SubcategoryChoice[]
): ResolvedAssignment[] {
  const transactionByIndex = new Map(transactions.map(t => [t.index, t]))

  // Keyed by name *and* sign: the same name can exist on both sides, and only
  // one of them can receive a given transaction.
  const categoryByKey = new Map<string, CategoryChoice>()
  for (const category of categories) {
    const key = `${category.type}|${matchKey(category.name)}`
    if (!categoryByKey.has(key)) categoryByKey.set(key, category)
  }

  const subcategoryByKey = new Map<string, SubcategoryChoice>()
  for (const subcategory of subcategories) {
    const key = `${subcategory.categoryId}|${matchKey(subcategory.name)}`
    if (!subcategoryByKey.has(key)) subcategoryByKey.set(key, subcategory)
  }

  const resolved = new Map<number, ResolvedAssignment>()

  for (const entry of raw) {
    const transaction = transactionByIndex.get(entry.index)
    if (!transaction) continue
    // First answer wins: a model that repeats an index is not more sure.
    if (resolved.has(entry.index)) continue

    const category = categoryByKey.get(
      `${transaction.type}|${matchKey(entry.category ?? '')}`
    )
    if (!category) continue

    const subcategory = entry.subcategory
      ? subcategoryByKey.get(`${category.id}|${matchKey(entry.subcategory)}`)
      : undefined

    resolved.set(entry.index, {
      index: entry.index,
      categoryId: category.id,
      subcategoryId: subcategory?.id ?? null,
      subcategoryName: subcategory?.name ?? null,
    })
  }

  return [...resolved.values()].sort((a, b) => a.index - b.index)
}

/** The catalogue the model is allowed to choose from, as prompt text. */
export function describeCatalog(
  categories: CategoryChoice[],
  subcategories: SubcategoryChoice[],
  type: 'EXPENSE' | 'INCOME'
): string {
  const subsByCategory = new Map<string, string[]>()
  for (const subcategory of subcategories) {
    const list = subsByCategory.get(subcategory.categoryId) ?? []
    list.push(subcategory.name)
    subsByCategory.set(subcategory.categoryId, list)
  }

  return categories
    .filter(category => category.type === type)
    .map(category => {
      const subs = subsByCategory.get(category.id) ?? []
      return subs.length > 0
        ? `- ${category.name} (sous-categories: ${subs.join(', ')})`
        : `- ${category.name}`
    })
    .join('\n')
}

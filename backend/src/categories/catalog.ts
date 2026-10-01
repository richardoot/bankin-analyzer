/**
 * The category catalogue: the one vocabulary every user files under.
 *
 * ## Why a file, not a table
 *
 * The catalogue is versioned, reviewed and tested like code, because it *is*
 * the product's opinion on what a household spends on. A table would let it
 * drift per environment and put its rules (one "Autre" per category, an
 * attribute on every expense subcategory) out of reach of a unit test.
 *
 * The data lives in `catalog.data.json` rather than here so the seed — plain
 * JavaScript run outside the Nest build — reads the very same file. This
 * module is what the application sees: the JSON checked against the rules
 * below at load time, typed, and indexed by key. Not `catalog.json`: under
 * ts-node, `require('./catalog')` resolves `.json` before `.ts`, and every
 * command-line script would load the raw data in place of this module.
 *
 * ## The rules
 *
 *  - Keys are stable and readable (`housing`, `housing.rent`). A label can be
 *    reworded without touching the key, which is what the database stores.
 *  - Every expense subcategory carries a nature and a rhythm: that is where
 *    every calculation reads them. Income and transfer subcategories carry
 *    neither, deliberately — no calculation needs them yet, and inventing
 *    values nobody reads would only look like a decision.
 *  - Every expense and income category ends with an "Autre" subcategory,
 *    whose attributes become the category's defaults for a transaction filed
 *    at the category alone. Transfer categories are flat: "Virement interne /
 *    Autre" would be a heading with nothing to distinguish it from.
 */

import {
  CategoryNature,
  CategoryRhythm,
  TransactionType,
} from '../generated/prisma'
import catalogJson from './catalog.data.json'

export const OTHER_SUFFIX = '.other'

export interface CatalogSubcategory {
  key: string
  label: string
  /** Null on income and transfer subcategories. */
  nature: CategoryNature | null
  /** Null on income and transfer subcategories. */
  rhythm: CategoryRhythm | null
  description: string | null
}

export interface CatalogCategory {
  key: string
  type: TransactionType
  label: string
  icon: string
  description: string
  subcategories: CatalogSubcategory[]
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(`Category catalogue: ${message}`)
    this.name = 'CatalogError'
  }
}

const NATURES = new Set<string>(Object.values(CategoryNature))
const RHYTHMS = new Set<string>(Object.values(CategoryRhythm))
const TYPES = new Set<string>(Object.values(TransactionType))
const KEY_PATTERN = /^[a-z][a-z0-9-]*$/
const SUBKEY_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  where: string
): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogError(`${where}: "${field}" must be a non-empty string`)
  }
  return value
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  where: string
): string | null {
  const value = record[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogError(`${where}: "${field}" must be a non-empty string`)
  }
  return value
}

function parseSubcategory(
  raw: unknown,
  category: { key: string; type: TransactionType }
): CatalogSubcategory {
  if (!isRecord(raw)) {
    throw new CatalogError(`${category.key}: subcategory is not an object`)
  }
  const key = requireString(raw, 'key', category.key)
  const where = key
  if (!SUBKEY_PATTERN.test(key)) {
    throw new CatalogError(`${where}: subcategory key is malformed`)
  }
  if (!key.startsWith(`${category.key}.`)) {
    throw new CatalogError(
      `${where}: subcategory key must be prefixed by its category "${category.key}"`
    )
  }
  const label = requireString(raw, 'label', where)
  const description = optionalString(raw, 'description', where)

  const nature = raw['nature']
  const rhythm = raw['rhythm']
  if (category.type === TransactionType.EXPENSE) {
    if (typeof nature !== 'string' || !NATURES.has(nature)) {
      throw new CatalogError(`${where}: expense subcategory needs a nature`)
    }
    if (typeof rhythm !== 'string' || !RHYTHMS.has(rhythm)) {
      throw new CatalogError(`${where}: expense subcategory needs a rhythm`)
    }
    return {
      key,
      label,
      nature: nature as CategoryNature,
      rhythm: rhythm as CategoryRhythm,
      description,
    }
  }

  if (nature !== undefined || rhythm !== undefined) {
    throw new CatalogError(
      `${where}: only expense subcategories carry a nature and a rhythm`
    )
  }
  return { key, label, nature: null, rhythm: null, description }
}

function parseCategory(raw: unknown): CatalogCategory {
  if (!isRecord(raw)) throw new CatalogError('category is not an object')
  const key = requireString(raw, 'key', 'category')
  if (!KEY_PATTERN.test(key)) {
    throw new CatalogError(`${key}: category key is malformed`)
  }
  const type = requireString(raw, 'type', key)
  if (!TYPES.has(type)) throw new CatalogError(`${key}: unknown type "${type}"`)
  const label = requireString(raw, 'label', key)
  const icon = requireString(raw, 'icon', key)
  const description = requireString(raw, 'description', key)

  const rawSubcategories = raw['subcategories']
  if (!Array.isArray(rawSubcategories)) {
    throw new CatalogError(`${key}: "subcategories" must be an array`)
  }
  const category = { key, type: type as TransactionType }
  const subcategories = rawSubcategories.map(sub =>
    parseSubcategory(sub, category)
  )

  const others = subcategories.filter(sub => sub.key === key + OTHER_SUFFIX)
  if (type === TransactionType.TRANSFER) {
    if (others.length > 0) {
      throw new CatalogError(`${key}: transfer categories have no "Autre"`)
    }
  } else if (others.length !== 1) {
    throw new CatalogError(`${key}: exactly one "${key}${OTHER_SUFFIX}" needed`)
  } else if (subcategories[subcategories.length - 1] !== others[0]) {
    throw new CatalogError(`${key}: "Autre" must come last`)
  }

  const labels = new Set<string>()
  for (const sub of subcategories) {
    const normalized = sub.label.toLocaleLowerCase('fr')
    if (labels.has(normalized)) {
      throw new CatalogError(
        `${key}: duplicate subcategory label "${sub.label}"`
      )
    }
    labels.add(normalized)
  }

  return {
    key,
    type: type as TransactionType,
    label,
    icon,
    description,
    subcategories,
  }
}

/**
 * Check a raw catalogue against the rules and hand back the typed one.
 * Exported so the tests can feed it deliberately broken inputs; the
 * application only ever sees `CATEGORY_CATALOG`.
 */
export function parseCatalog(raw: unknown): CatalogCategory[] {
  if (!isRecord(raw) || !Array.isArray(raw['categories'])) {
    throw new CatalogError('"categories" must be an array')
  }
  const categories = raw['categories'].map(parseCategory)

  const keys = new Set<string>()
  const labelsByType = new Map<TransactionType, Set<string>>()
  for (const category of categories) {
    if (keys.has(category.key)) {
      throw new CatalogError(`duplicate key "${category.key}"`)
    }
    keys.add(category.key)
    for (const sub of category.subcategories) {
      if (keys.has(sub.key)) {
        throw new CatalogError(`duplicate key "${sub.key}"`)
      }
      keys.add(sub.key)
    }

    const labels = labelsByType.get(category.type) ?? new Set<string>()
    const normalized = category.label.toLocaleLowerCase('fr')
    if (labels.has(normalized)) {
      throw new CatalogError(
        `duplicate ${category.type} category label "${category.label}"`
      )
    }
    labels.add(normalized)
    labelsByType.set(category.type, labels)
  }

  return categories
}

/** The catalogue, checked once at load. A broken file fails the boot. */
export const CATEGORY_CATALOG: readonly CatalogCategory[] =
  parseCatalog(catalogJson)

const categoryByKey = new Map(CATEGORY_CATALOG.map(c => [c.key, c]))
const subcategoryByKey = new Map(
  CATEGORY_CATALOG.flatMap(c =>
    c.subcategories.map(sub => [sub.key, { category: c, subcategory: sub }])
  )
)

export function catalogCategory(key: string): CatalogCategory | undefined {
  return categoryByKey.get(key)
}

export function catalogSubcategory(
  key: string
): { category: CatalogCategory; subcategory: CatalogSubcategory } | undefined {
  return subcategoryByKey.get(key)
}

/** The "Autre" entry of a category, or undefined for a flat transfer one. */
export function otherOf(
  category: CatalogCategory
): CatalogSubcategory | undefined {
  return category.subcategories.find(
    sub => sub.key === category.key + OTHER_SUFFIX
  )
}

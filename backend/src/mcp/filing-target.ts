/**
 * Where an agent asks a transaction to be filed, resolved against what the
 * user actually has.
 *
 * An agent knows categories by name far more often than by id: a reclassing
 * document is written by and for a person. So a target can be named, and the
 * name is compared the way a person reads it — case, accents and stray spaces
 * ignored. What a name never does is guess: one that matches nothing, or more
 * than one row, is refused with a reason the agent can act on. Writing to the
 * wrong category is worse than not writing.
 *
 * Since the category framework, a target can also be a **catalogue key**
 * (`housing`, `housing.rent`): the same in every account, so a document written
 * once applies to anyone, and an agent cannot misspell it into another heading.
 * A key resolves against the user's own rows; one the catalogue knows but the
 * user lacks means the catalogue was never provisioned, and says so.
 *
 * A target can also be **nothing**: `categoryId` or `categoryKey` given as
 * `null` sends the transaction back to "à classer".
 *
 * Pure on purpose: no Prisma, no request. The caller hands in the user's
 * categories and subcategories, which is also what keeps another user's ids out
 * of reach — an id that is not in the list is unknown, whoever it belongs to.
 */
import type { TransactionType } from '../generated/prisma'
import { catalogCategory, catalogSubcategory } from '../categories/catalog'
import { normalizeName } from '../categories/category-catalog.plan'

export { normalizeName }

export interface FilingCategory {
  id: string
  name: string
  type: TransactionType
  catalogKey?: string | null
}

export interface FilingSubcategory {
  id: string
  name: string
  categoryId: string
  catalogKey?: string | null
}

export interface FilingTargetInput {
  /** `null` unfiles the transaction. */
  categoryId?: string | null | undefined
  categoryName?: string | undefined
  /** A catalogue key; `null` unfiles the transaction. */
  categoryKey?: string | null | undefined
  subcategoryId?: string | undefined
  subcategoryName?: string | undefined
  subcategoryKey?: string | undefined
}

export type FilingTargetError =
  | 'CATEGORY_MISSING'
  | 'CATEGORY_ID_AND_NAME'
  | 'SUBCATEGORY_ID_AND_NAME'
  | 'CATEGORY_UNKNOWN'
  | 'CATEGORY_AMBIGUOUS'
  | 'SUBCATEGORY_UNKNOWN'
  | 'SUBCATEGORY_AMBIGUOUS'
  | 'SUBCATEGORY_NOT_IN_CATEGORY'
  | 'CATALOG_NOT_PROVISIONED'
  | 'UNFILE_WITH_SUBCATEGORY'

export type FilingTarget =
  | {
      ok: true
      /** Null when the target is "à classer". */
      category: FilingCategory | null
      subcategory: FilingSubcategory | null
    }
  | { ok: false; error: FilingTargetError; message: string }

function refuse(error: FilingTargetError, message: string): FilingTarget {
  return { ok: false, error, message }
}

function isGiven(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}

/**
 * Resolve a target to one category and at most one subcategory of it.
 *
 * Giving neither subcategory field files the transaction under the category
 * alone, clearing any subcategory it had: a subcategory belongs to exactly one
 * category, so keeping the old one across a move would be wrong.
 */
export function resolveFilingTarget(
  categories: readonly FilingCategory[],
  subcategories: readonly FilingSubcategory[],
  target: FilingTargetInput
): FilingTarget {
  const unfile = target.categoryId === null || target.categoryKey === null
  const hasCategoryId = isGiven(target.categoryId ?? undefined)
  const hasCategoryName = isGiven(target.categoryName)
  const hasCategoryKey = isGiven(target.categoryKey ?? undefined)
  const hasSubcategoryId = isGiven(target.subcategoryId)
  const hasSubcategoryName = isGiven(target.subcategoryName)
  const hasSubcategoryKey = isGiven(target.subcategoryKey)

  const categoryWays =
    Number(hasCategoryId) + Number(hasCategoryName) + Number(hasCategoryKey)
  const subcategoryWays =
    Number(hasSubcategoryId) +
    Number(hasSubcategoryName) +
    Number(hasSubcategoryKey)

  if (unfile) {
    if (categoryWays > 0) {
      return refuse(
        'CATEGORY_ID_AND_NAME',
        'Une cible nulle déclasse la transaction : ne donner aucune autre désignation de catégorie.'
      )
    }
    if (subcategoryWays > 0) {
      return refuse(
        'UNFILE_WITH_SUBCATEGORY',
        'Une transaction déclassée n’a pas de sous-catégorie : ne pas en donner.'
      )
    }
    return { ok: true, category: null, subcategory: null }
  }

  if (categoryWays > 1) {
    return refuse(
      'CATEGORY_ID_AND_NAME',
      'Donner un seul de categoryId, categoryName ou categoryKey.'
    )
  }
  if (subcategoryWays > 1) {
    return refuse(
      'SUBCATEGORY_ID_AND_NAME',
      'Donner un seul de subcategoryId, subcategoryName ou subcategoryKey.'
    )
  }
  if (categoryWays === 0) {
    return refuse(
      'CATEGORY_MISSING',
      'La catégorie cible manque : donner categoryKey, categoryName ou categoryId, ou null pour déclasser.'
    )
  }

  let category: FilingCategory
  if (hasCategoryKey) {
    const key = target.categoryKey as string
    const found = categories.find(c => c.catalogKey === key)
    if (!found) {
      return catalogCategory(key)
        ? refuse(
            'CATALOG_NOT_PROVISIONED',
            `La catégorie du catalogue « ${key} » manque chez cet utilisateur : le catalogue n’est pas provisionné (script provision-category-catalog).`
          )
        : refuse(
            'CATEGORY_UNKNOWN',
            `« ${key} » n’est pas une clé de catégorie du catalogue.`
          )
    }
    category = found
  } else if (hasCategoryId) {
    const found = categories.find(c => c.id === target.categoryId)
    if (!found) {
      return refuse(
        'CATEGORY_UNKNOWN',
        `Aucune catégorie d'identifiant ${target.categoryId} chez cet utilisateur.`
      )
    }
    category = found
  } else {
    const wanted = normalizeName(target.categoryName as string)
    const matches = categories.filter(c => normalizeName(c.name) === wanted)
    if (matches.length === 0) {
      return refuse(
        'CATEGORY_UNKNOWN',
        `Aucune catégorie nommée « ${target.categoryName} » chez cet utilisateur.`
      )
    }
    if (matches.length > 1) {
      const ids = matches.map(c => `${c.id} (${c.type})`).join(', ')
      return refuse(
        'CATEGORY_AMBIGUOUS',
        `Plusieurs catégories s'appellent « ${target.categoryName} » : ${ids}. Désigner la cible par categoryId.`
      )
    }
    category = matches[0] as FilingCategory
  }

  if (subcategoryWays === 0) {
    return { ok: true, category, subcategory: null }
  }

  if (hasSubcategoryKey) {
    const key = target.subcategoryKey as string
    const entry = catalogSubcategory(key)
    if (!entry) {
      return refuse(
        'SUBCATEGORY_UNKNOWN',
        `« ${key} » n’est pas une clé de sous-catégorie du catalogue.`
      )
    }
    if (category.catalogKey !== entry.category.key) {
      return refuse(
        'SUBCATEGORY_NOT_IN_CATEGORY',
        `La sous-catégorie « ${key} » appartient à « ${entry.category.key} », pas à la catégorie « ${category.name} ».`
      )
    }
    const found = subcategories.find(
      s => s.categoryId === category.id && s.catalogKey === key
    )
    if (!found) {
      return refuse(
        'CATALOG_NOT_PROVISIONED',
        `La sous-catégorie du catalogue « ${key} » manque chez cet utilisateur : le catalogue n’est pas provisionné (script provision-category-catalog).`
      )
    }
    return { ok: true, category, subcategory: found }
  }

  if (hasSubcategoryId) {
    const found = subcategories.find(s => s.id === target.subcategoryId)
    if (!found) {
      return refuse(
        'SUBCATEGORY_UNKNOWN',
        `Aucune sous-catégorie d'identifiant ${target.subcategoryId} chez cet utilisateur.`
      )
    }
    if (found.categoryId !== category.id) {
      return refuse(
        'SUBCATEGORY_NOT_IN_CATEGORY',
        `La sous-catégorie « ${found.name} » n'appartient pas à la catégorie « ${category.name} ».`
      )
    }
    return { ok: true, category, subcategory: found }
  }

  // By name, the search is scoped to the category: the same subcategory name
  // under two categories is legitimate, and the category already says which.
  const wanted = normalizeName(target.subcategoryName as string)
  const matches = subcategories.filter(
    s => s.categoryId === category.id && normalizeName(s.name) === wanted
  )
  if (matches.length === 0) {
    return refuse(
      'SUBCATEGORY_UNKNOWN',
      `Aucune sous-catégorie « ${target.subcategoryName} » dans la catégorie « ${category.name} ». Elle se crée dans l'application, pas par le MCP.`
    )
  }
  // Names are unique per category in the database, but only as typed: « Café »
  // and « Cafe » are two rows that normalize to one.
  if (matches.length > 1) {
    const ids = matches.map(s => `${s.id} (${s.name})`).join(', ')
    return refuse(
      'SUBCATEGORY_AMBIGUOUS',
      `Plusieurs sous-catégories de « ${category.name} » répondent à « ${target.subcategoryName} » : ${ids}. Désigner la cible par subcategoryId.`
    )
  }
  return { ok: true, category, subcategory: matches[0] as FilingSubcategory }
}

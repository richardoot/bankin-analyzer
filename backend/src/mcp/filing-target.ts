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
 * Pure on purpose: no Prisma, no request. The caller hands in the user's
 * categories and subcategories, which is also what keeps another user's ids out
 * of reach — an id that is not in the list is unknown, whoever it belongs to.
 */
import type { TransactionType } from '../generated/prisma'

export interface FilingCategory {
  id: string
  name: string
  type: TransactionType
}

export interface FilingSubcategory {
  id: string
  name: string
  categoryId: string
}

export interface FilingTargetInput {
  categoryId?: string | undefined
  categoryName?: string | undefined
  subcategoryId?: string | undefined
  subcategoryName?: string | undefined
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

export type FilingTarget =
  | {
      ok: true
      category: FilingCategory
      subcategory: FilingSubcategory | null
    }
  | { ok: false; error: FilingTargetError; message: string }

/** Lowercase, no diacritics, inner whitespace collapsed, ends trimmed. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

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
  const hasCategoryId = isGiven(target.categoryId)
  const hasCategoryName = isGiven(target.categoryName)
  const hasSubcategoryId = isGiven(target.subcategoryId)
  const hasSubcategoryName = isGiven(target.subcategoryName)

  if (hasCategoryId && hasCategoryName) {
    return refuse(
      'CATEGORY_ID_AND_NAME',
      'Donner categoryId ou categoryName, pas les deux.'
    )
  }
  if (hasSubcategoryId && hasSubcategoryName) {
    return refuse(
      'SUBCATEGORY_ID_AND_NAME',
      'Donner subcategoryId ou subcategoryName, pas les deux.'
    )
  }
  if (!hasCategoryId && !hasCategoryName) {
    return refuse(
      'CATEGORY_MISSING',
      'La catégorie cible manque : donner categoryId ou categoryName.'
    )
  }

  let category: FilingCategory
  if (hasCategoryId) {
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

  if (!hasSubcategoryId && !hasSubcategoryName) {
    return { ok: true, category, subcategory: null }
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

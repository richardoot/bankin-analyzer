/**
 * What the category framework means for the screens, in one place.
 *
 * A category of the catalogue carries a key and is locked; one without a
 * key predates the catalogue and is waiting to be migrated. The fields are
 * optional on the wire type because older fixtures never had them, so every
 * screen asks here rather than testing the field itself.
 */
import type { CategoryDto, CategoryNature, CategoryRhythm } from './api'

export type CategoryKind = 'EXPENSE' | 'INCOME' | 'TRANSFER'

export function isCatalogCategory(category: CategoryDto): boolean {
  return typeof category.catalogKey === 'string' && category.catalogKey !== ''
}

export function isLegacyCategory(category: CategoryDto): boolean {
  return !isCatalogCategory(category)
}

/** The wire type says EXPENSE or INCOME; transfer rows arrive all the same. */
export function kindOf(category: CategoryDto): CategoryKind {
  return category.type as CategoryKind
}

export const NATURE_LABELS: Record<CategoryNature, string> = {
  ESSENTIAL: 'Essentiel',
  PLEASURE: 'Plaisir',
}

export const RHYTHM_LABELS: Record<CategoryRhythm, string> = {
  COMMITTED: 'Engagé',
  VARIABLE: 'Variable',
}

export const KIND_LABELS: Record<CategoryKind, string> = {
  EXPENSE: 'Dépenses',
  INCOME: 'Revenus',
  TRANSFER: 'Transferts',
}

/** Lower-case and strip diacritics so "energie" matches "Énergie". */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

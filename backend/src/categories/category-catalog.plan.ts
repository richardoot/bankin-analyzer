/**
 * Deciding how the catalogue lands on one user's existing categories, before
 * anything touches the database.
 *
 * ## Adopt, don't duplicate
 *
 * A user who already has a "Logement" expense category does not need a
 * second one: the legacy row is *adopted* — it receives the catalogue key,
 * icon and defaults, and its transactions, budget lines and hidden-list
 * entries stay exactly where they are. Only its subcategories remain to be
 * reconciled, and those follow the same rule one level down: a legacy "Loyer"
 * under an adopted "Logement" becomes `housing.rent`, everything else waits
 * for the migration assistant.
 *
 * The match is on the label alone, normalised for case, accents and spacing.
 * That is deliberately narrow: "Alimentation & Restau." is not "Alimentation",
 * and pouring a legacy category that only *resembles* a catalogue entry into
 * it would be a migration decided without the user. The wider matching lives
 * in the assistant, where the user can see and correct it.
 *
 * ## Pure on purpose
 *
 * Same split as the category migration: the rules here take plain rows and
 * return a plan, so each rule is one test with no Prisma in it. The service
 * and the command-line script carry the plan out.
 */

import type {
  CategoryNature,
  CategoryRhythm,
  TransactionType,
} from '../generated/prisma'
import type { CatalogCategory, CatalogSubcategory } from './catalog'
import { otherOf } from './catalog'

export interface ExistingCategory {
  id: string
  name: string
  type: TransactionType
  catalogKey: string | null
  /** Rows filed under it, subcategories included. Decides what retiring does. */
  transactionCount: number
  /** What the row shows today; compared to the catalogue when given. */
  icon?: string | null
  defaultNature?: CategoryNature | null
  defaultRhythm?: CategoryRhythm | null
}

export interface ExistingSubcategory {
  id: string
  categoryId: string
  name: string
  catalogKey: string | null
  transactionCount: number
  nature?: CategoryNature | null
  rhythm?: CategoryRhythm | null
}

/**
 * A row that already carries its key, brought back in line with what the
 * catalogue says of it today: a label reworded, an attribute revised. The
 * user cannot rename or retune a catalogue row, so what differs is always a
 * catalogue revision, never a choice of theirs to respect.
 */
export interface CategoryRefresh {
  id: string
  catalogKey: string
  name: string
  icon: string
  defaultNature: CategoryNature | null
  defaultRhythm: CategoryRhythm | null
}

export interface SubcategoryRefresh {
  id: string
  catalogKey: string
  name: string
  nature: CategoryNature | null
  rhythm: CategoryRhythm | null
}

/**
 * A row whose catalogue key the catalogue no longer carries — an entry
 * split, moved or dropped in a later version. Empty, it goes; holding
 * transactions, it is handed to the user as their own (the key cleared,
 * label and attributes kept), so nothing is ever lost to a catalogue change
 * and the assistant, or the filing dialog, can finish the job.
 */
export interface Retirement {
  id: string
  name: string
  catalogKey: string
  action: 'delete' | 'release'
}

/** A legacy category that becomes its catalogue entry in place. */
export interface CategoryAdoption {
  id: string
  catalogKey: string
  icon: string
  defaultNature: CategoryNature | null
  defaultRhythm: CategoryRhythm | null
}

/** A legacy subcategory that becomes its catalogue entry in place. */
export interface SubcategoryAdoption {
  id: string
  catalogKey: string
  nature: CategoryNature | null
  rhythm: CategoryRhythm | null
}

/** A catalogue subcategory to create under a category the user already has. */
export interface SubcategoryCreation {
  categoryId: string
  subcategory: CatalogSubcategory
}

export interface ProvisioningPlan {
  /** Catalogue categories the user has nothing for; created with all their subcategories. */
  createCategories: CatalogCategory[]
  adoptCategories: CategoryAdoption[]
  createSubcategories: SubcategoryCreation[]
  adoptSubcategories: SubcategoryAdoption[]
  retireCategories: Retirement[]
  retireSubcategories: Retirement[]
  refreshCategories: CategoryRefresh[]
  refreshSubcategories: SubcategoryRefresh[]
}

export function isEmptyPlan(plan: ProvisioningPlan): boolean {
  return (
    plan.createCategories.length === 0 &&
    plan.adoptCategories.length === 0 &&
    plan.createSubcategories.length === 0 &&
    plan.adoptSubcategories.length === 0 &&
    plan.retireCategories.length === 0 &&
    plan.retireSubcategories.length === 0 &&
    plan.refreshCategories.length === 0 &&
    plan.refreshSubcategories.length === 0
  )
}

/**
 * Lower-case, strip diacritics, collapse whitespace: "Santé " and "sante"
 * are the same heading to a person, so they are to this.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function planCatalogProvisioning(
  catalog: readonly CatalogCategory[],
  categories: ExistingCategory[],
  subcategories: ExistingSubcategory[]
): ProvisioningPlan {
  const plan: ProvisioningPlan = {
    createCategories: [],
    adoptCategories: [],
    createSubcategories: [],
    adoptSubcategories: [],
    retireCategories: [],
    retireSubcategories: [],
    refreshCategories: [],
    refreshSubcategories: [],
  }

  // Keys the catalogue carries today; anything else with a key is retired.
  const knownKeys = new Set<string>()
  for (const entry of catalog) {
    knownKeys.add(entry.key)
    for (const sub of entry.subcategories) knownKeys.add(sub.key)
  }
  const retiredCategoryIds = new Set<string>()
  for (const category of categories) {
    if (category.catalogKey && !knownKeys.has(category.catalogKey)) {
      retiredCategoryIds.add(category.id)
      plan.retireCategories.push({
        id: category.id,
        name: category.name,
        catalogKey: category.catalogKey,
        action: category.transactionCount === 0 ? 'delete' : 'release',
      })
    }
  }
  for (const sub of subcategories) {
    // A subcategory of a deleted category goes with it; of a released one,
    // it is released alongside — the key alone is the reason to touch it.
    if (sub.catalogKey && !knownKeys.has(sub.catalogKey)) {
      const parentDeleted =
        plan.retireCategories.find(r => r.id === sub.categoryId)?.action ===
        'delete'
      if (parentDeleted) continue
      plan.retireSubcategories.push({
        id: sub.id,
        name: sub.name,
        catalogKey: sub.catalogKey,
        action: sub.transactionCount === 0 ? 'delete' : 'release',
      })
    }
  }

  const categoryByKey = new Map<string, ExistingCategory>()
  for (const category of categories) {
    if (category.catalogKey && knownKeys.has(category.catalogKey)) {
      categoryByKey.set(category.catalogKey, category)
    }
  }
  const subcategoryKeys = new Set(
    subcategories
      .map(sub => sub.catalogKey)
      .filter((key): key is string => !!key && knownKeys.has(key))
  )
  const subcategoryByKey = new Map<string, ExistingSubcategory>()
  for (const sub of subcategories) {
    if (sub.catalogKey && knownKeys.has(sub.catalogKey)) {
      subcategoryByKey.set(sub.catalogKey, sub)
    }
  }
  // A legacy row is adopted by at most one entry; without this, two catalogue
  // categories with labels that normalise alike would both claim it.
  const claimed = new Set<string>()

  for (const entry of catalog) {
    let existing = categoryByKey.get(entry.key)

    if (existing) {
      // Already the catalogue's: bring its label and attributes up to date
      // when a revision changed them. Fields the caller did not load are not
      // compared.
      const other = otherOf(entry)
      const wantedNature = other?.nature ?? null
      const wantedRhythm = other?.rhythm ?? null
      const stale =
        existing.name !== entry.label ||
        (existing.icon !== undefined && existing.icon !== entry.icon) ||
        (existing.defaultNature !== undefined &&
          existing.defaultNature !== wantedNature) ||
        (existing.defaultRhythm !== undefined &&
          existing.defaultRhythm !== wantedRhythm)
      if (stale) {
        plan.refreshCategories.push({
          id: existing.id,
          catalogKey: entry.key,
          name: entry.label,
          icon: entry.icon,
          defaultNature: wantedNature,
          defaultRhythm: wantedRhythm,
        })
      }
    }

    if (!existing) {
      const wanted = normalizeName(entry.label)
      existing = categories.find(
        candidate =>
          (candidate.catalogKey === null ||
            retiredCategoryIds.has(candidate.id)) &&
          candidate.type === entry.type &&
          !claimed.has(candidate.id) &&
          normalizeName(candidate.name) === wanted
      )
      if (!existing) {
        plan.createCategories.push(entry)
        continue
      }
      const adopted = existing
      claimed.add(adopted.id)
      plan.retireCategories = plan.retireCategories.filter(
        r => r.id !== adopted.id
      )
      retiredCategoryIds.delete(adopted.id)
      const other = otherOf(entry)
      plan.adoptCategories.push({
        id: existing.id,
        catalogKey: entry.key,
        icon: entry.icon,
        defaultNature: other?.nature ?? null,
        defaultRhythm: other?.rhythm ?? null,
      })
    }

    const ownSubcategories = subcategories.filter(
      sub => sub.categoryId === existing.id
    )
    for (const sub of entry.subcategories) {
      if (subcategoryKeys.has(sub.key)) {
        const row = subcategoryByKey.get(sub.key)
        if (
          row &&
          (row.name !== sub.label ||
            (row.nature !== undefined && row.nature !== sub.nature) ||
            (row.rhythm !== undefined && row.rhythm !== sub.rhythm))
        ) {
          plan.refreshSubcategories.push({
            id: row.id,
            catalogKey: sub.key,
            name: sub.label,
            nature: sub.nature,
            rhythm: sub.rhythm,
          })
        }
        continue
      }
      const wanted = normalizeName(sub.label)
      const candidate = ownSubcategories.find(
        own =>
          (own.catalogKey === null ||
            plan.retireSubcategories.some(r => r.id === own.id)) &&
          !claimed.has(own.id) &&
          normalizeName(own.name) === wanted
      )
      if (candidate) {
        claimed.add(candidate.id)
        plan.retireSubcategories = plan.retireSubcategories.filter(
          r => r.id !== candidate.id
        )
        plan.adoptSubcategories.push({
          id: candidate.id,
          catalogKey: sub.key,
          nature: sub.nature,
          rhythm: sub.rhythm,
        })
      } else {
        plan.createSubcategories.push({
          categoryId: existing.id,
          subcategory: sub,
        })
      }
    }
  }

  return plan
}

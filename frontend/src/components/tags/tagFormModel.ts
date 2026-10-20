/** What a tag is made of, as the form edits it (see TagForm.vue). */
export interface TagFormValue {
  name: string
  color: string
  isExceptional: boolean
  eventStart: string
  eventEnd: string
  /** The project's envelope, a total for the whole event; null when none. */
  budget: number | null
  /** The family the tag is an edition of; null when none. */
  familyId: string | null
  /**
   * The tag's icon. The form does not ask it; a new edition carries over
   * its predecessor's.
   */
  icon?: string | null
}

export const DEFAULT_TAG_COLOR = '#ef4444'

export const TAG_COLORS = [
  DEFAULT_TAG_COLOR,
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
]

/** Spoken names of the swatches: a hex code is not a name. */
export const TAG_COLOR_NAMES: Record<string, string> = {
  [DEFAULT_TAG_COLOR]: 'Rouge',
  '#f97316': 'Orange',
  '#eab308': 'Jaune',
  '#22c55e': 'Vert',
  '#14b8a6': 'Sarcelle',
  '#06b6d4': 'Cyan',
  '#6366f1': 'Indigo',
  '#a855f7': 'Violet',
  '#ec4899': 'Rose',
  '#64748b': 'Gris',
}

export function emptyTagForm(): TagFormValue {
  return {
    name: '',
    color: DEFAULT_TAG_COLOR,
    isExceptional: false,
    eventStart: '',
    eventEnd: '',
    budget: null,
    familyId: null,
  }
}

/**
 * The name of an event's next edition: a name ending in a year (four digits
 * standing on their own) moves on by one, « HYROX Paris 2025 » →
 * « HYROX Paris 2026 ». Any other name is kept as is: « Fêtes de Bayonne »
 * is the same name every summer.
 */
export function nextEditionName(name: string): string {
  return name.replace(
    /(^|\D)(\d{4})$/,
    (_match, before: string, year: string) => `${before}${Number(year) + 1}`
  )
}

/**
 * The creation form, filled for the next edition of a past event: same
 * family, colour and icon, exceptional, the year moved on in the name. The
 * window is left empty — the new dates are not known yet — and so is the
 * envelope, which lives on the family.
 */
export function newEditionForm(tag: {
  name: string
  color: string | null
  icon: string | null
  familyId: string | null
}): TagFormValue {
  return {
    ...emptyTagForm(),
    name: nextEditionName(tag.name.trim()),
    color: tag.color ?? DEFAULT_TAG_COLOR,
    isExceptional: true,
    familyId: tag.familyId,
    icon: tag.icon,
  }
}

/**
 * Names offered while the user has no family yet: shortcuts to create one,
 * nothing written until they confirm. No « Gros achats »: a durable purchase
 * is smoothed, not tagged (agent-os/product/amortization-framework.md).
 */
export const FAMILY_SUGGESTIONS = [
  'Voyages',
  'Compétitions',
  'Concerts et fêtes',
] as const

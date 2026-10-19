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
 * Names offered while the user has no family yet: shortcuts to create one,
 * nothing written until they confirm. No « Gros achats »: a durable purchase
 * is smoothed, not tagged (agent-os/product/amortization-framework.md).
 */
export const FAMILY_SUGGESTIONS = [
  'Voyages',
  'Compétitions',
  'Concerts et fêtes',
] as const

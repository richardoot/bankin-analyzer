/** How the category table can be ordered — shared by the page (which sorts)
 * and the controls bar (which offers the choice). */
export type SortOrder =
  | 'amount-desc'
  | 'amount-asc'
  | 'difference-desc'
  | 'alpha'

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'amount-desc', label: 'Dépense (décroissant)' },
  { value: 'amount-asc', label: 'Dépense (croissant)' },
  { value: 'difference-desc', label: 'Économie potentielle' },
  { value: 'alpha', label: 'Alphabétique' },
]

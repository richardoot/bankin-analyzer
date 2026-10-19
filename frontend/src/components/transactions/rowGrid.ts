/**
 * The columns of the transactions table from `lg` up, shared by the header
 * (in the page) and every row so the two can never drift apart.
 *
 * Fixed tracks for what must stay legible whatever the width — the date,
 * the amount, the pointed toggle — and flexible ones for the text that
 * can truncate. The actions column is fixed too: each row is its own
 * grid, so a column sized to its content would shift from row to row. Eleven equal
 * columns used to give the date 61px at 768px; this gives it 5.5rem at
 * any width, and the table only starts at 1024px (the card layout serves
 * tablets).
 *
 * Both strings are written out in full: Tailwind reads them from this
 * file as they are, and would not see a class assembled at run time.
 */
export const ROW_GRID_CLASS =
  'lg:grid-cols-[5.5rem_minmax(0,3fr)_minmax(0,2fr)_6.5rem_minmax(0,2fr)_3.5rem_13.5rem]'

/** With the selection column in front. */
export const ROW_GRID_SELECTION_CLASS =
  'lg:grid-cols-[1.5rem_5.5rem_minmax(0,3fr)_minmax(0,2fr)_6.5rem_minmax(0,2fr)_3.5rem_13.5rem]'

export function rowGridClass(selectionMode: boolean): string {
  return selectionMode ? ROW_GRID_SELECTION_CLASS : ROW_GRID_CLASS
}

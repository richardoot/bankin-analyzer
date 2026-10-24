/**
 * The tiles of the budget's three bands — « Ce mois-ci », « Bilan du
 * plan », « Planification » — drawn with one set of classes, so the three
 * read as one family and a change of size reaches all of them. A phone
 * stands the tiles two by two, the figure at 22 px; a desk four in a row.
 * The figure is in the text's ink; colour carries the state alone, in
 * the badge (`STATE_BADGE_CLASSES`) or, for a shortfall, the figure's
 * amber (`figureClass`).
 */

export const TILE =
  'flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-gray-200 p-3 sm:p-4 dark:border-slate-700'

export const TILE_TITLE = 'text-sm font-medium text-gray-500 dark:text-gray-400'

const FIGURE_SIZE =
  'text-[22px] leading-tight font-semibold sm:text-2xl tabular-nums'

export const FIGURE = `${FIGURE_SIZE} text-gray-900 dark:text-gray-100`

/** The figure, in amber when it says a shortfall (a negative saving, an overrun). */
export function figureClass(shortfall: boolean): string {
  return `${FIGURE_SIZE} ${
    shortfall
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-gray-900 dark:text-gray-100'
  }`
}

export const FIGURE_UNIT =
  'text-xs font-normal text-gray-500 sm:text-sm dark:text-gray-400'

/** The badge's shape; its tint is the state's. */
export const BADGE =
  'inline-flex max-w-full items-center rounded-md px-2 py-0.5 font-semibold tabular-nums sm:rounded-full sm:whitespace-nowrap'

/** The line that holds a badge, and its note after it. */
export const BADGE_LINE = 'text-[11px] sm:text-xs'

export const DETAIL =
  'text-[11px] sm:text-xs text-gray-500 tabular-nums dark:text-gray-400'

/** A tile's way on — to a row, to edit mode — a link, 44 px under a thumb. */
export const LINK =
  "relative mt-auto self-start pt-1 text-[11px] font-medium text-primary-700 sm:text-xs pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-[''] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"

/** The four tiles: two by two on a phone, four in a row from `md`. */
export const TILES_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4'

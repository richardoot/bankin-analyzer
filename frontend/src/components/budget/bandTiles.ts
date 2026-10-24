/**
 * The tiles of the budget's three bands — « Ce mois-ci », « Bilan du
 * plan », « Planification » — drawn with one set of classes, so the three
 * read as one family and a change of size reaches all of them. A phone
 * stands the tiles two by two, the figure at 22 px; a desk four in a row.
 * The figure takes its nature's hue (`NATURE_FIGURE_CLASSES`: blue for
 * a spending, green for an income, violet for a saving) or the ink for a
 * count or a margin (`FIGURE`); the state lives in the badge
 * (`STATE_BADGE_CLASSES`) or, for a shortfall, in the figure's amber
 * (`figureClass`).
 */

import { NATURE_FIGURE_CLASSES, type NatureKind } from '@/lib/stateTints'

export const TILE =
  'flex min-w-0 flex-col gap-1 rounded-lg sm:gap-1.5 border border-gray-200 p-3 sm:p-4 dark:border-slate-700'

export const TILE_TITLE = 'text-sm font-medium text-gray-500 dark:text-gray-400'

const FIGURE_SIZE =
  'text-[22px] leading-tight font-semibold sm:text-2xl tabular-nums'

export const FIGURE = `${FIGURE_SIZE} text-gray-900 dark:text-gray-100`

/**
 * The figure in its nature's hue — or in amber when it says a shortfall
 * (a negative saving, an overrun): the state wins over the nature. `null`
 * for a figure of no nature, a count: the ink.
 */
export function figureClass(
  nature: NatureKind | null,
  shortfall = false
): string {
  const hue = shortfall
    ? 'text-amber-700 dark:text-amber-400'
    : nature
      ? NATURE_FIGURE_CLASSES[nature]
      : 'text-gray-900 dark:text-gray-100'
  return `${FIGURE_SIZE} ${hue}`
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

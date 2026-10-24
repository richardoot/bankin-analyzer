/**
 * The dashboard's colours (agent-os/product/design-system.md, « Teintes
 * d'état »), in one place.
 *
 * The figures are in the text's ink. Colour carries a state alone, in
 * three tints and no other: teal under the habit or for a drop, amber over
 * it or for a rise, grey within ±5 % or when there is nothing to compare.
 * Amber is also the one hue of « À faire »; red and green never sit on a
 * figure. The data itself — a bar, a sparkline's line — has one hue, the
 * share bars' blue-400.
 */

/** The three states a badge can say, and nothing else. */
export type StateTone = 'under' | 'over' | 'neutral'

/** A state's badge: a pale ground and a dark ink of the same tint. */
export const STATE_BADGE_CLASSES: Readonly<Record<StateTone, string>> = {
  under: 'bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  over: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300',
}

/** A state's mark in a chart: a sparkline's last point, an overrun. */
export const STATE_COLORS: Readonly<Record<StateTone, string>> = {
  under: '#14b8a6', // teal-500
  over: '#f59e0b', // amber-500
  neutral: '#9ca3af', // gray-400
}

/** The one data hue of the dashboard: the share bars' blue-400. */
export const DATA_HUE = '#60a5fa'

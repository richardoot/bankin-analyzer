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

import { DASHBOARD_THRESHOLDS } from './dashboardThresholds'

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

/**
 * The income line of the Budget's « Dépenses et enveloppe par mois »:
 * green-600, legible on a light and a dark ground. Richard's decision of
 * 2026-10-24, an exception to the rule « no green on a figure »: a line of
 * reference, not a figure, told apart from the envelope (amber, dashed)
 * and the columns (`DATA_HUE`).
 */
export const INCOME_LINE_COLOR = '#16a34a'

/**
 * The nature of a figure in a band's tiles — « Ce mois-ci » on the
 * dashboard, the budget's three bands: what goes out, what comes in, what
 * stays. Richard's decision of 2026-10-25, the second exception to « the
 * figures are in ink »: four tiles side by side read faster when the
 * amount itself says which is which. Blue is the columns' hue
 * (`DATA_HUE`), green the income line's (`INCOME_LINE_COLOR`), violet the
 * saving's own — none of the three state tints, so a figure's hue never
 * says a state. A shortfall (a negative saving, an overrun) keeps the
 * state's amber: the state wins over the nature. A count, a margin, a
 * placeholder stay in ink.
 */
export type NatureKind = 'expense' | 'income' | 'savings'

export const NATURE_FIGURE_CLASSES: Readonly<Record<NatureKind, string>> = {
  expense: 'text-blue-700 dark:text-blue-400',
  income: 'text-green-700 dark:text-green-400',
  savings: 'text-violet-700 dark:text-violet-400',
}

/**
 * A gap to a reference, as a share of it: `under` below it, `over` above
 * it, `neutral` within ±5 % (`DASHBOARD_THRESHOLDS.neutralGap`) or when
 * there is no reference to compare with. Shared by « Ce mois-ci » on the
 * dashboard (spending against the habit) and on the budget (spending
 * against the envelope to date).
 */
export function gapOf(
  value: number,
  reference: number
): { tone: StateTone; ratio: number } {
  if (reference <= 0) return { tone: 'neutral', ratio: 0 }
  const ratio = (value - reference) / reference
  if (Math.abs(ratio) <= DASHBOARD_THRESHOLDS.neutralGap) {
    return { tone: 'neutral', ratio }
  }
  return { tone: ratio < 0 ? 'under' : 'over', ratio }
}

/**
 * The tone of a change of a total, said by the edit mode's band and bar
 * alike (budget-refonte.md, lot 4): teal for a drop, amber for a rise,
 * grey when it rounds to nothing.
 */
export function deltaTone(delta: number): StateTone {
  if (Math.round(delta) === 0) return 'neutral'
  return delta < 0 ? 'under' : 'over'
}

/**
 * Flips teal and amber, for a figure where more is better — a saving, a
 * margin: above its reference it is the good side (teal), below it the
 * shortfall (amber). Neutral stays neutral.
 */
export function invertTone(tone: StateTone): StateTone {
  if (tone === 'under') return 'over'
  if (tone === 'over') return 'under'
  return 'neutral'
}

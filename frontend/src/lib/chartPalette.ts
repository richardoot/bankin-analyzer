/**
 * The one palette a categorical chart draws from, shared with the list that
 * sits next to it: a slice and its row carry the same color, so the donut
 * can be read against « Détail par catégorie » without a legend hunt.
 *
 * Categories are data, not roles (see style.css), so these hues are chosen
 * for contrast between neighbours, not for meaning.
 */
export const CATEGORY_PALETTE = [
  '#f97316', // orange-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#eab308', // yellow-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#a855f7', // purple-500
  '#0ea5e9', // sky-500
] as const

export const OTHERS_COLOR_LIGHT = '#9ca3af' // gray-400
export const OTHERS_COLOR_DARK = '#64748b' // slate-500

export function othersColor(isDark: boolean): string {
  return isDark ? OTHERS_COLOR_DARK : OTHERS_COLOR_LIGHT
}

/**
 * Colors by label, the way the donut draws them: the `topN` largest values
 * take the palette in descending order, everything past that is the muted
 * « Autres » tone. The donut and the list both go through here, which is
 * what keeps them in step — the same sort, the same cap, the same hues.
 * `topN` of 0 means no cap.
 */
export function assignCategoryColors(
  labels: readonly string[],
  values: readonly number[],
  topN: number,
  isDark: boolean
): Map<string, string> {
  const pairs = labels.map((label, index) => ({
    label,
    value: values[index] ?? 0,
    index,
  }))
  // A stable sort: equal values keep their incoming order.
  pairs.sort((a, b) => b.value - a.value || a.index - b.index)
  const cap = topN > 0 ? topN : pairs.length
  const colors = new Map<string, string>()
  pairs.forEach((pair, rank) => {
    colors.set(
      pair.label,
      rank < cap
        ? (CATEGORY_PALETTE[rank % CATEGORY_PALETTE.length] ?? '#888')
        : othersColor(isDark)
    )
  })
  return colors
}

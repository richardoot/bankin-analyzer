/**
 * The dashboard's thresholds, in one place to tune them after use
 * (agent-os/product/dashboard-refonte.md, « Hors périmètre »). Each lot
 * that reads one adds it here rather than in its component.
 */
export const DASHBOARD_THRESHOLDS = {
  /**
   * « Ce mois-ci »: a gap to the habit within this share of it reads as
   * neutral — neither under nor over. 0.05 is ±5 %.
   */
  neutralGap: 0.05,
  /**
   * « Ce mois-ci »: under this share of the expected income, the month's
   * income reads « X attendus » — the salary has not landed yet — rather
   * than a gap.
   */
  incomeExpectedShare: 0.8,
  /**
   * « Où part l'argent »: the share of the period's spending a category
   * needs for its sparkline to be drawn in the list — the small lines'
   * trends are noise. An expanded row always draws it.
   */
  sparklineMinShare: 0.05,
} as const

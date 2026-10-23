import type { RouteLocationRaw } from 'vue-router'
import type {
  SpendingStructureDto,
  TagFamilyOfYearDto,
  TrendInsightDto,
  TrendsResponseDto,
} from '@/lib/api'
import { formatCompactCurrency } from '@/lib/formatters'
import { trendMonthLink } from '@/lib/trends'

/**
 * « À faire » (agent-os/product/dashboard-refonte.md, lot 3): the few things
 * the dashboard asks the user to do, composed from what the summary and the
 * trends already expose. No request of its own.
 */

/** One line of the card: a sentence, the screen where it gets done. */
export interface TodoItem {
  /** Stable across refreshes: `to-file`, `migration`, `envelope-<id>`… */
  key: string
  text: string
  /** The euros the sentence speaks of, when it speaks of some. */
  amount?: number
  to: RouteLocationRaw
  testId: string
}

/**
 * The part of the summary the card reads. `DashboardSummaryDto` fits it;
 * the page can also pass the refs it already holds, null while loading.
 */
export interface TodoSummary {
  /** Every expense of the period: the lines « à migrer » are counted there. */
  spendingStructure?: SpendingStructureDto | null
  pendingReceivables?: number | null
  tagFamiliesOfYear?: readonly TagFamilyOfYearDto[] | null
}

/** The part of the trends the card reads: their lines and their reading. */
export type TodoTrends = Pick<TrendsResponseDto, 'insights' | 'reading'>

/** How many lines the card shows before « et N autres ». */
export const TODO_SHOWN = 4

const euros = (value: number): string => formatCompactCurrency(value)

function item(
  key: string,
  text: string,
  to: RouteLocationRaw,
  amount?: number
): TodoItem {
  return {
    key,
    text,
    ...(amount !== undefined ? { amount } : {}),
    to,
    testId: `todo-item-${key}`,
  }
}

/**
 * A charge's sentence, shortened for a line: its name and its price, the
 * month it started or stopped left to the recurrences screen.
 *   « Nouvel abonnement : Netflix, 13,49 € par mois depuis septembre. »
 *     → « Nouvel abonnement : Netflix, 13,49 € par mois »
 *   « Abonnement arrêté : Netflix, 13,49 € par mois, dernier prélèvement en août. »
 *     → « Abonnement arrêté : Netflix, 13,49 € par mois »
 *   « Netflix : 15,99 € par mois depuis septembre, contre 13,49 €. »
 *     → « Netflix : 15,99 € par mois, contre 13,49 € »
 */
export function shortChargeSentence(insight: TrendInsightDto): string {
  const short = insight.sentence
    .trim()
    .replace(/, dernier prélèvement en [^,.]+/, '')
    .replace(/ depuis [^,.]+/, '')
    .replace(/\.$/, '')
    .trim()
  return short || insight.unit.name
}

/**
 * The card's lines, in the order the plan gives: the lines to file, the
 * categories to migrate, the money advanced, each envelope over, then the
 * charges that came, went or changed price. Either source may be missing
 * (not loaded yet, or failed): the other still speaks.
 */
export function todoItems(
  summary: TodoSummary | null | undefined,
  trends: TodoTrends | null | undefined
): TodoItem[] {
  const items: TodoItem[] = []
  const insights = trends?.insights ?? []

  // 1. The lines to file, opened as « Ce qui change » opens them.
  const toFile = insights.find(i => i.kind === 'uncategorized')
  if (trends && toFile && toFile.current > 0) {
    const n = toFile.current
    items.push(
      item(
        'to-file',
        `${n} ${n >= 2 ? 'lignes' : 'ligne'} à classer`,
        trendMonthLink(toFile, trends.reading)
      )
    )
  }

  // 2. What predates the catalogue: the larger of the two axes, since a
  // line missing either attribute is to migrate.
  const structure = summary?.spendingStructure
  if (
    structure &&
    (structure.unknownNature > 0 || structure.unknownRhythm > 0)
  ) {
    const amount = Math.max(structure.unknownNature, structure.unknownRhythm)
    items.push(
      item(
        'migration',
        `${euros(amount)} dans des catégories à migrer`,
        '/settings/categories/migration',
        amount
      )
    )
  }

  // 3. The money advanced and not back yet.
  const pending = summary?.pendingReceivables ?? 0
  if (pending > 0) {
    items.push(
      item(
        'receivables',
        `${euros(pending)} avancés, en attente de remboursement`,
        '/reimbursements',
        pending
      )
    )
  }

  // 4. Each envelope over, in the summary's order (biggest spent first).
  for (const family of summary?.tagFamiliesOfYear ?? []) {
    if (family.remaining === null || family.remaining >= 0) continue
    const over = -family.remaining
    items.push(
      item(
        `envelope-${family.id}`,
        `${family.name} : enveloppe dépassée de ${euros(over)}`,
        `/tags/families/${family.id}`,
        over
      )
    )
  }

  // 5. The charges, in the trends' score order.
  for (const insight of insights) {
    if (insight.kind !== 'subscription' && insight.kind !== 'price') continue
    items.push(
      item(
        `${insight.kind}-${insight.direction}-${insight.unit.id}`,
        shortChargeSentence(insight),
        '/recurrences'
      )
    )
  }

  return items
}

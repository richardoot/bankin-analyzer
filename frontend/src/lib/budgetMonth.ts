import type { BudgetPlanDto } from '@/lib/api'
import { gapOf, type StateTone } from '@/lib/stateTints'

/**
 * « Ce mois-ci » on the Budget page (agent-os/product/budget-refonte.md,
 * lot 1): what the band says about the month read, computed from what the
 * page already holds — the plan, the started plan months, and each
 * category's spending in them in the active reading (`seriesFor` of
 * `useBudgetComparison`). Pure: no clock, no store, no request.
 */

/** A category of the statistics, its spending in each started plan month. */
export interface BudgetMonthCategory {
  categoryId: string
  categoryName: string
  /**
   * Spending in each of `months`, in the active reading (everyday or real),
   * aligned with them.
   */
  amounts: number[]
}

export interface BudgetMonthInput {
  /** The plan: its envelopes, `referenceIncome`, `savingsTarget`. */
  plan: Pick<BudgetPlanDto, 'entries' | 'referenceIncome' | 'savingsTarget'>
  /**
   * The plan months that have begun, oldest first: the complete ones, then
   * the running one when the plan is in progress (`startedPlanMonths`).
   * Empty before the plan starts.
   */
  months: string[]
  /** How many of `months` are complete — always the first ones. */
  completeMonthsCount: number
  /**
   * The month read, `YYYY-MM`, or null for « Moyenne du plan »: the
   * average over the complete months. A month outside `months` reads as
   * the average, as `useBudgetComparison` does.
   */
  selectedMonth: string | null
  /**
   * How far into the month read we are, when it is the running one
   * (`selectedMonthProgress`); null for a complete month or the average.
   */
  progress: { elapsedDays: number; totalDays: number } | null
  /** The expense categories the page reads, in the active reading. */
  categories: BudgetMonthCategory[]
  /** The income of each of `months`, never segmented, aligned with them. */
  income: number[]
}

/** An envelope the month read spends past. */
export interface BudgetEnvelopeOver {
  categoryId: string
  categoryName: string
  spent: number
  envelope: number
  /** `spent − envelope`, above zero. */
  overBy: number
}

export interface BudgetMonthReading {
  /**
   * `future`: the plan has not begun, there is nothing spent to read;
   * `month`: one month, complete or running; `average`: the complete
   * months of the plan, averaged.
   */
  kind: 'future' | 'month' | 'average'
  /** The month read, `YYYY-MM`; null on the average and before the plan. */
  month: string | null
  /** The month read is the running one: its envelope is prorated. */
  isRunning: boolean
  /** The day the running month is read at; null otherwise. */
  asOfDay: number | null
  /** Spent on the month read (or per month on average); null before the plan. */
  spent: number | null
  /** The plan's monthly envelope: the sum of its envelopes. */
  envelope: number
  /**
   * The envelope at this point of the month: prorated `elapsedDays /
   * totalDays` on the running month, whole otherwise.
   */
  envelopeToDate: number
  /** The spending of every started plan month, in order. */
  spentSeries: number[]
  /** The spending against `envelopeToDate`. */
  spentGap: { tone: StateTone; ratio: number } | null
  /** `envelope − spent`: what is left to finish the month; null before the plan. */
  remaining: number | null
  /** Days left in the running month after today; null otherwise. */
  daysLeft: number | null
  /** `referenceIncome − envelope`; null without `referenceIncome`. */
  savingsPlanned: number | null
  /** `savingsTarget`, when one was decided. */
  savingsDecided: number | null
  /**
   * The planned savings against the decided ones, in the state tints:
   * teal when the plan saves more than decided, amber when less. Null
   * without both figures.
   */
  savingsGap: { tone: StateTone; amount: number } | null
  /** Income − spending, per month, over the complete months; null without any. */
  savingsActual: number | null
  /** How many complete months `savingsActual` averages. */
  savingsActualMonths: number
  /** The envelopes the month read spends past, the largest overrun first. */
  envelopesOver: BudgetEnvelopeOver[]
  /** The plan's categories that carry an envelope. */
  envelopesCount: number
}

function sum(values: number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

/** Flips teal and amber: for a figure where more is better (savings). */
function invertTone(tone: StateTone): StateTone {
  if (tone === 'under') return 'over'
  if (tone === 'over') return 'under'
  return 'neutral'
}

/** What « Ce mois-ci » of the Budget page shows, for the month read. */
export function budgetMonthReading(
  input: BudgetMonthInput
): BudgetMonthReading {
  const { plan, months, categories, income } = input
  const completeCount = Math.min(input.completeMonthsCount, months.length)

  const envelopes = new Map<string, number>()
  for (const entry of plan.entries) {
    envelopes.set(
      entry.categoryId,
      (envelopes.get(entry.categoryId) ?? 0) + entry.amount
    )
  }
  const envelope = sum([...envelopes.values()])
  const envelopesCount = [...envelopes.values()].filter(v => v > 0).length

  const referenceIncome = plan.referenceIncome ?? null
  const savingsPlanned =
    referenceIncome === null ? null : referenceIncome - envelope
  const savingsDecided = plan.savingsTarget ?? null
  const savingsGap =
    savingsPlanned !== null && savingsDecided !== null && savingsDecided > 0
      ? {
          tone: invertTone(gapOf(savingsPlanned, savingsDecided).tone),
          amount: savingsPlanned - savingsDecided,
        }
      : null

  const spentSeries = months.map((_, i) =>
    sum(categories.map(c => c.amounts[i] ?? 0))
  )

  // Savings actually made: income − spending, over the complete months
  // only — a running month has spent part of its money and received part
  // of its income, whichever month is read.
  const completeIndices = months.slice(0, completeCount).map((_, i) => i)
  const savingsActual =
    completeIndices.length === 0
      ? null
      : mean(completeIndices.map(i => income[i] ?? 0)) -
        mean(completeIndices.map(i => spentSeries[i] ?? 0))

  const base = {
    envelope,
    spentSeries,
    savingsPlanned,
    savingsDecided,
    savingsGap,
    savingsActual,
    savingsActualMonths: completeIndices.length,
    envelopesCount,
  }

  if (months.length === 0) {
    return {
      ...base,
      kind: 'future',
      month: null,
      isRunning: false,
      asOfDay: null,
      spent: null,
      envelopeToDate: envelope,
      spentGap: null,
      remaining: null,
      daysLeft: null,
      envelopesOver: [],
    }
  }

  const monthIndex =
    input.selectedMonth === null ? -1 : months.indexOf(input.selectedMonth)
  // The indices the month read covers: one month, or the complete ones.
  const indices = monthIndex >= 0 ? [monthIndex] : completeIndices
  const isRunning = monthIndex >= 0 && input.progress !== null
  const progress = isRunning ? input.progress : null

  const spent = mean(indices.map(i => spentSeries[i] ?? 0))
  const envelopeToDate = progress
    ? (envelope * progress.elapsedDays) / progress.totalDays
    : envelope

  // The rule of a row's « Dépassé »: an envelope, and more spent than it.
  const envelopesOver: BudgetEnvelopeOver[] =
    indices.length === 0
      ? []
      : categories
          .map(c => {
            const env = envelopes.get(c.categoryId) ?? 0
            const actual = mean(indices.map(i => c.amounts[i] ?? 0))
            return {
              categoryId: c.categoryId,
              categoryName: c.categoryName,
              spent: actual,
              envelope: env,
              overBy: actual - env,
            }
          })
          .filter(c => c.envelope > 0 && c.spent > c.envelope)
          .sort((a, b) => b.overBy - a.overBy)

  return {
    ...base,
    kind: monthIndex >= 0 ? 'month' : 'average',
    month: monthIndex >= 0 ? (months[monthIndex] ?? null) : null,
    isRunning,
    asOfDay: progress ? progress.elapsedDays : null,
    spent,
    envelopeToDate,
    spentGap: gapOf(spent, envelopeToDate),
    remaining: envelope - spent,
    daysLeft: progress ? progress.totalDays - progress.elapsedDays : null,
    envelopesOver,
  }
}

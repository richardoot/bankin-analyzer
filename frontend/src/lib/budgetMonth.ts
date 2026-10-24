import type { BudgetPlanDto } from '@/lib/api'
import { gapOf, invertTone, type StateTone } from '@/lib/stateTints'

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

/**
 * The income the planned savings are drawn from (Richard, 2026-10-24): the
 * real income averaged over the plan's complete months, or — before any
 * month is complete — the reference income typed at creation. `months` is
 * how many complete months `amount` averages, 0 on the reference.
 */
export interface SavingsIncomeBase {
  source: 'actual' | 'reference'
  amount: number
  months: number
}

/**
 * The base of the planned savings: the real income of the complete months
 * when there is one, the reference income otherwise, null with neither.
 * The backend's `projectReserve` keeps reading the reference income.
 */
export function savingsIncomeBase(
  referenceIncome: number | null | undefined,
  completeMonthsIncome: readonly number[]
): SavingsIncomeBase | null {
  if (completeMonthsIncome.length > 0) {
    return {
      source: 'actual',
      amount: mean([...completeMonthsIncome]),
      months: completeMonthsIncome.length,
    }
  }
  if (referenceIncome === null || referenceIncome === undefined) return null
  return { source: 'reference', amount: referenceIncome, months: 0 }
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
  /**
   * `income − envelope`, the income being `savingsBase`: the real income
   * of the complete months, or the reference income before any; null
   * with neither.
   */
  savingsPlanned: number | null
  /** What `savingsPlanned` is drawn from; null when it cannot be. */
  savingsBase: SavingsIncomeBase | null
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

  const spentSeries = months.map((_, i) =>
    sum(categories.map(c => c.amounts[i] ?? 0))
  )
  const completeIndices = months.slice(0, completeCount).map((_, i) => i)

  // The savings the plan makes on the income actually received, once a
  // month is complete; the reference income typed at creation until then.
  const savingsBase = savingsIncomeBase(
    plan.referenceIncome,
    completeIndices.map(i => income[i] ?? 0)
  )
  const savingsPlanned =
    savingsBase === null ? null : savingsBase.amount - envelope
  const savingsDecided = plan.savingsTarget ?? null
  const savingsGap =
    savingsPlanned !== null && savingsDecided !== null && savingsDecided > 0
      ? {
          tone: invertTone(gapOf(savingsPlanned, savingsDecided).tone),
          amount: savingsPlanned - savingsDecided,
        }
      : null

  // Savings actually made: income − spending, over the complete months
  // only — a running month has spent part of its money and received part
  // of its income, whichever month is read.
  const savingsActual =
    completeIndices.length === 0
      ? null
      : mean(completeIndices.map(i => income[i] ?? 0)) -
        mean(completeIndices.map(i => spentSeries[i] ?? 0))

  const base = {
    envelope,
    spentSeries,
    savingsPlanned,
    savingsBase,
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

/**
 * « Bilan du plan » (agent-os/product/budget-refonte.md, lot 6): what the
 * band of a finished plan says — the month reading of « Ce mois-ci », plus
 * the plan's totals and the savings actually made on what is read.
 */
export interface BudgetReviewReading extends BudgetMonthReading {
  /**
   * How many months the reading covers: the plan's complete months on
   * « Le plan », one on a month.
   */
  monthsCount: number
  /** Spent over the months read: `spent × monthsCount`. */
  spentTotal: number | null
  /** The envelope over the months read: `envelope × monthsCount`. */
  envelopeTotal: number
  /** The income of the months read, per month; null without any month read. */
  incomeRead: number | null
  /** Income − spending, per month, on the months read; null without any. */
  savingsRealized: number | null
  /** `savingsRealized × monthsCount`. */
  savingsRealizedTotal: number | null
  /**
   * The savings made against the decided ones: teal above, amber below,
   * grey within ±5 %. Null without both figures.
   */
  savingsRealizedGap: { tone: StateTone; amount: number } | null
  /** The envelopes held on the reading: `envelopesCount − envelopesOver`. */
  envelopesHeld: number
}

/**
 * The band of a finished plan: « Le plan » (`selectedMonth` null) reads the
 * average of its complete months, a month reads that month — the same
 * `budgetMonthReading`, completed with the plan's totals.
 */
export function budgetReviewReading(
  input: BudgetMonthInput
): BudgetReviewReading {
  const reading = budgetMonthReading(input)
  const completeCount = Math.min(input.completeMonthsCount, input.months.length)
  const monthIndex =
    input.selectedMonth === null
      ? -1
      : input.months.indexOf(input.selectedMonth)
  const indices =
    monthIndex >= 0
      ? [monthIndex]
      : input.months.slice(0, completeCount).map((_, i) => i)
  const monthsCount = indices.length

  const incomeRead =
    monthsCount === 0 ? null : mean(indices.map(i => input.income[i] ?? 0))
  const savingsRealized =
    incomeRead === null || reading.spent === null
      ? null
      : incomeRead - reading.spent
  const decided = reading.savingsDecided
  const savingsRealizedGap =
    savingsRealized !== null && decided !== null && decided > 0
      ? {
          tone: invertTone(gapOf(savingsRealized, decided).tone),
          amount: savingsRealized - decided,
        }
      : null

  return {
    ...reading,
    monthsCount,
    spentTotal: reading.spent === null ? null : reading.spent * monthsCount,
    envelopeTotal: reading.envelope * monthsCount,
    incomeRead,
    savingsRealized,
    savingsRealizedTotal:
      savingsRealized === null ? null : savingsRealized * monthsCount,
    savingsRealizedGap,
    envelopesHeld: Math.max(
      0,
      reading.envelopesCount - reading.envelopesOver.length
    ),
  }
}

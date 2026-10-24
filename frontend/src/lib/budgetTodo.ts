import type { RouteLocationRaw } from 'vue-router'
import type { BudgetPlanDto, TagBudgetSummaryDto } from '@/lib/api'
import type { PlanStatus } from '@/components/budget/planStatus'
import type { BudgetMonthCategory, BudgetMonthReading } from '@/lib/budgetMonth'
import { formatCompactCurrency } from '@/lib/formatters'
import type { TodoItem } from '@/lib/todo'

/**
 * « À faire » on the Budget page (agent-os/product/budget-refonte.md,
 * lot 2): the few things the plan asks the user to do, composed from what
 * the page already holds — the month read, the plan, its projects. The
 * card is the dashboard's `TodoCard`, mounted as is: these are its lines.
 * Pure: no clock, no store, no request.
 */

/** Below half a cent, an amount is rounding, not money. */
const TOLERANCE = 0.005

/** The page's own route: the actions it reads off the query on mount. */
export const BUDGET_EDIT_ROUTE: RouteLocationRaw = {
  path: '/budget',
  query: { edit: '1' },
}
export const BUDGET_NEW_ROUTE: RouteLocationRaw = {
  path: '/budget',
  query: { new: '1' },
}

/** The anchor of a category's row, and of the projects line. */
export const budgetRowAnchor = (categoryId: string): string =>
  `budget-row-${categoryId}`
export const BUDGET_PROJECTS_ANCHOR = 'budget-projects'
/** The title of « Les enveloppes », the list's anchor. */
export const BUDGET_ENVELOPES_ANCHOR = 'budget-envelopes-title'

/** How many envelopes the finished plan's line names before « et N autres ». */
const ENVELOPES_NAMED = 3

const COUNT_WORDS = [
  'Zéro',
  'Une',
  'Deux',
  'Trois',
  'Quatre',
  'Cinq',
  'Six',
  'Sept',
  'Huit',
  'Neuf',
  'Dix',
]

/** « Trois », as the sentence opens; the digits past ten. */
const countWord = (count: number): string => COUNT_WORDS[count] ?? String(count)

/** A category that spends over the plan with no envelope to hold it. */
export interface BudgetCategoryWithoutEnvelope {
  categoryId: string
  categoryName: string
  /** Its spending per month over the plan, in the active reading. */
  monthlyAverage: number
}

export interface BudgetTodoInput {
  plan: Pick<BudgetPlanDto, 'endDate' | 'projectReserve'>
  status: PlanStatus
  /** « Ce mois-ci »: its `envelopesOver` are the month read's. */
  reading: Pick<BudgetMonthReading, 'envelopesOver'> | null
  /** The projects of the plan's window; null while loading or failed. */
  projects: Pick<TagBudgetSummaryDto, 'totalBudget'> | null
  /** See `categoriesWithoutEnvelope`, biggest first. */
  categoriesWithoutEnvelope: readonly BudgetCategoryWithoutEnvelope[]
  /** Whether some plan covers today — another one than a past plan shown. */
  hasCurrentPlan: boolean
  /** Today's month, `YYYY-MM`. */
  currentMonth: string
}

const euros = (value: number): string => formatCompactCurrency(value)

/** « −870 € », the typographic minus the band writes. */
const signedEuros = (value: number): string =>
  value < 0 ? `−${euros(-value)}` : euros(value)

/** « 31 décembre », the plan's last day. */
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
function dayMonth(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? isoDate : DAY_MONTH.format(date)
}

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
 * The categories that spend with no envelope: their average over the plan
 * months — the complete ones, or the started ones while none is complete
 * (a plan in its first month) — above zero, and no envelope or a zero one
 * in the plan. Biggest first.
 */
export function categoriesWithoutEnvelope(input: {
  plan: Pick<BudgetPlanDto, 'entries'>
  categories: readonly BudgetMonthCategory[]
  /** How many of the categories' months are complete — the first ones. */
  completeMonthsCount: number
}): BudgetCategoryWithoutEnvelope[] {
  const envelopes = new Map<string, number>()
  for (const entry of input.plan.entries) {
    envelopes.set(
      entry.categoryId,
      (envelopes.get(entry.categoryId) ?? 0) + entry.amount
    )
  }
  return input.categories
    .map(c => {
      const amounts =
        input.completeMonthsCount > 0
          ? c.amounts.slice(0, input.completeMonthsCount)
          : c.amounts
      const total = amounts.reduce((sum, v) => sum + v, 0)
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        monthlyAverage: amounts.length === 0 ? 0 : total / amounts.length,
      }
    })
    .filter(
      c =>
        c.monthlyAverage > TOLERANCE && (envelopes.get(c.categoryId) ?? 0) <= 0
    )
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage)
}

/**
 * The card's lines, in the order the plan gives: each envelope over on the
 * month read, the project reserve overdrawn, the categories spending with
 * no envelope, the plan ending (or none running), the plan that does not
 * fit in the reference income. Empty when nothing is to do: the card then
 * renders nothing.
 *
 * A finished plan (lot 6) is read as a review: the next plan comes first,
 * then one line for the envelopes it spent past on average — `reading`
 * must then be the plan's average, whichever month the band reads — that
 * scrolls to the list rather than to each row.
 */
export function budgetTodoItems(input: BudgetTodoInput): TodoItem[] {
  const { plan, status, reading, projects } = input
  const items: TodoItem[] = []
  const finished = status === 'past'

  if (finished) {
    // 4, first on a finished plan: what it asks for is the next one.
    if (!input.hasCurrentPlan) {
      items.push(
        item(
          'no-current-plan',
          'Aucun plan en cours : créer le suivant',
          BUDGET_NEW_ROUTE
        )
      )
    }
    // 1, as one line: the envelopes spent past on average over the plan.
    const over = reading?.envelopesOver ?? []
    if (over.length > 0) {
      const count = over.length
      const names = over.map(o => o.categoryName)
      const shown =
        names.length > ENVELOPES_NAMED
          ? `${names.slice(0, ENVELOPES_NAMED).join(', ')} et ${names.length - ENVELOPES_NAMED} autres`
          : names.join(', ')
      items.push(
        item(
          'envelopes-over-average',
          `${countWord(count)} ${count > 1 ? 'enveloppes dépassées' : 'enveloppe dépassée'} en moyenne : ${shown}`,
          { hash: `#${BUDGET_ENVELOPES_ANCHOR}` },
          over.reduce((total, o) => total + o.overBy, 0)
        )
      )
    }
  }

  // 1. Each envelope the month read spends past, the largest overrun first.
  for (const over of finished ? [] : (reading?.envelopesOver ?? [])) {
    items.push(
      item(
        `envelope-${over.categoryId}`,
        `${over.categoryName} : enveloppe dépassée de ${euros(over.overBy)}`,
        { hash: `#${budgetRowAnchor(over.categoryId)}` },
        over.overBy
      )
    )
  }

  // 2. The project reserve, committed past what it holds. A reserve below
  // zero is the plan not fitting at all: line 5 says that one.
  const reserve = plan.projectReserve ?? null
  if (
    reserve !== null &&
    reserve >= 0 &&
    projects &&
    projects.totalBudget - reserve > TOLERANCE
  ) {
    items.push(
      item(
        'project-reserve',
        `Réserve projets : ${euros(projects.totalBudget)} engagés sur ${euros(reserve)}`,
        { hash: `#${BUDGET_PROJECTS_ANCHOR}` },
        projects.totalBudget - reserve
      )
    )
  }

  // 3. The categories that spend with no envelope to hold it.
  for (const c of input.categoriesWithoutEnvelope) {
    items.push(
      item(
        `no-envelope-${c.categoryId}`,
        `${c.categoryName} sans enveloppe · ${euros(c.monthlyAverage)} par mois`,
        BUDGET_EDIT_ROUTE,
        c.monthlyAverage
      )
    )
  }

  // 4. The next plan: due when this one lives its last month, or when the
  // one shown is over and none runs.
  if (status === 'current' && plan.endDate.slice(0, 7) === input.currentMonth) {
    items.push(
      item(
        'plan-ending',
        `Le plan se termine le ${dayMonth(plan.endDate)} : préparer le suivant`,
        BUDGET_NEW_ROUTE
      )
    )
  }

  // 5. The envelopes and the savings decided spend more than the income.
  if (reserve !== null && reserve < -TOLERANCE) {
    items.push(
      item(
        'plan-unfunded',
        `Le plan ne tient pas dans les revenus de référence (${signedEuros(reserve)})`,
        BUDGET_EDIT_ROUTE,
        -reserve
      )
    )
  }

  return items
}

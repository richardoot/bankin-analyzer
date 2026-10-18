/**
 * Lot 3 of the smoothed purchases (agent-os/product/amortization-framework.md):
 * the suggestion « Épisode ou achat à lisser ? ».
 *
 * The category framework noted a suggestion it left for later: an exceptional
 * tag when an amount far exceeds the habit of its subcategory. The smoothing
 * framework turns it into a question, because a large amount is not always an
 * episode. The test that settles it: will it come back, in a comparable form,
 * within two or three years?
 *
 *  - an episode (trip, wedding, move) will not: exceptional tag;
 *  - a durable good (phone, computer, furniture) will: smoothing over its
 *    useful life, never the exceptional tag;
 *  - an unforeseen cost (car repair, dentist) will, in another form: it stays
 *    in everyday life, smoothed over a short span if it distorts the plan,
 *    never the exceptional tag.
 *
 * The subcategory says which case a purchase most likely is, by its stable
 * catalogue key, never by its label. Each known key proposes one duration.
 * A subcategory the table does not know asks the open question with both
 * answers. Nothing here writes: the answers name what to do, the user does it.
 */

/** What a subcategory's large purchases most likely are. */
export type PurchaseKind = 'DURABLE' | 'UNFORESEEN'

export interface SmoothingProfile {
  kind: PurchaseKind
  /** The one duration proposed, in months. */
  months: number
}

/**
 * The subcategories whose large purchases the framework knows, by catalogue
 * key. Durations: phone and computer 24 to 36 months, household appliances
 * and furniture 36 to 60, unforeseen costs 6 to 12; one value each.
 */
export const SMOOTHING_PROFILES: Readonly<Record<string, SmoothingProfile>> = {
  // High-tech: a phone, a computer.
  'shopping.tech': { kind: 'DURABLE', months: 24 },
  // Sport et équipement de loisir: a bike, skis, a watch.
  'shopping.sports-gear': { kind: 'DURABLE', months: 24 },
  // Maison et déco: furniture, household appliances.
  'shopping.home': { kind: 'DURABLE', months: 48 },
  // Achat du véhicule paid outright: the upper bound, until it is raised.
  'transport.vehicle-purchase': { kind: 'DURABLE', months: 60 },
  // Entretien et réparation (car), Entretien et travaux (a boiler),
  // Optique et dentaire, Amendes: costs one suffers, that come back.
  'transport.maintenance': { kind: 'UNFORESEEN', months: 12 },
  'housing.maintenance': { kind: 'UNFORESEEN', months: 12 },
  'health.optical-dental': { kind: 'UNFORESEEN', months: 12 },
  'taxes.fines': { kind: 'UNFORESEEN', months: 12 },
}

/** The duration proposed when the subcategory says nothing more. */
export const DEFAULT_SMOOTHING_MONTHS = 12

export function smoothingProfile(
  subcategoryKey: string | null | undefined
): SmoothingProfile | null {
  if (!subcategoryKey) return null
  return SMOOTHING_PROFILES[subcategoryKey] ?? null
}

/** The duration to propose for an expense filed under this subcategory. */
export function suggestedAmortizationMonths(
  subcategoryKey: string | null | undefined
): number {
  return smoothingProfile(subcategoryKey)?.months ?? DEFAULT_SMOOTHING_MONTHS
}

/** One expense, as the detection reads it. */
export interface SuggestionRow {
  id: string
  date: Date
  description: string
  /** The user's share, net of the reimbursements requested on it, > 0. */
  net: number
  /** Where its habit is read: its subcategory, or its category alone. */
  groupId: string
  category: string | null
  categoryKey: string | null
  subcategory: string | null
  subcategoryKey: string | null
  /** The effective rhythm: the subcategory's, or the category's default. */
  rhythm: string | null
  smoothed: boolean
  exceptional: boolean
}

export interface SuggestionOptions {
  /** Candidates are dated in [since, until]. */
  since: Date
  until: Date
  /** Months of habit read before each candidate. */
  habitMonths?: number
  /** Below this net, nothing distorts a plan enough to ask. */
  minAmount?: number
  /** How many months of habit one purchase must exceed. */
  ratio?: number
}

export const SUGGESTION_HABIT_MONTHS = 12
export const SUGGESTION_MIN_AMOUNT = 200
export const SUGGESTION_RATIO = 3

export type SuggestionAnswer =
  | { answer: 'SMOOTH'; label: string; months: number; monthly: number }
  | { answer: 'EPISODE'; label: string }
  | { answer: 'KEEP'; label: string }

export interface SmoothingSuggestion {
  transactionId: string
  /** `YYYY-MM-DD` */
  date: string
  description: string
  /** Net amount, positive. */
  amount: number
  category: string | null
  categoryKey: string | null
  subcategory: string | null
  subcategoryKey: string | null
  /** What the subcategory cost per month over the months before, this left out. */
  habitMonthly: number
  kind: PurchaseKind | 'UNKNOWN'
  question: string
  /**
   * Two answers. For a subcategory the table knows, the first is the one the
   * framework leans to; otherwise neither is, the episode comes first.
   */
  answers: [SuggestionAnswer, SuggestionAnswer]
  reason: string
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function euros(n: number): string {
  return `${round2(n).toLocaleString('fr-FR', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`
}

function monthsBefore(date: Date, months: number): Date {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d
}

function smooth(net: number, months: number, label: string): SuggestionAnswer {
  return { answer: 'SMOOTH', label, months, monthly: round2(net / months) }
}

/** The question and its two answers, by what the subcategory says. */
function questionFor(
  row: SuggestionRow
): Pick<SmoothingSuggestion, 'kind' | 'question' | 'answers'> {
  const profile = smoothingProfile(row.subcategoryKey)
  if (profile?.kind === 'DURABLE') {
    return {
      kind: 'DURABLE',
      question: 'Achat à lisser ?',
      answers: [
        smooth(
          row.net,
          profile.months,
          `Bien durable, il reviendra : le lisser sur ${profile.months} mois`
        ),
        { answer: 'KEEP', label: 'Le laisser compté en entier à sa date' },
      ],
    }
  }
  if (profile?.kind === 'UNFORESEEN') {
    return {
      kind: 'UNFORESEEN',
      question: 'Imprévu à lisser ?',
      answers: [
        smooth(
          row.net,
          profile.months,
          `Imprévu, il reviendra sous une autre forme : le lisser sur ${profile.months} mois`
        ),
        { answer: 'KEEP', label: 'Le laisser compté en entier à sa date' },
      ],
    }
  }
  return {
    kind: 'UNKNOWN',
    question: 'Épisode ou achat à lisser ?',
    answers: [
      {
        answer: 'EPISODE',
        label:
          'Épisode, il ne reviendra pas : étiquette exceptionnelle, hors vie courante',
      },
      smooth(
        row.net,
        DEFAULT_SMOOTHING_MONTHS,
        `Achat qui reviendra : le lisser sur ${DEFAULT_SMOOTHING_MONTHS} mois (durée à ajuster)`
      ),
    ],
  }
}

/**
 * The expenses that far exceed the habit of their subcategory, each with
 * its question.
 *
 * A candidate is an expense dated in the window, not yet answered (neither
 * smoothed nor exceptional), not a commitment (a yearly insurance premium is
 * the habit of its line, not a purchase), of at least `minAmount`, and worth
 * more than `ratio` months of what its subcategory cost over the
 * `habitMonths` before it. The habit leaves out the candidate itself and the
 * rows already answered, which are not everyday habit in their raw form.
 *
 * `rows` must reach `habitMonths` before `since`. Newest first.
 */
export function findSmoothingSuggestions(
  rows: readonly SuggestionRow[],
  options: SuggestionOptions
): SmoothingSuggestion[] {
  const habitMonths = options.habitMonths ?? SUGGESTION_HABIT_MONTHS
  const minAmount = options.minAmount ?? SUGGESTION_MIN_AMOUNT
  const ratio = options.ratio ?? SUGGESTION_RATIO

  const byGroup = new Map<string, SuggestionRow[]>()
  for (const row of rows) {
    const group = byGroup.get(row.groupId)
    if (group) group.push(row)
    else byGroup.set(row.groupId, [row])
  }

  const suggestions: SmoothingSuggestion[] = []
  for (const row of rows) {
    if (row.date < options.since || row.date > options.until) continue
    if (row.smoothed || row.exceptional) continue
    if (row.rhythm === 'COMMITTED') continue
    if (row.net < minAmount) continue

    const from = monthsBefore(row.date, habitMonths)
    let habitTotal = 0
    for (const other of byGroup.get(row.groupId) ?? []) {
      if (other.id === row.id || other.smoothed || other.exceptional) continue
      if (other.date > from && other.date <= row.date) habitTotal += other.net
    }
    const habitMonthly = round2(habitTotal / habitMonths)
    if (row.net <= ratio * habitMonthly) continue

    const where = row.subcategory ?? row.category ?? 'cette catégorie'
    suggestions.push({
      transactionId: row.id,
      date: row.date.toISOString().slice(0, 10),
      description: row.description,
      amount: round2(row.net),
      category: row.category,
      categoryKey: row.categoryKey,
      subcategory: row.subcategory,
      subcategoryKey: row.subcategoryKey,
      habitMonthly,
      ...questionFor(row),
      reason:
        habitMonthly > 0
          ? `${euros(row.net)} en une fois, quand « ${where} » coûte d'habitude ${euros(habitMonthly)} par mois sur les ${habitMonths} mois précédents.`
          : `${euros(row.net)} en une fois, sans dépense « ${where} » sur les ${habitMonths} mois précédents.`,
    })
  }

  return suggestions.sort(
    (a, b) => b.date.localeCompare(a.date) || b.amount - a.amount
  )
}

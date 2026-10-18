/**
 * The rules a smoothed purchase obeys, shared by the two services that can
 * break them: transactions (setting the smoothing) and tags (making a
 * transaction exceptional). See agent-os/product/amortization-framework.md.
 *
 * A transaction is an episode (exceptional tag) or a smoothed cost of
 * everyday life, never both: the first leaves the everyday reading, the
 * second stays in it spread over months, and a row cannot do both at once.
 */
import { BadRequestException } from '@nestjs/common'

/** Bounds of the smoothing, mirrored by the column's CHECK constraint. */
export const AMORTIZATION_MIN_MONTHS = 2
export const AMORTIZATION_MAX_MONTHS = 60

/** Refuse anything but a whole number of months within the bounds. */
export function assertAmortizationMonths(months: unknown): void {
  if (
    typeof months !== 'number' ||
    !Number.isInteger(months) ||
    months < AMORTIZATION_MIN_MONTHS ||
    months > AMORTIZATION_MAX_MONTHS
  ) {
    throw new BadRequestException(
      `Un achat s'étale sur un nombre entier de mois, de ${AMORTIZATION_MIN_MONTHS} à ${AMORTIZATION_MAX_MONTHS}.`
    )
  }
}

/** Only an expense is smoothed: income and transfers count at their date. */
export function notAnExpenseError(): BadRequestException {
  return new BadRequestException(
    "Seule une dépense peut être étalée : un revenu ou un virement compte en entier à sa date. Retirez l'étalement avant de la classer ailleurs."
  )
}

/** Smoothing refused because the transaction already carries an episode. */
export function smoothingAnExceptionalError(
  tagNames: string[]
): BadRequestException {
  return new BadRequestException(
    `Cette transaction porte l'étiquette exceptionnelle ${quoted(tagNames)} : un épisode exceptionnel sort de la vie courante, alors qu'un achat étalé y reste, réparti sur plusieurs mois. Retirez l'étiquette pour l'étaler.`
  )
}

/** An exceptional tag refused because it would land on smoothed rows. */
export function exceptionalOnSmoothedError(
  descriptions: string[],
  total: number
): BadRequestException {
  const shown = descriptions.map(d => `« ${d} »`).join(', ')
  const rest =
    total > descriptions.length
      ? ` et ${total - descriptions.length} autre(s)`
      : ''
  const subject =
    total > 1
      ? `${total} transactions sont étalées sur plusieurs mois (${shown}${rest})`
      : `La transaction ${shown} est étalée sur plusieurs mois`
  return new BadRequestException(
    `${subject} : un achat étalé reste dans la vie courante, alors qu'une étiquette exceptionnelle l'en sortirait. Choisissez l'un ou l'autre, et retirez l'étalement d'abord pour en faire un épisode.`
  )
}

/** How many smoothed rows a refusal names before summing up the rest. */
export const SMOOTHED_ROWS_NAMED = 3

function quoted(names: string[]): string {
  return names.map(n => `« ${n} »`).join(', ')
}

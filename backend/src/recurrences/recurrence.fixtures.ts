/**
 * Real ledgers, replayed. Dates, amounts and labels come from production
 * rows read on 2026-10-07; only the names of people inside transfer labels
 * are replaced. Each fixture is one merchant as the bank wrote it.
 */

import type { RecurrenceExpense } from './recurrence.detection'

/** The moment the rows were read. */
export const READ_AT = new Date('2026-10-07T00:00:00.000Z')

type Row = [date: string, amount: number, description: string]

function rows(
  prefix: string,
  data: Row[],
  categoryId = `${prefix}-cat`,
  subcategoryId: string | null = `${prefix}-sub`
): RecurrenceExpense[] {
  return data.map(([date, amount, description], index) => ({
    id: `${prefix}-${index + 1}`,
    date: new Date(`${date}T00:00:00.000Z`),
    amount,
    description,
    categoryId,
    subcategoryId,
  }))
}

const PAYPAL = 'Prlv Sepa Paypal Europe S.a.r.l'

/**
 * Netflix, billed through PayPal: 14.99, two months on the 21.99 plan, back
 * to 14.99. One subscription at three prices.
 */
export const netflix = rows('netflix', [
  ['2026-01-02', -14.99, PAYPAL],
  ['2026-02-02', -21.99, PAYPAL],
  ['2026-03-03', -21.99, PAYPAL],
  ['2026-03-31', -14.99, PAYPAL],
  ['2026-05-04', -14.99, PAYPAL],
  ['2026-06-02', -14.99, PAYPAL],
  ['2026-07-01', -14.99, PAYPAL],
  ['2026-07-31', -14.99, PAYPAL],
  ['2026-09-01', -14.99, PAYPAL],
])

/** Hevy, also through PayPal: twice, five months apart. Not a rhythm. */
export const hevyPaypal = rows('hevy', [
  ['2025-09-23', -3.49, PAYPAL],
  ['2026-02-10', -3.49, PAYPAL],
])

const APPLE = 'CB Apple.com/bill'

/**
 * Everything charged as `CB Apple.com/bill` over fifteen months: a 9.99
 * monthly service, a 39.99 yearly one, and the purchases around them.
 */
export const apple = rows('apple', [
  ['2025-07-07', -9.99, APPLE],
  ['2025-07-11', -22.99, APPLE],
  ['2025-08-04', -9.99, APPLE],
  ['2025-08-08', -3.49, APPLE],
  ['2025-08-25', -39.99, APPLE],
  ['2025-09-02', -2.39, APPLE],
  ['2025-09-04', -9.99, APPLE],
  ['2025-09-08', -34.99, APPLE],
  ['2025-10-06', -9.99, APPLE],
  ['2025-10-13', -10.99, APPLE],
  ['2025-10-13', -59.99, APPLE],
  ['2025-10-14', -12.99, APPLE],
  ['2025-11-04', -9.99, APPLE],
  ['2025-11-12', -2.39, APPLE],
  ['2025-12-03', -62, APPLE],
  ['2025-12-04', -9.99, APPLE],
  ['2025-12-11', -11.99, APPLE],
  ['2025-12-22', -119.99, APPLE],
  ['2025-12-29', -22.9, APPLE],
  ['2026-01-05', -9.99, APPLE],
  ['2026-03-02', -29.99, APPLE],
  ['2026-03-04', -9.99, APPLE],
  ['2026-03-09', -26.49, APPLE],
  ['2026-04-07', -9.99, APPLE],
  ['2026-05-05', -9.99, APPLE],
  ['2026-06-01', -11.99, APPLE],
  ['2026-06-04', -9.99, APPLE],
  ['2026-07-07', -9.99, APPLE],
  ['2026-07-07', -35, APPLE],
  ['2026-08-04', -9.99, APPLE],
  ['2026-08-14', -2.39, APPLE],
  ['2026-08-25', -39.99, APPLE],
  ['2026-09-04', -9.99, APPLE],
  ['2026-10-05', -9.99, APPLE],
])

/**
 * The rent, a transfer made by hand from the joint account: 650 then 660,
 * paid anywhere from the 1st to the 7th, labelled with or without who sent
 * it.
 */
export const rent = rows('rent', [
  ['2025-08-07', -650, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2025-09-03', -650, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2025-10-02', -650, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2025-11-03', -650, 'Vir Inst Martin Paul'],
  ['2025-12-03', -650, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2026-01-02', -660, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2026-02-02', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-03-02', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-04-01', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-05-04', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-06-01', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-07-07', -660, 'Vir Inst Martin Paul Virement De Claire Durand'],
  ['2026-08-03', -660, 'Vir Sepa Martin Paul Virement De Claire Durand Réf'],
  ['2026-09-01', -660, 'Vir Sepa Martin Paul'],
  ['2026-10-01', -660, 'Vir Sepa Martin Paul Virement De Claire Durand'],
])

const AMV = 'Prlv Sepa Amv'

/**
 * Two insurance contracts at the same insurer, debited the same day each
 * month: one revised from 28.50 to 29.50, the other from 48.50 to 37.30.
 */
export const amv = rows('amv', [
  ['2025-07-10', -48.5, AMV],
  ['2025-07-10', -28.5, AMV],
  ['2025-08-11', -48.5, AMV],
  ['2025-08-11', -28.5, AMV],
  ['2025-09-10', -48.5, AMV],
  ['2025-09-10', -28.5, AMV],
  ['2025-10-10', -28.5, AMV],
  ['2025-10-10', -48.5, AMV],
  ['2025-11-10', -48.5, AMV],
  ['2025-11-10', -28.5, AMV],
  ['2025-12-10', -28.5, AMV],
  ['2025-12-10', -48.5, AMV],
  ['2026-01-12', -48.5, AMV],
  ['2026-01-12', -28.5, AMV],
  ['2026-02-10', -28.5, AMV],
  ['2026-02-10', -48.5, AMV],
  ['2026-03-10', -37.3, AMV],
  ['2026-03-10', -28.5, AMV],
  ['2026-04-10', -28.5, AMV],
  ['2026-04-10', -37.3, AMV],
  ['2026-05-11', -37.3, AMV],
  ['2026-05-11', -28.5, AMV],
  ['2026-06-10', -37.3, AMV],
  ['2026-06-10', -29.5, AMV],
  ['2026-07-10', -29.5, AMV],
  ['2026-07-10', -37.3, AMV],
  ['2026-08-10', -29.5, AMV],
  ['2026-08-10', -37.3, AMV],
  ['2026-09-10', -29.5, AMV],
  ['2026-09-10', -37.3, AMV],
])

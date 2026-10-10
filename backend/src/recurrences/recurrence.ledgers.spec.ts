import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { detectRecurrences } from './recurrence.detection'

/**
 * Whole ledgers, replayed: what detection makes of two real accounts,
 * anonymised (`src/scripts/export-recurrence-ledger.ts`), compared to a
 * reviewed reference.
 *
 * The thresholds of detection interact; a rule tuned for one case can
 * break another nobody is looking at. When this fails, read the diff: it is
 * the exact effect of the change on two real histories. Accept it with
 * `vitest -u` only once every line of it is what the change meant to do.
 *
 * The ledgers carry real dates and amounts. Where they are not checked in,
 * the test is skipped rather than failed; export them again with the
 * script to run it.
 */

interface Ledger {
  readAt: string
  expenses: Array<{
    id: string
    date: string
    amount: number
    description: string
    categoryId: string | null
    subcategoryId: string | null
  }>
}

const LEDGERS = ['ledger-a', 'ledger-b']
const ledgerPath = (name: string): string =>
  path.join(__dirname, 'ledgers', `${name}.json`)
const available = LEDGERS.every(name => existsSync(ledgerPath(name)))

function load(name: string): Ledger {
  return JSON.parse(readFileSync(ledgerPath(name), 'utf8')) as Ledger
}

/** One line per recurrence, the way a person reviews the list. */
function replay(ledger: Ledger): string[] {
  const now = new Date(`${ledger.readAt}T00:00:00.000Z`)
  return detectRecurrences(
    ledger.expenses.map(expense => ({
      ...expense,
      date: new Date(`${expense.date}T00:00:00.000Z`),
    })),
    { now }
  ).map(r =>
    [
      r.status.padEnd(9),
      r.period.padEnd(11),
      r.amount.toFixed(2).padStart(8),
      `${r.monthlyEquivalent.toFixed(2)}/mois`.padStart(13),
      `x${r.occurrences}`.padStart(4),
      `${r.firstDate.toISOString().slice(0, 10)}→${r.lastDate.toISOString().slice(0, 10)}`,
      `total ${r.totalPaid.toFixed(2)}`.padStart(15),
      r.name,
    ].join(' ')
  )
}

describe.skipIf(!available)('detection over whole ledgers', () => {
  it.each(LEDGERS)('reads %s as the reference says', name => {
    expect(replay(load(name))).toMatchSnapshot()
  })
})

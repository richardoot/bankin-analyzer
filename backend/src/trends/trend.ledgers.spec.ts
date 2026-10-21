import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import type { TrendLedger } from '../scripts/export-trends-ledger'
import { replayAll } from '../scripts/export-trends-ledger'
import { TREND_RULES, aggregateMonths } from './trend.detection'

/**
 * Whole ledgers, replayed: what the trend detection makes of real accounts,
 * anonymised (`src/scripts/export-trends-ledger.ts`), compared to a reviewed
 * reference — the last three closed months, every window, the everyday
 * reading.
 *
 * The thresholds interact; a rule tuned for one month can break another
 * nobody is looking at. When this fails, read the diff: it is the exact
 * effect of the change on real histories. Accept it with `vitest -u` only
 * once every line of it is what the change meant to do.
 *
 * The ledgers carry real dates and amounts. Where they are not checked in,
 * the test is skipped rather than failed; export them again with the script.
 */

const DIR = path.join(__dirname, 'ledgers')
const LEDGERS = existsSync(DIR)
  ? readdirSync(DIR)
      .filter(name => name.endsWith('.json'))
      .map(name => name.replace(/\.json$/, ''))
      .sort()
  : []

function load(name: string): TrendLedger {
  return JSON.parse(
    readFileSync(path.join(DIR, `${name}.json`), 'utf8')
  ) as TrendLedger
}

const readAtOf = (ledger: TrendLedger): Date =>
  new Date(`${ledger.readAt}T12:00:00.000Z`)

/** One line per trend, the way a person reviews the card. */
function replay(ledger: TrendLedger): string[] {
  return replayAll(ledger.registry, readAtOf(ledger)).flatMap(
    ({ month, window, insights }) => [
      `${month} w${window}: ${insights.length}`,
      ...insights.map((insight, index) =>
        [
          index < TREND_RULES.shown ? '  *' : '   ',
          insight.kind.padEnd(9),
          insight.score.toFixed(0).padStart(5),
          insight.sentence,
        ].join(' ')
      ),
    ]
  )
}

describe.skipIf(LEDGERS.length === 0)('trends over whole ledgers', () => {
  it.each(LEDGERS)('reads %s as the reference says', name => {
    expect(replay(load(name))).toMatchSnapshot()
  })

  it.each(LEDGERS)('adds every month of %s up from its units', name => {
    const ledger = load(name)
    const months = [
      ...new Set(ledger.registry.lines.map(l => l.date.slice(0, 7))),
    ].sort()
    for (const reading of ['everyday', 'real'] as const) {
      for (const aggregate of aggregateMonths(
        ledger.registry,
        reading,
        months
      ).values()) {
        const units = [...aggregate.units]
          .filter(([key]) => key.startsWith('category:'))
          .reduce((sum, [, unit]) => sum + unit.amount, 0)
        expect(units + aggregate.uncategorized).toBeCloseTo(aggregate.total, 6)
      }
    }
  })

  it.each(LEDGERS)('reads %s the same twice', name => {
    const ledger = load(name)
    expect(replayAll(ledger.registry, readAtOf(ledger))).toEqual(
      replayAll(ledger.registry, readAtOf(ledger))
    )
  })
})

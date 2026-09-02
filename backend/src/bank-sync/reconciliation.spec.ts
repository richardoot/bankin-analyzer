import { describe, it, expect } from 'vitest'
import {
  findDuplicateGroups,
  labelSimilarity,
  normalizeLabel,
  reconcileOne,
  summarize,
  type LedgerTransaction,
  type StagedTransaction,
  type Verdict,
} from './reconciliation'

function staged(overrides: Partial<StagedTransaction> = {}): StagedTransaction {
  return {
    externalAccountId: 'acc-api-1',
    externalId: 'ENTRY-1',
    date: '2026-08-25',
    amount: -39.99,
    label: 'CARTE 25/08/26 APPLE.COM/BILL    CB*7962',
    ...overrides,
  }
}

function ledger(overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id: 'tx-1',
    accountId: 'acc-db-1',
    date: '2026-08-25',
    amount: -39.99,
    description: 'CB Apple.com/bill',
    externalId: null,
    ...overrides,
  }
}

describe('normalizeLabel', () => {
  it('drops the card date and card number Boursorama wraps around a merchant', () => {
    expect(normalizeLabel('CARTE 06/08/26 FITNESS PARK      CB*7962')).toBe(
      'FITNESS PARK'
    )
  })

  it('drops the SEPA mandate reference CIC appends', () => {
    expect(
      normalizeLabel('PRLV SEPA PAYPAL EUROPE S.A.R.L 1052705322624')
    ).toBe('PRLV SEPA PAYPAL EUROPE S A R L')
  })

  it('drops mixed alphanumeric archive codes', () => {
    expect(normalizeLabel('VIR EKINO I0000017315071')).toBe('VIR EKINO')
  })

  it('folds accents and case so the two sources agree', () => {
    expect(normalizeLabel('Réglement Café')).toBe('REGLEMENT CAFE')
  })

  it('keeps a short number that is part of the name', () => {
    // "AUCHAN SUP 832" — the 832 is the store, not a reference.
    expect(normalizeLabel('CARTE 31/08/26 AUCHAN SUP 832')).toBe(
      'AUCHAN SUP 832'
    )
  })
})

describe('labelSimilarity', () => {
  it('scores a perfect match at 1', () => {
    expect(labelSimilarity('FITNESS PARK', 'Fitness Park')).toBe(1)
  })

  it('ignores word order', () => {
    const score = labelSimilarity(
      'VIR DE M RICHARD BOILLEY Payment from Richard Boilley',
      'Payment From Richard Boilley Vir De M Richard Boilley'
    )
    expect(score).toBe(1)
  })

  it('sees through the padding each source adds', () => {
    expect(
      labelSimilarity(
        'CARTE 25/08/26 APPLE.COM/BILL    CB*7962',
        'CB Apple.com/bill'
      )
    ).toBeGreaterThan(0.4)
  })

  it('scores unrelated labels at 0', () => {
    expect(labelSimilarity('FITNESS PARK', 'CARREFOUR CITY')).toBe(0)
  })

  it('scores 0 rather than dividing by zero when nothing survives normalizing', () => {
    expect(labelSimilarity('CB*7962', '12345678')).toBe(0)
  })
})

describe('reconcileOne', () => {
  it('recognises a row already carrying this bank reference', () => {
    const verdict = reconcileOne(staged(), [
      ledger({ id: 'tx-known', externalId: 'ENTRY-1' }),
    ])
    expect(verdict).toEqual({
      kind: 'alreadyLinked',
      transactionId: 'tx-known',
    })
  })

  it('recognises it even after the bank restated the date and amount', () => {
    // The point of an immutable reference: a pending transaction that settles
    // changes date and wording, and must not be ingested a second time.
    const verdict = reconcileOne(
      staged({ date: '2026-09-02', amount: -41.5 }),
      [ledger({ id: 'tx-known', externalId: 'ENTRY-1', date: '2026-08-25' })]
    )
    expect(verdict).toEqual({
      kind: 'alreadyLinked',
      transactionId: 'tx-known',
    })
  })

  it('matches a CSV row by amount, date and label', () => {
    const verdict = reconcileOne(staged(), [ledger()])
    expect(verdict).toMatchObject({ kind: 'matched', transactionId: 'tx-1' })
  })

  it('tolerates the days the two sources disagree by', () => {
    expect(
      reconcileOne(staged(), [ledger({ date: '2026-08-27' })])
    ).toMatchObject({ kind: 'matched' })
  })

  it('refuses a date beyond the tolerance', () => {
    expect(reconcileOne(staged(), [ledger({ date: '2026-09-10' })])).toEqual({
      kind: 'new',
    })
  })

  it('refuses an amount that differs by a cent', () => {
    expect(reconcileOne(staged(), [ledger({ amount: -40.0 })])).toEqual({
      kind: 'new',
    })
  })

  it('reports nothing to match as new', () => {
    expect(reconcileOne(staged(), [])).toEqual({ kind: 'new' })
  })

  it('calls two equally plausible candidates ambiguous rather than guessing', () => {
    // The real case from phase 2: two 50 € transfers between the same people,
    // days apart, worded identically.
    const verdict = reconcileOne(
      staged({ label: 'VIR INST RICHARD BOILLEY', amount: 50 }),
      [
        ledger({
          id: 'tx-a',
          amount: 50,
          description: 'Vir Inst Richard Boilley',
        }),
        ledger({
          id: 'tx-b',
          amount: 50,
          date: '2026-08-26',
          description: 'Vir Inst Richard Boilley',
        }),
      ]
    )
    expect(verdict.kind).toBe('ambiguous')
    if (verdict.kind === 'ambiguous') {
      expect(verdict.candidates).toHaveLength(2)
    }
  })

  it('lets the label break a tie when it says something', () => {
    const verdict = reconcileOne(
      staged({ label: 'CARTE 25/08/26 FITNESS PARK' }),
      [
        ledger({ id: 'tx-gym', description: 'CB Fitness Park' }),
        ledger({ id: 'tx-other', description: 'CB Carrefour City' }),
      ]
    )
    expect(verdict).toMatchObject({ kind: 'matched', transactionId: 'tx-gym' })
  })

  it('will not claim a row another bank reference already owns', () => {
    // Two API transactions must never both link to one ledger row.
    const verdict = reconcileOne(staged({ externalId: 'ENTRY-2' }), [
      ledger({ externalId: 'ENTRY-1' }),
    ])
    expect(verdict).toEqual({ kind: 'new' })
  })

  it('honours a similarity floor when one is asked for', () => {
    const verdict = reconcileOne(
      staged({ label: 'CARTE 25/08/26 FITNESS PARK' }),
      [ledger({ description: 'CB Carrefour City' })],
      { minimumSimilarity: 0.5 }
    )
    expect(verdict.kind).toBe('ambiguous')
  })
})

describe('findDuplicateGroups', () => {
  it('pairs a card purchase with its twin on the current account', () => {
    const groups = findDuplicateGroups([
      staged({
        externalAccountId: 'card',
        externalId: 'CARD-1',
        label: 'CARTE 25/08/26 APPLE.COM/BILL CB*7962',
      }),
      staged({
        externalAccountId: 'current',
        externalId: 'CURRENT-1',
        label: 'APPLE.COM/BILL',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.externalAccountIds.sort()).toEqual(['card', 'current'])
  })

  it('is not fooled by the different reference each side carries', () => {
    // Exactly what `(account_id, external_id)` cannot see.
    const groups = findDuplicateGroups([
      staged({ externalAccountId: 'a', externalId: 'REF-A' }),
      staged({ externalAccountId: 'b', externalId: 'REF-B' }),
    ])
    expect(groups).toHaveLength(1)
  })

  it('leaves two purchases of different amounts alone', () => {
    const groups = findDuplicateGroups([
      staged({ externalAccountId: 'a', amount: -10 }),
      staged({ externalAccountId: 'b', amount: -20 }),
    ])
    expect(groups).toEqual([])
  })

  it('does not pair an account with itself', () => {
    const groups = findDuplicateGroups([
      staged({ externalAccountId: 'a', externalId: 'REF-1' }),
      staged({ externalAccountId: 'a', externalId: 'REF-2' }),
    ])
    expect(groups).toEqual([])
  })
})

describe('summarize', () => {
  it('counts each verdict under its own name', () => {
    const verdicts: Verdict[] = [
      { kind: 'new' },
      { kind: 'new' },
      { kind: 'matched', transactionId: 'a', similarity: 1 },
      { kind: 'alreadyLinked', transactionId: 'b' },
      { kind: 'ambiguous', candidates: [] },
    ]
    expect(summarize(verdicts)).toEqual({
      total: 5,
      new: 2,
      matched: 1,
      alreadyLinked: 1,
      ambiguous: 1,
    })
  })

  it('counts nothing as nothing', () => {
    expect(summarize([])).toEqual({
      total: 0,
      new: 0,
      matched: 0,
      alreadyLinked: 0,
      ambiguous: 0,
    })
  })
})

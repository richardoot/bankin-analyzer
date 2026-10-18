import { describe, it, expect } from 'vitest'
import {
  NO_CATEGORY,
  TRANSACTIONS_QUERY_KEYS,
  hasTransactionsQuery,
  isTransactionsContext,
  monthWindow,
  parseTransactionsQuery,
  sameTransactionsQuery,
  transactionsLink,
  transactionsQuery,
  type TransactionsLinkFilters,
} from './transactionsLink'

describe('transactionsLink', () => {
  it('points at the Transactions page with the filters as query', () => {
    expect(transactionsLink({ type: 'EXPENSE', categoryId: 'cat-1' })).toEqual({
      path: '/transactions',
      query: { type: 'EXPENSE', category: 'cat-1' },
    })
  })

  it('opens the page bare when given nothing', () => {
    expect(transactionsLink()).toEqual({ path: '/transactions', query: {} })
  })

  it('expands a month into its first and last day', () => {
    expect(transactionsQuery({ month: '2026-02' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(transactionsQuery({ month: '2028-02' })).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
    expect(monthWindow('2026-13')).toBeNull()
    expect(monthWindow('oct')).toBeNull()
  })

  it('joins ids with commas and flags booleans as 1', () => {
    expect(
      transactionsQuery({
        ids: ['a', ' b ', ''],
        gross: true,
        notPointed: true,
        review: true,
      })
    ).toEqual({ ids: 'a,b', gross: '1', notPointed: '1', review: '1' })
  })

  it('drops blanks, defaults and a subcategory without its category', () => {
    expect(
      transactionsQuery({
        q: '   ',
        account: '',
        subcategoryId: 'sub-1',
        sort: 'date',
        dir: 'desc',
        size: 20,
        page: 1,
        gross: false,
      })
    ).toEqual({})
  })

  it('keeps no subcategory under « sans catégorie »', () => {
    expect(
      transactionsQuery({ categoryId: NO_CATEGORY, subcategoryId: 'sub-1' })
    ).toEqual({ category: NO_CATEGORY })
  })

  it('keeps the recurrence label only next to its series', () => {
    expect(transactionsQuery({ recurrenceLabel: 'Netflix' })).toEqual({})
    expect(
      transactionsQuery({ recurrence: '15:com netflix', recurrenceLabel: 'N' })
    ).toEqual({ recurrence: '15:com netflix', recurrenceLabel: 'N' })
  })
})

describe('parseTransactionsQuery', () => {
  const full: TransactionsLinkFilters = {
    type: 'INCOME',
    categoryId: 'cat-1',
    subcategoryId: 'sub-1',
    account: 'Compte joint',
    tagId: 'tag-1',
    from: '2026-10-01',
    to: '2026-10-31',
    min: '10',
    max: '250.5',
    q: 'uber',
    notPointed: true,
    review: true,
    recurrence: '15:com netflix',
    recurrenceLabel: 'Netflix',
    personId: 'person-1',
    reimbursement: 'open',
    settlementId: 'settlement-1',
    importId: 'import-1',
    syncRunId: 'run-1',
    ids: ['tx-1', 'tx-2'],
    exceptional: 'exclude',
    nature: 'ESSENTIAL',
    rhythm: 'none',
    label: 'Dettes ouvertes de Julien',
    gross: true,
    sort: 'amount',
    dir: 'asc',
    size: 100,
    page: 3,
  }

  it('reads back exactly what transactionsQuery wrote', () => {
    expect(parseTransactionsQuery(transactionsQuery(full))).toEqual(full)
  })

  it('round-trips every single field on its own', () => {
    for (const [key, value] of Object.entries(full)) {
      const alone = { [key]: value } as TransactionsLinkFilters
      // A subcategory, a recurrence label: meaningless alone, so dropped.
      const expected =
        key === 'subcategoryId' || key === 'recurrenceLabel' ? {} : alone
      expect(parseTransactionsQuery(transactionsQuery(alone))).toEqual(expected)
    }
  })

  it('normalises a month to its window on the way back', () => {
    expect(
      parseTransactionsQuery(transactionsQuery({ month: '2026-10' }))
    ).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('ignores values it does not know', () => {
    expect(
      parseTransactionsQuery({
        type: 'GIFT',
        reimbursement: 'maybe',
        size: '33',
        page: '0',
        sort: 'merchant',
        dir: 'sideways',
        notPointed: 'yes',
        exceptional: 'sometimes',
        nature: 'essential',
        rhythm: 'constructor',
      })
    ).toEqual({})
  })

  it('takes the first value of a repeated key and trims the free text', () => {
    expect(
      parseTransactionsQuery({ q: ['  uber ', 'x'], account: ['A', 'B'] })
    ).toEqual({ q: 'uber', account: 'A' })
  })

  it('carries the exceptional events left out, or kept alone', () => {
    expect(transactionsQuery({ exceptional: 'only' })).toEqual({
      exceptional: 'only',
    })
    expect(parseTransactionsQuery({ exceptional: 'exclude' })).toEqual({
      exceptional: 'exclude',
    })
  })

  it('reads an id list, blanks removed', () => {
    expect(parseTransactionsQuery({ ids: 'a, b,,c' })).toEqual({
      ids: ['a', 'b', 'c'],
    })
  })
})

describe('hasTransactionsQuery', () => {
  it('sees every key the page reads, labels and sort included', () => {
    expect(hasTransactionsQuery({})).toBe(false)
    expect(hasTransactionsQuery({ foo: 'bar' })).toBe(false)
    expect(hasTransactionsQuery({ type: '' })).toBe(false)
    for (const key of TRANSACTIONS_QUERY_KEYS) {
      expect(hasTransactionsQuery({ [key]: 'x' })).toBe(true)
    }
  })
})

describe('isTransactionsContext', () => {
  it('is true for what the page controls cannot express', () => {
    expect(isTransactionsContext({ type: 'EXPENSE', from: '2026-01-01' })).toBe(
      false
    )
    expect(isTransactionsContext({ label: 'Alimentation · oct. 2026' })).toBe(
      true
    )
    expect(isTransactionsContext({ personId: 'p' })).toBe(true)
    expect(isTransactionsContext({ reimbursement: 'open' })).toBe(true)
    expect(isTransactionsContext({ settlementId: 's' })).toBe(true)
    expect(isTransactionsContext({ importId: 'i' })).toBe(true)
    expect(isTransactionsContext({ syncRunId: 'r' })).toBe(true)
    expect(isTransactionsContext({ ids: ['a'] })).toBe(true)
    expect(isTransactionsContext({ ids: [] })).toBe(false)
  })
})

describe('sameTransactionsQuery', () => {
  it('compares on the known keys only, absence equal to blank', () => {
    expect(
      sameTransactionsQuery({ type: 'EXPENSE' }, { type: 'EXPENSE' })
    ).toBe(true)
    expect(sameTransactionsQuery({ type: 'EXPENSE' }, {})).toBe(false)
    expect(sameTransactionsQuery({ page: '' }, {})).toBe(true)
  })
})

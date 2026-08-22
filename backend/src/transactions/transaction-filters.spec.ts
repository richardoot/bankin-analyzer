import { describe, it, expect } from 'vitest'
import {
  parseTransactionFilters,
  buildTransactionWhere,
} from './transaction-filters'

describe('parseTransactionFilters', () => {
  it('returns nothing for an empty request', () => {
    expect(parseTransactionFilters({})).toEqual({})
  })

  it('covers the whole day of a date-only upper bound', () => {
    // A bare YYYY-MM-DD parses to midnight, which would exclude everything
    // that happened during the day the user asked for.
    const { endDate } = parseTransactionFilters({ endDate: '2026-08-22' })

    expect(endDate?.toISOString()).toBe('2026-08-22T23:59:59.999Z')
  })

  it('leaves a full timestamp upper bound alone', () => {
    const { endDate } = parseTransactionFilters({
      endDate: '2026-08-22T10:00:00.000Z',
    })

    expect(endDate?.toISOString()).toBe('2026-08-22T10:00:00.000Z')
  })

  it('drops a subcategory sent without its category', () => {
    // A subcategory only exists inside a category, so on its own it is
    // ambiguous rather than restrictive.
    const filters = parseTransactionFilters({ subcategoryId: 'sub-1' })

    expect(filters.subcategoryId).toBeUndefined()
  })

  it('keeps a subcategory sent with its category', () => {
    const filters = parseTransactionFilters({
      categoryId: 'cat-1',
      subcategoryId: 'sub-1',
    })

    expect(filters.subcategoryId).toBe('sub-1')
  })

  it('reads isPointed from a query string and from JSON alike', () => {
    expect(parseTransactionFilters({ isPointed: 'true' }).isPointed).toBe(true)
    expect(parseTransactionFilters({ isPointed: 'false' }).isPointed).toBe(
      false
    )
    expect(parseTransactionFilters({ isPointed: true }).isPointed).toBe(true)
    expect(parseTransactionFilters({ isPointed: false }).isPointed).toBe(false)
  })

  it('ignores amount bounds that are not usable magnitudes', () => {
    expect(
      parseTransactionFilters({ amountMin: 'abc' }).amountMin
    ).toBeUndefined()
    expect(
      parseTransactionFilters({ amountMin: '-5' }).amountMin
    ).toBeUndefined()
  })

  it('reads a cleared field as no bound, not as zero', () => {
    // Number('') is 0, so the naive parse turned an emptied input into
    // "amount is exactly 0", which matches nothing.
    expect(parseTransactionFilters({ amountMax: '' }).amountMax).toBeUndefined()
    expect(
      parseTransactionFilters({ amountMin: '  ' }).amountMin
    ).toBeUndefined()
  })

  it('accepts zero as a bound', () => {
    // Zero is a legitimate floor, and the naive falsy check drops it.
    expect(parseTransactionFilters({ amountMin: '0' }).amountMin).toBe(0)
  })

  it('trims a search term and drops a blank one', () => {
    expect(parseTransactionFilters({ search: '  uber ' }).search).toBe('uber')
    expect(parseTransactionFilters({ search: '   ' }).search).toBeUndefined()
  })
})

describe('buildTransactionWhere', () => {
  it('scopes to the user even with no filter at all', () => {
    expect(buildTransactionWhere('user-1')).toEqual({ userId: 'user-1' })
  })

  it('matches an amount floor on either sign', () => {
    // Expenses are stored negative but the user reasons in magnitude, so
    // "at least 50" has to catch -80 as well as 80.
    const where = buildTransactionWhere('user-1', { amountMin: 50 })

    expect(where.AND).toEqual([
      { OR: [{ amount: { gte: 50 } }, { amount: { lte: -50 } }] },
    ])
  })

  it('matches an amount ceiling as a band around zero', () => {
    const where = buildTransactionWhere('user-1', { amountMax: 50 })

    expect(where.AND).toEqual([{ amount: { gte: -50, lte: 50 } }])
  })

  it('searches description, note and subcategory together', () => {
    const where = buildTransactionWhere('user-1', { search: 'uber' })

    expect(where.AND).toEqual([
      {
        OR: [
          { description: { contains: 'uber', mode: 'insensitive' } },
          { note: { contains: 'uber', mode: 'insensitive' } },
          { subcategory: { contains: 'uber', mode: 'insensitive' } },
        ],
      },
    ])
  })

  it('applies each date bound independently', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    expect(buildTransactionWhere('user-1', { startDate: start }).date).toEqual({
      gte: start,
    })

    const end = new Date('2026-12-31T23:59:59.999Z')
    expect(buildTransactionWhere('user-1', { endDate: end }).date).toEqual({
      lte: end,
    })
  })

  it('keeps isPointed false rather than treating it as absent', () => {
    const where = buildTransactionWhere('user-1', { isPointed: false })

    expect(where.isPointed).toBe(false)
  })

  it('reaches accounts by name and tags through the join table', () => {
    const where = buildTransactionWhere('user-1', {
      account: 'Checking',
      tagId: 'tag-1',
    })

    expect(where.accountRef).toEqual({ name: 'Checking' })
    expect(where.tags).toEqual({ some: { tagId: 'tag-1' } })
  })

  it('combines every clause without letting them collide', () => {
    const where = buildTransactionWhere('user-1', {
      categoryId: 'cat-1',
      search: 'uber',
      amountMin: 10,
      amountMax: 100,
    })

    expect(where.categoryId).toBe('cat-1')
    // Three independent conditions, kept side by side in AND rather than
    // overwriting one another at the top level.
    expect(where.AND).toHaveLength(3)
  })
})

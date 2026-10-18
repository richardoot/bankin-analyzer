import { describe, it, expect } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import {
  parseTransactionFilters,
  buildTransactionWhere,
  MAX_TRANSACTION_IDS,
} from './transaction-filters'

const uuid = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`

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

  it('reads needsBankReview from a query string and from JSON alike', () => {
    expect(
      parseTransactionFilters({ needsBankReview: 'true' }).needsBankReview
    ).toBe(true)
    expect(
      parseTransactionFilters({ needsBankReview: 'false' }).needsBankReview
    ).toBe(false)
    expect(
      parseTransactionFilters({ needsBankReview: true }).needsBankReview
    ).toBe(true)
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

  it('matches an unclaimed synced row when asked to review the bank sync', () => {
    const where = buildTransactionWhere('user-1', { needsBankReview: true })

    expect(where.source).toBe('BANK_API')
    expect(where.externalId).toBeNull()
  })

  it('ignores needsBankReview when false, rather than filtering by it', () => {
    const where = buildTransactionWhere('user-1', { needsBankReview: false })

    expect(where.source).toBeUndefined()
    expect(where.externalId).toBeUndefined()
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

  describe('recurrence', () => {
    it('reads a series by its bucket and merchant', () => {
      expect(
        parseTransactionFilters({ recurrence: '15:com netflix' }).recurrence
      ).toEqual({ amountBucket: 15, merchantKey: 'com netflix' })
    })

    it('ignores a value that names no series', () => {
      expect(
        parseTransactionFilters({ recurrence: 'netflix' }).recurrence
      ).toBeUndefined()
      expect(parseTransactionFilters({ recurrence: '15:' }).recurrence).toBe(
        undefined
      )
    })

    it('keeps the lines linked to that series', () => {
      const where = buildTransactionWhere('user-1', {
        recurrence: { amountBucket: 15, merchantKey: 'com netflix' },
      })

      expect(where.recurrences).toEqual({
        some: { recurrence: { amountBucket: 15, merchantKey: 'com netflix' } },
      })
    })
  })

  describe('an exact list of ids', () => {
    it('reads a comma-separated query and a JSON array alike', () => {
      expect(
        parseTransactionFilters({ ids: `${uuid(1)}, ${uuid(2)}` }).ids
      ).toEqual([uuid(1), uuid(2)])
      expect(parseTransactionFilters({ ids: [uuid(1), uuid(1)] }).ids).toEqual([
        uuid(1),
      ])
    })

    it('drops what is not an id, and matches nothing when nothing is left', () => {
      // A list made only of garbage must not fall back to "everything".
      expect(parseTransactionFilters({ ids: 'abc,1' }).ids).toEqual([])
      expect(parseTransactionFilters({ ids: `${uuid(1)},abc` }).ids).toEqual([
        uuid(1),
      ])
      expect(parseTransactionFilters({ ids: '' }).ids).toBeUndefined()
      expect(parseTransactionFilters({ ids: ' , ' }).ids).toBeUndefined()
    })

    it('refuses more than the cap rather than truncating', () => {
      const many = Array.from({ length: MAX_TRANSACTION_IDS + 1 }, (_, i) =>
        uuid(i)
      )
      expect(() => parseTransactionFilters({ ids: many })).toThrow(
        BadRequestException
      )
      expect(parseTransactionFilters({ ids: many.slice(1) }).ids).toHaveLength(
        MAX_TRANSACTION_IDS
      )
    })

    it('narrows by id inside AND, next to the other conditions', () => {
      const where = buildTransactionWhere('user-1', {
        ids: [uuid(1)],
        search: 'uber',
      })

      expect(where.AND).toEqual([
        expect.objectContaining({ OR: expect.any(Array) }),
        { id: { in: [uuid(1)] } },
      ])
    })
  })

  describe('« sans catégorie »', () => {
    it('reads none as a null category', () => {
      expect(parseTransactionFilters({ categoryId: 'none' })).toEqual({
        categoryId: null,
      })
      expect(
        buildTransactionWhere('user-1', { categoryId: null }).categoryId
      ).toBeNull()
    })

    it('reads none as a null subcategory, inside a real category only', () => {
      expect(
        parseTransactionFilters({ categoryId: 'cat-1', subcategoryId: 'none' })
      ).toEqual({ categoryId: 'cat-1', subcategoryId: null })
      expect(
        parseTransactionFilters({ categoryId: 'none', subcategoryId: 'none' })
      ).toEqual({ categoryId: null })
      expect(
        buildTransactionWhere('user-1', {
          categoryId: 'cat-1',
          subcategoryId: null,
        })
      ).toMatchObject({ categoryId: 'cat-1', subcategoryId: null })
    })

    it('still leaves an absent category out of the where', () => {
      expect(buildTransactionWhere('user-1', {})).toEqual({ userId: 'user-1' })
    })
  })

  describe('reimbursements', () => {
    it('reads a person, open by request only', () => {
      expect(
        parseTransactionFilters({ personId: 'p-1' }).reimbursement
      ).toEqual({ personId: 'p-1', open: false })
      expect(
        parseTransactionFilters({ personId: 'p-1', reimbursement: 'open' })
          .reimbursement
      ).toEqual({ personId: 'p-1', open: true })
      expect(
        parseTransactionFilters({ reimbursement: 'open' }).reimbursement
      ).toEqual({ open: true })
      expect(
        parseTransactionFilters({ reimbursement: 'all' }).reimbursement
      ).toEqual({ open: false })
      expect(parseTransactionFilters({}).reimbursement).toBeUndefined()
    })

    it('matches every expense carrying a request, of one person or anyone', () => {
      expect(
        buildTransactionWhere('user-1', {
          reimbursement: { personId: 'p-1', open: false },
        }).AND
      ).toEqual([{ reimbursementRequests: { some: { personId: 'p-1' } } }])
      expect(
        buildTransactionWhere('user-1', { reimbursement: { open: false } }).AND
      ).toEqual([{ reimbursementRequests: { some: {} } }])
    })

    it('narrows open debts to the rows the ledger resolved', () => {
      expect(
        buildTransactionWhere(
          'user-1',
          { reimbursement: { open: true } },
          { openDebtTransactionIds: ['tx-1'] }
        ).AND
      ).toEqual([{ id: { in: ['tx-1'] } }])
      // Building it without the resolution would silently widen the list.
      expect(() =>
        buildTransactionWhere('user-1', { reimbursement: { open: true } })
      ).toThrow()
    })
  })

  describe('a settlement, an import, a sync run', () => {
    it('reads each id under its own name', () => {
      expect(
        parseTransactionFilters({
          settlementId: 's-1',
          importId: 'i-1',
          syncRunId: 'r-1',
        })
      ).toEqual({
        settlementId: 's-1',
        importHistoryId: 'i-1',
        syncRunId: 'r-1',
      })
    })

    it('matches the expenses a settlement closed and the income that paid them', () => {
      expect(
        buildTransactionWhere('user-1', { settlementId: 's-1' }).AND
      ).toEqual([
        {
          OR: [
            { settlementsAsIncome: { some: { id: 's-1' } } },
            {
              reimbursementRequests: {
                some: { settlements: { some: { settlementId: 's-1' } } },
              },
            },
          ],
        },
      ])
    })

    it('matches the rows an import or a sync run wrote', () => {
      expect(
        buildTransactionWhere('user-1', { importHistoryId: 'i-1' })
      ).toEqual({ userId: 'user-1', importHistoryId: 'i-1' })
      expect(buildTransactionWhere('user-1', { syncRunId: 'r-1' })).toEqual({
        userId: 'user-1',
        syncRunId: 'r-1',
      })
    })
  })
})

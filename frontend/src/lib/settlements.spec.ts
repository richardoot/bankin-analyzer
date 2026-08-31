import { describe, it, expect } from 'vitest'
import {
  availableAmountOf,
  cascadeAllocate,
  personSearchTerms,
  prorataAllocate,
  scoreIncomeTransaction,
  toAllocationLine,
  type AllocationLine,
} from './settlements'
import type { ReimbursementDto, TransactionDto } from './api'

const line = (overrides: Partial<AllocationLine> = {}): AllocationLine => ({
  reimbursementId: 'r-1',
  categoryId: 'cat-courses',
  categoryName: 'R Courses',
  date: '2026-08-05',
  description: 'Monoprix',
  amountDue: 15,
  ...overrides,
})

const income = (overrides: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'tx-1',
  date: '2026-08-14',
  description: 'VIR ALICE MARTIN',
  amount: 57,
  type: 'INCOME',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: 'cat-courses',
  categoryName: 'R Courses',
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
})

describe('availableAmountOf', () => {
  it('returns the full amount when nothing has been settled yet', () => {
    expect(availableAmountOf(income())).toBe(57)
  })

  it('subtracts the settlements already drawn on the transaction', () => {
    const transaction = income({
      settlements: [
        {
          id: 's-1',
          personId: 'p-1',
          personName: 'Alice',
          amountUsed: 18,
        },
        {
          id: 's-2',
          personId: 'p-2',
          personName: 'Paul',
          amountUsed: 9,
        },
      ],
    })

    expect(availableAmountOf(transaction)).toBe(30)
  })
})

describe('cascadeAllocate', () => {
  const older = line({
    reimbursementId: 'r-old',
    date: '2026-08-05',
    amountDue: 15,
  })
  const newer = line({
    reimbursementId: 'r-new',
    date: '2026-08-12',
    amountDue: 30,
  })

  it('settles every line in full when the pot covers the total', () => {
    const allocations = cascadeAllocate([newer, older], 45)

    expect(allocations.get('r-old')).toBe(15)
    expect(allocations.get('r-new')).toBe(30)
  })

  it('fills the oldest line first and leaves the rest untouched', () => {
    const allocations = cascadeAllocate([newer, older], 15)

    // The whole point of the cascade: one clean COMPLETED, one clean PENDING,
    // rather than two PARTIAL lines.
    expect(allocations.get('r-old')).toBe(15)
    expect(allocations.get('r-new')).toBe(0)
  })

  it('gives the remainder to the next line once the older ones are settled', () => {
    const allocations = cascadeAllocate([newer, older], 20)

    expect(allocations.get('r-old')).toBe(15)
    expect(allocations.get('r-new')).toBe(5)
  })

  it('never allocates more than the pot', () => {
    const allocations = cascadeAllocate([newer, older], 1000)
    const total = [...allocations.values()].reduce((sum, v) => sum + v, 0)

    expect(total).toBe(45)
  })
})

describe('prorataAllocate', () => {
  it('splits the pot in proportion to what each line owes', () => {
    const allocations = prorataAllocate(
      [
        line({ reimbursementId: 'r-a', date: '2026-08-01', amountDue: 30 }),
        line({ reimbursementId: 'r-b', date: '2026-08-02', amountDue: 10 }),
      ],
      20
    )

    expect(allocations.get('r-a')).toBe(15)
    expect(allocations.get('r-b')).toBe(5)
  })

  it('keeps the parts summing exactly to the pot despite rounding', () => {
    const allocations = prorataAllocate(
      [
        line({ reimbursementId: 'r-a', date: '2026-08-01', amountDue: 10 }),
        line({ reimbursementId: 'r-b', date: '2026-08-02', amountDue: 10 }),
        line({ reimbursementId: 'r-c', date: '2026-08-03', amountDue: 10 }),
      ],
      10
    )

    const total = [...allocations.values()].reduce((sum, v) => sum + v, 0)
    expect(total).toBe(10)
  })

  it('caps at the total due when the pot is larger', () => {
    const allocations = prorataAllocate(
      [line({ reimbursementId: 'r-a', amountDue: 10 })],
      50
    )

    expect(allocations.get('r-a')).toBe(10)
  })
})

describe('scoreIncomeTransaction', () => {
  const context = {
    personName: 'Alice Martin',
    pendingTotals: [57, 45, 12],
  }

  it('matches the person name through case and accents', () => {
    const { reasons } = scoreIncomeTransaction(
      income({ description: 'VIR ALICE MARTIN', categoryId: null }),
      { ...context, personName: 'Alice Màrtin' }
    )

    expect(reasons).toContain('name')
  })

  it('flags an exact amount match', () => {
    const { reasons } = scoreIncomeTransaction(
      income({ description: 'VIREMENT RECU', amount: 45 }),
      context
    )

    expect(reasons).toContain('amount')
  })

  it('never scores on the category', () => {
    // A debt only knows the expense it repays; matching that against the
    // category of an incoming transfer means nothing. The income category it
    // used to compare with was retired from the debt flow, and reading it left
    // every uncategorised receipt scoring as a match on null.
    const { score, reasons } = scoreIncomeTransaction(
      income({ description: 'VIREMENT', categoryId: null, amount: 3 }),
      context
    )

    expect(score).toBe(0)
    expect(reasons).toEqual([])
  })

  it('scores an unrelated transaction at zero', () => {
    const { score, reasons } = scoreIncomeTransaction(
      income({
        description: 'REMBOURSEMENT CPAM',
        amount: 84.2,
        categoryId: 'cat-sante',
      }),
      context
    )

    expect(score).toBe(0)
    expect(reasons).toEqual([])
  })

  it('ranks an amount match above a name match', () => {
    // A recurring transfer names the same people every month, so the name
    // matches dozens of receipts; the exact figure usually matches one.
    const withName = scoreIncomeTransaction(
      income({ description: 'VIR ALICE', amount: 3 }),
      context
    )
    const withAmount = scoreIncomeTransaction(
      income({ description: 'VIREMENT', amount: 45 }),
      context
    )

    expect(withAmount.score).toBeGreaterThan(withName.score)
  })

  it('ranks a receipt matching both above either signal alone', () => {
    const both = scoreIncomeTransaction(
      income({ description: 'VIR ALICE MARTIN', amount: 45 }),
      context
    )
    const withAmount = scoreIncomeTransaction(
      income({ description: 'VIREMENT', amount: 45 }),
      context
    )

    expect(both.score).toBeGreaterThan(withAmount.score)
  })

  it('lists the amount first so the strongest badge reads first', () => {
    const { reasons } = scoreIncomeTransaction(
      income({ description: 'VIR ALICE MARTIN', amount: 45 }),
      context
    )

    expect(reasons).toEqual(['amount', 'name'])
  })
})

describe('toAllocationLine', () => {
  it('carries the expense transaction date and description across', () => {
    const reimbursement = {
      id: 'r-1',
      transactionId: 'tx-9',
      personId: 'p-1',
      personName: 'Alice',
      expenseCategoryId: 'cat-courses',
      expenseCategoryName: 'Alimentation',
      amount: 30,
      amountReceived: 10,
      amountRemaining: 20,
      status: 'PARTIAL',
      note: null,
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
      transaction: {
        id: 'tx-9',
        date: '2026-08-12',
        description: 'Carrefour',
        amount: -30,
      },
    } satisfies ReimbursementDto

    expect(toAllocationLine(reimbursement)).toEqual({
      reimbursementId: 'r-1',
      categoryId: 'cat-courses',
      categoryName: 'Alimentation',
      date: '2026-08-12',
      description: 'Carrefour',
      amountDue: 20,
    })
  })

  it('groups on the expense repaid', () => {
    // The regression that filed every debt under "Sans categorie": grouping ran
    // on an income hint that was null on most rows. That field is gone from the
    // DTO since the backend dropped its column, so the mistake is no longer
    // expressible — this pins that the expense is what grouping reads.
    const reimbursement = {
      id: 'r-3',
      transactionId: 'tx-7',
      personId: 'p-1',
      personName: 'Alice',
      expenseCategoryId: 'cat-resto',
      expenseCategoryName: 'Restaurant',
      amount: 20,
      amountReceived: 0,
      amountRemaining: 20,
      status: 'PENDING',
      note: null,
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
      transaction: {
        id: 'tx-7',
        date: '2026-08-12',
        description: 'Uber Eats',
        amount: -20,
      },
    } satisfies ReimbursementDto

    const line = toAllocationLine(reimbursement)

    // The income category is loudly set here and must still be ignored: it was
    // retired from the debt flow, and grouping on it is what collapsed the list.
    expect(line.categoryId).toBe('cat-resto')
    expect(line.categoryName).toBe('Restaurant')
    expect(line).not.toHaveProperty('incomeCategoryId')
  })

  it('falls back to a label when the expense transaction was not included', () => {
    const reimbursement = {
      id: 'r-2',
      transactionId: 'tx-9',
      personId: 'p-1',
      personName: 'Alice',
      expenseCategoryId: null,
      expenseCategoryName: null,
      amount: 30,
      amountReceived: 0,
      amountRemaining: 30,
      status: 'PENDING',
      note: null,
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    } satisfies ReimbursementDto

    const allocationLine = toAllocationLine(reimbursement)
    expect(allocationLine.categoryName).toBe('Sans categorie')
    expect(allocationLine.description).toBe('Transaction')
    expect(allocationLine.date).toBe('2026-08-13T10:00:00.000Z')
  })
})

describe('personSearchTerms', () => {
  it('searches each name token on its own', () => {
    // The server matches a substring, so the name whole finds nothing in a
    // statement that reorders the words: "Vir Inst Chloe Torres".
    expect(personSearchTerms('Alice Martin')).toEqual(['Martin', 'Alice'])
  })

  it('searches the unaccented spelling alongside the original', () => {
    // The SQL search folds case but not diacritics, and a bank statement
    // writes the name without them.
    const terms = personSearchTerms('Chlo\u00e9 TORRES')

    expect(terms).toContain('Chlo\u00e9')
    expect(terms).toContain('Chloe')
  })

  it('drops tokens too short to be worth a query', () => {
    // "Moi" is a real person here, and as a substring it matches "mois" across
    // half the ledger. The scoring floor is looser because it only re-ranks
    // rows already fetched; a term here costs a request.
    expect(personSearchTerms('Moi')).toEqual([])
    expect(personSearchTerms('Van de Berg')).toEqual(['Berg'])
  })

  it('puts the longest token first and caps the query count', () => {
    // These fire in parallel when the modal opens; a long name must not
    // multiply the requests without bound.
    const terms = personSearchTerms('Jean Charles \u00c9ric De La Fontaine')

    expect(terms).toHaveLength(4)
    expect(terms[0]).toBe('Fontaine')
  })

  it('returns nothing for a person with no usable name', () => {
    expect(personSearchTerms('')).toEqual([])
  })
})

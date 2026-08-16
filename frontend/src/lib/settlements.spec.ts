import { describe, it, expect } from 'vitest'
import {
  availableAmountOf,
  cascadeAllocate,
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
    pendingCategoryNames: new Set(['R Courses']),
    pendingTotals: [57, 45, 12],
  }

  it('matches the person name through case and accents', () => {
    const { reasons } = scoreIncomeTransaction(
      income({ description: 'VIR ALICE MARTIN', categoryName: undefined }),
      { ...context, personName: 'Alice Màrtin' }
    )

    expect(reasons).toContain('name')
  })

  it('flags a category and an exact amount match', () => {
    const { reasons } = scoreIncomeTransaction(
      income({ description: 'VIREMENT RECU', amount: 45 }),
      context
    )

    expect(reasons).toEqual(expect.arrayContaining(['category', 'amount']))
  })

  it('scores an unrelated transaction at zero', () => {
    const { score, reasons } = scoreIncomeTransaction(
      income({
        description: 'REMBOURSEMENT CPAM',
        amount: 84.2,
        categoryName: 'Sante',
      }),
      context
    )

    expect(score).toBe(0)
    expect(reasons).toEqual([])
  })

  it('ranks a name match above a category match', () => {
    const withName = scoreIncomeTransaction(
      income({ description: 'VIR ALICE', categoryName: 'Sante', amount: 3 }),
      context
    )
    const withCategory = scoreIncomeTransaction(
      income({ description: 'VIREMENT', categoryName: 'R Courses', amount: 3 }),
      context
    )

    expect(withName.score).toBeGreaterThan(withCategory.score)
  })
})

describe('toAllocationLine', () => {
  it('carries the expense transaction date and description across', () => {
    const reimbursement = {
      id: 'r-1',
      transactionId: 'tx-9',
      personId: 'p-1',
      personName: 'Alice',
      categoryId: 'cat-courses',
      categoryName: 'R Courses',
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
      categoryName: 'R Courses',
      date: '2026-08-12',
      description: 'Carrefour',
      amountDue: 20,
    })
  })

  it('falls back to a label when the expense transaction was not included', () => {
    const reimbursement = {
      id: 'r-2',
      transactionId: 'tx-9',
      personId: 'p-1',
      personName: 'Alice',
      categoryId: null,
      categoryName: null,
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

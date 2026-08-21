import { describe, it, expect } from 'vitest'
import {
  nameMatches,
  suggestSettlements,
  type AssociationHints,
  type PendingDebt,
  type UnsettledIncome,
} from './settlement-suggestions'

function debt(overrides: Partial<PendingDebt> = {}): PendingDebt {
  return {
    reimbursementId: 'reimb-dentiste',
    personId: 'person-alice',
    personName: 'Alice Martin',
    description: 'Cabinet dentaire',
    expenseDate: new Date('2026-01-12'),
    expenseCategoryId: 'cat-sante',
    expenseCategoryName: 'Sante',
    amountRemaining: 600,
    ...overrides,
  }
}

function income(overrides: Partial<UnsettledIncome> = {}): UnsettledIncome {
  return {
    transactionId: 'tx-virement',
    date: new Date('2026-02-15'),
    description: 'VIR ALICE MARTIN',
    amount: 600,
    availableAmount: 600,
    categoryId: 'cat-remboursement-sante',
    ...overrides,
  }
}

const hints: AssociationHints = new Map([
  ['cat-remboursement-sante', 'cat-sante'],
])

describe('nameMatches', () => {
  it('finds the payer through the bank wording', () => {
    expect(nameMatches('VIR ALICE MARTIN', 'Alice Martin')).toBe(true)
  })

  it('ignores accents and case', () => {
    expect(nameMatches('VIR JEROME PEREZ', 'Jérôme Pérez')).toBe(true)
  })

  it('matches on a single token, since banks truncate', () => {
    expect(nameMatches('VIREMENT DE MARTIN', 'Alice Martin')).toBe(true)
  })

  it('says no when the name is absent', () => {
    expect(nameMatches('VIR SALAIRE ACME', 'Alice Martin')).toBe(false)
  })

  it('ignores tokens under three characters', () => {
    // "Le" would otherwise fire on half the labels a bank produces.
    expect(nameMatches('VIREMENT LE 12', 'Le Goff')).toBe(false)
  })
})

describe('suggestSettlements', () => {
  it('scores name, category and amount together', () => {
    const [suggestion] = suggestSettlements([income()], [debt()], hints)

    expect(suggestion?.reasons).toEqual(['name', 'category', 'amount'])
    expect(suggestion?.score).toBe(7)
    expect(suggestion?.coverage).toBe(600)
  })

  it('suggests on the name alone', () => {
    const [suggestion] = suggestSettlements(
      [income({ categoryId: null, availableAmount: 137.42 })],
      [debt()],
      hints
    )

    expect(suggestion?.reasons).toEqual(['name'])
    expect(suggestion?.score).toBe(4)
  })

  it('leaves out a pair with no signal at all', () => {
    const unrelated = income({
      description: 'VIR SALAIRE ACME',
      categoryId: null,
      availableAmount: 3000,
    })

    expect(suggestSettlements([unrelated], [debt()], hints)).toEqual([])
  })

  it('matches the amount against one debt, not only the balance', () => {
    const two = [
      debt({ reimbursementId: 'a', amountRemaining: 600 }),
      debt({ reimbursementId: 'b', amountRemaining: 100 }),
    ]
    const [suggestion] = suggestSettlements(
      [
        income({
          description: 'VIR RECU',
          categoryId: null,
          availableAmount: 100,
        }),
      ],
      two,
      hints
    )

    expect(suggestion?.reasons).toEqual(['amount'])
  })

  it('caps the coverage at what is actually owed', () => {
    const [suggestion] = suggestSettlements(
      [income({ availableAmount: 1000 })],
      [debt({ amountRemaining: 600 })],
      hints
    )

    expect(suggestion?.coverage).toBe(600)
  })

  it('caps the coverage at the cash on hand', () => {
    const [suggestion] = suggestSettlements(
      [income({ availableAmount: 250 })],
      [debt({ amountRemaining: 600 })],
      hints
    )

    expect(suggestion?.coverage).toBe(250)
  })

  it('ignores a transaction whose cash is spent', () => {
    expect(
      suggestSettlements([income({ availableAmount: 0 })], [debt()], hints)
    ).toEqual([])
  })

  it('ignores a debt that is already settled', () => {
    expect(
      suggestSettlements([income()], [debt({ amountRemaining: 0 })], hints)
    ).toEqual([])
  })

  it('does not fire the category signal without an association', () => {
    const [suggestion] = suggestSettlements(
      [income({ description: 'VIR RECU', availableAmount: 137.42 })],
      [debt()],
      new Map()
    )

    expect(suggestion).toBeUndefined()
  })

  it('does not fire the category signal when no debt matches the pairing', () => {
    const [suggestion] = suggestSettlements(
      [income({ description: 'VIR ALICE MARTIN', availableAmount: 137.42 })],
      [debt({ expenseCategoryId: 'cat-loisirs' })],
      hints
    )

    expect(suggestion?.reasons).toEqual(['name'])
  })

  it('lists a person debts oldest first, as the cascade settles them', () => {
    const [suggestion] = suggestSettlements(
      [income()],
      [
        debt({
          reimbursementId: 'recent',
          description: 'Pharmacie',
          expenseDate: new Date('2026-02-01'),
          amountRemaining: 300,
        }),
        debt({
          reimbursementId: 'older',
          expenseDate: new Date('2026-01-12'),
          amountRemaining: 300,
        }),
      ],
      hints
    )

    expect(suggestion?.debts.map(d => d.reimbursementId)).toEqual([
      'older',
      'recent',
    ])
  })

  it('ranks the stronger signal first', () => {
    const debts = [
      debt(),
      debt({
        reimbursementId: 'reimb-bruno',
        personId: 'person-bruno',
        personName: 'Bruno Petit',
        expenseCategoryId: 'cat-loisirs',
        amountRemaining: 600,
      }),
    ]

    const ranked = suggestSettlements([income()], debts, hints)

    // Alice is named in the wording; Bruno only happens to owe the same amount.
    expect(ranked.map(s => s.personName)).toEqual([
      'Alice Martin',
      'Bruno Petit',
    ])
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  it('orders equal scores by the coverage they achieve', () => {
    const incomes = [
      income({ transactionId: 'tx-small', availableAmount: 50 }),
      income({ transactionId: 'tx-large', availableAmount: 400 }),
    ]

    const ranked = suggestSettlements(incomes, [debt()], hints)

    expect(ranked.map(s => s.transactionId)).toEqual(['tx-large', 'tx-small'])
  })

  it('is stable across runs when everything ties', () => {
    const incomes = [
      income({ transactionId: 'tx-b' }),
      income({ transactionId: 'tx-a' }),
    ]

    const first = suggestSettlements(incomes, [debt()], hints)
    const second = suggestSettlements([...incomes].reverse(), [debt()], hints)

    expect(first.map(s => s.transactionId)).toEqual(
      second.map(s => s.transactionId)
    )
  })
})

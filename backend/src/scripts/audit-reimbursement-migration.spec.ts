import { describe, it, expect } from 'vitest'
import {
  blockingCount,
  buildAudit,
  buildSubcategoryBacklog,
  derivedStatusOf,
  findAmbiguousForceComplete,
  findNonExpenseTargets,
  findOrphanCredits,
  findStatusDrift,
  forgivenAmountOf,
  formatReport,
  usedForceComplete,
  type AuditReimbursement,
  type AuditSettlement,
  type SubcategoryBacklogRow,
} from './audit-reimbursement-migration'

function settlement(overrides: Partial<AuditSettlement> = {}): AuditSettlement {
  return {
    id: 'settlement-1',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    amountUsed: 80,
    personName: 'Alice Martin',
    incomeDescription: 'VIR ALICE MARTIN',
    lines: [{ reimbursementId: 'reimb-carrefour', amountSettled: 80 }],
    ...overrides,
  }
}

function reimbursement(
  overrides: Partial<AuditReimbursement> = {}
): AuditReimbursement {
  return {
    id: 'reimb-carrefour',
    personName: 'Alice Martin',
    description: 'Courses Carrefour',
    amount: 80,
    amountReceived: 80,
    status: 'COMPLETED',
    transactionType: 'EXPENSE',
    settledTotal: 80,
    expectedIncomeCategoryId: 'cat-remboursement-courses',
    ...overrides,
  }
}

describe('forgivenAmountOf / usedForceComplete', () => {
  it('reports nothing forgiven when the credit matches the cash drawn', () => {
    expect(forgivenAmountOf(settlement())).toBe(0)
    expect(usedForceComplete(settlement())).toBe(false)
  })

  it('reports the shortfall when the lines credit more than the cash', () => {
    // 5 EUR of cash closing an 80 EUR debt: 75 were forgiven.
    const forced = settlement({ amountUsed: 5 })

    expect(forgivenAmountOf(forced)).toBe(75)
    expect(usedForceComplete(forced)).toBe(true)
  })

  it('ignores sub-cent drift', () => {
    expect(
      usedForceComplete(
        settlement({
          lines: [
            { reimbursementId: 'reimb-carrefour', amountSettled: 80.001 },
          ],
        })
      )
    ).toBe(false)
  })
})

describe('findAmbiguousForceComplete', () => {
  it('leaves a single-line force-complete alone: the split is arithmetic', () => {
    expect(findAmbiguousForceComplete([settlement({ amountUsed: 5 })])).toEqual(
      []
    )
  })

  it('flags a multi-line force-complete: the cash cannot be attributed', () => {
    const forced = settlement({
      amountUsed: 6,
      lines: [
        { reimbursementId: 'reimb-carrefour', amountSettled: 80 },
        { reimbursementId: 'reimb-netflix', amountSettled: 12 },
      ],
    })

    const findings = findAmbiguousForceComplete([forced])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      settlementId: 'settlement-1',
      lineCount: 2,
      amountUsed: 6,
      creditedTotal: 92,
      forgiven: 86,
    })
  })

  it('leaves a multi-line settlement that forgave nothing alone', () => {
    const honest = settlement({
      amountUsed: 92,
      lines: [
        { reimbursementId: 'reimb-carrefour', amountSettled: 80 },
        { reimbursementId: 'reimb-netflix', amountSettled: 12 },
      ],
    })

    expect(findAmbiguousForceComplete([honest])).toEqual([])
  })

  it('ranks the worst offender first', () => {
    const small = settlement({
      id: 'settlement-small',
      amountUsed: 90,
      lines: [
        { reimbursementId: 'a', amountSettled: 80 },
        { reimbursementId: 'b', amountSettled: 12 },
      ],
    })
    const big = settlement({
      id: 'settlement-big',
      amountUsed: 6,
      lines: [
        { reimbursementId: 'a', amountSettled: 80 },
        { reimbursementId: 'b', amountSettled: 12 },
      ],
    })

    expect(
      findAmbiguousForceComplete([small, big]).map(f => f.settlementId)
    ).toEqual(['settlement-big', 'settlement-small'])
  })
})

describe('findOrphanCredits', () => {
  it('passes a reimbursement backed exactly by its settlements', () => {
    expect(findOrphanCredits([reimbursement()])).toEqual([])
  })

  it('flags credit recorded outside any settlement as unbacked', () => {
    // What PATCH /reimbursements/:id/receive leaves behind.
    const findings = findOrphanCredits([
      reimbursement({ amountReceived: 50, settledTotal: 20 }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'unbacked', residual: 30 })
  })

  it('flags a reimbursement reversed beyond what was credited', () => {
    const findings = findOrphanCredits([
      reimbursement({ amountReceived: 0, settledTotal: 30 }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'over-reversed', residual: -30 })
  })

  it('ignores sub-cent drift', () => {
    expect(
      findOrphanCredits([
        reimbursement({ amountReceived: 80.001, settledTotal: 80 }),
      ])
    ).toEqual([])
  })
})

describe('findNonExpenseTargets', () => {
  it('passes requests hanging off an expense', () => {
    expect(findNonExpenseTargets([reimbursement()])).toEqual([])
  })

  it('flags a request anchored on an income transaction', () => {
    const findings = findNonExpenseTargets([
      reimbursement({ transactionType: 'INCOME' }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reimbursementId: 'reimb-carrefour',
      transactionType: 'INCOME',
    })
  })
})

describe('derivedStatusOf / findStatusDrift', () => {
  it('derives the three states from the amounts', () => {
    expect(derivedStatusOf(80, 0)).toBe('PENDING')
    expect(derivedStatusOf(80, 30)).toBe('PARTIAL')
    expect(derivedStatusOf(80, 80)).toBe('COMPLETED')
    // Over-payment still closes the debt.
    expect(derivedStatusOf(80, 95)).toBe('COMPLETED')
  })

  it('treats a sub-cent shortfall as completed', () => {
    expect(derivedStatusOf(80, 79.999)).toBe('COMPLETED')
  })

  it('says nothing when stored and derived agree', () => {
    expect(findStatusDrift([reimbursement()])).toEqual([])
  })

  it('flags a status its own amounts contradict', () => {
    const findings = findStatusDrift([
      reimbursement({ amountReceived: 30, status: 'COMPLETED' }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      storedStatus: 'COMPLETED',
      derivedStatus: 'PARTIAL',
    })
  })
})

describe('buildSubcategoryBacklog', () => {
  const rows: SubcategoryBacklogRow[] = [
    {
      categoryName: 'Sante',
      subcategory: 'Dentiste',
      transactionCount: 12,
      resolvable: true,
    },
    {
      categoryName: 'Sante',
      subcategory: 'Osteopathe',
      transactionCount: 3,
      resolvable: false,
    },
    {
      categoryName: 'Loisirs',
      subcategory: 'Cinema',
      transactionCount: 7,
      resolvable: false,
    },
  ]

  it('totals both sides and keeps only the unresolvable labels, biggest first', () => {
    const backlog = buildSubcategoryBacklog(rows)

    expect(backlog.resolvableTransactions).toBe(12)
    expect(backlog.unresolvableTransactions).toBe(10)
    expect(backlog.unresolvable.map(r => r.subcategory)).toEqual([
      'Cinema',
      'Osteopathe',
    ])
  })

  it('handles an empty backlog', () => {
    expect(buildSubcategoryBacklog([])).toEqual({
      resolvableTransactions: 0,
      unresolvableTransactions: 0,
      unresolvable: [],
    })
  })
})

describe('buildAudit / blockingCount', () => {
  it('counts detached income-category hints without blocking on them', () => {
    const audit = buildAudit(
      [settlement()],
      [reimbursement({ expectedIncomeCategoryId: null })],
      []
    )

    expect(audit.scanned).toMatchObject({
      reimbursements: 1,
      settlements: 1,
      forcedSettlements: 0,
      detachedIncomeCategories: 1,
    })
    expect(blockingCount(audit)).toBe(0)
  })

  it('counts only the three blocking checks', () => {
    const audit = buildAudit(
      [],
      [
        // Blocking: credit with no settlement behind it.
        reimbursement({ id: 'a', amountReceived: 50, settledTotal: 0 }),
        // Blocking: anchored on an income transaction.
        reimbursement({ id: 'b', transactionType: 'INCOME' }),
        // Informational only: the amounts reconcile, the stored status lies.
        reimbursement({
          id: 'c',
          amountReceived: 30,
          settledTotal: 30,
          status: 'COMPLETED',
        }),
      ],
      [
        {
          categoryName: 'Loisirs',
          subcategory: 'Cinema',
          transactionCount: 7,
          resolvable: false,
        },
      ]
    )

    expect(audit.statusDrift.length).toBeGreaterThan(0)
    expect(audit.subcategoryBacklog.unresolvableTransactions).toBe(7)
    // a (orphan) + b (non-expense). c drifts but reconciles, so it is not one.
    expect(blockingCount(audit)).toBe(2)
  })
})

describe('formatReport', () => {
  it('clears the migration when every check passes', () => {
    const report = formatReport(
      buildAudit([settlement()], [reimbursement()], [])
    )

    expect(report).toContain('1 reimbursement request(s), 1 settlement(s)')
    expect(report).toContain('no settlement ever forgave a shortfall')
    expect(report).toContain('Nothing blocks the migration')
    expect(report).toContain('Migrate additively either way')
  })

  it('names each blocking finding and the money behind it', () => {
    const report = formatReport(
      buildAudit(
        [
          settlement({
            amountUsed: 6,
            lines: [
              { reimbursementId: 'reimb-carrefour', amountSettled: 80 },
              { reimbursementId: 'reimb-netflix', amountSettled: 12 },
            ],
          }),
        ],
        [reimbursement({ amountReceived: 50, settledTotal: 20 })],
        []
      )
    )

    expect(report).toContain('86.00 forgiven with no per-line breakdown')
    expect(report).toContain('30.00 EUR, recoverable only as a CASH payment')
    expect(report).toContain('2 row(s) need a decision')
  })

  it('caps each section at the sample limit', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      reimbursement({ id: `reimb-${i}`, amountReceived: 50, settledTotal: 20 })
    )

    const report = formatReport(buildAudit([], many, []), { samples: 2 })

    expect(report).toContain('... and 3 more')
  })
})

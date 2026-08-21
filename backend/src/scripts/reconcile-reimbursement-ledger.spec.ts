import { describe, it, expect } from 'vitest'
import {
  buildReconciliation,
  derivedStatusOf,
  findCreditMismatches,
  findOverdrawnIncome,
  findSettlementCashMismatches,
  findStatusMismatches,
  formatReport,
  mismatchCount,
  type LedgerIncomeTransaction,
  type LedgerReimbursement,
  type LedgerSettlement,
} from './reconcile-reimbursement-ledger'

function reimbursement(
  overrides: Partial<LedgerReimbursement> = {}
): LedgerReimbursement {
  return {
    id: 'reimb-dentiste',
    personName: 'Alice Martin',
    description: 'Cabinet dentaire',
    amount: 600,
    amountReceived: 600,
    status: 'COMPLETED',
    payments: [{ amount: 600, kind: 'CASH' }],
    ...overrides,
  }
}

function settlement(
  overrides: Partial<LedgerSettlement> = {}
): LedgerSettlement {
  return {
    id: 'settlement-1',
    createdAt: new Date('2026-02-15T10:00:00.000Z'),
    personName: 'Alice Martin',
    amountUsed: 600,
    payments: [{ amount: 600, kind: 'CASH' }],
    ...overrides,
  }
}

function income(
  overrides: Partial<LedgerIncomeTransaction> = {}
): LedgerIncomeTransaction {
  return {
    id: 'tx-virement',
    description: 'VIR ALICE MARTIN',
    date: new Date('2026-02-15T00:00:00.000Z'),
    amount: 600,
    cashDrawn: 600,
    ...overrides,
  }
}

describe('findCreditMismatches', () => {
  it('passes a request whose payments add back up', () => {
    expect(findCreditMismatches([reimbursement()])).toEqual([])
  })

  it('counts a write-off towards the credit', () => {
    // 560 collected, 40 forgiven: the debt is settled in full either way.
    const forgiven = reimbursement({
      payments: [
        { amount: 560, kind: 'CASH' },
        { amount: 40, kind: 'WRITE_OFF' },
      ],
    })

    expect(findCreditMismatches([forgiven])).toEqual([])
  })

  it('flags a ledger that credits less than the stored column', () => {
    const findings = findCreditMismatches([
      reimbursement({ payments: [{ amount: 500, kind: 'CASH' }] }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ stored: 600, derived: 500 })
    expect(findings[0]?.difference).toBeCloseTo(-100, 2)
  })

  it('flags a ledger that credits more than the stored column', () => {
    const findings = findCreditMismatches([
      reimbursement({ amountReceived: 400 }),
    ])

    expect(findings[0]?.difference).toBeCloseTo(200, 2)
  })

  it('ignores sub-cent drift', () => {
    expect(
      findCreditMismatches([
        reimbursement({ payments: [{ amount: 600.001, kind: 'CASH' }] }),
      ])
    ).toEqual([])
  })

  it('ranks the widest gap first', () => {
    const small = reimbursement({
      id: 'small',
      payments: [{ amount: 590, kind: 'CASH' }],
    })
    const wide = reimbursement({
      id: 'wide',
      payments: [{ amount: 100, kind: 'CASH' }],
    })

    expect(
      findCreditMismatches([small, wide]).map(f => f.reimbursementId)
    ).toEqual(['wide', 'small'])
  })
})

describe('derivedStatusOf / findStatusMismatches', () => {
  it('derives the three states from the amounts', () => {
    expect(derivedStatusOf(600, 0)).toBe('PENDING')
    expect(derivedStatusOf(600, 560)).toBe('PARTIAL')
    expect(derivedStatusOf(600, 600)).toBe('COMPLETED')
  })

  it('says nothing when the ledger implies the stored status', () => {
    expect(findStatusMismatches([reimbursement()])).toEqual([])
  })

  it('flags a request the ledger would display differently', () => {
    // Only 560 in the ledger, yet the row claims to be settled.
    const findings = findStatusMismatches([
      reimbursement({ payments: [{ amount: 560, kind: 'CASH' }] }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      stored: 'COMPLETED',
      derived: 'PARTIAL',
    })
  })

  it('treats a forgiven remainder as closing the debt', () => {
    const forgiven = reimbursement({
      payments: [
        { amount: 560, kind: 'CASH' },
        { amount: 40, kind: 'WRITE_OFF' },
      ],
    })

    expect(findStatusMismatches([forgiven])).toEqual([])
  })
})

describe('findSettlementCashMismatches', () => {
  it('passes a settlement whose cash adds back up', () => {
    expect(findSettlementCashMismatches([settlement()])).toEqual([])
  })

  it('excludes write-offs from the cash total', () => {
    // 5 of cash closing a 600 debt: the other 595 were forgiven, not drawn.
    const forced = settlement({
      amountUsed: 5,
      payments: [
        { amount: 5, kind: 'CASH' },
        { amount: 595, kind: 'WRITE_OFF' },
      ],
    })

    expect(findSettlementCashMismatches([forced])).toEqual([])
  })

  it('flags a settlement whose cash was mis-split', () => {
    const findings = findSettlementCashMismatches([
      settlement({
        amountUsed: 600,
        payments: [{ amount: 600, kind: 'WRITE_OFF' }],
      }),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ amountUsed: 600, cashRecorded: 0 })
  })
})

describe('findOverdrawnIncome', () => {
  it('passes a transaction drawn down to the cent', () => {
    expect(findOverdrawnIncome([income()])).toEqual([])
  })

  it('passes a partially drawn transaction', () => {
    expect(findOverdrawnIncome([income({ cashDrawn: 200 })])).toEqual([])
  })

  it('flags a transaction that gave out more than it carries', () => {
    const findings = findOverdrawnIncome([income({ cashDrawn: 750 })])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ amount: 600, cashDrawn: 750 })
  })
})

describe('buildReconciliation / mismatchCount', () => {
  it('clears a faithful ledger', () => {
    const reconciliation = buildReconciliation(
      [reimbursement()],
      [settlement()],
      [income()]
    )

    expect(reconciliation.scanned).toMatchObject({
      reimbursements: 1,
      settlements: 1,
      payments: 1,
      writeOffs: 0,
      incomeTransactions: 1,
    })
    expect(mismatchCount(reconciliation)).toBe(0)
  })

  it('counts every family of mismatch', () => {
    const reconciliation = buildReconciliation(
      // One request, off on both the credit and the status it implies.
      [reimbursement({ payments: [{ amount: 500, kind: 'CASH' }] })],
      [settlement({ payments: [{ amount: 100, kind: 'CASH' }] })],
      [income({ cashDrawn: 900 })]
    )

    expect(mismatchCount(reconciliation)).toBe(4)
  })

  it('counts write-offs across every request', () => {
    const reconciliation = buildReconciliation(
      [
        reimbursement({
          payments: [
            { amount: 560, kind: 'CASH' },
            { amount: 40, kind: 'WRITE_OFF' },
          ],
        }),
      ],
      [],
      []
    )

    expect(reconciliation.scanned).toMatchObject({ payments: 2, writeOffs: 1 })
  })
})

describe('formatReport', () => {
  it('clears phase 3 when everything lines up', () => {
    const report = formatReport(
      buildReconciliation([reimbursement()], [settlement()], [income()])
    )

    expect(report).toContain('1 payment(s) (0 write-off)')
    expect(report).toContain('The ledger is a faithful mirror')
  })

  it('names each family of mismatch and the money involved', () => {
    const report = formatReport(
      buildReconciliation(
        [reimbursement({ payments: [{ amount: 500, kind: 'CASH' }] })],
        [settlement({ payments: [{ amount: 100, kind: 'CASH' }] })],
        [income({ cashDrawn: 900 })]
      )
    )

    expect(report).toContain('1 request(s) off by 100.00 EUR')
    expect(report).toContain('stored COMPLETED, derived PARTIAL')
    expect(report).toContain('drew 600.00, ledger records 100.00')
    expect(report).toContain('carries 600.00, 900.00 drawn from it')
    expect(report).toContain('4 mismatch(es)')
  })

  it('caps each section at the sample limit', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      reimbursement({ id: `reimb-${i}`, payments: [] })
    )

    const report = formatReport(buildReconciliation(many, [], []), {
      samples: 2,
    })

    expect(report).toContain('... and 3 more')
  })
})

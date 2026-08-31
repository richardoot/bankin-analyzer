import { describe, it, expect } from 'vitest'
import {
  buildReconciliation,
  findOverdrawnIncome,
  findSettlementCashMismatches,
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
      [reimbursement()],
      [settlement({ payments: [{ amount: 100, kind: 'CASH' }] })],
      [income({ cashDrawn: 900 })]
    )

    expect(mismatchCount(reconciliation)).toBe(2)
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
  it('clears when everything lines up', () => {
    const report = formatReport(
      buildReconciliation([reimbursement()], [settlement()], [income()])
    )

    expect(report).toContain('1 payment(s) (0 write-off)')
    expect(report).toContain('The ledger holds together.')
  })

  it('names each family of mismatch and the money involved', () => {
    const report = formatReport(
      buildReconciliation(
        [reimbursement()],
        [settlement({ payments: [{ amount: 100, kind: 'CASH' }] })],
        [income({ cashDrawn: 900 })]
      )
    )

    expect(report).toContain('drew 600.00, ledger records 100.00')
    expect(report).toContain('carries 600.00, 900.00 drawn from it')
    expect(report).toContain('2 mismatch(es)')
  })

  it('caps each section at the sample limit', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      income({ id: `tx-${i}`, cashDrawn: 900 })
    )

    const report = formatReport(buildReconciliation([], [], many), {
      samples: 2,
    })

    expect(report).toContain('... and 3 more')
  })
})

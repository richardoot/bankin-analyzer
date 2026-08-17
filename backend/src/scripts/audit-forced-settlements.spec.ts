import { describe, it, expect } from 'vitest'
import {
  findAtRiskLines,
  formatReport,
  usedForceComplete,
  type AuditReimbursement,
  type AuditSettlement,
} from './audit-forced-settlements'

const CARREFOUR: AuditReimbursement = {
  id: 'reimb-carrefour',
  amount: 80,
  description: 'Courses Carrefour',
}

function settlement(overrides: Partial<AuditSettlement> = {}): AuditSettlement {
  return {
    id: 'settlement-1',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    amountUsed: 80,
    personName: 'Alice Martin',
    incomeDescription: 'VIR ALICE MARTIN',
    lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 80 }],
    ...overrides,
  }
}

describe('usedForceComplete', () => {
  it('is false when the credited total matches the cash drawn', () => {
    expect(usedForceComplete(settlement())).toBe(false)
  })

  it('is true when the lines credit more than the cash drawn', () => {
    // 5 EUR of cash closing an 80 EUR debt: 75 were forgiven.
    expect(
      usedForceComplete(
        settlement({
          amountUsed: 5,
          lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 80 }],
        })
      )
    ).toBe(true)
  })

  it('ignores sub-cent drift', () => {
    expect(
      usedForceComplete(
        settlement({
          amountUsed: 80,
          lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 80.001 }],
        })
      )
    ).toBe(false)
  })
})

describe('findAtRiskLines', () => {
  /** 30 EUR credited first, then the rest force-completed the legacy way. */
  const earlierPartial = settlement({
    id: 'settlement-partial',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    amountUsed: 30,
    lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 30 }],
  })

  const legacyForced = settlement({
    id: 'settlement-forced',
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    amountUsed: 5,
    lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 80 }],
  })

  it('flags a forced line that would wipe an earlier payment', () => {
    const findings = findAtRiskLines(
      [earlierPartial, legacyForced],
      [CARREFOUR]
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      settlementId: 'settlement-forced',
      reimbursementId: CARREFOUR.id,
      originalAmount: 80,
      recordedAmountSettled: 80,
      earlierCredit: 30,
      // 80 - 30: what delete must subtract to land back on 30.
      suggestedAmountSettled: 50,
    })
  })

  it('ignores a forced line on a debt that had never been credited', () => {
    // Nothing to lose: subtracting 80 from 80 correctly returns to 0.
    expect(findAtRiskLines([legacyForced], [CARREFOUR])).toEqual([])
  })

  it('ignores settlements that never used force-complete', () => {
    const secondPartial = settlement({
      id: 'settlement-partial-2',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      amountUsed: 20,
      lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 20 }],
    })

    expect(
      findAtRiskLines([earlierPartial, secondPartial], [CARREFOUR])
    ).toEqual([])
  })

  it('ignores a forced line already storing the real credit', () => {
    // What the fixed code writes: the credit, not the original amount.
    const fixed = settlement({
      id: 'settlement-fixed',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      amountUsed: 5,
      lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 50 }],
    })

    expect(findAtRiskLines([earlierPartial, fixed], [CARREFOUR])).toEqual([])
  })

  it('counts only the credits that predate the forced settlement', () => {
    const laterCredit = settlement({
      id: 'settlement-later',
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      amountUsed: 10,
      lines: [{ reimbursementId: CARREFOUR.id, amountSettled: 10 }],
    })

    const findings = findAtRiskLines(
      [earlierPartial, legacyForced, laterCredit],
      [CARREFOUR]
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]?.earlierCredit).toBe(30)
  })

  it('honours the --before cutoff', () => {
    expect(
      findAtRiskLines([earlierPartial, legacyForced], [CARREFOUR], {
        before: new Date('2026-06-15T00:00:00.000Z'),
      })
    ).toEqual([])
  })

  it('reports each affected line of a multi-line settlement', () => {
    const netflix: AuditReimbursement = {
      id: 'reimb-netflix',
      amount: 12,
      description: 'Netflix',
    }
    const earlierOnNetflix = settlement({
      id: 'settlement-netflix-partial',
      createdAt: new Date('2026-06-02T10:00:00.000Z'),
      amountUsed: 4,
      lines: [{ reimbursementId: netflix.id, amountSettled: 4 }],
    })
    const forcedBoth = settlement({
      id: 'settlement-forced-both',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      amountUsed: 6,
      lines: [
        { reimbursementId: CARREFOUR.id, amountSettled: 80 },
        { reimbursementId: netflix.id, amountSettled: 12 },
      ],
    })

    const findings = findAtRiskLines(
      [earlierPartial, earlierOnNetflix, forcedBoth],
      [CARREFOUR, netflix]
    )

    expect(findings.map(f => f.reimbursementId)).toEqual([
      CARREFOUR.id,
      netflix.id,
    ])
    expect(findings.map(f => f.suggestedAmountSettled)).toEqual([50, 8])
  })
})

describe('formatReport', () => {
  it('states plainly when nothing is at risk', () => {
    const report = formatReport([], { settlements: 12, forced: 3 })

    expect(report).toContain('12 settlements read, 3 used force-complete.')
    expect(report).toContain('No settlement would lose an earlier payment')
  })

  it('totals the money at risk and names the suggested value', () => {
    const report = formatReport(
      [
        {
          settlementId: 'settlement-forced',
          settlementCreatedAt: new Date('2026-07-01T10:00:00.000Z'),
          personName: 'Alice Martin',
          incomeDescription: 'VIR ALICE MARTIN',
          reimbursementId: CARREFOUR.id,
          reimbursementDescription: CARREFOUR.description,
          originalAmount: 80,
          recordedAmountSettled: 80,
          earlierCredit: 30,
          suggestedAmountSettled: 50,
        },
      ],
      { settlements: 12, forced: 3 }
    )

    expect(report).toContain('30.00 EUR of earlier payments')
    expect(report).toContain('should be 50.00')
    expect(report).toContain('Alice Martin — Courses Carrefour')
  })
})

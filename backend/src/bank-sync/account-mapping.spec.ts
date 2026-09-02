import { describe, it, expect } from 'vitest'
import { mappingFromProposals, proposeMapping } from './account-mapping'
import type { AssignedVerdict, StagedTransaction } from './reconciliation'

function staged(externalAccountId: string, index: number): StagedTransaction {
  return {
    externalAccountId,
    externalId: `ENTRY-${externalAccountId}-${index}`,
    date: '2026-08-25',
    amount: -10 - index,
    label: `PURCHASE ${index}`,
  }
}

/** `count` transactions on one bank account, all matched to `transactionIds`. */
function fixture(
  externalAccountId: string,
  transactionIds: (string | null)[]
): { staged: StagedTransaction[]; verdicts: AssignedVerdict[] } {
  return {
    staged: transactionIds.map((_, i) => staged(externalAccountId, i)),
    verdicts: transactionIds.map(id =>
      id === null
        ? ({ kind: 'new' } as AssignedVerdict)
        : ({
            kind: 'matched',
            transactionId: id,
            similarity: 1,
          } as AssignedVerdict)
    ),
  }
}

/** Ledger rows tx-a* live in account A, tx-b* in account B. */
const accountOf = (transactionId: string): string | undefined =>
  transactionId.startsWith('tx-a')
    ? 'account-A'
    : transactionId.startsWith('tx-b')
      ? 'account-B'
      : undefined

describe('proposeMapping', () => {
  it('proposes the account most of the matches landed in', () => {
    const { staged: s, verdicts } = fixture('bank-1', [
      'tx-a1',
      'tx-a2',
      'tx-a3',
      'tx-a4',
      'tx-a5',
      'tx-a6',
    ])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.proposedAccountId).toBe('account-A')
    expect(proposal?.confidence).toBe(1)
    expect(proposal?.matched).toBe(6)
    expect(proposal?.total).toBe(6)
  })

  it('tolerates the overlap a card account has with its current account', () => {
    // A card purchase is reported on both, so a card account's matches split.
    const { staged: s, verdicts } = fixture('bank-card', [
      'tx-a1',
      'tx-a2',
      'tx-a3',
      'tx-a4',
      'tx-a5',
      'tx-a6',
      'tx-a7',
      'tx-b1',
      'tx-b2',
    ])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.proposedAccountId).toBe('account-A')
    expect(proposal?.confidence).toBeCloseTo(7 / 9)
  })

  it('refuses to choose when the evidence is a coin flip', () => {
    // A wrong mapping files a year of spending under the wrong account and
    // moves every total downstream, silently.
    const { staged: s, verdicts } = fixture('bank-1', [
      'tx-a1',
      'tx-a2',
      'tx-a3',
      'tx-b1',
      'tx-b2',
      'tx-b3',
    ])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.proposedAccountId).toBeNull()
    expect(proposal?.confidence).toBe(0.5)
  })

  it('refuses to choose on too few matches, however unanimous', () => {
    const { staged: s, verdicts } = fixture('bank-1', ['tx-a1', 'tx-a2'])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.confidence).toBe(1)
    expect(proposal?.proposedAccountId).toBeNull()
  })

  it('reports a bank account nothing matched', () => {
    const { staged: s, verdicts } = fixture('bank-new', [null, null, null])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.matched).toBe(0)
    expect(proposal?.confidence).toBe(0)
    expect(proposal?.proposedAccountId).toBeNull()
    expect(proposal?.total).toBe(3)
  })

  it('counts a row the sync already owns as evidence too', () => {
    const s = [staged('bank-1', 0)]
    const verdicts: AssignedVerdict[] = [
      { kind: 'alreadyLinked', transactionId: 'tx-a1' },
    ]

    const [proposal] = proposeMapping(s, verdicts, accountOf, new Map(), {
      minimumMatches: 1,
    })

    expect(proposal?.proposedAccountId).toBe('account-A')
  })

  it('keeps every account the matches touched, strongest first', () => {
    const { staged: s, verdicts } = fixture('bank-1', [
      'tx-a1',
      'tx-a2',
      'tx-a3',
      'tx-b1',
    ])

    const [proposal] = proposeMapping(s, verdicts, accountOf)

    expect(proposal?.distribution).toEqual([
      { accountId: 'account-A', count: 3 },
      { accountId: 'account-B', count: 1 },
    ])
  })

  it('reports one proposal per bank account', () => {
    const a = fixture('bank-1', ['tx-a1'])
    const b = fixture('bank-2', ['tx-b1'])

    const proposals = proposeMapping(
      [...a.staged, ...b.staged],
      [...a.verdicts, ...b.verdicts],
      accountOf
    )

    expect(proposals.map(p => p.externalAccountId)).toEqual([
      'bank-1',
      'bank-2',
    ])
  })

  it('uses the bank label when one is known', () => {
    const { staged: s, verdicts } = fixture('bank-1', ['tx-a1'])

    const [proposal] = proposeMapping(
      s,
      verdicts,
      accountOf,
      new Map([['bank-1', 'M  BOILLEY RICHARD']])
    )

    expect(proposal?.accountName).toBe('M  BOILLEY RICHARD')
  })
})

describe('mappingFromProposals', () => {
  it('keeps only the proposals confident enough to act on', () => {
    const mapping = mappingFromProposals([
      {
        externalAccountId: 'sure',
        accountName: 'a',
        proposedAccountId: 'account-A',
        confidence: 1,
        matched: 10,
        total: 10,
        distribution: [],
      },
      {
        externalAccountId: 'unsure',
        accountName: 'b',
        proposedAccountId: null,
        confidence: 0.5,
        matched: 10,
        total: 10,
        distribution: [],
      },
    ])

    expect(mapping).toEqual({ sure: 'account-A' })
  })

  it('is empty when nothing is certain', () => {
    expect(mappingFromProposals([])).toEqual({})
  })
})

/**
 * Working out which account at the bank is which account here.
 *
 * ## Why it cannot be read off the names
 *
 * The bank says `M  BOILLEY R OU MLLE TORR`; the user wrote `CJ Fixe`. Nothing
 * relates the two, and matching on names would be worse than useless where
 * Boursorama returns two distinct card accounts sharing the name
 * `Carte Visa Ultim - RICHARD BOILLEY`.
 *
 * What does relate them is the money. Run the matcher without a mapping and
 * the answers point at it: if 380 of an account's transactions match rows
 * filed under `Perso Bourso` and eleven land anywhere else, that account is
 * `Perso Bourso`. The first pass therefore exists to learn the mapping, not to
 * ingest anything — which is also why it is safe for it to be as optimistic as
 * it is.
 *
 * ## What it refuses to do
 *
 * Propose a mapping it is not sure of. A wrong mapping does not fail loudly:
 * it files a year of one account's spending under another, and every total
 * downstream quietly moves. Below the thresholds the proposal is `null` and a
 * person decides.
 */

import type { AssignedVerdict } from './reconciliation'
import type { StagedTransaction } from './reconciliation'

/** What one bank account's matches say about where it belongs. */
export interface MappingProposal {
  externalAccountId: string
  /** The bank's label, for a human reading the report. */
  accountName: string
  /** The account here, or null when the evidence is too thin to say. */
  proposedAccountId: string | null
  /** Share of this account's matches that landed in the proposed account. */
  confidence: number
  /** How many of its transactions matched anything at all. */
  matched: number
  /** How many it holds in total. */
  total: number
  /** Every account its matches landed in, strongest first. */
  distribution: { accountId: string; count: number }[]
}

export interface MappingOptions {
  /**
   * Share of matches that must agree before a mapping is proposed.
   *
   * A card account and the current account it settles onto share most of their
   * transactions, so a card account's matches split across both. Two thirds
   * leaves room for that overlap while still refusing a genuine coin flip.
   */
  minimumConfidence?: number
  /**
   * Matches needed before the share means anything. Three transactions
   * agreeing is not evidence; it is a small number.
   */
  minimumMatches?: number
}

const DEFAULT_MINIMUM_CONFIDENCE = 0.66
const DEFAULT_MINIMUM_MATCHES = 5

/**
 * Propose, for each bank account, the account here its transactions belong to.
 *
 * `accountIdOfTransaction` resolves a matched ledger row to the account it is
 * filed under; the caller holds that map because it comes from the database.
 */
export function proposeMapping(
  staged: StagedTransaction[],
  verdicts: AssignedVerdict[],
  accountIdOfTransaction: (transactionId: string) => string | undefined,
  accountNames: Map<string, string> = new Map(),
  options: MappingOptions = {}
): MappingProposal[] {
  const minimumConfidence =
    options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE
  const minimumMatches = options.minimumMatches ?? DEFAULT_MINIMUM_MATCHES

  const tallies = new Map<
    string,
    { total: number; counts: Map<string, number> }
  >()

  staged.forEach((transaction, index) => {
    const key = transaction.externalAccountId
    let tally = tallies.get(key)
    if (!tally) {
      tally = { total: 0, counts: new Map() }
      tallies.set(key, tally)
    }
    tally.total++

    const verdict = verdicts[index]
    if (
      verdict === undefined ||
      (verdict.kind !== 'matched' && verdict.kind !== 'alreadyLinked')
    ) {
      return
    }
    const accountId = accountIdOfTransaction(verdict.transactionId)
    if (accountId === undefined) return
    tally.counts.set(accountId, (tally.counts.get(accountId) ?? 0) + 1)
  })

  return [...tallies.entries()].map(([externalAccountId, tally]) => {
    const distribution = [...tally.counts.entries()]
      .map(([accountId, count]) => ({ accountId, count }))
      .sort(
        (a, b) => b.count - a.count || a.accountId.localeCompare(b.accountId)
      )

    const matched = distribution.reduce((sum, entry) => sum + entry.count, 0)
    const best = distribution[0]
    const confidence = matched === 0 || !best ? 0 : best.count / matched

    const confident =
      best !== undefined &&
      matched >= minimumMatches &&
      confidence >= minimumConfidence

    return {
      externalAccountId,
      accountName: accountNames.get(externalAccountId) ?? externalAccountId,
      proposedAccountId: confident && best ? best.accountId : null,
      confidence,
      matched,
      total: tally.total,
      distribution,
    }
  })
}

/**
 * The lookup `reconcileAll` wants: bank account → account here.
 *
 * Only confident proposals travel. An unmapped bank account then has no
 * candidates at all, so every one of its transactions comes back as `new` —
 * visibly unresolved, rather than quietly matched against the wrong account.
 */
export function mappingFromProposals(
  proposals: MappingProposal[]
): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const proposal of proposals) {
    if (proposal.proposedAccountId !== null) {
      mapping[proposal.externalAccountId] = proposal.proposedAccountId
    }
  }
  return mapping
}

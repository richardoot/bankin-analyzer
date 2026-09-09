/**
 * The bank sync, as the application offers it.
 *
 * The thinking lives in the pure modules beside this one — `reconciliation`
 * decides what is already known, `account-mapping` what an account is,
 * `sync-policy` whether the bank will answer. This orchestrates them and is
 * the only place that writes.
 *
 * ## Triggered by a person, on purpose
 *
 * There is no scheduler. A sync happens because someone pressed a button, so
 * the policy guards the button rather than driving a timer: a lapsed consent
 * becomes "reconnect your bank", an exhausted quota becomes "the bank will not
 * answer again today". The same answers a scheduler would have needed, asked
 * at a moment when there is somebody to read them.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import type { ResolvedAssignment } from '../ai-suggestions/transaction-categorizer'
import {
  proposeCategoryFromHistory,
  type CategorizedHistoryRow,
} from '../ai-suggestions/category-rules'
import {
  EnableBankingClient,
  type BankAccountResource,
  type BankTransaction,
  type EnableBankingCredentials,
  type PsuContext,
} from './enable-banking.client'
import { EnableBankingCredentialsService } from './enable-banking-credentials.service'
import {
  humanizeLabel,
  reconcileAll,
  summarize,
  type AssignedVerdict,
  type LedgerTransaction,
  type StagedTransaction,
} from './reconciliation'
import { proposeMapping, type MappingProposal } from './account-mapping'
import {
  decide,
  expiringConnections,
  type ConnectionState,
  type SyncPolicyOptions,
} from './sync-policy'
import { TransactionSource } from '../generated/prisma'

/** What a bank account looks like once a person has to decide about it. */
export interface DiscoveredAccount {
  linkId: string
  externalAccountId: string
  /** What the bank calls it. Never unique: two arrive identical. */
  accountName: string
  product: string | null
  /** ISO 20022: `CACC` current account, `CARD` card account. */
  cashAccountType: string | null
  iban: string | null
  /** The account here it maps to, once someone has said so. */
  accountId: string | null
  accountLabel: string | null
  isIngested: boolean
  /**
   * What the transactions suggest, and how strongly. Absent for an account
   * with no history to reason from — a fresh ledger, or a bank the export
   * never covered.
   */
  suggestion: {
    accountId: string
    accountLabel: string
    matches: number
  } | null
  /** Stated when the account should be left alone, and why. */
  warning: string | null
}

export interface ConnectionView {
  id: string
  aspspName: string
  aspspCountry: string
  status: string
  consentValidUntil: Date | null
  lastSyncAt: Date | null
  /** What pressing sync would do right now, and why. */
  action: 'fetch' | 'skip' | 'reconnect'
  reason: string
  daysUntilConsentExpires: number | null
  accounts: DiscoveredAccount[]
}

export interface SyncOutcome {
  connectionId: string
  fetched: number
  claimed: number
  inserted: number
  skippedDuplicates: number
  skippedAmbiguous: number
  /** Older than this account's own earliest known transaction — see `ingest`. */
  skippedTooOld: number
  accountsRead: number
}

/** What correcting a bank account's mapping did to what an earlier sync wrote. */
export interface ReassignmentOutcome {
  /** Inserted under the old account; nothing on the new one matched it. */
  moved: number
  /** Inserted under the old account; the new one already had it via CSV. */
  merged: number
  /**
   * Lost its bank reference, kept everything else: a CSV row claimed by
   * coincidence on the old account, or — when the link is cleared entirely —
   * an inserted row with nowhere left to belong. Never deleted: the
   * transaction still happened, whichever account it ends up filed under.
   */
  unlinked: number
  /** Left untouched: gained a tag, reimbursement, settlement or payment since. */
  blockedByWork: number
  /** Left untouched: more than one equally good match, or none worth trusting. */
  ambiguous: number
}

/** One past sync, and what pressing "Annuler" on it would find. */
export interface BankSyncRunSummary {
  id: string
  aspspName: string
  fetchedAt: Date
  /** Still attributed to this run right now — 0 once it's been undone. */
  inserted: number
  claimed: number
  /** Set once this run has been undone. */
  undoneAt: Date | null
}

/** What undoing a run did, or would do. */
export interface UndoRunOutcome {
  /** Inserted by this run, removed the same way it arrived. */
  deleted: number
  /** Claimed by this run, restored to how it stood before — never deleted. */
  unlinked: number
  /** Left untouched: gained a reimbursement, tag, settlement or payment since. */
  blocked: number
}

/**
 * Loosen the sync policy for local testing, without touching the bank's own
 * limits when the environment doesn't ask for it.
 *
 * `BANK_SYNC_MIN_INTERVAL_HOURS=0` lifts the 8 h gap between two syncs of
 * one connection; `BANK_SYNC_MAX_FETCHES_PER_DAY` raises the local 3-a-day
 * ceiling. Both only relax what THIS application decided for itself:
 * whatever the bank refuses (`ASPSP_RATE_LIMIT_EXCEEDED`) it refuses
 * regardless of anything set here — although a sync carrying PSU headers is
 * exempted from the four-a-day rule by most banks, being an attended read.
 */
export function syncPolicyOptionsFromEnv(): SyncPolicyOptions {
  const options: SyncPolicyOptions = {}

  const interval = Number(process.env.BANK_SYNC_MIN_INTERVAL_HOURS)
  if (
    process.env.BANK_SYNC_MIN_INTERVAL_HOURS !== undefined &&
    !Number.isNaN(interval)
  ) {
    options.minimumIntervalHours = interval
  }

  const perDay = Number(process.env.BANK_SYNC_MAX_FETCHES_PER_DAY)
  if (
    process.env.BANK_SYNC_MAX_FETCHES_PER_DAY !== undefined &&
    !Number.isNaN(perDay)
  ) {
    options.maxFetchesPerDay = perDay
  }

  return options
}

/** A card account repeats its current account; ingesting both counts twice. */
const CARD_ACCOUNT_WARNING =
  'A card account: its purchases are already reported by the account it ' +
  'settles onto, so ingesting both counts each of them twice.'

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: EnableBankingClient,
    private readonly credentialsService: EnableBankingCredentialsService,
    private readonly aiSuggestions: AiSuggestionsService
  ) {}

  isConfigured(userId: string): Promise<boolean> {
    return this.credentialsService.isConfigured(userId)
  }

  private async credentialsOf(
    userId: string
  ): Promise<EnableBankingCredentials> {
    const credentials = await this.credentialsService.resolve(userId)
    if (!credentials) {
      throw new ServiceUnavailableException(
        'Bank sync is not configured: add your Enable Banking application in ' +
          'Settings first.'
      )
    }
    return credentials
  }

  /**
   * The banks available in a country, for a person choosing one.
   *
   * Beta implementations are flagged rather than hidden: they work, they are
   * simply newer, and a bank missing from a list with no explanation is worse
   * than one shown with a caveat.
   */
  async listBanks(
    userId: string,
    country: string
  ): Promise<
    {
      name: string
      country: string
      beta: boolean
      logo: string | null
    }[]
  > {
    const credentials = await this.credentialsOf(userId)
    const aspsps = await this.client.listAspsps(credentials, country)
    return aspsps
      .map(aspsp => ({
        name: aspsp.name,
        country: aspsp.country,
        beta: aspsp.beta ?? false,
        logo: aspsp.logo ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Ask the bank for the URL the user must visit.
   *
   * The consent is clamped to the bank's own maximum: asking for more is
   * refused outright, and the ceiling differs per bank — 180 days on the three
   * measured, but that is a fact about them, not a rule.
   */
  async startAuthorization(
    userId: string,
    input: { aspspName: string; country: string; redirectUrl: string }
  ): Promise<{ url: string; state: string }> {
    const credentials = await this.credentialsOf(userId)
    const aspsps = await this.client.listAspsps(credentials, input.country)
    const aspsp = aspsps.find(
      candidate =>
        candidate.name.toLowerCase() === input.aspspName.toLowerCase()
    )
    if (!aspsp) {
      throw new NotFoundException(
        `No bank named "${input.aspspName}" in ${input.country}`
      )
    }

    const ceiling = (aspsp.maximum_consent_validity ?? 90 * 86_400) * 1000
    // A minute under: the value is checked against the bank's clock, not ours,
    // and landing exactly on the boundary is how a request is refused for
    // being one second too long.
    const validUntil = new Date(Date.now() + ceiling - 60_000).toISOString()
    const state = randomUUID()

    const { url } = await this.client.startAuthorization(credentials, {
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      redirectUrl: input.redirectUrl,
      validUntil,
      state,
      // Stable per user, so the sessions of one person stay related across
      // the re-authorizations a lapsing consent forces.
      psuId: userId,
    })

    // Carries the canonical name to `completeAuthorization`, which otherwise
    // only sees whatever `session.aspsp` echoes back — not guaranteed to
    // repeat this string, and once, for real, it did not.
    //
    // Opportunistic cleanup rather than a job anything depends on running: an
    // abandoned attempt is as harmless as an unredeemed CSRF token.
    await this.prisma.bankAuthorizationAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 3_600_000) } },
    })
    await this.prisma.bankAuthorizationAttempt.create({
      data: {
        id: state,
        userId,
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
      },
    })

    return { url, state }
  }

  /**
   * Turn the code a redirect carried into a connection and its accounts.
   *
   * The descriptions are fetched here and stored, not re-read later: they are
   * absent from a session read back, and asking again costs a request against
   * a quota of four a day.
   */
  async completeAuthorization(
    userId: string,
    code: string,
    state?: string,
    psu?: PsuContext
  ): Promise<ConnectionView> {
    const credentials = await this.credentialsOf(userId)
    const session = await this.client.createSession(credentials, code)
    const accounts = EnableBankingClient.accountsOf(session)

    // The name this application itself asked with, over the one the session
    // echoes: they are not guaranteed to agree, and trusting the echo is what
    // let a bank already connected pass the lookup and get a second
    // connection. Falls back to the echo only when `state` is missing or the
    // attempt already expired — the best that is left in that case, and
    // exactly what ran before this existed. Single use, like the code itself.
    const attempt = state
      ? await this.prisma.bankAuthorizationAttempt.findUnique({
          where: { id: state, userId },
        })
      : null
    if (attempt) {
      await this.prisma.bankAuthorizationAttempt.delete({
        where: { id: attempt.id },
      })
    }
    const aspspName = attempt?.aspspName ?? session.aspsp?.name ?? 'unknown'
    const aspspCountry = attempt?.aspspCountry ?? session.aspsp?.country ?? 'FR'

    const existing = await this.prisma.bankConnection.findFirst({
      where: { userId, aspspCountry, aspspName },
      select: { id: true },
    })

    const connection = await this.prisma.bankConnection.upsert({
      where: { id: existing?.id ?? '' },
      create: {
        userId,
        aspspName,
        aspspCountry,
        sessionId: session.session_id ?? null,
        consentValidUntil: session.access?.valid_until
          ? new Date(session.access.valid_until)
          : null,
        status: 'ACTIVE',
      },
      update: {
        sessionId: session.session_id ?? null,
        status: 'ACTIVE',
        retryAfter: null,
        ...(session.access?.valid_until
          ? { consentValidUntil: new Date(session.access.valid_until) }
          : {}),
      },
      select: { id: true },
    })

    for (const account of accounts) {
      if (!account.uid) continue
      const details = await this.describe(credentials, account, psu)
      const iban = details.account_id?.iban ?? null
      const identificationHash = details.identification_hash ?? null

      // `externalAccountId` is the bank's handle within a session and is
      // refreshed on every authorization — looking a link up by it, as this
      // used to, means a renewal never finds the account it already knew and
      // doubles it instead. `iban` (or `identificationHash` for the card
      // account that has none) is what actually survives between sessions,
      // and is what has to be matched on instead.
      const existing = iban
        ? await this.prisma.bankAccountLink.findFirst({
            where: { connectionId: connection.id, iban },
            select: { id: true },
          })
        : identificationHash
          ? await this.prisma.bankAccountLink.findFirst({
              where: { connectionId: connection.id, identificationHash },
              select: { id: true },
            })
          : null

      await this.prisma.bankAccountLink.upsert({
        where: { id: existing?.id ?? '' },
        create: {
          connectionId: connection.id,
          userId,
          externalAccountId: account.uid,
          accountName: details.name ?? account.uid,
          cashAccountType: details.cash_account_type ?? null,
          product: details.product ?? null,
          iban,
          identificationHash,
        },
        // A decision already made is never overwritten by a re-authorization.
        // What the bank says about itself is refreshed; what the user said
        // about it is theirs.
        update: {
          externalAccountId: account.uid,
          accountName: details.name ?? account.uid,
          ...(details.cash_account_type
            ? { cashAccountType: details.cash_account_type }
            : {}),
          ...(details.product ? { product: details.product } : {}),
          ...(iban ? { iban } : {}),
          ...(identificationHash ? { identificationHash } : {}),
        },
      })
    }

    return this.viewConnection(userId, connection.id)
  }

  /** What `/details` says, falling back to the session when it will not say. */
  private async describe(
    credentials: EnableBankingCredentials,
    account: BankAccountResource,
    psu?: PsuContext
  ): Promise<BankAccountResource> {
    if (!account.uid) return account
    try {
      const details = await this.client.getAccountDetails(
        credentials,
        account.uid,
        psu
      )
      return { ...account, ...details, uid: account.uid }
    } catch (error) {
      // A bank that will not describe an account can still be read from. What
      // is lost is a good default, not the fetch.
      this.logger.warn(
        `No details for account ${account.uid}: ${(error as Error).message}`
      )
      return account
    }
  }

  async listConnections(userId: string): Promise<ConnectionView[]> {
    const connections = await this.prisma.bankConnection.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { aspspName: 'asc' },
    })
    return Promise.all(
      connections.map(connection => this.viewConnection(userId, connection.id))
    )
  }

  async viewConnection(
    userId: string,
    connectionId: string
  ): Promise<ConnectionView> {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, userId },
      include: {
        accountLinks: {
          include: { account: { select: { id: true, name: true } } },
          orderBy: { accountName: 'asc' },
        },
      },
    })
    if (!connection) throw new NotFoundException('No such bank connection')

    const state = await this.stateOf(userId, connection.id)
    const decision = decide(state, new Date(), syncPolicyOptionsFromEnv())
    const [warning] = expiringConnections([state], new Date())

    const suggestions = await this.suggestAccounts(userId, connection.id)

    return {
      id: connection.id,
      aspspName: connection.aspspName,
      aspspCountry: connection.aspspCountry,
      status: connection.status,
      consentValidUntil: connection.consentValidUntil,
      lastSyncAt: connection.lastSyncAt,
      action: decision.action,
      reason: decision.reason,
      daysUntilConsentExpires: warning?.daysLeft ?? null,
      accounts: connection.accountLinks.map(link => ({
        linkId: link.id,
        externalAccountId: link.externalAccountId,
        accountName: link.accountName,
        product: link.product,
        cashAccountType: link.cashAccountType,
        iban: link.iban,
        accountId: link.accountId,
        accountLabel: link.account?.name ?? null,
        isIngested: link.isIngested,
        suggestion: suggestions.get(link.externalAccountId) ?? null,
        warning: link.cashAccountType === 'CARD' ? CARD_ACCOUNT_WARNING : null,
      })),
    }
  }

  /**
   * Local accounts still carrying a row a bank sync inserted or claimed and
   * then lost the reference to — cleared to "— aucun —", or a correction
   * still pending on the other side of a swap. Grouped by account rather
   * than by link, because that is where these rows actually sit; the link
   * that once claimed them may by now point nowhere; or somewhere else.
   */
  async needsReview(
    userId: string
  ): Promise<{ accountId: string; accountLabel: string; count: number }[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where: { userId, source: TransactionSource.BANK_API, externalId: null },
      _count: { _all: true },
    })
    if (grouped.length === 0) return []

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: grouped.map(g => g.accountId) } },
      select: { id: true, name: true },
    })
    const nameById = new Map(accounts.map(a => [a.id, a.name]))

    return grouped
      .map(g => ({
        accountId: g.accountId,
        accountLabel: nameById.get(g.accountId) ?? '?',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Every run this user's connections have made, most recent first —
   * counted from what still points back at each one, the same as a CSV
   * import is counted from `importHistoryId`. An undone run reads 0 and 0
   * for that reason, not because it never wrote anything; `undoneAt` is
   * what tells the two apart.
   */
  async listRuns(userId: string): Promise<BankSyncRunSummary[]> {
    const runs = await this.prisma.bankSyncRun.findMany({
      where: { userId },
      orderBy: { fetchedAt: 'desc' },
      select: { id: true, aspspName: true, fetchedAt: true, undoneAt: true },
    })
    if (runs.length === 0) return []

    const counts = await this.prisma.transaction.groupBy({
      by: ['syncRunId', 'source'],
      where: { userId, syncRunId: { in: runs.map(r => r.id) } },
      _count: { _all: true },
    })
    const insertedByRun = new Map<string, number>()
    const claimedByRun = new Map<string, number>()
    for (const c of counts) {
      if (!c.syncRunId) continue
      const target =
        c.source === TransactionSource.BANK_API ? insertedByRun : claimedByRun
      target.set(c.syncRunId, (target.get(c.syncRunId) ?? 0) + c._count._all)
    }

    return runs.map(r => ({
      id: r.id,
      aspspName: r.aspspName,
      fetchedAt: r.fetchedAt,
      inserted: insertedByRun.get(r.id) ?? 0,
      claimed: claimedByRun.get(r.id) ?? 0,
      undoneAt: r.undoneAt,
    }))
  }

  /**
   * What a run touched, split the way undoing it treats them: an inserted
   * row with no work of its own since is deletable, one that has gained a
   * reimbursement, tag, settlement or payment is blocked, and a CSV row the
   * run only claimed is always restorable — its own work was never at risk.
   */
  private async planUndoRun(
    userId: string,
    runId: string
  ): Promise<{
    runId: string
    deletableIds: string[]
    claimedIds: string[]
    blockedCount: number
  }> {
    const run = await this.prisma.bankSyncRun.findFirst({
      where: { id: runId, userId },
      select: { id: true, undoneAt: true },
    })
    if (!run) throw new NotFoundException('No such bank sync run')
    if (run.undoneAt) {
      throw new BadRequestException('This run has already been undone.')
    }

    const touched = await this.prisma.transaction.findMany({
      where: { syncRunId: run.id },
      select: {
        id: true,
        source: true,
        _count: {
          select: {
            reimbursementRequests: true,
            settlementsAsIncome: true,
            tags: true,
            reimbursementPayments: true,
          },
        },
      },
    })

    const carriesWork = (t: (typeof touched)[number]): boolean =>
      t._count.reimbursementRequests > 0 ||
      t._count.settlementsAsIncome > 0 ||
      t._count.tags > 0 ||
      t._count.reimbursementPayments > 0

    const inserted = touched.filter(
      t => t.source === TransactionSource.BANK_API
    )
    const claimed = touched.filter(t => t.source !== TransactionSource.BANK_API)
    const blocked = inserted.filter(carriesWork)
    const deletable = inserted.filter(t => !carriesWork(t))

    return {
      runId: run.id,
      deletableIds: deletable.map(t => t.id),
      claimedIds: claimed.map(t => t.id),
      blockedCount: blocked.length,
    }
  }

  /** What undoing a run would do, without doing it. */
  async previewUndoRun(userId: string, runId: string): Promise<UndoRunOutcome> {
    const plan = await this.planUndoRun(userId, runId)
    return {
      deleted: plan.deletableIds.length,
      unlinked: plan.claimedIds.length,
      blocked: plan.blockedCount,
    }
  }

  /**
   * Undo one sync run: delete what it inserted, unlink what it only
   * claimed — never a row that has gained a reimbursement, a tag, a
   * settlement or a payment since. The same refusal every correction in
   * this feature makes: work added after the fact is never taken silently.
   */
  async undoRun(userId: string, runId: string): Promise<UndoRunOutcome> {
    const plan = await this.planUndoRun(userId, runId)

    await this.prisma.$transaction(async tx => {
      if (plan.deletableIds.length > 0) {
        await tx.transaction.deleteMany({
          where: { id: { in: plan.deletableIds } },
        })
      }
      if (plan.claimedIds.length > 0) {
        await tx.transaction.updateMany({
          where: { id: { in: plan.claimedIds } },
          data: { externalId: null, bookingStatus: null, syncRunId: null },
        })
      }
      await tx.bankSyncRun.update({
        where: { id: plan.runId },
        data: { undoneAt: new Date() },
      })
    })

    return {
      deleted: plan.deletableIds.length,
      unlinked: plan.claimedIds.length,
      blocked: plan.blockedCount,
    }
  }

  /** The connection as the policy needs to see it. */
  private async stateOf(
    userId: string,
    connectionId: string
  ): Promise<ConnectionState> {
    const connection = await this.prisma.bankConnection.findFirstOrThrow({
      where: { id: connectionId, userId },
    })
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    // Counted from the runs rather than stored: a counter drifts the first
    // time a run dies halfway, and the runs are the record of what happened.
    const fetchesToday = await this.prisma.bankSyncRun.count({
      where: {
        userId,
        aspspName: connection.aspspName,
        fetchedAt: { gte: startOfDay },
      },
    })
    return {
      id: connection.id,
      aspspName: connection.aspspName,
      status: connection.status,
      consentValidUntil: connection.consentValidUntil,
      lastSyncAt: connection.lastSyncAt,
      fetchesToday,
      retryAfter: connection.retryAfter,
    }
  }

  /**
   * Which account here each bank account looks like, judged on the money.
   *
   * Only offered for accounts nobody has mapped yet, and only from
   * transactions already staged — this reads, it never asks the bank.
   */
  private async suggestAccounts(
    userId: string,
    connectionId: string
  ): Promise<
    Map<string, { accountId: string; accountLabel: string; matches: number }>
  > {
    const staged = await this.prisma.bankStagedTransaction.findMany({
      where: { userId },
      select: {
        externalAccountId: true,
        externalId: true,
        date: true,
        amount: true,
        label: true,
      },
      take: 5000,
    })
    if (staged.length === 0) return new Map()

    const known = new Set(
      (
        await this.prisma.bankAccountLink.findMany({
          where: { connectionId },
          select: { externalAccountId: true },
        })
      ).map(link => link.externalAccountId)
    )
    const relevant = staged.filter(row => known.has(row.externalAccountId))
    if (relevant.length === 0) return new Map()

    const ledgerRows = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        accountId: true,
        date: true,
        amount: true,
        description: true,
        externalId: true,
      },
    })
    const ledger: LedgerTransaction[] = ledgerRows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      date: row.date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      description: row.description,
      externalId: row.externalId,
    }))
    const accountOf = new Map(ledgerRows.map(row => [row.id, row.accountId]))

    const incoming: StagedTransaction[] = relevant.map(row => ({
      externalAccountId: row.externalAccountId,
      externalId: row.externalId,
      date: row.date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      label: row.label,
    }))

    const proposals: MappingProposal[] = proposeMapping(
      incoming,
      reconcileAll(incoming, ledger),
      id => accountOf.get(id)
    )

    const names = new Map(
      (
        await this.prisma.account.findMany({
          where: { userId },
          select: { id: true, name: true },
        })
      ).map(account => [account.id, account.name])
    )

    const result = new Map<
      string,
      { accountId: string; accountLabel: string; matches: number }
    >()
    for (const proposal of proposals) {
      if (!proposal.proposedAccountId) continue
      result.set(proposal.externalAccountId, {
        accountId: proposal.proposedAccountId,
        accountLabel: names.get(proposal.proposedAccountId) ?? '?',
        matches: proposal.matched,
      })
    }
    return result
  }

  /**
   * Say what a bank account is, or that it should be left alone.
   *
   * Enabling a `CARD` account is refused rather than warned about. Its
   * purchases are already reported by the account it settles onto — 597 of
   * them in a single measured session — and a warning in a form is a warning
   * nobody reads, where the cost of being wrong is a ledger to rebuild.
   */
  async updateLink(
    userId: string,
    linkId: string,
    input: { accountId?: string | null; isIngested?: boolean }
  ): Promise<DiscoveredAccount> {
    const link = await this.prisma.bankAccountLink.findFirst({
      where: { id: linkId, userId },
    })
    if (!link) throw new NotFoundException('No such bank account')

    const accountId =
      input.accountId === undefined ? link.accountId : input.accountId
    const isIngested = input.isIngested ?? link.isIngested

    if (isIngested && link.cashAccountType === 'CARD') {
      throw new BadRequestException(CARD_ACCOUNT_WARNING)
    }
    if (isIngested && !accountId) {
      throw new BadRequestException(
        'Say which account this is before reading from it: its transactions ' +
          'have nowhere to go otherwise.'
      )
    }
    if (accountId) {
      const owned = await this.prisma.account.findFirst({
        where: { id: accountId, userId },
        select: { id: true },
      })
      if (!owned) throw new NotFoundException('No such account')
      await this.assertAccountFree(userId, accountId, linkId)
    }

    await this.prisma.bankAccountLink.update({
      where: { id: linkId },
      data: { accountId, isIngested },
    })

    const view = await this.viewConnection(userId, link.connectionId)
    const updated = view.accounts.find(account => account.linkId === linkId)
    if (!updated) throw new NotFoundException('No such bank account')
    return updated
  }

  /**
   * One bank account, one local account: two links feeding the same one
   * would double-count the moment either syncs, and reconciliation would
   * compare each incoming row against a ledger mixing both banks' rows —
   * exactly the false-merge risk a plain amount-and-date match already has
   * to guard against once, not twice over.
   */
  private async assertAccountFree(
    userId: string,
    accountId: string,
    exceptLinkId: string
  ): Promise<void> {
    const claimedBy = await this.prisma.bankAccountLink.findFirst({
      where: { userId, accountId, id: { not: exceptLinkId } },
      select: {
        accountName: true,
        connection: { select: { aspspName: true } },
      },
    })
    if (claimedBy) {
      throw new BadRequestException(
        `This account is already "${claimedBy.accountName}" from ` +
          `${claimedBy.connection.aspspName} — swapping two accounts needs ` +
          'one side cleared to "— aucun —" first, so both are never ' +
          'claimed at once.'
      )
    }
  }

  /**
   * Correct which account a bank account is — not just for the next sync,
   * but for what an earlier, wrong answer already wrote.
   *
   * Changing the mapping alone only points a future fetch somewhere else. It
   * does nothing about a row a past sync already wrote under the wrong
   * account: an inserted transaction stays there, and a CSV row that
   * happened to match by date and amount stays wearing a bank reference it
   * never earned. Both are found the same way — by the bank references
   * `BankStagedTransaction` recorded for this bank account, wherever a
   * `Transaction` carrying one of them sits today — and both are put right:
   * an inserted row is reconciled against the corrected account exactly as a
   * sync would (claimed if it is already there, moved if it is not); a
   * wrongly claimed CSV row simply loses the reference, keeping everything
   * else it carries.
   *
   * A row that has since gained a tag, a reimbursement, a settlement or a
   * payment is left alone rather than merged away — the same refusal
   * `undo-bank-sync-run.ts` makes, for the same reason: deleting it would
   * take that work with it, silently.
   */
  private async planLinkReassignment(
    userId: string,
    linkId: string,
    newAccountId: string | null
  ): Promise<{
    outcome: ReassignmentOutcome
    toDelete: string[]
    toMove: {
      id: string
      accountId: string
      hash: string
      externalId: string | null
      bookingStatus: string | null
    }[]
    toClaim: {
      transactionId: string
      externalId: string | null
      bookingStatus: string | null
      syncRunId: string | null
    }[]
    toUnlink: string[]
  }> {
    const link = await this.prisma.bankAccountLink.findFirst({
      where: { id: linkId, userId },
    })
    if (!link) throw new NotFoundException('No such bank account')

    if (newAccountId) {
      const target = await this.prisma.account.findFirst({
        where: { id: newAccountId, userId },
        select: { id: true },
      })
      if (!target) throw new NotFoundException('No such account')
      await this.assertAccountFree(userId, newAccountId, linkId)
    }

    const empty = {
      outcome: {
        moved: 0,
        merged: 0,
        unlinked: 0,
        blockedByWork: 0,
        ambiguous: 0,
      },
      toDelete: [] as string[],
      toMove: [] as {
        id: string
        accountId: string
        hash: string
        externalId: string | null
        bookingStatus: string | null
      }[],
      toClaim: [] as {
        transactionId: string
        externalId: string | null
        bookingStatus: string | null
        syncRunId: string | null
      }[],
      toUnlink: [] as string[],
    }

    const oldAccountId = link.accountId
    // Both sides the same — including both null — is nothing to do: either a
    // plain reassignment for a link no sync has touched yet, or a link
    // already cleared, being cleared again.
    if (oldAccountId === newAccountId) return empty

    // A link cleared to "— aucun —" no longer says where its rows are — that
    // was the one thing `accountId` was for. They didn't move on their own,
    // though: they're still wherever the sync originally put them — which can
    // be the very account this correction now targets, if that happens to be
    // where the original, wrong sync landed them too. Search everywhere
    // instead of refusing for lack of a value the link no longer carries, or
    // excluding the one account a direct "aucun" → correct-account correction
    // is likely to name — otherwise that correction finds nothing and leaves
    // the rows stranded exactly where "à réaffecter" already found them.
    const accountScope = oldAccountId ? { accountId: oldAccountId } : {}

    const staged = await this.prisma.bankStagedTransaction.findMany({
      where: { userId, externalAccountId: link.externalAccountId },
      select: {
        externalId: true,
        date: true,
        amount: true,
        label: true,
        bookingStatus: true,
      },
    })
    if (staged.length === 0) return empty
    const externalIds = staged
      .map(s => s.externalId)
      .filter((id): id is string => id !== null)

    // What this bank told `ingest` at the time — date, amount, label — is
    // what recovers a row that has already lost its reference: by an earlier,
    // careless use of this same tool, or by "aucun" further up the same
    // correction. Without this, that row is indistinguishable from any other
    // plain transaction, and stays on the wrong account forever — which is
    // exactly the failure a first version of this method had.
    const signatureOf = (row: {
      date: Date
      amount: unknown
      label: string
    }): string =>
      `${row.date.toISOString().slice(0, 10)}|${Number(row.amount)}|${row.label}`
    const bySignature = new Map<string, (typeof staged)[number][]>()
    for (const row of staged) {
      const key = signatureOf(row)
      const queue = bySignature.get(key)
      if (queue) queue.push(row)
      else bySignature.set(key, [row])
    }

    const selectAffected = {
      id: true,
      source: true,
      date: true,
      amount: true,
      description: true,
      externalId: true,
      bookingStatus: true,
      syncRunId: true,
      _count: {
        select: {
          reimbursementRequests: true,
          settlementsAsIncome: true,
          tags: true,
          reimbursementPayments: true,
        },
      },
    } as const

    const stillLinked =
      externalIds.length > 0
        ? await this.prisma.transaction.findMany({
            where: {
              userId,
              ...accountScope,
              externalId: { in: externalIds },
            },
            select: selectAffected,
          })
        : []

    const orphaned = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...accountScope,
        externalId: null,
        source: TransactionSource.BANK_API,
        OR: [...bySignature.values()].map(queue => {
          const representative = queue[0]
          return representative
            ? {
                date: representative.date,
                amount: representative.amount,
                description: representative.label,
              }
            : {}
        }),
      },
      select: selectAffected,
    })

    const affected = [...stillLinked, ...orphaned]
    if (affected.length === 0) return empty

    // Each row's true bank reference: its own, where it still carries one;
    // recovered from the matching staged row otherwise. A queue rather than a
    // plain map because a signature is not guaranteed unique — two identical
    // purchases the same day — so each recovery consumes one candidate rather
    // than handing the same reference to every row that looks like it.
    const recovered = new Map<
      string,
      { externalId: string | null; bookingStatus: string | null }
    >()
    for (const t of affected) {
      if (t.externalId) {
        recovered.set(t.id, {
          externalId: t.externalId,
          bookingStatus: t.bookingStatus,
        })
        continue
      }
      const queue = bySignature.get(
        signatureOf({ date: t.date, amount: t.amount, label: t.description })
      )
      const match = queue?.shift()
      recovered.set(t.id, {
        externalId: match?.externalId ?? null,
        bookingStatus: match?.bookingStatus ?? null,
      })
    }

    const carriesWork = (t: (typeof affected)[number]): boolean =>
      t._count.reimbursementRequests > 0 ||
      t._count.settlementsAsIncome > 0 ||
      t._count.tags > 0 ||
      t._count.reimbursementPayments > 0

    const inserted = affected.filter(
      t => t.source === TransactionSource.BANK_API
    )
    const claimed = affected.filter(
      t => t.source !== TransactionSource.BANK_API
    )

    const result = {
      outcome: { ...empty.outcome, unlinked: claimed.length },
      toDelete: [] as string[],
      toMove: [] as {
        id: string
        accountId: string
        hash: string
        externalId: string | null
        bookingStatus: string | null
      }[],
      toClaim: empty.toClaim,
      toUnlink: claimed.map(t => t.id),
    }

    if (inserted.length === 0) return result

    if (!newAccountId) {
      // The link is being cleared entirely: there is nowhere left for these
      // rows to belong, but the transaction still happened — unlinked, same
      // as a CSV row claimed by coincidence, never deleted. The row is real;
      // only the sync's claim on it was wrong.
      result.toUnlink.push(...inserted.map(t => t.id))
      result.outcome.unlinked += inserted.length
      return result
    }

    // A row already sitting on the new account precisely because that is
    // where the wrong sync originally put it — now searchable account-wide
    // above — must not also appear as the ledger it's reconciled against:
    // compared to itself, it would come back "already there" and get deleted
    // out from under the very correction meant to restore it.
    const insertedIds = inserted.map(t => t.id)
    const ledgerRows = await this.prisma.transaction.findMany({
      where: {
        userId,
        accountId: newAccountId,
        ...(insertedIds.length > 0 && { id: { notIn: insertedIds } }),
      },
      select: {
        id: true,
        accountId: true,
        date: true,
        amount: true,
        description: true,
        externalId: true,
      },
    })
    const ledger: LedgerTransaction[] = ledgerRows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      date: row.date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      description: row.description,
      externalId: row.externalId,
    }))

    const stagedForReconcile: StagedTransaction[] = inserted.map(t => ({
      externalAccountId: link.externalAccountId,
      externalId: recovered.get(t.id)?.externalId ?? null,
      date: t.date.toISOString().slice(0, 10),
      amount: Number(t.amount),
      label: t.description,
    }))

    const verdicts: AssignedVerdict[] = reconcileAll(
      stagedForReconcile,
      ledger,
      {
        accountIdByExternalAccountId: {
          [link.externalAccountId]: newAccountId,
        },
      }
    )

    for (const [position, verdict] of verdicts.entries()) {
      const t = inserted[position]
      if (!t) continue
      const ref = recovered.get(t.id) ?? {
        externalId: null,
        bookingStatus: null,
      }

      if (verdict.kind === 'matched' || verdict.kind === 'alreadyLinked') {
        if (carriesWork(t)) {
          result.outcome.blockedByWork++
          continue
        }
        result.toDelete.push(t.id)
        result.toClaim.push({
          transactionId: verdict.transactionId,
          externalId: ref.externalId,
          bookingStatus: ref.bookingStatus,
          syncRunId: t.syncRunId,
        })
        result.outcome.merged++
        continue
      }

      if (verdict.kind === 'new') {
        result.toMove.push({
          id: t.id,
          accountId: newAccountId,
          hash: `${userId}|${t.date.toISOString().slice(0, 10)}|${Number(t.amount)}|${newAccountId}|${ref.externalId ?? t.description}`,
          externalId: ref.externalId,
          bookingStatus: ref.bookingStatus,
        })
        result.outcome.moved++
        continue
      }

      // 'ambiguous', 'duplicate' — more than one equally good account for
      // this row to belong to, or none at all worth trusting. A person
      // decides, this does not guess.
      result.outcome.ambiguous++
    }

    return result
  }

  /** What correcting a link's account would do, without doing it. */
  async previewLinkReassignment(
    userId: string,
    linkId: string,
    newAccountId: string | null
  ): Promise<ReassignmentOutcome> {
    const plan = await this.planLinkReassignment(userId, linkId, newAccountId)
    return plan.outcome
  }

  /** Correct a link's account, and everything an earlier sync wrote under it. */
  async reassignLink(
    userId: string,
    linkId: string,
    newAccountId: string | null
  ): Promise<ReassignmentOutcome> {
    const plan = await this.planLinkReassignment(userId, linkId, newAccountId)

    await this.prisma.$transaction(async tx => {
      if (plan.toDelete.length > 0) {
        await tx.transaction.deleteMany({
          where: { id: { in: plan.toDelete } },
        })
      }
      for (const claim of plan.toClaim) {
        await tx.transaction.update({
          where: { id: claim.transactionId },
          data: {
            externalId: claim.externalId,
            bookingStatus: claim.bookingStatus,
            syncRunId: claim.syncRunId,
          },
        })
      }
      for (const move of plan.toMove) {
        await tx.transaction.update({
          where: { id: move.id },
          data: {
            accountId: move.accountId,
            hash: move.hash,
            // A no-op for a row that already carried its own reference;
            // restores it for one recovered from a signature match instead.
            externalId: move.externalId,
            bookingStatus: move.bookingStatus,
          },
        })
      }
      if (plan.toUnlink.length > 0) {
        await tx.transaction.updateMany({
          where: { id: { in: plan.toUnlink } },
          data: { externalId: null, bookingStatus: null, syncRunId: null },
        })
      }
      await tx.bankAccountLink.update({
        where: { id: linkId },
        data: {
          accountId: newAccountId,
          // An account arrives switched off; one cleared entirely is no
          // different — there is nowhere left for it to read into.
          ...(newAccountId ? {} : { isIngested: false }),
        },
      })
    })

    return plan.outcome
  }

  /**
   * Fetch, reconcile and write. What the button does.
   *
   * A matched row is claimed, never recreated: it may already carry a
   * reimbursement, a tag, a category corrected by hand. A new one is inserted
   * unfiled, because the bank sends no category and a wrong one is invisible
   * where a missing one is a click from correct.
   */
  async sync(
    userId: string,
    connectionId: string,
    psu?: PsuContext
  ): Promise<SyncOutcome> {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, userId },
      include: { accountLinks: true },
    })
    if (!connection) throw new NotFoundException('No such bank connection')

    const decision = decide(
      await this.stateOf(userId, connectionId),
      new Date(),
      syncPolicyOptionsFromEnv()
    )
    if (decision.action !== 'fetch') {
      throw new BadRequestException(decision.reason)
    }
    if (!connection.sessionId) {
      throw new BadRequestException(
        'This connection has no session: authorize the bank again.'
      )
    }

    const ingestable = connection.accountLinks.filter(
      link => link.isIngested && link.accountId
    )
    if (ingestable.length === 0) {
      throw new BadRequestException(
        'No account is enabled on this connection, so there is nothing to read.'
      )
    }

    const run = await this.prisma.bankSyncRun.create({
      data: {
        userId,
        aspspName: connection.aspspName,
        sessionId: connection.sessionId,
        fetchedAt: new Date(),
      },
      select: { id: true },
    })

    const credentials = await this.credentialsOf(userId)
    const fetched = new Map<string, BankTransaction[]>()
    for (const link of ingestable) {
      fetched.set(
        link.externalAccountId,
        // `psu` says a person pressed the button — which is the only way a
        // sync starts here. Without it the bank counts this read against
        // PSD2's four-unattended-a-day; with it, it does not.
        await this.client.listTransactions(
          credentials,
          link.externalAccountId,
          psu ? { psu } : {}
        )
      )
    }

    const outcome = await this.ingest(userId, connection.id, run.id, fetched)
    await this.prisma.bankConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    })
    return outcome
  }

  /** Stage what was fetched, reconcile it, and write the difference. */
  private async ingest(
    userId: string,
    connectionId: string,
    runId: string,
    fetched: Map<string, BankTransaction[]>
  ): Promise<SyncOutcome> {
    const links = await this.prisma.bankAccountLink.findMany({
      where: { connectionId, isIngested: true },
    })
    const accountIdByExternal: Record<string, string> = {}
    for (const link of links) {
      if (link.accountId)
        accountIdByExternal[link.externalAccountId] = link.accountId
    }

    const staged: (StagedTransaction & { raw: BankTransaction })[] = []
    for (const [externalAccountId, transactions] of fetched) {
      for (const raw of transactions) {
        // `transaction_date` — "date d'opération" — over `booking_date`:
        // measured on real CIC data, they agree for almost everything
        // (card purchases), but a monthly fee is booked a few days after it
        // is dated, and CIC's own app, and Bankin, both show the earlier
        // date. `booking_date` was the original default, on the strength of
        // matching Bankin for a card purchase; this is that assumption
        // overturned by a case it did not cover.
        const date =
          raw.transaction_date ?? raw.booking_date ?? raw.value_date ?? null
        const magnitude = Math.abs(Number(raw.transaction_amount?.amount))
        const amount =
          raw.credit_debit_indicator === 'CRDT'
            ? magnitude
            : raw.credit_debit_indicator === 'DBIT'
              ? -magnitude
              : null
        // A transaction with no date or no stated direction cannot be matched
        // on anything, and guessing either is how a wrong link is written.
        if (date === null || amount === null || Number.isNaN(magnitude))
          continue

        staged.push({
          externalAccountId,
          externalId: raw.entry_reference ?? null,
          date,
          amount,
          // Bankin's own export arrives already stripped of the date, card
          // number and bank reference codes a raw label carries — humanized
          // once here so the staging row and the transaction it produces
          // agree on the same text, exact-match orphan recovery included.
          label: humanizeLabel(
            (raw.remittance_information ?? []).join(' ').trim() ||
              raw.creditor?.name ||
              raw.debtor?.name ||
              '(no label)'
          ),
          raw,
        })
      }
    }

    await this.prisma.bankStagedTransaction.createMany({
      data: staged.map(row => ({
        runId,
        userId,
        externalAccountId: row.externalAccountId,
        accountName:
          links.find(l => l.externalAccountId === row.externalAccountId)
            ?.accountName ?? row.externalAccountId,
        externalId: row.externalId,
        bookingStatus: row.raw.status ?? null,
        date: new Date(row.date),
        amount: row.amount,
        label: row.label,
        raw: row.raw as unknown as object,
      })),
      skipDuplicates: true,
    })

    const ledgerRows = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        accountId: true,
        date: true,
        amount: true,
        description: true,
        externalId: true,
      },
    })
    const ledger: LedgerTransaction[] = ledgerRows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      date: row.date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      description: row.description,
      externalId: row.externalId,
    }))

    // The earliest a given account's own history goes, going only from what
    // this ledger already has for it — CSV or bank, whichever came first. Not
    // computed for an account with nothing yet: there is no settled period to
    // protect from a first backfill, which is exactly where the deep history
    // is worth having.
    //
    // The API reaches further back on a re-authorization than it does on a
    // routine sync — 729 days against 90, measured — and further back than
    // the CSV ever did for at least one account, by four months, also
    // measured. Nothing stops that window from handing back a genuine,
    // previously unseen transaction dated before it: not a duplicate, so
    // reconciliation lets it through as `new`, and inserting it would revise
    // a month the user had already closed the books on. This floor is what
    // refuses that insert without refusing the claim a matching row still
    // deserves.
    const earliestByAccount = new Map<string, string>()
    for (const row of ledger) {
      const current = earliestByAccount.get(row.accountId)
      if (!current || row.date < current) {
        earliestByAccount.set(row.accountId, row.date)
      }
    }

    const verdicts: AssignedVerdict[] = reconcileAll(staged, ledger, {
      accountIdByExternalAccountId: accountIdByExternal,
    })
    const summary = summarize(verdicts)

    // Which rows this run will actually insert — 'new', a mapped account,
    // not older than that account's own settled history — decided up front
    // so the categorizer, a network call, never runs inside the write
    // transaction below.
    const toInsert: {
      position: number
      row: (typeof staged)[number]
      accountId: string
    }[] = []
    let skippedTooOld = 0
    for (const [position, verdict] of verdicts.entries()) {
      if (verdict.kind !== 'new') continue
      const row = staged[position]
      if (!row) continue
      const accountId = accountIdByExternal[row.externalAccountId]
      if (!accountId) continue
      const floor = earliestByAccount.get(accountId)
      if (floor && row.date < floor) {
        skippedTooOld++
        continue
      }
      toInsert.push({ position, row, accountId })
    }

    const filingByPosition = await this.categorizeInserts(userId, toInsert)

    let claimed = 0
    let inserted = 0

    await this.prisma.$transaction(async tx => {
      for (const [position, verdict] of verdicts.entries()) {
        if (verdict.kind !== 'matched') continue
        const row = staged[position]
        if (!row) continue
        await tx.transaction.update({
          where: { id: verdict.transactionId },
          data: {
            externalId: row.externalId,
            bookingStatus: row.raw.status ?? null,
            syncRunId: runId,
          },
        })
        claimed++
      }

      for (const { position, row, accountId } of toInsert) {
        const filing = filingByPosition.get(position)
        await tx.transaction.create({
          data: {
            userId,
            accountId,
            hash: `${userId}|${row.date}|${row.amount}|${accountId}|${row.externalId ?? row.label}`,
            date: new Date(row.date),
            description: row.label,
            amount: row.amount,
            type: row.amount < 0 ? 'EXPENSE' : 'INCOME',
            source: TransactionSource.BANK_API,
            externalId: row.externalId,
            bookingStatus: row.raw.status ?? null,
            syncRunId: runId,
            categoryId: filing?.categoryId ?? null,
            subcategoryId: filing?.subcategoryId ?? null,
            subcategory: filing?.subcategoryName ?? null,
          },
        })
        inserted++
      }
    })

    return {
      connectionId,
      fetched: staged.length,
      claimed,
      inserted,
      skippedDuplicates: summary.duplicate,
      skippedAmbiguous: summary.ambiguous,
      skippedTooOld,
      accountsRead: fetched.size,
    }
  }

  /**
   * Place each freshly synced row among the categories the user already
   * has. A bank states an amount and a counterparty, never what a purchase
   * was for, so this is the only way a synced row arrives filed rather than
   * blank — the same problem an import solves once it stops trusting a
   * file's own categories, answered here the same two ways in order:
   *
   * 1. `proposeCategoryFromHistory` — this user has already filed a
   *    near-identical label before, consistently enough to trust without
   *    asking anyone. Free, instant, and exactly as sure as the account
   *    mapping this project already proposes the same way.
   * 2. The model, for whatever the rule would not commit to — grounded with
   *    a couple of this user's own closest examples rather than the bare
   *    category names, but never invited to invent a category that is not
   *    already there.
   *
   * Never fatal: a batch the model can't reach leaves those rows unfiled —
   * visible, and one click to fix — rather than losing the sync over it.
   */
  private async categorizeInserts(
    userId: string,
    toInsert: { position: number; row: { label: string; amount: number } }[]
  ): Promise<Map<number, ResolvedAssignment>> {
    const byPosition = new Map<number, ResolvedAssignment>()
    if (toInsert.length === 0) return byPosition

    const [categories, subcategories] = await Promise.all([
      this.prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true, type: true },
      }),
      this.prisma.subcategory.findMany({
        where: { userId },
        select: { id: true, name: true, categoryId: true },
      }),
    ])
    if (categories.length === 0) return byPosition

    const categoryNameById = new Map(categories.map(c => [c.id, c.name]))
    const subcategoryNameById = new Map(subcategories.map(s => [s.id, s.name]))
    const historyRows = await this.prisma.transaction.findMany({
      where: { userId, categoryId: { not: null } },
      select: {
        description: true,
        type: true,
        categoryId: true,
        subcategoryId: true,
      },
      // Recent habits over old ones: a merchant filed one way for years and
      // reclassified last month should be read from how it is filed now.
      orderBy: { date: 'desc' },
      take: 3000,
    })
    const history: CategorizedHistoryRow[] = []
    for (const row of historyRows) {
      const categoryName = row.categoryId
        ? categoryNameById.get(row.categoryId)
        : undefined
      if (!row.categoryId || !categoryName) continue
      history.push({
        description: row.description,
        type: row.type,
        categoryId: row.categoryId,
        categoryName,
        subcategoryId: row.subcategoryId,
        subcategoryName: row.subcategoryId
          ? (subcategoryNameById.get(row.subcategoryId) ?? null)
          : null,
      })
    }

    const remaining: typeof toInsert = []
    for (const entry of toInsert) {
      const type = entry.row.amount < 0 ? 'EXPENSE' : 'INCOME'
      const rule = proposeCategoryFromHistory(entry.row.label, type, history)
      if (rule) {
        byPosition.set(entry.position, {
          index: entry.position,
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          subcategoryName: rule.subcategoryName,
        })
      } else {
        remaining.push(entry)
      }
    }

    if (remaining.length > 0) {
      try {
        // Indexed locally (0..n-1) for the model, then mapped back to this
        // run's own verdict position — the two only coincide by accident,
        // since `toInsert` already skipped every matched and skipped-too-old
        // row `verdicts` also carries, and a rule may have just resolved
        // some positions the model never sees.
        const assignments = await this.aiSuggestions.categorizeTransactions(
          remaining.map(({ row }, index) => ({
            index,
            description: row.label,
            amount: row.amount,
            type: row.amount < 0 ? ('EXPENSE' as const) : ('INCOME' as const),
          })),
          categories,
          subcategories,
          history
        )
        for (const assignment of assignments) {
          const entry = remaining[assignment.index]
          if (entry) byPosition.set(entry.position, assignment)
        }
      } catch (error) {
        this.logger.error(
          `Categorization failed for ${remaining.length} synced transaction(s); left unfiled`,
          error
        )
      }
    }

    const usedCategoryIds = new Set(
      [...byPosition.values()].map(a => a.categoryId)
    )
    if (usedCategoryIds.size > 0) {
      const withoutIcons = await this.prisma.category.findMany({
        where: { userId, id: { in: [...usedCategoryIds] }, icon: null },
        select: { id: true, name: true },
      })
      if (withoutIcons.length > 0) {
        void this.aiSuggestions.generateAndSaveIcons(userId, withoutIcons, [])
      }
    }

    return byPosition
  }
}

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
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import {
  EnableBankingClient,
  type BankAccountResource,
  type BankTransaction,
} from './enable-banking.client'
import {
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
  accountsRead: number
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
    private readonly client: EnableBankingClient
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured()
  }

  /**
   * The banks available in a country, for a person choosing one.
   *
   * Beta implementations are flagged rather than hidden: they work, they are
   * simply newer, and a bank missing from a list with no explanation is worse
   * than one shown with a caveat.
   */
  async listBanks(
    country: string
  ): Promise<{ name: string; country: string; beta: boolean }[]> {
    const aspsps = await this.client.listAspsps(country)
    return aspsps
      .map(aspsp => ({
        name: aspsp.name,
        country: aspsp.country,
        beta: aspsp.beta ?? false,
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
    const aspsps = await this.client.listAspsps(input.country)
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

    const { url } = await this.client.startAuthorization({
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      redirectUrl: input.redirectUrl,
      validUntil,
      state,
      // Stable per user, so the sessions of one person stay related across the
      // re-authorizations a lapsing consent forces.
      psuId: userId,
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
    code: string
  ): Promise<ConnectionView> {
    const session = await this.client.createSession(code)
    const accounts = EnableBankingClient.accountsOf(session)
    const aspspName = session.aspsp?.name ?? 'unknown'

    const connection = await this.prisma.bankConnection.upsert({
      where: {
        id:
          (
            await this.prisma.bankConnection.findFirst({
              where: { userId, aspspName },
              select: { id: true },
            })
          )?.id ?? '',
      },
      create: {
        userId,
        aspspName,
        aspspCountry: session.aspsp?.country ?? 'FR',
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
      const details = await this.describe(account)
      await this.prisma.bankAccountLink.upsert({
        where: {
          connectionId_externalAccountId: {
            connectionId: connection.id,
            externalAccountId: account.uid,
          },
        },
        create: {
          connectionId: connection.id,
          userId,
          externalAccountId: account.uid,
          accountName: details.name ?? account.uid,
          cashAccountType: details.cash_account_type ?? null,
          product: details.product ?? null,
          iban: details.account_id?.iban ?? null,
          identificationHash: details.identification_hash ?? null,
        },
        // A decision already made is never overwritten by a re-authorization.
        // What the bank says about itself is refreshed; what the user said
        // about it is theirs.
        update: {
          accountName: details.name ?? account.uid,
          ...(details.cash_account_type
            ? { cashAccountType: details.cash_account_type }
            : {}),
          ...(details.product ? { product: details.product } : {}),
          ...(details.account_id?.iban
            ? { iban: details.account_id.iban }
            : {}),
        },
      })
    }

    return this.viewConnection(userId, connection.id)
  }

  /** What `/details` says, falling back to the session when it will not say. */
  private async describe(
    account: BankAccountResource
  ): Promise<BankAccountResource> {
    if (!account.uid) return account
    try {
      const details = await this.client.getAccountDetails(account.uid)
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
    const decision = decide(state, new Date())
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
   * Fetch, reconcile and write. What the button does.
   *
   * A matched row is claimed, never recreated: it may already carry a
   * reimbursement, a tag, a category corrected by hand. A new one is inserted
   * unfiled, because the bank sends no category and a wrong one is invisible
   * where a missing one is a click from correct.
   */
  async sync(userId: string, connectionId: string): Promise<SyncOutcome> {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, userId },
      include: { accountLinks: true },
    })
    if (!connection) throw new NotFoundException('No such bank connection')

    const decision = decide(
      await this.stateOf(userId, connectionId),
      new Date()
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

    const fetched = new Map<string, BankTransaction[]>()
    for (const link of ingestable) {
      fetched.set(
        link.externalAccountId,
        await this.client.listTransactions(link.externalAccountId)
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
        const date =
          raw.booking_date ?? raw.transaction_date ?? raw.value_date ?? null
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
          label:
            (raw.remittance_information ?? []).join(' ').trim() ||
            raw.creditor?.name ||
            raw.debtor?.name ||
            '(no label)',
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

    const verdicts: AssignedVerdict[] = reconcileAll(staged, ledger, {
      accountIdByExternalAccountId: accountIdByExternal,
    })
    const summary = summarize(verdicts)

    let claimed = 0
    let inserted = 0

    await this.prisma.$transaction(async tx => {
      for (const [position, verdict] of verdicts.entries()) {
        const row = staged[position]
        if (!row) continue

        if (verdict.kind === 'matched') {
          await tx.transaction.update({
            where: { id: verdict.transactionId },
            data: {
              externalId: row.externalId,
              bookingStatus: row.raw.status ?? null,
            },
          })
          claimed++
          continue
        }
        if (verdict.kind !== 'new') continue

        const accountId = accountIdByExternal[row.externalAccountId]
        if (!accountId) continue
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
      accountsRead: fetched.size,
    }
  }
}

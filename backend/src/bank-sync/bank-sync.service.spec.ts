import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { BankSyncService, syncPolicyOptionsFromEnv } from './bank-sync.service'
import { PrismaService } from '../prisma/prisma.service'
import { EnableBankingClient } from './enable-banking.client'
import { EnableBankingCredentialsService } from './enable-banking-credentials.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'

const userId = 'user-1'

/**
 * A connection row shaped for both `completeAuthorization`'s own lookup and
 * what `viewConnection`/`stateOf` read back afterwards — a mock does not care
 * which `select`/`include` asked for it, only that the fields under test are
 * there.
 */
function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-1',
    userId,
    aspspName: 'CIC',
    aspspCountry: 'FR',
    status: 'ACTIVE',
    consentValidUntil: null,
    lastSyncAt: null,
    retryAfter: null,
    accountLinks: [],
    ...overrides,
  }
}

const mockPrisma = {
  bankAuthorizationAttempt: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  bankConnection: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  bankAccountLink: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  bankStagedTransaction: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  bankSyncRun: {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
  },
  subcategory: {
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  // The service runs `ingest`'s writes in one interactive transaction;
  // handing the callback this same mock keeps every assertion below reading
  // from the calls it already knows how to inspect.
  $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
    callback(mockPrisma)
  ),
}

const mockClient = {
  listAspsps: vi.fn(),
  startAuthorization: vi.fn(),
  createSession: vi.fn(),
  getAccountDetails: vi.fn(),
  listTransactions: vi.fn(),
}

const mockCredentialsService = {
  resolve: vi.fn(),
  isConfigured: vi.fn(),
}

const mockAiSuggestions = {
  categorizeTransactions: vi.fn(),
  generateAndSaveIcons: vi.fn(),
}

describe('BankSyncService — authorization', () => {
  let service: BankSyncService

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EnableBankingClient, useValue: mockClient },
        {
          provide: EnableBankingCredentialsService,
          useValue: mockCredentialsService,
        },
        { provide: AiSuggestionsService, useValue: mockAiSuggestions },
      ],
    }).compile()
    service = module.get<BankSyncService>(BankSyncService)

    // Defaults every completeAuthorization test relies on unless overridden.
    mockPrisma.bankConnection.findFirst.mockResolvedValue(connectionRow())
    mockPrisma.bankConnection.findFirstOrThrow.mockResolvedValue(
      connectionRow()
    )
    mockPrisma.bankConnection.upsert.mockResolvedValue({ id: 'connection-1' })
    mockPrisma.bankSyncRun.count.mockResolvedValue(0)
    mockPrisma.bankStagedTransaction.findMany.mockResolvedValue([])
    mockPrisma.bankAccountLink.findFirst.mockResolvedValue(null)
    mockPrisma.bankAccountLink.upsert.mockResolvedValue({ id: 'link-1' })
    mockClient.getAccountDetails.mockResolvedValue({})
    mockCredentialsService.resolve.mockResolvedValue({
      applicationId: 'app-1',
      privateKey: 'test-key',
    })
  })

  describe('startAuthorization', () => {
    it('refuses a bank GET /aspsps does not name', async () => {
      mockClient.listAspsps.mockResolvedValue([{ name: 'CIC', country: 'FR' }])

      await expect(
        service.startAuthorization(userId, {
          aspspName: 'Not A Bank',
          country: 'FR',
          redirectUrl: 'https://localhost/callback',
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('records the canonical name under the state it returns', async () => {
      mockClient.listAspsps.mockResolvedValue([
        // Resolved case-insensitively: what the user typed need not match
        // the directory's own casing.
        { name: 'CIC', country: 'FR', maximum_consent_validity: 180 * 86_400 },
      ])
      mockClient.startAuthorization.mockResolvedValue({
        url: 'https://bank.example/authorize',
      })

      const result = await service.startAuthorization(userId, {
        aspspName: 'cic',
        country: 'FR',
        redirectUrl: 'https://localhost/callback',
      })

      expect(result.url).toBe('https://bank.example/authorize')
      expect(mockPrisma.bankAuthorizationAttempt.create).toHaveBeenCalledWith({
        data: {
          id: result.state,
          userId,
          aspspName: 'CIC',
          aspspCountry: 'FR',
        },
      })
    })
  })

  describe('completeAuthorization', () => {
    it('reuses the connection despite the session echoing a different name', async () => {
      // The failure this exists to prevent: a bank already connected gets a
      // second connection because `session.aspsp.name` does not repeat what
      // this application asked `POST /auth` with.
      mockPrisma.bankAuthorizationAttempt.findUnique.mockResolvedValue({
        id: 'state-1',
        userId,
        aspspName: 'CIC',
        aspspCountry: 'FR',
      })
      mockClient.createSession.mockResolvedValue({
        session_id: 'session-1',
        accounts: [],
        // The bank's own echo, deliberately different from the canonical
        // name the attempt carries.
        aspsp: { name: 'Credit Industriel et Commercial', country: 'FR' },
      })
      mockPrisma.bankConnection.findFirst.mockResolvedValue(
        connectionRow({ id: 'connection-1' })
      )

      await service.completeAuthorization(userId, 'code-1', 'state-1')

      expect(mockPrisma.bankConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, aspspCountry: 'FR', aspspName: 'CIC' },
        })
      )
      expect(mockPrisma.bankConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'connection-1' } })
      )
      expect(mockPrisma.bankAuthorizationAttempt.delete).toHaveBeenCalledWith({
        where: { id: 'state-1' },
      })
    })

    it('creates a new connection under the canonical name, not the echo', async () => {
      mockPrisma.bankAuthorizationAttempt.findUnique.mockResolvedValue({
        id: 'state-1',
        userId,
        aspspName: 'CIC',
        aspspCountry: 'FR',
      })
      mockClient.createSession.mockResolvedValue({
        session_id: 'session-1',
        accounts: [],
        aspsp: { name: 'Credit Industriel et Commercial', country: 'FR' },
      })
      mockPrisma.bankConnection.findFirst.mockResolvedValueOnce(null)

      await service.completeAuthorization(userId, 'code-1', 'state-1')

      expect(mockPrisma.bankConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '' },
          create: expect.objectContaining({
            aspspName: 'CIC',
            aspspCountry: 'FR',
          }),
        })
      )
    })

    it('falls back to the session name when state is missing', async () => {
      mockClient.createSession.mockResolvedValue({
        session_id: 'session-1',
        accounts: [],
        aspsp: { name: 'Boursorama Banque', country: 'FR' },
      })
      mockPrisma.bankConnection.findFirst.mockResolvedValueOnce(null)

      await service.completeAuthorization(userId, 'code-1')

      expect(
        mockPrisma.bankAuthorizationAttempt.findUnique
      ).not.toHaveBeenCalled()
      expect(mockPrisma.bankConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, aspspCountry: 'FR', aspspName: 'Boursorama Banque' },
        })
      )
    })

    it('falls back to the session name when the attempt already expired', async () => {
      mockPrisma.bankAuthorizationAttempt.findUnique.mockResolvedValue(null)
      mockClient.createSession.mockResolvedValue({
        session_id: 'session-1',
        accounts: [],
        aspsp: { name: 'Revolut', country: 'FR' },
      })
      mockPrisma.bankConnection.findFirst.mockResolvedValueOnce(null)

      await service.completeAuthorization(userId, 'code-1', 'stale-state')

      expect(mockPrisma.bankAuthorizationAttempt.delete).not.toHaveBeenCalled()
      expect(mockPrisma.bankConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, aspspCountry: 'FR', aspspName: 'Revolut' },
        })
      )
    })
  })

  describe('completeAuthorization — account links', () => {
    function baseSession() {
      return {
        session_id: 'session-1',
        aspsp: { name: 'CIC', country: 'FR' },
        accounts: [{ uid: 'session-2-account-uid' }],
      }
    }

    it('reuses the link a re-authorization already knew, by IBAN', async () => {
      // The failure this exists to prevent: a current account, re-authorized
      // once, becomes two links sharing one IBAN because the bank's own
      // per-session account id is not the same the second time.
      mockClient.createSession.mockResolvedValue(baseSession())
      mockClient.getAccountDetails.mockResolvedValue({
        name: 'Compte courant',
        account_id: { iban: 'FR7610057190130008931390458' },
      })
      mockPrisma.bankAccountLink.findFirst.mockResolvedValue({ id: 'link-1' })

      await service.completeAuthorization(userId, 'code-1')

      expect(mockPrisma.bankAccountLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            connectionId: 'connection-1',
            iban: 'FR7610057190130008931390458',
          },
        })
      )
      expect(mockPrisma.bankAccountLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'link-1' },
          update: expect.objectContaining({
            externalAccountId: 'session-2-account-uid',
          }),
        })
      )
    })

    it('matches a card account by identification hash, having no IBAN', async () => {
      mockClient.createSession.mockResolvedValue(baseSession())
      mockClient.getAccountDetails.mockResolvedValue({
        name: 'Carte Visa Ultim',
        cash_account_type: 'CARD',
        identification_hash: 'hash-abc',
      })
      mockPrisma.bankAccountLink.findFirst.mockResolvedValue({ id: 'link-2' })

      await service.completeAuthorization(userId, 'code-1')

      expect(mockPrisma.bankAccountLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            connectionId: 'connection-1',
            identificationHash: 'hash-abc',
          },
        })
      )
      expect(mockPrisma.bankAccountLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'link-2' } })
      )
    })

    it('creates a new link when nothing matches the durable identity', async () => {
      mockClient.createSession.mockResolvedValue(baseSession())
      mockClient.getAccountDetails.mockResolvedValue({
        name: 'Compte courant',
        account_id: { iban: 'FR7610057190130008931390458' },
      })
      mockPrisma.bankAccountLink.findFirst.mockResolvedValue(null)

      await service.completeAuthorization(userId, 'code-1')

      expect(mockPrisma.bankAccountLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '' },
          create: expect.objectContaining({
            externalAccountId: 'session-2-account-uid',
            iban: 'FR7610057190130008931390458',
          }),
        })
      )
    })
  })

  describe('previewLinkReassignment', () => {
    function linkRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'link-1',
        userId,
        connectionId: 'connection-1',
        externalAccountId: 'bank-acc-1',
        accountId: 'account-old',
        ...overrides,
      }
    }

    /** A row this link's own sync wrote or claimed under the old account. */
    function affectedRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'txn-1',
        source: 'BANK_API',
        date: new Date('2026-08-25'),
        amount: -39.99,
        description: 'CARTE FITNESS PARK',
        externalId: 'ENTRY-1',
        bookingStatus: 'BOOK',
        syncRunId: 'run-1',
        _count: {
          reimbursementRequests: 0,
          settlementsAsIncome: 0,
          tags: 0,
          reimbursementPayments: 0,
        },
        ...overrides,
      }
    }

    /** What `ingest` staged at the time — the trail a recovery reads back. */
    function stagedRow(overrides: Record<string, unknown> = {}) {
      return {
        externalId: 'ENTRY-1',
        date: new Date('2026-08-25'),
        amount: -39.99,
        label: 'CARTE FITNESS PARK',
        bookingStatus: 'BOOK',
        ...overrides,
      }
    }

    beforeEach(() => {
      mockPrisma.bankAccountLink.findFirst
        .mockResolvedValueOnce(linkRow()) // the link itself
        .mockResolvedValue(null) // no other link claims the target account
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'account-new' })
      mockPrisma.bankStagedTransaction.findMany.mockResolvedValue([stagedRow()])
    })

    it('reports nothing when the link was never synced', async () => {
      mockPrisma.bankStagedTransaction.findMany.mockResolvedValue([])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome).toEqual({
        moved: 0,
        merged: 0,
        unlinked: 0,
        blockedByWork: 0,
        ambiguous: 0,
      })
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled()
    })

    it('short-circuits when the account chosen is the one already there', async () => {
      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-old'
      )

      expect(outcome.moved).toBe(0)
      expect(mockPrisma.bankStagedTransaction.findMany).not.toHaveBeenCalled()
    })

    it('refuses an account that is not the caller’s', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null)

      await expect(
        service.previewLinkReassignment(userId, 'link-1', 'someone-elses')
      ).rejects.toThrow(NotFoundException)
    })

    it('refuses an account another bank link already claims', async () => {
      mockPrisma.bankAccountLink.findFirst
        .mockReset()
        .mockResolvedValueOnce(linkRow()) // the link itself
        .mockResolvedValueOnce({
          accountName: 'CJ Fixe',
          connection: { aspspName: 'Boursorama Banque' },
        }) // another link already sits on that account

      await expect(
        service.previewLinkReassignment(userId, 'link-1', 'account-new')
      ).rejects.toThrow(BadRequestException)
    })

    it('moves an inserted row that matches nothing on the new account', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([affectedRow()]) // still linked, on the old account
        .mockResolvedValueOnce([]) // orphaned candidates: none
        .mockResolvedValueOnce([]) // the new account's own ledger

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome.moved).toBe(1)
      expect(outcome.merged).toBe(0)
    })

    it('merges an inserted row the new account already has via CSV', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([affectedRow()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'csv-on-new',
            accountId: 'account-new',
            date: new Date('2026-08-25'),
            amount: -39.99,
            description: 'CARTE FITNESS PARK',
            externalId: null,
          },
        ])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome.merged).toBe(1)
      expect(outcome.moved).toBe(0)
    })

    it('recovers a row that had already lost its bank reference', async () => {
      // The failure this exists to prevent: a row unlinked once — by "aucun",
      // or by an earlier, incomplete correction — is otherwise indistinguishable
      // from any other transaction, and a second correction attempt can never
      // find it again through `externalId` alone.
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([]) // still linked: none, the reference is gone
        .mockResolvedValueOnce([
          affectedRow({
            externalId: null,
            bookingStatus: null,
            syncRunId: null,
          }),
        ]) // orphaned: found by date, amount and label instead
        .mockResolvedValueOnce([]) // the new account's own ledger

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome.moved).toBe(1)
    })

    it('leaves a matched row alone once it has gained a tag since', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          affectedRow({
            _count: {
              tags: 1,
              reimbursementRequests: 0,
              settlementsAsIncome: 0,
              reimbursementPayments: 0,
            },
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'csv-on-new',
            accountId: 'account-new',
            date: new Date('2026-08-25'),
            amount: -39.99,
            description: 'CARTE FITNESS PARK',
            externalId: null,
          },
        ])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome.blockedByWork).toBe(1)
      expect(outcome.merged).toBe(0)
    })

    it('unlinks a CSV row claimed by coincidence on the old account', async () => {
      // With no BANK_API row among the affected ones, `inserted` is empty and
      // the ledger is never even fetched.
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([affectedRow({ source: 'BANKIN_CSV' })])
        .mockResolvedValueOnce([])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        'account-new'
      )

      expect(outcome.unlinked).toBe(1)
    })

    it('unlinks rather than deletes an inserted row when the link is cleared entirely', async () => {
      // The transaction still happened — only the sync's claim on it was
      // wrong. Deleting it would be losing a real record, not fixing one.
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([affectedRow()])
        .mockResolvedValueOnce([])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        null
      )

      expect(outcome.unlinked).toBe(1)
      expect(outcome.blockedByWork).toBe(0)
      expect(mockPrisma.account.findFirst).not.toHaveBeenCalled()
    })

    it('unlinks a cleared row even if it has since gained work', async () => {
      // Unlinking only clears the bank reference — it never touches the
      // category, note, tags or reimbursements a row carries, so there is
      // nothing here for `carriesWork` to protect against.
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          affectedRow({
            _count: {
              reimbursementRequests: 1,
              settlementsAsIncome: 0,
              tags: 0,
              reimbursementPayments: 0,
            },
          }),
        ])
        .mockResolvedValueOnce([])

      const outcome = await service.previewLinkReassignment(
        userId,
        'link-1',
        null
      )

      expect(outcome.unlinked).toBe(1)
      expect(outcome.blockedByWork).toBe(0)
    })
  })

  describe('needsReview', () => {
    it('reports nothing when every synced row still carries its reference', async () => {
      mockPrisma.transaction.groupBy.mockResolvedValue([])

      expect(await service.needsReview(userId)).toEqual([])
      expect(mockPrisma.account.findMany).not.toHaveBeenCalled()
    })

    it('names the account and the count, busiest first', async () => {
      mockPrisma.transaction.groupBy.mockResolvedValue([
        { accountId: 'account-quiet', _count: { _all: 1 } },
        { accountId: 'account-busy', _count: { _all: 6 } },
      ])
      mockPrisma.account.findMany.mockResolvedValue([
        { id: 'account-quiet', name: 'CJ Fixe' },
        { id: 'account-busy', name: 'CJ Irregulier' },
      ])

      const result = await service.needsReview(userId)

      expect(result).toEqual([
        { accountId: 'account-busy', accountLabel: 'CJ Irregulier', count: 6 },
        { accountId: 'account-quiet', accountLabel: 'CJ Fixe', count: 1 },
      ])
      expect(mockPrisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['accountId'],
        where: { userId, source: 'BANK_API', externalId: null },
        _count: { _all: true },
      })
    })
  })

  describe('listRuns', () => {
    it('counts what still points at each run, inserted and claimed apart', async () => {
      mockPrisma.bankSyncRun.findMany.mockResolvedValue([
        {
          id: 'run-old',
          aspspName: 'CIC',
          fetchedAt: new Date('2026-09-01'),
          undoneAt: null,
        },
        {
          id: 'run-new',
          aspspName: 'Boursorama Banque',
          fetchedAt: new Date('2026-09-05'),
          undoneAt: null,
        },
      ])
      mockPrisma.transaction.groupBy.mockResolvedValue([
        { syncRunId: 'run-old', source: 'BANK_API', _count: { _all: 3 } },
        { syncRunId: 'run-old', source: 'BANKIN_CSV', _count: { _all: 1 } },
        { syncRunId: 'run-new', source: 'BANK_API', _count: { _all: 2 } },
      ])

      const result = await service.listRuns(userId)

      expect(result).toEqual([
        {
          id: 'run-old',
          aspspName: 'CIC',
          fetchedAt: new Date('2026-09-01'),
          inserted: 3,
          claimed: 1,
          undoneAt: null,
        },
        {
          id: 'run-new',
          aspspName: 'Boursorama Banque',
          fetchedAt: new Date('2026-09-05'),
          inserted: 2,
          claimed: 0,
          undoneAt: null,
        },
      ])
    })

    it('reads 0 and 0 for a run that was undone, distinguished by undoneAt', async () => {
      mockPrisma.bankSyncRun.findMany.mockResolvedValue([
        {
          id: 'run-undone',
          aspspName: 'CIC',
          fetchedAt: new Date('2026-09-01'),
          undoneAt: new Date('2026-09-02'),
        },
      ])
      mockPrisma.transaction.groupBy.mockResolvedValue([])

      const result = await service.listRuns(userId)

      expect(result).toEqual([
        {
          id: 'run-undone',
          aspspName: 'CIC',
          fetchedAt: new Date('2026-09-01'),
          inserted: 0,
          claimed: 0,
          undoneAt: new Date('2026-09-02'),
        },
      ])
    })

    it('skips the count query entirely when there is nothing to list', async () => {
      mockPrisma.bankSyncRun.findMany.mockResolvedValue([])

      expect(await service.listRuns(userId)).toEqual([])
      expect(mockPrisma.transaction.groupBy).not.toHaveBeenCalled()
    })
  })

  describe('previewUndoRun / undoRun', () => {
    function touchedRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'txn-1',
        source: 'BANK_API',
        _count: {
          reimbursementRequests: 0,
          settlementsAsIncome: 0,
          tags: 0,
          reimbursementPayments: 0,
        },
        ...overrides,
      }
    }

    beforeEach(() => {
      mockPrisma.bankSyncRun.findFirst.mockResolvedValue({
        id: 'run-1',
        undoneAt: null,
      })
    })

    it('refuses a run that does not belong to the caller', async () => {
      mockPrisma.bankSyncRun.findFirst.mockResolvedValue(null)

      await expect(service.previewUndoRun(userId, 'run-1')).rejects.toThrow(
        NotFoundException
      )
    })

    it('refuses a run already undone', async () => {
      mockPrisma.bankSyncRun.findFirst.mockResolvedValue({
        id: 'run-1',
        undoneAt: new Date('2026-09-02'),
      })

      await expect(service.previewUndoRun(userId, 'run-1')).rejects.toThrow(
        BadRequestException
      )
    })

    it('previews without writing anything', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([touchedRow()])

      const outcome = await service.previewUndoRun(userId, 'run-1')

      expect(outcome).toEqual({ deleted: 1, unlinked: 0, blocked: 0 })
      expect(mockPrisma.transaction.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.bankSyncRun.update).not.toHaveBeenCalled()
    })

    it('deletes an inserted row and unlinks a claimed one', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        touchedRow({ id: 'txn-inserted', source: 'BANK_API' }),
        touchedRow({ id: 'txn-claimed', source: 'BANKIN_CSV' }),
      ])

      const outcome = await service.undoRun(userId, 'run-1')

      expect(outcome).toEqual({ deleted: 1, unlinked: 1, blocked: 0 })
      expect(mockPrisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['txn-inserted'] } },
      })
      expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['txn-claimed'] } },
        data: { externalId: null, bookingStatus: null, syncRunId: null },
      })
      expect(mockPrisma.bankSyncRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { undoneAt: expect.any(Date) },
      })
    })

    it('never deletes an inserted row that has since gained work', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        touchedRow({
          id: 'txn-tagged',
          source: 'BANK_API',
          _count: {
            reimbursementRequests: 0,
            settlementsAsIncome: 0,
            tags: 1,
            reimbursementPayments: 0,
          },
        }),
      ])

      const outcome = await service.undoRun(userId, 'run-1')

      expect(outcome).toEqual({ deleted: 0, unlinked: 0, blocked: 1 })
      expect(mockPrisma.transaction.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('sync — categorizing a freshly inserted row', () => {
    /** One raw fetch, resolved into exactly one 'new' insert. */
    function primeMinimalSync(): void {
      mockPrisma.bankConnection.findFirstOrThrow.mockResolvedValue(
        connectionRow()
      )
      mockPrisma.bankSyncRun.count.mockResolvedValue(0)
      mockPrisma.bankSyncRun.create.mockResolvedValue({ id: 'run-1' })
      mockClient.listTransactions.mockResolvedValue([
        {
          entry_reference: 'ENTRY-1',
          transaction_amount: { amount: '39.99' },
          credit_debit_indicator: 'DBIT',
          booking_date: '2026-08-25',
          status: 'BOOK',
          remittance_information: ['CARTE 25/08/26 FITNESS PARK CB*1234'],
        },
      ])
      mockPrisma.bankAccountLink.findMany.mockResolvedValue([
        {
          externalAccountId: 'ext-1',
          accountId: 'account-1',
          accountName: 'M BOILLEY RICHARD',
          isIngested: true,
        },
      ])
      mockPrisma.bankStagedTransaction.createMany.mockResolvedValue({
        count: 1,
      })
      mockPrisma.transaction.findMany.mockResolvedValue([]) // empty ledger
      mockPrisma.transaction.create.mockResolvedValue({})
      mockPrisma.bankConnection.update.mockResolvedValue({})
    }

    // `sync` reads the connection under `connectionRow()`'s accountLinks,
    // which the outer `beforeEach` leaves empty — every test here needs its
    // own connection carrying the one ingestable link.
    beforeEach(() => {
      mockPrisma.bankConnection.findFirst.mockResolvedValue(
        connectionRow({
          sessionId: 'session-1',
          accountLinks: [
            {
              isIngested: true,
              accountId: 'account-1',
              externalAccountId: 'ext-1',
            },
          ],
        })
      )
    })

    it('tells the bank the user is present, when the caller says who that is', async () => {
      // The PSU context is what keeps a button-press sync outside PSD2's
      // four-unattended-reads-a-day.
      primeMinimalSync()
      mockPrisma.category.findMany.mockResolvedValue([])
      const psu = { ipAddress: '203.0.113.7', userAgent: 'UA' }

      await service.sync(userId, 'connection-1', psu)

      expect(mockClient.listTransactions).toHaveBeenCalledWith(
        expect.anything(),
        'ext-1',
        { psu }
      )
    })

    it('files a new row among the categories the user already has', async () => {
      primeMinimalSync()
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-sport', name: 'Sport', type: 'EXPENSE' },
      ])
      mockPrisma.subcategory.findMany.mockResolvedValue([])
      mockAiSuggestions.categorizeTransactions.mockResolvedValue([
        {
          index: 0,
          categoryId: 'cat-sport',
          subcategoryId: null,
          subcategoryName: null,
        },
      ])

      const outcome = await service.sync(userId, 'connection-1')

      expect(outcome).toMatchObject({ inserted: 1 })
      expect(mockAiSuggestions.categorizeTransactions).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            index: 0,
            description: 'CB Fitness Park',
            amount: -39.99,
            type: 'EXPENSE',
          }),
        ],
        [{ id: 'cat-sport', name: 'Sport', type: 'EXPENSE' }],
        [],
        []
      )
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: 'cat-sport',
          subcategoryId: null,
          subcategory: null,
        }),
      })
    })

    it('never asks the model when the user has no categories yet', async () => {
      primeMinimalSync()
      mockPrisma.category.findMany.mockResolvedValue([])
      mockPrisma.subcategory.findMany.mockResolvedValue([])

      await service.sync(userId, 'connection-1')

      expect(mockAiSuggestions.categorizeTransactions).not.toHaveBeenCalled()
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: null,
          subcategoryId: null,
          subcategory: null,
        }),
      })
    })

    it('inserts unfiled rather than failing the sync when categorization throws', async () => {
      primeMinimalSync()
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-sport', name: 'Sport', type: 'EXPENSE' },
      ])
      mockPrisma.subcategory.findMany.mockResolvedValue([])
      mockAiSuggestions.categorizeTransactions.mockRejectedValue(
        new Error('model unavailable')
      )

      const outcome = await service.sync(userId, 'connection-1')

      expect(outcome).toMatchObject({ inserted: 1 })
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ categoryId: null }),
      })
    })

    it('files a row the user has already filed like this, without ever asking the model', async () => {
      primeMinimalSync()
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-sport', name: 'Sport', type: 'EXPENSE' },
      ])
      mockPrisma.subcategory.findMany.mockResolvedValue([])
      // First call is the reconciliation ledger (empty, so the row is
      // 'new'); the second is categorizeInserts's own history read.
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            description: 'CB Fitness Park',
            type: 'EXPENSE',
            categoryId: 'cat-sport',
            subcategoryId: null,
          },
          {
            description: 'CARTE 06/08/26 FITNESS PARK CB*9999',
            type: 'EXPENSE',
            categoryId: 'cat-sport',
            subcategoryId: null,
          },
          {
            description: 'CARTE 20/08/26 FITNESS PARK CB*9999',
            type: 'EXPENSE',
            categoryId: 'cat-sport',
            subcategoryId: null,
          },
        ])

      const outcome = await service.sync(userId, 'connection-1')

      expect(outcome).toMatchObject({ inserted: 1 })
      expect(mockAiSuggestions.categorizeTransactions).not.toHaveBeenCalled()
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: 'cat-sport',
          subcategoryId: null,
          subcategory: null,
        }),
      })
    })
  })
})

describe('syncPolicyOptionsFromEnv', () => {
  const original = {
    interval: process.env.BANK_SYNC_MIN_INTERVAL_HOURS,
    perDay: process.env.BANK_SYNC_MAX_FETCHES_PER_DAY,
  }

  afterEach(() => {
    if (original.interval === undefined)
      delete process.env.BANK_SYNC_MIN_INTERVAL_HOURS
    else process.env.BANK_SYNC_MIN_INTERVAL_HOURS = original.interval
    if (original.perDay === undefined)
      delete process.env.BANK_SYNC_MAX_FETCHES_PER_DAY
    else process.env.BANK_SYNC_MAX_FETCHES_PER_DAY = original.perDay
  })

  it('leaves the policy untouched when unset', () => {
    delete process.env.BANK_SYNC_MIN_INTERVAL_HOURS
    delete process.env.BANK_SYNC_MAX_FETCHES_PER_DAY
    expect(syncPolicyOptionsFromEnv()).toEqual({})
  })

  it('overrides the minimum interval when set, including to zero', () => {
    process.env.BANK_SYNC_MIN_INTERVAL_HOURS = '0'
    expect(syncPolicyOptionsFromEnv()).toEqual({ minimumIntervalHours: 0 })

    process.env.BANK_SYNC_MIN_INTERVAL_HOURS = '2.5'
    expect(syncPolicyOptionsFromEnv()).toEqual({ minimumIntervalHours: 2.5 })
  })

  it('raises the local daily ceiling when set', () => {
    process.env.BANK_SYNC_MAX_FETCHES_PER_DAY = '20'
    expect(syncPolicyOptionsFromEnv()).toEqual({ maxFetchesPerDay: 20 })
  })

  it('can relax both guards at once', () => {
    process.env.BANK_SYNC_MIN_INTERVAL_HOURS = '0'
    process.env.BANK_SYNC_MAX_FETCHES_PER_DAY = '20'
    expect(syncPolicyOptionsFromEnv()).toEqual({
      minimumIntervalHours: 0,
      maxFetchesPerDay: 20,
    })
  })

  it('ignores a value that is not a number', () => {
    process.env.BANK_SYNC_MIN_INTERVAL_HOURS = 'soon'
    process.env.BANK_SYNC_MAX_FETCHES_PER_DAY = 'many'
    expect(syncPolicyOptionsFromEnv()).toEqual({})
  })
})

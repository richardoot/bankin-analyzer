import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { McpController } from './mcp.controller'
import { McpAuthGuard } from './mcp-auth.guard'
import { TransactionsService } from '../transactions/transactions.service'
import { CategoriesService } from '../categories/categories.service'
import { BudgetsService } from '../budgets/budgets.service'
import { DashboardService } from '../dashboard/dashboard.service'
import { SubcategoriesService } from '../subcategories/subcategories.service'
import { PersonsService } from '../persons/persons.service'
import { ReimbursementsService } from '../reimbursements/reimbursements.service'
import { SettlementsService } from '../settlements/settlements.service'
import { RecurrencesService } from '../recurrences/recurrences.service'
import { SmoothingSuggestionsService } from '../transactions/smoothing-suggestions.service'
import { TagsService } from '../tags/tags.service'
import { TagFamiliesService } from '../tag-families/tag-families.service'
import { TrendsService } from '../trends/trends.service'
import { exceptionalOnSmoothedError } from '../transactions/amortization'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { z } from 'zod'

/* ──────────────────────────────────────────────────────────────
 * MCP SDK mocks
 *
 * We replace `McpServer` with a shim that captures each call to
 * `server.tool(name, description, schema, handler)` so tests can
 * invoke the handlers directly with arbitrary params. This lets us
 * unit-test the tool logic without spinning up a real HTTP transport.
 * ────────────────────────────────────────────────────────────── */

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}>

const registeredTools = new Map<string, ToolHandler>()
/** What the model reads before it calls a tool: its description and input shape. */
const registeredSpecs = new Map<
  string,
  { description: string; schema: Record<string, unknown> }
>()

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: ToolHandler
    ): void {
      registeredTools.set(name, handler)
      registeredSpecs.set(name, { description, schema })
    }
    async connect(): Promise<void> {
      /* no-op */
    }
    async close(): Promise<void> {
      /* no-op */
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    constructor(public readonly options: { sessionIdGenerator: unknown }) {}
    async handleRequest(): Promise<void> {
      /* no-op — we test tool handlers directly */
    }
  },
}))

const mockUser = {
  id: 'db-user-id',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockTransactionsService = {
  findAllByUserPaginated: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
}

const mockCategoriesService = {
  findAllByUser: vi.fn(),
}

const mockSubcategoriesService = {
  findAllByUser: vi.fn(),
}

const mockPersonsService = {
  findAllByUser: vi.fn(),
}

const mockReimbursementsService = {
  findByTransaction: vi.fn(),
  findByPerson: vi.fn(),
  findAllByUser: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
}

const mockSettlementsService = {
  getAvailableAmount: vi.fn(),
  create: vi.fn(),
}

const mockRecurrencesService = {
  list: vi.fn(),
}

const mockSmoothingSuggestionsService = {
  list: vi.fn(),
}

const mockTagsService = {
  findAllByUser: vi.fn(),
  spentByTag: vi.fn(),
  findCandidates: vi.fn(),
  attachTransactions: vi.fn(),
  detachTransaction: vi.fn(),
}

const mockTagFamiliesService = {
  findAllByUser: vi.fn(),
}

const mockTrendsService = {
  getTrends: vi.fn(),
}

/** The JSON inside a <user_financial_data> answer. */
const parseData = (result: { content: Array<{ text: string }> }): any =>
  JSON.parse(
    (result.content[0]?.text ?? '')
      .replace(/^<user_financial_data>\n/, '')
      .replace(/\n<\/user_financial_data>$/, '')
  )

const mockBudgetsService = {
  getStatistics: vi.fn(),
}

const mockDashboardService = {
  getSummary: vi.fn(),
}

describe('McpController', () => {
  let controller: McpController

  beforeEach(async () => {
    vi.clearAllMocks()
    registeredTools.clear()
    registeredSpecs.clear()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: TransactionsService, useValue: mockTransactionsService },
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: BudgetsService, useValue: mockBudgetsService },
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: SubcategoriesService, useValue: mockSubcategoriesService },
        { provide: PersonsService, useValue: mockPersonsService },
        {
          provide: ReimbursementsService,
          useValue: mockReimbursementsService,
        },
        { provide: SettlementsService, useValue: mockSettlementsService },
        { provide: RecurrencesService, useValue: mockRecurrencesService },
        {
          provide: SmoothingSuggestionsService,
          useValue: mockSmoothingSuggestionsService,
        },
        { provide: TagsService, useValue: mockTagsService },
        { provide: TagFamiliesService, useValue: mockTagFamiliesService },
        { provide: TrendsService, useValue: mockTrendsService },
      ],
    })
      .overrideGuard(McpAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<McpController>(McpController)
  })

  /**
   * Invokes the controller's POST handler with a minimal fake req/res and
   * then returns the map of tool handlers captured during createMcpServer.
   */
  const registerTools = async (): Promise<Map<string, ToolHandler>> => {
    const fakeReq = { body: {} } as unknown as Parameters<
      McpController['handlePost']
    >[1]
    const fakeRes = {} as unknown as Parameters<McpController['handlePost']>[2]
    await controller.handlePost(mockUser, fakeReq, fakeRes)
    return registeredTools
  }

  describe('tool registration', () => {
    it('registers the read and write tools', async () => {
      const tools = await registerTools()

      expect([...tools.keys()].sort()).toEqual([
        'create_reimbursement_request',
        'get_budget_statistics',
        'get_categories',
        'get_dashboard_summary',
        'get_persons',
        'get_recurrences',
        'get_reimbursements',
        'get_smoothing_suggestions',
        'get_spending_trends',
        'get_tag_candidates',
        'get_tags',
        'get_transaction',
        'get_transactions',
        'set_transaction_amortization',
        'set_transaction_category',
        'set_transaction_tags',
        'set_transactions_category',
        'settle_reimbursements',
      ])
    })
  })

  describe('get_transactions tool', () => {
    const paginatedResult = {
      data: [
        {
          date: new Date('2026-01-15'),
          description: 'Coffee',
          amount: 3.5,
          type: 'EXPENSE',
          accountRef: { name: 'CHECKING' },
          category: { name: 'Food' },
          subcategory: 'Coffee shops',
          isPointed: true,
        },
      ],
      total: 1,
    }

    it('passes the authenticated userId and default pagination to the service', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue(
        paginatedResult
      )
      const tools = await registerTools()

      await tools.get('get_transactions')!({})

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(mockUser.id, { page: 1, limit: 50 }, undefined)
    })

    it('forwards type, date range, category and account filters', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue(
        paginatedResult
      )
      const tools = await registerTools()

      await tools.get('get_transactions')!({
        type: 'EXPENSE',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        categoryId: 'cat-1',
        account: 'CHECKING',
        page: 2,
        limit: 25,
      })

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 2, limit: 25 },
        {
          type: 'EXPENSE',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-31'),
          categoryId: 'cat-1',
          account: 'CHECKING',
        }
      )
    })

    it('caps limit at 100', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue(
        paginatedResult
      )
      const tools = await registerTools()

      await tools.get('get_transactions')!({ limit: 500 })

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(mockUser.id, { page: 1, limit: 100 }, undefined)
    })

    it('wraps response data in <user_financial_data> tags and shapes each transaction', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue(
        paginatedResult
      )
      const tools = await registerTools()

      const result = await tools.get('get_transactions')!({})
      const text = result.content[0].text

      expect(text).toMatch(/^<user_financial_data>\n/)
      expect(text).toMatch(/\n<\/user_financial_data>$/)

      const json = text
        .replace(/^<user_financial_data>\n/, '')
        .replace(/\n<\/user_financial_data>$/, '')
      const parsed = JSON.parse(json)

      expect(parsed.total).toBe(1)
      expect(parsed.transactions[0]).toMatchObject({
        description: 'Coffee',
        amount: 3.5,
        type: 'EXPENSE',
        account: 'CHECKING',
        category: 'Food',
        subcategory: 'Coffee shops',
        isPointed: true,
      })
    })

    it('tolerates transactions without a category', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [
          {
            date: new Date('2026-01-15'),
            description: 'Unknown',
            amount: 10,
            type: 'EXPENSE',
            accountRef: { name: 'CHECKING' },
            subcategory: null,
            isPointed: false,
          },
        ],
        total: 1,
      })
      const tools = await registerTools()

      const result = await tools.get('get_transactions')!({})
      const text = result.content[0].text
      const json = text
        .replace(/^<user_financial_data>\n/, '')
        .replace(/\n<\/user_financial_data>$/, '')
      const parsed = JSON.parse(json)

      expect(parsed.transactions[0].category).toBeUndefined()
    })
  })

  describe('get_categories tool', () => {
    it('queries categories scoped to the authenticated user', async () => {
      const categories = [
        { id: 'cat-1', name: 'Food' },
        { id: 'cat-2', name: 'Transport' },
      ]
      mockCategoriesService.findAllByUser.mockResolvedValue(categories)
      mockSubcategoriesService.findAllByUser.mockResolvedValue([])
      const tools = await registerTools()

      const result = await tools.get('get_categories')!({})

      expect(mockCategoriesService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id
      )

      const text = result.content[0].text
      expect(text).toContain('<user_financial_data>')
      expect(text).toContain('</user_financial_data>')
      expect(text).toContain('"name": "Food"')
    })
  })

  describe('get_budget_statistics tool', () => {
    it('passes startDate and endDate through to the budgets service', async () => {
      const stats = { totals: { EXPENSE: 1200 }, categories: [] }
      mockBudgetsService.getStatistics.mockResolvedValue(stats)
      const tools = await registerTools()

      const result = await tools.get('get_budget_statistics')!({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      expect(mockBudgetsService.getStatistics).toHaveBeenCalledWith(
        mockUser.id,
        { startDate: '2026-01-01', endDate: '2026-01-31' }
      )
      expect(result.content[0].text).toContain('"EXPENSE": 1200')
    })

    it('forwards all optional flags to the budgets service', async () => {
      mockBudgetsService.getStatistics.mockResolvedValue({ categories: [] })
      const tools = await registerTools()

      await tools.get('get_budget_statistics')!({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        deductReimbursements: false,
        deductPendingReimbursements: true,
        includeMonthlyBreakdown: true,
      })

      expect(mockBudgetsService.getStatistics).toHaveBeenCalledWith(
        mockUser.id,
        {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          deductReimbursements: false,
          deductPendingReimbursements: true,
          includeMonthlyBreakdown: true,
        }
      )
    })

    it('omits undefined optional flags from the filters object', async () => {
      mockBudgetsService.getStatistics.mockResolvedValue({ categories: [] })
      const tools = await registerTools()

      await tools.get('get_budget_statistics')!({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      })

      const call = mockBudgetsService.getStatistics.mock.calls[0][1]
      expect(call).toEqual({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      })
      expect('deductReimbursements' in call).toBe(false)
      expect('deductPendingReimbursements' in call).toBe(false)
      expect('includeMonthlyBreakdown' in call).toBe(false)
    })
  })

  describe('get_dashboard_summary tool', () => {
    it('calls the dashboard service with no filters when none are provided', async () => {
      mockDashboardService.getSummary.mockResolvedValue({ months: [] })
      const tools = await registerTools()

      await tools.get('get_dashboard_summary')!({})

      expect(mockDashboardService.getSummary).toHaveBeenCalledWith(
        mockUser.id,
        {}
      )
    })

    it('forwards the startDate and endDate filters when provided', async () => {
      mockDashboardService.getSummary.mockResolvedValue({ months: [] })
      const tools = await registerTools()

      await tools.get('get_dashboard_summary')!({
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      })

      expect(mockDashboardService.getSummary).toHaveBeenCalledWith(
        mockUser.id,
        { startDate: '2026-01-01', endDate: '2026-03-31' }
      )
    })

    it('wraps dashboard data in <user_financial_data> tags', async () => {
      mockDashboardService.getSummary.mockResolvedValue({
        months: [{ month: '2026-01', expenses: 500, incomes: 2000 }],
      })
      const tools = await registerTools()

      const result = await tools.get('get_dashboard_summary')!({})
      const text = result.content[0].text

      expect(text).toMatch(/^<user_financial_data>\n/)
      expect(text).toMatch(/\n<\/user_financial_data>$/)
      expect(text).toContain('"month": "2026-01"')
    })
  })

  describe('get_spending_trends tool', () => {
    /** The answer the screen gets, as the service returns it. */
    const trends = {
      month: '2026-09',
      reading: 'everyday',
      window: 6,
      completeMonths: 7,
      insights: Array.from({ length: 7 }, (_, i) => ({
        kind: 'amount',
        unit: {
          type: 'subcategory',
          id: `sub-${i}`,
          categoryId: 'cat-food',
          name: `Sous-catégorie ${i}`,
          icon: null,
        },
        direction: 'up',
        tone: 'neutral',
        current: 300 - i,
        reference: 100,
        delta: 200 - i,
        deltaPct: 200,
        sentence: `Phrase ${i}`,
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2026-03-01', end: '2026-08-31' },
        },
        series: [100, 100, 100, 100, 100, 100, 300 - i],
        score: 200 - i,
      })),
      quietSentence: null,
      headline: 'Septembre : plus de dépenses en sous-catégorie 0.',
      availableMonths: ['2026-09', '2026-08'],
      horizons: [
        {
          kind: 'yearAgo',
          months: 13,
          missing: 6,
          sentence:
            "La comparaison avec l'an dernier demande 13 mois complets : il en manque 6.",
        },
      ],
      digest: null,
    }

    /** The tool's input, parsed the way the MCP SDK parses it. */
    const parseInput = (input: unknown): ReturnType<z.ZodType['safeParse']> =>
      z
        .object(
          registeredSpecs.get('get_spending_trends')!.schema as z.ZodRawShape
        )
        .safeParse(input)

    it('leaves every default and the reimbursement preferences to the service, as the dashboard summary does', async () => {
      mockTrendsService.getTrends.mockResolvedValue(trends)
      const tools = await registerTools()

      await tools.get('get_spending_trends')!({})

      // No month, window, reading nor deduction switch: the service reads the
      // last closed month over 6 months, everyday, and the user's preference.
      expect(mockTrendsService.getTrends).toHaveBeenCalledWith(mockUser.id, {})
    })

    it('forwards the month, the reading and the window', async () => {
      mockTrendsService.getTrends.mockResolvedValue(trends)
      const tools = await registerTools()

      await tools.get('get_spending_trends')!({
        month: '2026-07',
        reading: 'real',
        window: 12,
      })

      expect(mockTrendsService.getTrends).toHaveBeenCalledWith(mockUser.id, {
        month: '2026-07',
        reading: 'real',
        window: 12,
      })
    })

    it('renders the whole list, not the five of the card, fenced as data', async () => {
      mockTrendsService.getTrends.mockResolvedValue(trends)
      const tools = await registerTools()

      const result = await tools.get('get_spending_trends')!({})

      expect(result.isError).toBeUndefined()
      expect(result.content[0].text).toMatch(/^<user_financial_data>\n/)
      expect(result.content[0].text).toMatch(/\n<\/user_financial_data>$/)
      const data = parseData(result)
      expect(data).toEqual(trends)
      expect(data.insights).toHaveLength(7)
      expect(data.headline).toBe(trends.headline)
    })

    it("answers a month not closed yet with isError, in the service's words", async () => {
      mockTrendsService.getTrends.mockRejectedValue(
        new BadRequestException(
          "Le mois 2026-10 n'est pas encore clos : le dernier mois clos est 2026-09."
        )
      )
      const tools = await registerTools()

      const result = await tools.get('get_spending_trends')!({
        month: '2026-10',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe(
        "Refusé par le serveur : Le mois 2026-10 n'est pas encore clos : le dernier mois clos est 2026-09."
      )
    })

    it('accepts the three windows, the two readings and a YYYY-MM month', async () => {
      await registerTools()

      expect(parseInput({}).success).toBe(true)
      for (const window of [3, 6, 12]) {
        expect(parseInput({ window }).success).toBe(true)
      }
      expect(
        parseInput({ month: '2026-09', reading: 'everyday' }).success
      ).toBe(true)
      expect(parseInput({ reading: 'real' }).success).toBe(true)
    })

    it.each([
      [{ window: 4 }],
      [{ window: '6' }],
      [{ month: '2026-13' }],
      [{ month: '2026-9' }],
      [{ reading: 'tout' }],
    ])('refuses %j before the service is called', async input => {
      await registerTools()

      expect(parseInput(input).success).toBe(false)
    })

    it('tells the model what a trend is, that the list is whole, why it may be empty, and where to dig', async () => {
      await registerTools()
      const { description } = registeredSpecs.get('get_spending_trends')!

      expect(description).toContain('mediane des N mois complets')
      expect(description).toContain('vie courante')
      expect(description).toContain('liste complete')
      expect(description).toContain('quietSentence')
      expect(description).toContain('horizons')
      expect(description).toContain('get_transactions')
      expect(description).toContain('windows.reference')
      expect(description).toContain('ni en inventer')
    })
  })

  /* ── Fixtures shared by the classification and write tools ── */

  const categories = [
    { id: 'cat-errors', name: 'Erreurs', type: 'EXPENSE' },
    { id: 'cat-food', name: 'Alimentation', type: 'EXPENSE' },
    { id: 'cat-salary', name: 'Salaire', type: 'INCOME' },
    { id: 'cat-refund-exp', name: 'Remboursements', type: 'EXPENSE' },
    { id: 'cat-refund-inc', name: 'Remboursements', type: 'INCOME' },
  ]
  const subcategories = [
    {
      id: 'sub-errors-other',
      name: 'Erreurs - Autres',
      categoryId: 'cat-errors',
      icon: null,
    },
    {
      id: 'sub-groceries',
      name: 'Supermarché',
      categoryId: 'cat-food',
      icon: 'cart',
    },
  ]

  const expense = (
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    id: 'tx-1',
    date: new Date('2025-03-30'),
    description: 'CARTE 30/03 SUPERMARCHE',
    amount: -42,
    type: 'EXPENSE',
    accountId: 'acc-1',
    accountRef: { name: 'Courant' },
    categoryId: 'cat-errors',
    category: { id: 'cat-errors', name: 'Erreurs' },
    subcategoryId: 'sub-errors-other',
    subcategoryRef: { id: 'sub-errors-other', name: 'Erreurs - Autres' },
    subcategory: 'Erreurs - Autres',
    note: null,
    isPointed: false,
    tags: [],
    settlementsAsIncome: [],
    ...overrides,
  })

  const filedUnderGroceries = (id = 'tx-1'): Record<string, unknown> =>
    expense({
      id,
      categoryId: 'cat-food',
      category: { id: 'cat-food', name: 'Alimentation' },
      subcategoryId: 'sub-groceries',
      subcategoryRef: { id: 'sub-groceries', name: 'Supermarché' },
    })

  const givenFilingTree = (): void => {
    mockCategoriesService.findAllByUser.mockResolvedValue(categories)
    mockSubcategoriesService.findAllByUser.mockResolvedValue(subcategories)
  }

  describe('get_transactions lot-0 additions', () => {
    beforeEach(() => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [expense()],
        total: 1,
      })
      givenFilingTree()
    })

    it('returns the ids an agent needs to write', async () => {
      const tools = await registerTools()

      const parsed = parseData(await tools.get('get_transactions')!({}))

      expect(parsed.transactions[0]).toMatchObject({
        id: 'tx-1',
        accountId: 'acc-1',
        categoryId: 'cat-errors',
        subcategoryId: 'sub-errors-other',
        category: 'Erreurs',
      })
    })

    it('forwards subcategoryId and search', async () => {
      const tools = await registerTools()

      await tools.get('get_transactions')!({
        subcategoryId: 'sub-groceries',
        search: 'SUPERMARCHE',
      })

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 50 },
        { subcategoryId: 'sub-groceries', search: 'SUPERMARCHE' }
      )
    })

    it('resolves categoryName to the category id', async () => {
      const tools = await registerTools()

      await tools.get('get_transactions')!({ categoryName: 'erreurs' })

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 50 },
        { categoryId: 'cat-errors' }
      )
    })

    it('lets the type filter settle a name both types carry', async () => {
      const tools = await registerTools()

      await tools.get('get_transactions')!({
        categoryName: 'Remboursements',
        type: 'INCOME',
      })

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 50 },
        { type: 'INCOME', categoryId: 'cat-refund-inc' }
      )
    })

    it.each([['Vacances'], ['Remboursements']])(
      'refuses the unknown or ambiguous name %s without querying',
      async categoryName => {
        const tools = await registerTools()

        const result = await tools.get('get_transactions')!({ categoryName })

        expect(result.isError).toBe(true)
        expect(
          mockTransactionsService.findAllByUserPaginated
        ).not.toHaveBeenCalled()
      }
    )
  })

  describe('get_transaction tool', () => {
    it('returns the full filing, tags and reimbursement requests', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        expense({ tags: [{ tag: { id: 'tag-1', name: 'Vacances' } }] })
      )
      mockReimbursementsService.findByTransaction.mockResolvedValue([
        {
          id: 'req-1',
          transactionId: 'tx-1',
          personId: 'person-1',
          personName: 'Chloé',
          amount: 21,
          amountReceived: 0,
          amountRemaining: 21,
          status: 'PENDING',
          note: null,
        },
      ])
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('get_transaction')!({ id: 'tx-1' })
      )

      expect(mockTransactionsService.findOne).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id
      )
      expect(parsed).toMatchObject({
        id: 'tx-1',
        amount: -42,
        category: 'Erreurs',
        categoryId: 'cat-errors',
        subcategory: 'Erreurs - Autres',
        subcategoryId: 'sub-errors-other',
        tags: [{ id: 'tag-1', name: 'Vacances' }],
        reimbursementRequests: [
          {
            id: 'req-1',
            person: { id: 'person-1', name: 'Chloé' },
            status: 'PENDING',
          },
        ],
      })
    })

    it('answers an unknown id with isError instead of throwing', async () => {
      mockTransactionsService.findOne.mockRejectedValue(
        new NotFoundException('Transaction with ID nope not found')
      )
      const tools = await registerTools()

      const result = await tools.get('get_transaction')!({ id: 'nope' })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('not found')
    })
  })

  describe('get_categories tool', () => {
    it("embeds each category's subcategories", async () => {
      givenFilingTree()
      const tools = await registerTools()

      const parsed = parseData(await tools.get('get_categories')!({}))

      expect(
        parsed.find((c: { id: string }) => c.id === 'cat-food')
      ).toMatchObject({
        name: 'Alimentation',
        subcategories: [
          { id: 'sub-groceries', name: 'Supermarché', icon: 'cart' },
        ],
      })
      expect(
        parsed.find((c: { id: string }) => c.id === 'cat-salary').subcategories
      ).toEqual([])
    })
  })

  describe('get_persons tool', () => {
    it('returns id and name only', async () => {
      mockPersonsService.findAllByUser.mockResolvedValue([
        { id: 'person-1', name: 'Chloé', email: 'chloe@example.com' },
      ])
      const tools = await registerTools()

      const parsed = parseData(await tools.get('get_persons')!({}))

      expect(mockPersonsService.findAllByUser).toHaveBeenCalledWith(mockUser.id)
      expect(parsed).toEqual([{ id: 'person-1', name: 'Chloé' }])
    })
  })

  describe('get_recurrences tool', () => {
    const recurrence = (status: string, label: string) => ({
      id: `rec-${label}`,
      merchantKey: label.toLowerCase(),
      amountBucket: 15,
      label,
      categoryId: 'cat-1',
      categoryName: 'Loisirs et culture',
      categoryIcon: null,
      subcategoryId: 'sub-1',
      subcategoryName: 'Streaming, musique et médias',
      nature: 'PLEASURE',
      period: 'MONTHLY',
      amount: 14.99,
      monthlyEquivalent: 14.99,
      occurrences: 8,
      firstDate: '2026-02-02T00:00:00.000Z',
      lastDate: '2026-09-01T00:00:00.000Z',
      nextExpected: '2026-10-01T00:00:00.000Z',
      status,
      confirmed: false,
    })

    beforeEach(() => {
      mockRecurrencesService.list.mockResolvedValue({
        recurrences: [
          recurrence('ACTIVE', 'Netflix'),
          recurrence('CANDIDATE', 'Spotify'),
        ],
        monthlyTotal: 14.99,
        byCategory: [
          {
            categoryId: 'cat-1',
            name: 'Loisirs et culture',
            monthlyTotal: 14.99,
          },
        ],
        byNature: { essential: 0, pleasure: 14.99, unclassified: 0 },
        dismissed: [],
        computedAt: '2026-10-07T00:00:00.000Z',
      })
    })

    it('answers the list with its monthly total, dates cut to the day', async () => {
      const tools = await registerTools()

      const parsed = parseData(await tools.get('get_recurrences')!({}))

      expect(mockRecurrencesService.list).toHaveBeenCalledWith(mockUser.id)
      expect(parsed.monthlyTotal).toBe(14.99)
      expect(parsed.recurrences).toHaveLength(2)
      expect(parsed.recurrences[0]).toMatchObject({
        label: 'Netflix',
        category: 'Loisirs et culture',
        lastDate: '2026-09-01',
        nextExpected: '2026-10-01',
      })
    })

    it('filters by status', async () => {
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('get_recurrences')!({ status: 'CANDIDATE' })
      )

      expect(parsed.recurrences.map((r: { label: string }) => r.label)).toEqual(
        ['Spotify']
      )
    })
  })

  describe('set_transaction_category tool', () => {
    beforeEach(() => {
      givenFilingTree()
      mockTransactionsService.findOne.mockResolvedValue(expense())
      mockTransactionsService.update.mockResolvedValue(filedUnderGroceries())
    })

    it('files the transaction through the service and reports before and after', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryName: 'alimentation',
        subcategoryName: 'Supermarche',
        expectedCategoryName: 'erreurs',
      })

      expect(result.isError).toBeUndefined()
      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id,
        { categoryId: 'cat-food', subcategoryId: 'sub-groceries' }
      )
      expect(parseData(result)).toMatchObject({
        status: 'updated',
        transaction: { id: 'tx-1', amount: -42 },
        before: {
          category: 'Erreurs',
          categoryId: 'cat-errors',
          subcategory: 'Erreurs - Autres',
          subcategoryId: 'sub-errors-other',
        },
        after: {
          category: 'Alimentation',
          categoryId: 'cat-food',
          subcategory: 'Supermarché',
          subcategoryId: 'sub-groceries',
        },
      })
    })

    it('clears the subcategory when the target is a category alone', async () => {
      const tools = await registerTools()

      await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryId: 'cat-food',
      })

      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id,
        { categoryId: 'cat-food', subcategoryId: null }
      )
    })

    it('refuses without writing when the guard disagrees', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryName: 'Alimentation',
        expectedCategoryName: 'Loisirs',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('Erreurs')
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('refuses to file an expense under an income category', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryName: 'Salaire',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('refuses an unresolvable target before reading the transaction', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryName: 'Remboursements',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.findOne).not.toHaveBeenCalled()
    })

    it('does nothing and says so when the target is the current filing', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryId: 'cat-errors',
        subcategoryId: 'sub-errors-other',
      })

      expect(mockTransactionsService.update).not.toHaveBeenCalled()
      expect(parseData(result)).toMatchObject({ status: 'unchanged' })
    })

    it('answers a missing transaction with isError', async () => {
      mockTransactionsService.findOne.mockRejectedValue(
        new NotFoundException('Transaction with ID tx-x not found')
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-x',
        categoryName: 'Alimentation',
      })

      expect(result.isError).toBe(true)
    })
  })

  describe('the category framework', () => {
    const framework = [
      ...categories,
      {
        id: 'cat-adjust',
        name: 'Régularisation',
        type: 'TRANSFER',
        catalogKey: 'adjustment',
      },
      {
        id: 'cat-housing',
        name: 'Logement',
        type: 'EXPENSE',
        catalogKey: 'housing',
      },
      {
        id: 'cat-refunds',
        name: 'Remboursements',
        type: 'INCOME',
        catalogKey: 'refunds',
      },
    ]
    const frameworkSubs = [
      ...subcategories,
      {
        id: 'sub-rent',
        name: 'Loyer ou crédit immobilier',
        categoryId: 'cat-housing',
        catalogKey: 'housing.rent',
        icon: null,
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      },
    ]
    const refundIncome = (
      overrides: Record<string, unknown> = {}
    ): Record<string, unknown> =>
      expense({
        id: 'tx-r',
        amount: 39.2,
        type: 'INCOME',
        categoryId: 'cat-refunds',
        category: {
          id: 'cat-refunds',
          name: 'Remboursements',
          catalogKey: 'refunds',
        },
        subcategoryId: null,
        subcategoryRef: null,
        ...overrides,
      })

    beforeEach(() => {
      mockCategoriesService.findAllByUser.mockResolvedValue(framework)
      mockSubcategoriesService.findAllByUser.mockResolvedValue(frameworkSubs)
      mockReimbursementsService.findByTransaction.mockResolvedValue([])
    })

    it('files an income under a transfer category by key, and reports the type change', async () => {
      mockTransactionsService.findOne.mockResolvedValue(refundIncome())
      mockTransactionsService.update.mockResolvedValue(
        refundIncome({
          type: 'TRANSFER',
          categoryId: 'cat-adjust',
          category: {
            id: 'cat-adjust',
            name: 'Régularisation',
            catalogKey: 'adjustment',
          },
        })
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-r',
        categoryKey: 'adjustment',
        expectedCategoryKey: 'refunds',
      })

      expect(result.isError).toBeUndefined()
      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-r',
        mockUser.id,
        { categoryId: 'cat-adjust', subcategoryId: null }
      )
      expect(parseData(result)).toMatchObject({
        status: 'updated',
        before: { type: 'INCOME', categoryKey: 'refunds' },
        after: { type: 'TRANSFER', categoryKey: 'adjustment' },
      })
    })

    it('refuses to make a transfer of an income that pays a reimbursement', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        refundIncome({
          settlementsAsIncome: [
            {
              id: 'set-1',
              amountUsed: 39.2,
              personId: 'p1',
              person: { name: 'Chloé' },
            },
          ],
        })
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-r',
        categoryKey: 'adjustment',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('règle')
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('refuses to make a transfer of an expense that carries a request', async () => {
      mockTransactionsService.findOne.mockResolvedValue(expense())
      mockReimbursementsService.findByTransaction.mockResolvedValue([
        { id: 'r1' },
      ])
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryKey: 'adjustment',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('sends a transfer back only to the side its sign says', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        refundIncome({
          type: 'TRANSFER',
          categoryId: 'cat-adjust',
          category: {
            id: 'cat-adjust',
            name: 'Régularisation',
            catalogKey: 'adjustment',
          },
        })
      )
      const tools = await registerTools()

      const refused = await tools.get('set_transaction_category')!({
        transactionId: 'tx-r',
        categoryKey: 'housing',
      })
      expect(refused.isError).toBe(true)

      mockTransactionsService.update.mockResolvedValue(refundIncome())
      const accepted = await tools.get('set_transaction_category')!({
        transactionId: 'tx-r',
        categoryKey: 'refunds',
      })
      expect(accepted.isError).toBeUndefined()
    })

    it('unfiles a transaction on a null key', async () => {
      mockTransactionsService.findOne.mockResolvedValue(expense())
      mockTransactionsService.update.mockResolvedValue(
        expense({
          categoryId: null,
          category: null,
          subcategoryId: null,
          subcategoryRef: null,
        })
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-1',
        categoryKey: null,
      })

      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id,
        { categoryId: null }
      )
      expect(parseData(result)).toMatchObject({ after: { categoryId: null } })
    })

    it('refuses without writing when the key guard disagrees', async () => {
      mockTransactionsService.findOne.mockResolvedValue(refundIncome())
      const tools = await registerTools()

      const result = await tools.get('set_transaction_category')!({
        transactionId: 'tx-r',
        categoryKey: 'adjustment',
        expectedCategoryKey: 'housing',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('reads in keys: transactions, one transaction and the categories', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [refundIncome()],
        total: 1,
      })
      mockTransactionsService.findOne.mockResolvedValue(
        expense({
          categoryId: 'cat-housing',
          category: {
            id: 'cat-housing',
            name: 'Logement',
            catalogKey: 'housing',
            defaultNature: 'ESSENTIAL',
            defaultRhythm: 'VARIABLE',
          },
          subcategoryId: 'sub-rent',
          subcategoryRef: {
            id: 'sub-rent',
            name: 'Loyer ou crédit immobilier',
            catalogKey: 'housing.rent',
            nature: 'ESSENTIAL',
            rhythm: 'COMMITTED',
          },
        })
      )
      const tools = await registerTools()

      const list = parseData(
        await tools.get('get_transactions')!({
          categoryKey: 'refunds',
          type: 'TRANSFER',
        })
      )
      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 50 },
        expect.objectContaining({ categoryId: 'cat-refunds', type: 'TRANSFER' })
      )
      expect(list.transactions[0]).toMatchObject({
        categoryKey: 'refunds',
        subcategoryKey: null,
      })

      const one = parseData(await tools.get('get_transaction')!({ id: 'tx-1' }))
      expect(one).toMatchObject({
        categoryKey: 'housing',
        subcategoryKey: 'housing.rent',
        nature: 'ESSENTIAL',
        rhythm: 'COMMITTED',
      })

      const cats = parseData(await tools.get('get_categories')!({}))
      const housing = cats.find((c: { id: string }) => c.id === 'cat-housing')
      expect(housing).toMatchObject({
        catalogKey: 'housing',
        isLocked: true,
        isLegacy: false,
      })
      expect(housing.subcategories[0]).toMatchObject({
        catalogKey: 'housing.rent',
        rhythm: 'COMMITTED',
      })
      expect(
        cats.find((c: { id: string }) => c.id === 'cat-errors')
      ).toMatchObject({ isLegacy: true })
    })

    it('refuses a reimbursement request on a transfer', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        expense({ type: 'TRANSFER' })
      )
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'p1',
        amount: 10,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('transfert')
      expect(mockReimbursementsService.create).not.toHaveBeenCalled()
    })
  })

  describe('set_transactions_category tool', () => {
    beforeEach(() => {
      givenFilingTree()
    })

    it('applies each row on its own and keeps going past a refusal', async () => {
      mockTransactionsService.findOne.mockImplementation(async (id: string) => {
        if (id === 'tx-2') {
          // Already moved by someone else: the guard must catch it.
          return filedUnderGroceries('tx-2')
        }
        if (id === 'tx-missing') {
          throw new NotFoundException(`Transaction with ID ${id} not found`)
        }
        return expense({ id })
      })
      mockTransactionsService.update.mockImplementation(async (id: string) =>
        filedUnderGroceries(id)
      )
      const tools = await registerTools()

      const result = await tools.get('set_transactions_category')!({
        transactionIds: ['tx-1', 'tx-2', 'tx-missing', 'tx-3'],
        categoryName: 'Alimentation',
        subcategoryName: 'Supermarché',
        expectedCategoryName: 'Erreurs',
      })
      const parsed = parseData(result)

      expect(mockCategoriesService.findAllByUser).toHaveBeenCalledTimes(1)
      expect(mockTransactionsService.update).toHaveBeenCalledTimes(2)
      expect(mockTransactionsService.update.mock.calls.map(c => c[0])).toEqual([
        'tx-1',
        'tx-3',
      ])
      expect(parsed.counts).toEqual({ updated: 2, unchanged: 0, refused: 2 })
      expect(
        parsed.results.map((r: { transactionId: string; status: string }) => [
          r.transactionId,
          r.status,
        ])
      ).toEqual([
        ['tx-1', 'updated'],
        ['tx-2', 'refused'],
        ['tx-missing', 'refused'],
        ['tx-3', 'updated'],
      ])
      expect(parsed.results[1].reason).toContain('Alimentation')
      expect(parsed.results[0].before.categoryId).toBe('cat-errors')
    })

    it('refuses an unresolvable target without touching any row', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transactions_category')!({
        transactionIds: ['tx-1'],
        categoryName: 'Vacances',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.findOne).not.toHaveBeenCalled()
    })

    it('refuses a batch over the limit', async () => {
      const tools = await registerTools()

      const result = await tools.get('set_transactions_category')!({
        transactionIds: Array.from({ length: 51 }, (_, i) => `tx-${i}`),
        categoryName: 'Alimentation',
      })

      expect(result.isError).toBe(true)
      expect(mockTransactionsService.findOne).not.toHaveBeenCalled()
    })
  })

  describe('get_reimbursements tool', () => {
    const request = (
      id: string,
      personId: string,
      status: string
    ): Record<string, unknown> => ({
      id,
      transactionId: 'tx-1',
      personId,
      personName: personId,
      amount: 10,
      amountReceived: 0,
      amountRemaining: 10,
      status,
      note: null,
    })

    it('reads by transaction, narrowed by person and status', async () => {
      mockReimbursementsService.findByTransaction.mockResolvedValue([
        request('req-1', 'person-1', 'PENDING'),
        request('req-2', 'person-2', 'PENDING'),
        request('req-3', 'person-1', 'COMPLETED'),
      ])
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('get_reimbursements')!({
          transactionId: 'tx-1',
          personId: 'person-1',
          status: 'PENDING',
        })
      )

      expect(parsed.map((r: { id: string }) => r.id)).toEqual(['req-1'])
    })

    it('reads everything with the transactions when no key is given', async () => {
      mockReimbursementsService.findAllByUser.mockResolvedValue([])
      const tools = await registerTools()

      await tools.get('get_reimbursements')!({})

      expect(mockReimbursementsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        { includeTransaction: true }
      )
    })
  })

  describe('create_reimbursement_request tool', () => {
    const created = {
      id: 'req-new',
      transactionId: 'tx-1',
      personId: 'person-1',
      personName: 'Chloé',
      amount: 21,
      amountReceived: 0,
      amountRemaining: 21,
      status: 'PENDING',
      note: null,
    }

    beforeEach(() => {
      mockTransactionsService.findOne.mockResolvedValue(expense())
      mockReimbursementsService.findByTransaction.mockResolvedValue([])
      mockReimbursementsService.create.mockResolvedValue(created)
    })

    it('creates the request through the service', async () => {
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'person-1',
        amount: 21,
        note: 'moitié',
        expectedAmount: 42,
      })

      expect(mockReimbursementsService.create).toHaveBeenCalledWith(
        mockUser.id,
        {
          transactionId: 'tx-1',
          personId: 'person-1',
          amount: 21,
          note: 'moitié',
        }
      )
      expect(parseData(result)).toMatchObject({
        reimbursement: {
          id: 'req-new',
          amount: 21,
          status: 'PENDING',
          person: { id: 'person-1', name: 'Chloé' },
        },
        transaction: { id: 'tx-1', amount: -42 },
      })
    })

    it('refuses when the amount guard disagrees', async () => {
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'person-1',
        amount: 21,
        expectedAmount: 40,
      })

      expect(result.isError).toBe(true)
      expect(mockReimbursementsService.create).not.toHaveBeenCalled()
    })

    it('refuses an income transaction', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        expense({ type: 'INCOME', amount: 42 })
      )
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'person-1',
        amount: 21,
      })

      expect(result.isError).toBe(true)
      expect(mockReimbursementsService.create).not.toHaveBeenCalled()
    })

    it('refuses a second request for the same person on the same expense', async () => {
      mockReimbursementsService.findByTransaction.mockResolvedValue([created])
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'person-1',
        amount: 21,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('req-new')
      expect(mockReimbursementsService.create).not.toHaveBeenCalled()
    })

    it('turns a service refusal into isError', async () => {
      mockReimbursementsService.create.mockRejectedValue(
        new BadRequestException(
          'Reimbursements on this transaction would total 50 for a spending of 42'
        )
      )
      const tools = await registerTools()

      const result = await tools.get('create_reimbursement_request')!({
        transactionId: 'tx-1',
        personId: 'person-1',
        amount: 50,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('would total 50')
    })
  })

  describe('settle_reimbursements tool', () => {
    const params = {
      incomeTransactionId: 'tx-income',
      personId: 'person-1',
      reimbursements: [
        { reimbursementId: 'req-1', amountSettled: 21 },
        { reimbursementId: 'req-2', amountSettled: 5, forceComplete: true },
      ],
    }

    beforeEach(() => {
      mockSettlementsService.getAvailableAmount
        .mockResolvedValueOnce({ availableAmount: 30 })
        .mockResolvedValueOnce({ availableAmount: 4 })
      mockSettlementsService.create.mockResolvedValue({
        id: 'settlement-1',
        personId: 'person-1',
        personName: 'Chloé',
        createdAt: new Date('2026-10-01'),
        amountUsed: 26,
        reimbursements: [
          {
            reimbursementId: 'req-1',
            transactionId: 'tx-1',
            transactionDescription: 'Courses',
            amountSettled: 21,
          },
          {
            reimbursementId: 'req-2',
            transactionId: 'tx-2',
            transactionDescription: 'Cinéma',
            amountSettled: 5,
          },
        ],
      })
      mockReimbursementsService.findOne.mockImplementation(
        async (id: string) => ({
          id,
          status: 'COMPLETED',
          amountRemaining: 0,
        })
      )
    })

    it('settles through the service and reports statuses and what is left', async () => {
      const tools = await registerTools()

      const result = await tools.get('settle_reimbursements')!(params)

      expect(mockSettlementsService.create).toHaveBeenCalledWith(mockUser.id, {
        personId: 'person-1',
        incomeTransactionId: 'tx-income',
        reimbursements: [
          { reimbursementId: 'req-1', amountSettled: 21 },
          { reimbursementId: 'req-2', amountSettled: 5, forceComplete: true },
        ],
      })
      expect(parseData(result)).toMatchObject({
        settlement: {
          id: 'settlement-1',
          amountUsed: 26,
          person: { id: 'person-1', name: 'Chloé' },
          lines: [
            { reimbursementId: 'req-1', status: 'COMPLETED' },
            { reimbursementId: 'req-2', status: 'COMPLETED' },
          ],
        },
        incomeAvailableAfter: 4,
      })
    })

    it('refuses with the available amount when the lines exceed it', async () => {
      mockSettlementsService.getAvailableAmount.mockReset()
      mockSettlementsService.getAvailableAmount.mockResolvedValue({
        availableAmount: 20,
      })
      const tools = await registerTools()

      const result = await tools.get('settle_reimbursements')!(params)

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('20')
      expect(mockSettlementsService.create).not.toHaveBeenCalled()
    })

    it('turns a non-income transaction refusal into isError', async () => {
      mockSettlementsService.getAvailableAmount.mockReset()
      mockSettlementsService.getAvailableAmount.mockRejectedValue(
        new BadRequestException(
          'Transaction tx-income is not an INCOME transaction'
        )
      )
      const tools = await registerTools()

      const result = await tools.get('settle_reimbursements')!(params)

      expect(result.isError).toBe(true)
      expect(mockSettlementsService.create).not.toHaveBeenCalled()
    })
  })
  describe('smoothed purchases', () => {
    const phone = (
      overrides: Record<string, unknown> = {}
    ): Record<string, unknown> =>
      expense({
        amount: -1300,
        description: 'APPLE STORE',
        amortizationMonths: null,
        subcategoryRef: {
          id: 'sub-tech',
          name: 'High-tech',
          catalogKey: 'shopping.tech',
        },
        ...overrides,
      })

    it('smoothes an expense through the service and reports before and after', async () => {
      mockTransactionsService.findOne.mockResolvedValue(phone())
      mockTransactionsService.update.mockResolvedValue(
        phone({ amortizationMonths: 24 })
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_amortization')!({
        transactionId: 'tx-1',
        months: 24,
        expectedAmount: 1300,
      })

      expect(result.isError).toBeUndefined()
      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id,
        { amortizationMonths: 24 }
      )
      expect(parseData(result)).toMatchObject({
        status: 'updated',
        transaction: { id: 'tx-1', amount: -1300 },
        before: { amortizationMonths: null },
        after: { amortizationMonths: 24 },
      })
    })

    it('stops smoothing on null', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        phone({ amortizationMonths: 24 })
      )
      mockTransactionsService.update.mockResolvedValue(phone())
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('set_transaction_amortization')!({
          transactionId: 'tx-1',
          months: null,
        })
      )

      expect(mockTransactionsService.update).toHaveBeenCalledWith(
        'tx-1',
        mockUser.id,
        { amortizationMonths: null }
      )
      expect(parsed.after).toEqual({ amortizationMonths: null })
    })

    it('writes nothing when the smoothing is already the one asked', async () => {
      mockTransactionsService.findOne.mockResolvedValue(
        phone({ amortizationMonths: 24 })
      )
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('set_transaction_amortization')!({
          transactionId: 'tx-1',
          months: 24,
        })
      )

      expect(parsed.status).toBe('unchanged')
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it('refuses without writing when the amount guard disagrees', async () => {
      mockTransactionsService.findOne.mockResolvedValue(phone())
      const tools = await registerTools()

      const result = await tools.get('set_transaction_amortization')!({
        transactionId: 'tx-1',
        months: 24,
        expectedAmount: 999,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('1300')
      expect(mockTransactionsService.update).not.toHaveBeenCalled()
    })

    it("answers the service's refusal with its own words", async () => {
      mockTransactionsService.findOne.mockResolvedValue(phone())
      mockTransactionsService.update.mockRejectedValue(
        new BadRequestException(
          "Cette transaction porte l'étiquette exceptionnelle « Japon » : un épisode exceptionnel sort de la vie courante."
        )
      )
      const tools = await registerTools()

      const result = await tools.get('set_transaction_amortization')!({
        transactionId: 'tx-1',
        months: 24,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain(
        "Refusé par le serveur : Cette transaction porte l'étiquette exceptionnelle « Japon »"
      )
    })

    it('reads the smoothing on transactions, with a filter and a proposed duration', async () => {
      mockTransactionsService.findAllByUserPaginated.mockResolvedValue({
        data: [phone({ amortizationMonths: 24 })],
        total: 1,
      })
      mockTransactionsService.findOne.mockResolvedValue(phone())
      mockReimbursementsService.findByTransaction.mockResolvedValue([])
      const tools = await registerTools()

      const list = parseData(
        await tools.get('get_transactions')!({ amortized: true })
      )
      const one = parseData(await tools.get('get_transaction')!({ id: 'tx-1' }))

      expect(
        mockTransactionsService.findAllByUserPaginated
      ).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 50 },
        {
          amortized: true,
        }
      )
      expect(list.transactions[0].amortizationMonths).toBe(24)
      expect(one).toMatchObject({
        amortizationMonths: null,
        suggestedAmortizationMonths: 24,
      })
    })

    it('lists the suggestions for the window asked', async () => {
      mockSmoothingSuggestionsService.list.mockResolvedValue([
        { transactionId: 'tx-1', question: 'Achat à lisser ?' },
      ])
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('get_smoothing_suggestions')!({ months: 3 })
      )

      expect(mockSmoothingSuggestionsService.list).toHaveBeenCalledWith(
        mockUser.id,
        { months: 3 }
      )
      expect(parsed.suggestions).toHaveLength(1)
    })

    it('keeps a batch going past a row the service refuses', async () => {
      givenFilingTree()
      mockTransactionsService.findOne.mockImplementation(async (id: string) =>
        expense({ id })
      )
      mockTransactionsService.update.mockImplementation(async (id: string) => {
        if (id === 'tx-smoothed') {
          throw new BadRequestException(
            'Seule une dépense peut être étalée : un revenu ou un virement compte en entier à sa date.'
          )
        }
        return filedUnderGroceries(id)
      })
      const tools = await registerTools()

      const parsed = parseData(
        await tools.get('set_transactions_category')!({
          transactionIds: ['tx-smoothed', 'tx-2'],
          categoryName: 'Alimentation',
        })
      )

      expect(parsed.counts).toEqual({ updated: 1, unchanged: 0, refused: 1 })
      expect(parsed.results[0].reason).toContain('Seule une dépense')
    })
  })

  describe('tags', () => {
    /** A tag as TagsService.findAllByUser renders it. */
    function tagDto(
      id: string,
      name: string,
      overrides: Record<string, unknown> = {}
    ): Record<string, unknown> {
      return {
        id,
        name,
        color: '#ef4444',
        icon: null,
        transactionCount: 0,
        isExceptional: false,
        eventStartDate: null,
        eventEndDate: null,
        budgetAmount: null,
        status: null,
        familyId: null,
        family: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...overrides,
      }
    }

    const races = {
      id: 'fam-r',
      name: 'Compétitions',
      color: '#ef4444',
      icon: null,
      annualBudget: 1500,
      tagCount: 2,
    }

    const TAGS = [
      tagDto('tag-gifts', 'Cadeaux', { transactionCount: 4 }),
      tagDto('tag-paris', 'HYROX Paris 2025', {
        isExceptional: true,
        eventStartDate: '2025-04-12',
        eventEndDate: '2025-04-13',
        status: 'past',
        familyId: 'fam-r',
        family: { id: 'fam-r', name: 'Compétitions', color: '#ef4444' },
        transactionCount: 3,
      }),
      tagDto('tag-lyon', 'HYROX Lyon 2026', {
        isExceptional: true,
        eventStartDate: '2026-11-07',
        eventEndDate: '2026-11-08',
        status: 'upcoming',
        familyId: 'fam-r',
        family: { id: 'fam-r', name: 'Compétitions', color: '#ef4444' },
      }),
    ]

    function givenTags(): void {
      mockTagsService.findAllByUser.mockResolvedValue(TAGS)
      mockTagFamiliesService.findAllByUser.mockResolvedValue([races])
      mockTagsService.spentByTag.mockResolvedValue(
        new Map([
          ['tag-gifts', 120.5],
          ['tag-paris', 342],
        ])
      )
    }

    describe('get_tags', () => {
      it('lists every tag with its family, status, count and spend', async () => {
        givenTags()
        const tools = await registerTools()

        const parsed = parseData(await tools.get('get_tags')!({}))

        expect(mockTagsService.findAllByUser).toHaveBeenCalledWith(mockUser.id)
        expect(mockTagsService.spentByTag).toHaveBeenCalledWith(mockUser.id)
        expect(parsed.total).toBe(3)
        expect(parsed.tags[1]).toEqual({
          id: 'tag-paris',
          name: 'HYROX Paris 2025',
          color: '#ef4444',
          isExceptional: true,
          eventStartDate: '2025-04-12',
          eventEndDate: '2025-04-13',
          status: 'past',
          family: { id: 'fam-r', name: 'Compétitions', annualBudget: 1500 },
          transactionCount: 3,
          spent: 342,
        })
        // A tag with no expense spent nothing; a theme has no family.
        expect(
          parsed.tags.map((t: { spent: number; family: unknown }) => [
            t.spent,
            t.family === null,
          ])
        ).toEqual([
          [120.5, true],
          [342, false],
          [0, false],
        ])
      })

      it('fences the answer as user data', async () => {
        givenTags()
        const tools = await registerTools()

        const result = await tools.get('get_tags')!({})

        expect(result.content[0]?.text).toMatch(
          /^<user_financial_data>\n[\s\S]*\n<\/user_financial_data>$/
        )
      })

      it('filters by status, family and exceptional flag', async () => {
        givenTags()
        const tools = await registerTools()

        const names = async (
          params: Record<string, unknown>
        ): Promise<string[]> =>
          parseData(await tools.get('get_tags')!(params)).tags.map(
            (t: { name: string }) => t.name
          )

        expect(await names({ status: 'past' })).toEqual(['HYROX Paris 2025'])
        expect(await names({ familyId: 'fam-r' })).toEqual([
          'HYROX Paris 2025',
          'HYROX Lyon 2026',
        ])
        expect(await names({ isExceptional: false })).toEqual(['Cadeaux'])
      })
    })

    describe('get_tag_candidates', () => {
      it('reads the candidates of the tag, with the rule on what is left out', async () => {
        mockTagsService.findCandidates.mockResolvedValue({
          tag: {
            id: 'tag-paris',
            name: 'HYROX Paris 2025',
            isExceptional: true,
            eventStartDate: '2025-04-12',
            eventEndDate: '2025-04-13',
          },
          searchedFrom: '2025-04-10',
          searchedTo: '2025-04-15',
          candidates: [
            {
              id: 'tx-1',
              date: '2025-04-12',
              label: 'CB BRASSERIE',
              amount: -42,
              accountId: 'acc-1',
              categoryId: 'cat-food',
              category: 'Alimentation',
              categoryKey: 'food',
              subcategoryId: 'sub-rest',
              subcategory: 'Restaurants',
              subcategoryKey: 'food.restaurants',
              rhythm: 'VARIABLE',
              amortizationMonths: null,
            },
          ],
        })
        const tools = await registerTools()

        const parsed = parseData(
          await tools.get('get_tag_candidates')!({ tagId: 'tag-paris' })
        )

        expect(mockTagsService.findCandidates).toHaveBeenCalledWith(
          'tag-paris',
          mockUser.id
        )
        expect(parsed).toMatchObject({
          searchedFrom: '2025-04-10',
          searchedTo: '2025-04-15',
          total: 1,
          candidates: [{ id: 'tx-1', rhythm: 'VARIABLE' }],
        })
        expect(parsed.rule).toContain('par marchand')
      })

      it("answers the service's refusal of an undated tag", async () => {
        mockTagsService.findCandidates.mockRejectedValue(
          new BadRequestException(
            "L'étiquette « Cadeaux » n'a pas de fenêtre (dates de début et de fin)"
          )
        )
        const tools = await registerTools()

        const result = await tools.get('get_tag_candidates')!({
          tagId: 'tag-gifts',
        })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain(
          "Refusé par le serveur : L'étiquette « Cadeaux » n'a pas de fenêtre"
        )
      })
    })

    describe('set_transaction_tags', () => {
      /** An expense, read with the tags it carries. */
      function tagged(
        tagIds: string[],
        overrides: Record<string, unknown> = {}
      ): Record<string, unknown> {
        return {
          id: 'tx-1',
          date: new Date('2025-04-12'),
          amount: -85,
          description: 'CB HOTEL',
          type: 'EXPENSE',
          amortizationMonths: null,
          tags: tagIds.map(id => ({
            tag: { id, name: TAGS.find(t => t.id === id)?.name },
          })),
          ...overrides,
        }
      }

      /** The row as read before the write, then after it. */
      function givenTransaction(before: string[], after: string[]): void {
        mockTransactionsService.findOne
          .mockResolvedValueOnce(tagged(before))
          .mockResolvedValueOnce(tagged(after))
      }

      beforeEach(() => {
        mockTagsService.findAllByUser.mockResolvedValue(TAGS)
        mockTagsService.attachTransactions.mockResolvedValue({ attached: 1 })
        mockTagsService.detachTransaction.mockResolvedValue(undefined)
      })

      it('adds and removes, and answers the tags before and after', async () => {
        givenTransaction(['tag-gifts'], ['tag-paris'])
        const tools = await registerTools()

        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-paris'],
          remove: ['tag-gifts'],
          expectedAmount: 85,
        })

        expect(result.isError).toBeUndefined()
        expect(mockTagsService.attachTransactions).toHaveBeenCalledWith(
          'tag-paris',
          mockUser.id,
          ['tx-1']
        )
        expect(mockTagsService.detachTransaction).toHaveBeenCalledWith(
          'tag-gifts',
          mockUser.id,
          'tx-1'
        )
        expect(parseData(result)).toMatchObject({
          status: 'updated',
          transaction: { id: 'tx-1', amount: -85 },
          added: [{ id: 'tag-paris', name: 'HYROX Paris 2025' }],
          removed: [{ id: 'tag-gifts', name: 'Cadeaux' }],
          before: [{ id: 'tag-gifts', isExceptional: false }],
          after: [{ id: 'tag-paris', isExceptional: true }],
        })
      })

      it('is idempotent: a tag already there or already gone is said, not refused', async () => {
        mockTransactionsService.findOne.mockResolvedValue(tagged(['tag-paris']))
        const tools = await registerTools()

        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-paris'],
          remove: ['tag-gifts'],
        })

        expect(result.isError).toBeUndefined()
        expect(parseData(result)).toMatchObject({
          status: 'unchanged',
          alreadyPresent: [{ id: 'tag-paris' }],
          alreadyAbsent: [{ id: 'tag-gifts' }],
        })
        expect(mockTagsService.attachTransactions).not.toHaveBeenCalled()
        expect(mockTagsService.detachTransaction).not.toHaveBeenCalled()
      })

      it('writes only what changes when part of the call is already done', async () => {
        givenTransaction(['tag-paris'], ['tag-paris', 'tag-gifts'])
        const tools = await registerTools()

        const parsed = parseData(
          await tools.get('set_transaction_tags')!({
            transactionId: 'tx-1',
            add: ['tag-paris', 'tag-gifts'],
          })
        )

        expect(mockTagsService.attachTransactions).toHaveBeenCalledTimes(1)
        expect(mockTagsService.attachTransactions).toHaveBeenCalledWith(
          'tag-gifts',
          mockUser.id,
          ['tx-1']
        )
        expect(parsed).toMatchObject({
          status: 'updated',
          added: [{ id: 'tag-gifts' }],
          alreadyPresent: [{ id: 'tag-paris' }],
        })
      })

      it('refuses without writing when the amount guard disagrees', async () => {
        mockTransactionsService.findOne.mockResolvedValue(tagged([]))
        const tools = await registerTools()

        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-paris'],
          expectedAmount: 99,
        })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toBe(
          "Garde-fou : la transaction est de 85 €, pas de 99 €. Rien n'a été écrit."
        )
        expect(mockTagsService.attachTransactions).not.toHaveBeenCalled()
      })

      it("refuses someone else's transaction, cleanly", async () => {
        mockTransactionsService.findOne.mockRejectedValue(
          new NotFoundException('Transaction with ID tx-x not found')
        )
        const tools = await registerTools()

        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-x',
          add: ['tag-paris'],
        })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain(
          'Transaction tx-x introuvable chez cet utilisateur'
        )
        expect(mockTagsService.attachTransactions).not.toHaveBeenCalled()
      })

      it('refuses a tag that is not the user’s, before writing anything', async () => {
        mockTransactionsService.findOne.mockResolvedValue(tagged(['tag-gifts']))
        const tools = await registerTools()

        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-paris', 'tag-foreign'],
          remove: ['tag-gifts'],
        })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('tag-foreign')
        expect(result.content[0]?.text).toContain("Rien n'a été écrit")
        expect(mockTagsService.attachTransactions).not.toHaveBeenCalled()
        expect(mockTagsService.detachTransaction).not.toHaveBeenCalled()
      })

      it('refuses an empty call and the same tag added and removed', async () => {
        const tools = await registerTools()

        const empty = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
        })
        const both = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-paris'],
          remove: ['tag-paris'],
        })

        expect([empty.isError, both.isError]).toEqual([true, true])
        expect(mockTransactionsService.findOne).not.toHaveBeenCalled()
      })

      it("refuses an exceptional tag on a smoothed expense with the service's words, writing nothing", async () => {
        mockTransactionsService.findOne.mockResolvedValue(
          tagged(['tag-lyon'], { amortizationMonths: 24 })
        )
        const refusal = exceptionalOnSmoothedError(['CB HOTEL'], 1)
        mockTagsService.attachTransactions.mockImplementation(
          async (tagId: string) => {
            if (tagId === 'tag-paris') throw refusal
            return { attached: 1 }
          }
        )
        const tools = await registerTools()

        // The theme is listed first; the exceptional tag is still tried
        // first, so the refusal comes before any write.
        const result = await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-gifts', 'tag-paris'],
          remove: ['tag-lyon'],
        })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toBe(
          `Refusé par le serveur : ${refusal.message}`
        )
        expect(mockTagsService.attachTransactions).toHaveBeenCalledTimes(1)
        expect(mockTagsService.detachTransaction).not.toHaveBeenCalled()
      })

      it('tries an exceptional tag before an ordinary one', async () => {
        givenTransaction([], ['tag-gifts', 'tag-paris'])
        const tools = await registerTools()

        await tools.get('set_transaction_tags')!({
          transactionId: 'tx-1',
          add: ['tag-gifts', 'tag-paris'],
        })

        expect(
          mockTagsService.attachTransactions.mock.calls.map(c => c[0])
        ).toEqual(['tag-paris', 'tag-gifts'])
      })
    })
  })
})

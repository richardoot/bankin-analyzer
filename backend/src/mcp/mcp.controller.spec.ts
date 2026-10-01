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
import { NotFoundException, BadRequestException } from '@nestjs/common'

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

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(
      name: string,
      _description: string,
      _schema: unknown,
      handler: ToolHandler
    ): void {
      registeredTools.set(name, handler)
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
        'get_reimbursements',
        'get_transaction',
        'get_transactions',
        'set_transaction_category',
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
})

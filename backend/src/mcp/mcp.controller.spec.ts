import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { McpController } from './mcp.controller'
import { McpAuthGuard } from './mcp-auth.guard'
import { TransactionsService } from '../transactions/transactions.service'
import { CategoriesService } from '../categories/categories.service'
import { BudgetsService } from '../budgets/budgets.service'
import { DashboardService } from '../dashboard/dashboard.service'

/* ──────────────────────────────────────────────────────────────
 * MCP SDK mocks
 *
 * We replace `McpServer` with a shim that captures each call to
 * `server.tool(name, description, schema, handler)` so tests can
 * invoke the handlers directly with arbitrary params. This lets us
 * unit-test the tool logic without spinning up a real HTTP transport.
 * ────────────────────────────────────────────────────────────── */

type ToolHandler = (
  params: Record<string, unknown>
) => Promise<{ content: Array<{ type: 'text'; text: string }> }>

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
}

const mockCategoriesService = {
  findAllByUser: vi.fn(),
}

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
    it('registers the four expected tools', async () => {
      const tools = await registerTools()

      expect([...tools.keys()].sort()).toEqual([
        'get_budget_statistics',
        'get_categories',
        'get_dashboard_summary',
        'get_transactions',
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
          account: 'CHECKING',
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
            account: 'CHECKING',
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
})

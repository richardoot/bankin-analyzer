import { Controller, Post, Get, Req, Res, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { CurrentUser } from '../auth'
import { McpAuthGuard } from './mcp-auth.guard'
import type { User, TransactionType } from '../generated/prisma'
import { TransactionsService } from '../transactions/transactions.service'
import { CategoriesService } from '../categories/categories.service'
import { BudgetsService } from '../budgets/budgets.service'
import { DashboardService } from '../dashboard/dashboard.service'

@Controller('mcp')
export class McpController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    private readonly budgetsService: BudgetsService,
    private readonly dashboardService: DashboardService
  ) {}

  private createMcpServer(userId: string): McpServer {
    const server = new McpServer({
      name: 'bankin-analyzer',
      version: '1.0.0',
    })

    // ── Tool: get_transactions ──
    server.tool(
      'get_transactions',
      'Recupere les transactions financieres avec filtres optionnels',
      {
        type: z
          .enum(['EXPENSE', 'INCOME'])
          .optional()
          .describe('Filtrer par type'),
        startDate: z
          .string()
          .optional()
          .describe('Date de debut (ISO format YYYY-MM-DD)'),
        endDate: z
          .string()
          .optional()
          .describe('Date de fin (ISO format YYYY-MM-DD)'),
        categoryId: z.string().optional().describe('Filtrer par categorie'),
        account: z.string().optional().describe('Filtrer par compte bancaire'),
        page: z.number().optional().describe('Numero de page (defaut: 1)'),
        limit: z
          .number()
          .optional()
          .describe('Nombre de resultats par page (defaut: 50, max: 100)'),
      },
      async params => {
        const filters: {
          type?: TransactionType
          startDate?: Date
          endDate?: Date
          categoryId?: string
          account?: string
        } = {}
        if (params.type) filters.type = params.type as TransactionType
        if (params.startDate) filters.startDate = new Date(params.startDate)
        if (params.endDate) filters.endDate = new Date(params.endDate)
        if (params.categoryId) filters.categoryId = params.categoryId
        if (params.account) filters.account = params.account

        const result = await this.transactionsService.findAllByUserPaginated(
          userId,
          { page: params.page ?? 1, limit: Math.min(params.limit ?? 50, 100) },
          Object.keys(filters).length > 0 ? filters : undefined
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: `<user_financial_data>\n${JSON.stringify(
                {
                  transactions: result.data.map(tx => ({
                    date: tx.date,
                    description: tx.description,
                    amount: Number(tx.amount),
                    type: tx.type,
                    account: tx.account,
                    category: (tx as { category?: { name: string } }).category
                      ?.name,
                    subcategory: tx.subcategory,
                    isPointed: tx.isPointed,
                  })),
                  total: result.total,
                },
                null,
                2
              )}\n</user_financial_data>`,
            },
          ],
        }
      }
    )

    // ── Tool: get_categories ──
    server.tool(
      'get_categories',
      'Recupere toutes les categories de transactions',
      {},
      async () => {
        const categories = await this.categoriesService.findAllByUser(userId)
        return {
          content: [
            {
              type: 'text' as const,
              text: `<user_financial_data>\n${JSON.stringify(categories, null, 2)}\n</user_financial_data>`,
            },
          ],
        }
      }
    )

    // ── Tool: get_budget_statistics ──
    server.tool(
      'get_budget_statistics',
      'Recupere les statistiques de budget avec moyennes par categorie sur une periode donnee',
      {
        startDate: z.string().describe('Date de debut (ISO format YYYY-MM-DD)'),
        endDate: z.string().describe('Date de fin (ISO format YYYY-MM-DD)'),
      },
      async params => {
        const result = await this.budgetsService.getStatistics(userId, {
          startDate: params.startDate,
          endDate: params.endDate,
        })
        return {
          content: [
            {
              type: 'text' as const,
              text: `<user_financial_data>\n${JSON.stringify(result, null, 2)}\n</user_financial_data>`,
            },
          ],
        }
      }
    )

    // ── Tool: get_dashboard_summary ──
    server.tool(
      'get_dashboard_summary',
      'Recupere le resume du dashboard avec depenses et revenus par mois et par categorie',
      {
        startDate: z
          .string()
          .optional()
          .describe('Date de debut (ISO format YYYY-MM-DD)'),
        endDate: z
          .string()
          .optional()
          .describe('Date de fin (ISO format YYYY-MM-DD)'),
      },
      async params => {
        const dashFilters: { startDate?: string; endDate?: string } = {}
        if (params.startDate) dashFilters.startDate = params.startDate
        if (params.endDate) dashFilters.endDate = params.endDate

        const result = await this.dashboardService.getSummary(
          userId,
          dashFilters
        )
        return {
          content: [
            {
              type: 'text' as const,
              text: `<user_financial_data>\n${JSON.stringify(result, null, 2)}\n</user_financial_data>`,
            },
          ],
        }
      }
    )

    return server
  }

  @Post()
  @UseGuards(McpAuthGuard)
  async handlePost(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const server = this.createMcpServer(user.id)

    // Stateless mode: each request is independent. Our tools are all
    // read-only so we don't need session continuity, and creating a new
    // transport per request avoids session-lookup 404s between init and
    // subsequent calls.
    // The SDK type mistakenly marks sessionIdGenerator as required, but
    // passing undefined is the documented way to opt into stateless mode.
    const statelessOptions = {
      sessionIdGenerator: undefined,
    } as unknown as ConstructorParameters<
      typeof StreamableHTTPServerTransport
    >[0]
    const transport = new StreamableHTTPServerTransport(statelessOptions)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await server.connect(transport as any)

    await transport.handleRequest(req, res, req.body as Record<string, unknown>)

    await server.close()
  }

  @Get()
  @UseGuards(McpAuthGuard)
  async handleGet(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const server = this.createMcpServer(user.id)

    // Stateless mode: each request is independent. Our tools are all
    // read-only so we don't need session continuity, and creating a new
    // transport per request avoids session-lookup 404s between init and
    // subsequent calls.
    // The SDK type mistakenly marks sessionIdGenerator as required, but
    // passing undefined is the documented way to opt into stateless mode.
    const statelessOptions = {
      sessionIdGenerator: undefined,
    } as unknown as ConstructorParameters<
      typeof StreamableHTTPServerTransport
    >[0]
    const transport = new StreamableHTTPServerTransport(statelessOptions)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await server.connect(transport as any)

    await transport.handleRequest(req, res)

    await server.close()
  }
}

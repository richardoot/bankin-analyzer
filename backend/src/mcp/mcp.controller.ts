import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { CurrentUser } from '../auth'
import { McpAuthGuard } from './mcp-auth.guard'
import type {
  User,
  Category,
  Subcategory,
  Transaction,
  TransactionType,
  ReimbursementStatus,
} from '../generated/prisma'
import { TransactionsService } from '../transactions/transactions.service'
import type { TransactionFilters } from '../transactions/transaction-filters'
import { CategoriesService } from '../categories/categories.service'
import { toCategoryResponse } from '../categories/dto'
import { SubcategoriesService } from '../subcategories/subcategories.service'
import { BudgetsService } from '../budgets/budgets.service'
import { DashboardService } from '../dashboard/dashboard.service'
import { PersonsService } from '../persons/persons.service'
import { ReimbursementsService } from '../reimbursements/reimbursements.service'
import { SettlementsService } from '../settlements/settlements.service'
import type { ReimbursementResponseDto } from '../reimbursements/dto'
import { LEDGER_EPSILON, round2 } from '../reimbursements/reimbursement-ledger'
import {
  normalizeName,
  resolveFilingTarget,
  type FilingCategory,
  type FilingSubcategory,
} from './filing-target'

/** Rows one write call may touch. Each row is applied and reported on its own. */
const MAX_BATCH = 50

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** The user's data, fenced so the model reads it as data, not instructions. */
function dataResponse(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: `<user_financial_data>\n${JSON.stringify(payload, null, 2)}\n</user_financial_data>`,
      },
    ],
  }
}

/**
 * A refusal the agent can read and act on.
 *
 * Returned, never thrown: a throw out of a tool handler would surface as a
 * transport failure, and the agent would learn nothing about why.
 */
function errorResponse(message: string): ToolResult {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

/**
 * Run a tool body, turning the services' own refusals (a 404, a 400) into
 * answers. Anything else is a real failure and keeps propagating.
 */
async function answer(body: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() < 500) {
      return errorResponse(`Refusé par le serveur : ${error.message}`)
    }
    throw error
  }
}

/** A transaction as read with its relations (see TRANSACTION_READ_INCLUDE). */
type ReadTransaction = Transaction & {
  category?: {
    id: string
    name: string
    catalogKey?: string | null
    defaultNature?: string | null
    defaultRhythm?: string | null
  } | null
  subcategoryRef?: {
    id: string
    name: string
    catalogKey?: string | null
    nature?: string | null
    rhythm?: string | null
  } | null
  accountRef?: { name: string } | null
  tags?: Array<{ tag: { id: string; name: string } }>
  settlementsAsIncome?: Array<{
    id: string
    amountUsed: unknown
    personId: string
    person: { name: string }
  }>
}

/**
 * Where a transaction is filed, as a write reports it before and after. The
 * type is part of it: filing under a transfer category makes the row a
 * TRANSFER, and unfiling it gives back the type its sign implies.
 */
interface Filing {
  type: TransactionType
  category: string | null
  categoryId: string | null
  categoryKey: string | null
  subcategory: string | null
  subcategoryId: string | null
  subcategoryKey: string | null
}

function filingOf(tx: ReadTransaction): Filing {
  return {
    type: tx.type,
    category: tx.category?.name ?? null,
    categoryId: tx.categoryId,
    categoryKey: tx.category?.catalogKey ?? null,
    subcategory: tx.subcategoryRef?.name ?? null,
    subcategoryId: tx.subcategoryId,
    subcategoryKey: tx.subcategoryRef?.catalogKey ?? null,
  }
}

/** The type a row has by its sign alone, the one it falls back to unfiled. */
function signType(tx: Transaction): TransactionType {
  return Number(tx.amount) < 0 ? 'EXPENSE' : 'INCOME'
}

function transactionHeader(tx: Transaction): {
  id: string
  date: Date
  amount: number
  description: string
  type: TransactionType
} {
  return {
    id: tx.id,
    date: tx.date,
    amount: Number(tx.amount),
    description: tx.description,
    type: tx.type,
  }
}

function typeLabel(type: TransactionType): string {
  if (type === 'EXPENSE') return 'une dépense (EXPENSE)'
  if (type === 'INCOME') return 'un revenu (INCOME)'
  return 'un transfert (TRANSFER)'
}

/** One row of a reclassing, as the batch tool reports it. */
type ReclassOutcome =
  | {
      transactionId: string
      status: 'updated' | 'unchanged'
      transaction: ReturnType<typeof transactionHeader>
      before: Filing
      after: Filing
    }
  | { transactionId: string; status: 'refused'; reason: string }

function reimbursementSummary(r: ReimbursementResponseDto): {
  id: string
  transactionId: string
  person: { id: string; name: string }
  amount: number
  amountReceived: number
  amountRemaining: number
  status: ReimbursementStatus
  note: string | null
  transaction?: ReimbursementResponseDto['transaction']
} {
  return {
    id: r.id,
    transactionId: r.transactionId,
    person: { id: r.personId, name: r.personName },
    amount: r.amount,
    amountReceived: r.amountReceived,
    amountRemaining: r.amountRemaining,
    status: r.status,
    note: r.note,
    ...(r.transaction && { transaction: r.transaction }),
  }
}

const filingTargetShape = {
  categoryKey: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Catégorie cible, par clé de catalogue (housing, adjustment, internal-transfer…, voir get_categories). ' +
        'La façon recommandée de viser une catégorie. null déclasse la transaction (« à classer »). ' +
        'Un seul de categoryKey, categoryName, categoryId.'
    ),
  categoryId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Catégorie cible, par identifiant (voir get_categories). null déclasse la transaction.'
    ),
  categoryName: z
    .string()
    .optional()
    .describe('Catégorie cible, par nom (casse, accents et espaces ignorés).'),
  subcategoryKey: z
    .string()
    .optional()
    .describe(
      'Sous-catégorie cible, par clé de catalogue (housing.rent…) ; elle doit appartenir à la catégorie cible.'
    ),
  subcategoryId: z
    .string()
    .optional()
    .describe('Sous-catégorie cible, par identifiant'),
  subcategoryName: z
    .string()
    .optional()
    .describe(
      'Sous-catégorie cible, par nom, cherchée dans la catégorie cible. ' +
        "Sans sous-catégorie, la transaction est classée dans la catégorie seule et perd l'ancienne."
    ),
  expectedCategoryName: z
    .string()
    .optional()
    .describe(
      'Garde-fou : nom de la catégorie actuelle de la transaction. ' +
        'Si la base dit autre chose, la ligne est refusée sans écriture. Chaîne vide pour une ligne non classée.'
    ),
  expectedCategoryKey: z
    .string()
    .optional()
    .describe(
      'Garde-fou : clé de catalogue de la catégorie actuelle. Si la base dit autre chose, la ligne est refusée sans écriture.'
    ),
}

/** The two guards a write may carry, checked against the row before anything is written. */
interface FilingGuards {
  expectedCategoryName?: string | undefined
  expectedCategoryKey?: string | undefined
}

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name)

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    private readonly subcategoriesService: SubcategoriesService,
    private readonly budgetsService: BudgetsService,
    private readonly dashboardService: DashboardService,
    private readonly personsService: PersonsService,
    private readonly reimbursementsService: ReimbursementsService,
    private readonly settlementsService: SettlementsService
  ) {}

  private async loadFilingTree(userId: string): Promise<{
    categories: Category[]
    subcategories: Subcategory[]
  }> {
    const [categories, subcategories] = await Promise.all([
      this.categoriesService.findAllByUser(userId),
      this.subcategoriesService.findAllByUser(userId),
    ])
    return { categories, subcategories }
  }

  /**
   * Reclass one transaction to an already-resolved target.
   *
   * The order matters: nothing is written until the row is found, matches what
   * the agent believed it was looking at, and has the target's type.
   */
  private async reclassOne(
    userId: string,
    transactionId: string,
    target: {
      category: FilingCategory | null
      subcategory: FilingSubcategory | null
    },
    guards: FilingGuards
  ): Promise<ReclassOutcome> {
    const { expectedCategoryName, expectedCategoryKey } = guards
    let tx: ReadTransaction
    try {
      tx = await this.transactionsService.findOne(transactionId, userId)
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return {
          transactionId,
          status: 'refused',
          reason: 'Transaction introuvable chez cet utilisateur.',
        }
      }
      throw error
    }

    const before = filingOf(tx)

    if (
      expectedCategoryName !== undefined &&
      normalizeName(expectedCategoryName) !==
        normalizeName(before.category ?? '')
    ) {
      return {
        transactionId,
        status: 'refused',
        reason: `Garde-fou : la transaction est classée dans « ${before.category ?? 'aucune catégorie'} », pas dans « ${expectedCategoryName} ». Rien n'a été écrit.`,
      }
    }

    if (
      expectedCategoryKey !== undefined &&
      expectedCategoryKey !== (before.categoryKey ?? '')
    ) {
      return {
        transactionId,
        status: 'refused',
        reason: `Garde-fou : la transaction est classée sous la clé « ${before.categoryKey ?? 'aucune'} », pas « ${expectedCategoryKey} ». Rien n'a été écrit.`,
      }
    }

    // The sign is never crossed: an expense filed under an income category
    // would be counted on the wrong side of every total. A transfer is the one
    // way across — the row then leaves the totals — and a transfer goes back
    // only to the side its sign says.
    const own = signType(tx)
    if (target.category) {
      const allowed =
        target.category.type === 'TRANSFER' || target.category.type === own
      if (!allowed) {
        return {
          transactionId,
          status: 'refused',
          reason: `La transaction est ${typeLabel(tx.type)} de montant ${Number(tx.amount)} €, la catégorie « ${target.category.name} » est de type ${target.category.type}.`,
        }
      }
    }

    // A row that carries the reimbursement ledger cannot leave its side: an
    // expense with requests on it, or an income paying some, would stop being
    // read by the very totals the ledger nets.
    const leavingSide =
      tx.type !== 'TRANSFER' &&
      (target.category === null ? false : target.category.type !== tx.type)
    if (leavingSide) {
      const requests = await this.reimbursementsService.findByTransaction(
        tx.id,
        userId
      )
      const settlements = tx.settlementsAsIncome ?? []
      if (requests.length > 0 || settlements.length > 0) {
        return {
          transactionId,
          status: 'refused',
          reason:
            requests.length > 0
              ? `La transaction porte ${requests.length} demande(s) de remboursement : elle ne peut pas devenir un transfert. Supprimer d'abord les demandes.`
              : `La transaction règle ${settlements.length} demande(s) de remboursement : elle ne peut pas devenir un transfert. Supprimer d'abord les règlements.`,
        }
      }
    }

    const categoryId = target.category?.id ?? null
    const subcategoryId = target.subcategory?.id ?? null
    if (
      before.categoryId === categoryId &&
      before.subcategoryId === subcategoryId
    ) {
      return {
        transactionId,
        status: 'unchanged',
        transaction: transactionHeader(tx),
        before,
        after: before,
      }
    }

    const updated = (await this.transactionsService.update(
      transactionId,
      userId,
      categoryId === null ? { categoryId: null } : { categoryId, subcategoryId }
    )) as ReadTransaction
    const after = filingOf(updated)

    this.logger.log(
      `reclass user=${userId} transaction=${transactionId} ` +
        `before=${before.type}:${before.categoryId ?? '-'}/${before.subcategoryId ?? '-'} ` +
        `after=${after.type}:${after.categoryId ?? '-'}/${after.subcategoryId ?? '-'}`
    )

    return {
      transactionId,
      status: 'updated',
      transaction: transactionHeader(tx),
      before,
      after,
    }
  }

  private createMcpServer(userId: string): McpServer {
    const server = new McpServer({
      name: 'bankin-analyzer',
      version: '1.0.0',
    })

    // ── Tool: get_transactions ──
    server.tool(
      'get_transactions',
      'Recupere les transactions financieres avec filtres optionnels. ' +
        'Chaque ligne porte son id et ceux de son classement, utilisables par les outils d ecriture.',
      {
        type: z
          .enum(['EXPENSE', 'INCOME', 'TRANSFER'])
          .optional()
          .describe(
            'Filtrer par type ; TRANSFER pour les mouvements hors totaux'
          ),
        startDate: z
          .string()
          .optional()
          .describe('Date de debut (ISO format YYYY-MM-DD)'),
        endDate: z
          .string()
          .optional()
          .describe('Date de fin (ISO format YYYY-MM-DD)'),
        categoryId: z.string().optional().describe('Filtrer par categorie'),
        categoryKey: z
          .string()
          .optional()
          .describe('Filtrer par cle de catalogue (housing, adjustment…)'),
        categoryName: z
          .string()
          .optional()
          .describe(
            'Filtrer par nom de categorie (casse et accents ignores). ' +
              'Refuse si le nom est inconnu ou porte par plusieurs categories ; ' +
              'le filtre type, s il est donne, departage.'
          ),
        subcategoryId: z
          .string()
          .optional()
          .describe('Filtrer par sous-categorie'),
        search: z.string().optional().describe('Rechercher dans le libelle'),
        account: z.string().optional().describe('Filtrer par compte bancaire'),
        page: z.number().optional().describe('Numero de page (defaut: 1)'),
        limit: z
          .number()
          .optional()
          .describe('Nombre de resultats par page (defaut: 50, max: 100)'),
      },
      async params =>
        answer(async () => {
          const filters: TransactionFilters = {}
          if (params.type) filters.type = params.type
          if (params.startDate) filters.startDate = new Date(params.startDate)
          if (params.endDate) filters.endDate = new Date(params.endDate)
          if (params.categoryId) filters.categoryId = params.categoryId
          if (params.subcategoryId) filters.subcategoryId = params.subcategoryId
          if (params.search) filters.search = params.search
          if (params.account) filters.account = params.account

          if (params.categoryName || params.categoryKey) {
            const { categories } = await this.loadFilingTree(userId)
            const resolved = resolveFilingTarget(
              params.type && params.categoryName
                ? categories.filter(c => c.type === params.type)
                : categories,
              [],
              {
                categoryId: params.categoryId,
                categoryName: params.categoryName,
                categoryKey: params.categoryKey,
              }
            )
            if (!resolved.ok) return errorResponse(resolved.message)
            if (resolved.category) filters.categoryId = resolved.category.id
          }

          const result = await this.transactionsService.findAllByUserPaginated(
            userId,
            {
              page: params.page ?? 1,
              limit: Math.min(params.limit ?? 50, 100),
            },
            Object.keys(filters).length > 0 ? filters : undefined
          )

          return dataResponse({
            transactions: result.data.map(tx => {
              const t = tx as ReadTransaction
              return {
                id: tx.id,
                date: tx.date,
                description: tx.description,
                amount: Number(tx.amount),
                type: tx.type,
                accountId: tx.accountId,
                account: t.accountRef?.name,
                categoryId: tx.categoryId,
                category: t.category?.name,
                categoryKey: t.category?.catalogKey ?? null,
                subcategoryId: tx.subcategoryId,
                subcategory: tx.subcategory,
                subcategoryKey: t.subcategoryRef?.catalogKey ?? null,
                isPointed: tx.isPointed,
              }
            }),
            total: result.total,
          })
        })
    )

    // ── Tool: get_transaction ──
    server.tool(
      'get_transaction',
      'Recupere une transaction par id avec son classement complet, ses tags, ' +
        'les demandes de remboursement qui la portent et, pour un revenu, les reglements ' +
        'qu il paie. A appeler avant et apres une ecriture pour verifier.',
      {
        id: z.string().describe('Identifiant de la transaction'),
      },
      async params =>
        answer(async () => {
          const tx = (await this.transactionsService.findOne(
            params.id,
            userId
          )) as ReadTransaction
          const reimbursements =
            await this.reimbursementsService.findByTransaction(tx.id, userId)

          return dataResponse({
            ...transactionHeader(tx),
            accountId: tx.accountId,
            account: tx.accountRef?.name,
            ...filingOf(tx),
            // The subcategory's own attributes, or the category's defaults for
            // a row filed at the category alone. Null on income and transfers.
            nature:
              tx.subcategoryRef?.nature ?? tx.category?.defaultNature ?? null,
            rhythm:
              tx.subcategoryRef?.rhythm ?? tx.category?.defaultRhythm ?? null,
            note: tx.note,
            isPointed: tx.isPointed,
            tags: (tx.tags ?? []).map(({ tag }) => ({
              id: tag.id,
              name: tag.name,
            })),
            reimbursementRequests: reimbursements.map(reimbursementSummary),
            settlements: (tx.settlementsAsIncome ?? []).map(s => ({
              id: s.id,
              amountUsed: Number(s.amountUsed),
              person: { id: s.personId, name: s.person.name },
            })),
          })
        })
    )

    // ── Tool: get_categories ──
    server.tool(
      'get_categories',
      'Recupere toutes les categories de transactions, chacune avec ses sous-categories. ' +
        'Une categorie du catalogue porte sa cle (catalogKey), a viser de preference dans les ecritures ; ' +
        'une categorie heritee (isLegacy) date d avant le catalogue et attend la migration. ' +
        'Les categories TRANSFER sortent des totaux.',
      {},
      async () =>
        answer(async () => {
          const { categories, subcategories } =
            await this.loadFilingTree(userId)
          return dataResponse(
            categories.map(category => ({
              ...toCategoryResponse(category),
              isLegacy: !category.catalogKey,
              subcategories: subcategories
                .filter(s => s.categoryId === category.id)
                .map(s => ({
                  id: s.id,
                  name: s.name,
                  icon: s.icon,
                  catalogKey: s.catalogKey,
                  isLocked: s.catalogKey !== null,
                  nature: s.nature,
                  rhythm: s.rhythm,
                })),
            }))
          )
        })
    )

    // ── Tool: get_persons ──
    server.tool(
      'get_persons',
      'Recupere les personnes a qui l utilisateur peut demander un remboursement',
      {},
      async () =>
        answer(async () => {
          const persons = await this.personsService.findAllByUser(userId)
          return dataResponse(persons.map(p => ({ id: p.id, name: p.name })))
        })
    )

    // ── Tool: get_reimbursements ──
    server.tool(
      'get_reimbursements',
      'Recupere les demandes de remboursement, par transaction, par personne ou par statut, ' +
        'pour retrouver les identifiants a regler',
      {
        transactionId: z
          .string()
          .optional()
          .describe('La depense qui porte les demandes'),
        personId: z
          .string()
          .optional()
          .describe('La personne qui doit (voir get_persons)'),
        status: z
          .enum(['PENDING', 'PARTIAL', 'COMPLETED'])
          .optional()
          .describe('Filtrer par statut'),
      },
      async params =>
        answer(async () => {
          let requests: ReimbursementResponseDto[]
          if (params.transactionId) {
            requests = await this.reimbursementsService.findByTransaction(
              params.transactionId,
              userId
            )
          } else if (params.personId) {
            requests = await this.reimbursementsService.findByPerson(
              params.personId,
              userId
            )
          } else {
            requests = await this.reimbursementsService.findAllByUser(userId, {
              includeTransaction: true,
            })
          }

          const filtered = requests.filter(
            r =>
              (!params.personId || r.personId === params.personId) &&
              (!params.status || r.status === params.status)
          )
          return dataResponse(filtered.map(reimbursementSummary))
        })
    )

    // ── Tool: set_transaction_category ──
    server.tool(
      'set_transaction_category',
      'Reclasse une transaction : change sa categorie et sa sous-categorie. ' +
        'La cible se designe de preference par cle de catalogue (categoryKey, subcategoryKey). ' +
        'Une depense va dans une categorie de depense ou de transfert, un revenu dans une categorie de revenu ou de transfert ; ' +
        'sous un transfert la transaction devient TRANSFER et sort des totaux. categoryKey null la declasse. ' +
        'Renvoie le classement avant et apres, type compris ; pour annuler, rappeler l outil avec l ancien classement.',
      {
        transactionId: z.string().describe('La transaction a reclasser'),
        ...filingTargetShape,
      },
      async params =>
        answer(async () => {
          const { categories, subcategories } =
            await this.loadFilingTree(userId)
          const target = resolveFilingTarget(categories, subcategories, params)
          if (!target.ok) return errorResponse(target.message)

          const outcome = await this.reclassOne(
            userId,
            params.transactionId,
            target,
            params
          )
          if (outcome.status === 'refused') return errorResponse(outcome.reason)

          return dataResponse({
            status: outcome.status,
            ...(outcome.status === 'unchanged' && {
              message:
                'La transaction est deja classee ainsi : rien n a ete ecrit.',
            }),
            transaction: outcome.transaction,
            before: outcome.before,
            after: outcome.after,
          })
        })
    )

    // ── Tool: set_transactions_category ──
    server.tool(
      'set_transactions_category',
      `Reclasse un lot de transactions (1 a ${MAX_BATCH}) vers une meme cible. ` +
        'Chaque ligne est traitee et rapportee independamment, dans l ordre : une ligne ' +
        'refusee n arrete pas les suivantes. Renvoie avant et apres pour chaque ligne.',
      {
        transactionIds: z
          .array(z.string())
          .min(1)
          .max(MAX_BATCH)
          .describe(`Les transactions a reclasser, ${MAX_BATCH} au plus`),
        ...filingTargetShape,
      },
      async params =>
        answer(async () => {
          if (
            params.transactionIds.length === 0 ||
            params.transactionIds.length > MAX_BATCH
          ) {
            return errorResponse(
              `Un lot compte de 1 a ${MAX_BATCH} transactions ; celui-ci en compte ${params.transactionIds.length}.`
            )
          }

          const { categories, subcategories } =
            await this.loadFilingTree(userId)
          const target = resolveFilingTarget(categories, subcategories, params)
          if (!target.ok) return errorResponse(target.message)

          const results: ReclassOutcome[] = []
          for (const transactionId of params.transactionIds) {
            results.push(
              await this.reclassOne(userId, transactionId, target, params)
            )
          }

          const counts = { updated: 0, unchanged: 0, refused: 0 }
          for (const r of results) counts[r.status] += 1

          return dataResponse({
            target: {
              category: target.category?.name ?? null,
              categoryId: target.category?.id ?? null,
              categoryKey: target.category?.catalogKey ?? null,
              type: target.category?.type ?? null,
              subcategory: target.subcategory?.name ?? null,
              subcategoryId: target.subcategory?.id ?? null,
              subcategoryKey: target.subcategory?.catalogKey ?? null,
            },
            counts,
            results,
          })
        })
    )

    // ── Tool: create_reimbursement_request ──
    server.tool(
      'create_reimbursement_request',
      'Cree une demande de remboursement sur une depense, au nom d une personne. ' +
        'Refuse une seconde demande pour la meme personne sur la meme transaction.',
      {
        transactionId: z.string().describe('La depense'),
        personId: z
          .string()
          .describe('La personne qui doit (voir get_persons)'),
        amount: z
          .number()
          .positive()
          .describe('Ce qu elle doit, au plus le montant de la depense'),
        note: z.string().optional(),
        expectedAmount: z
          .number()
          .optional()
          .describe(
            'Garde-fou : montant absolu de la transaction. Si la base dit autre chose, rien n est ecrit.'
          ),
      },
      async params =>
        answer(async () => {
          const tx = (await this.transactionsService.findOne(
            params.transactionId,
            userId
          )) as ReadTransaction

          if (tx.type !== 'EXPENSE') {
            return errorResponse(
              `La transaction est ${typeLabel(tx.type)} : une demande de remboursement porte sur une dépense.`
            )
          }

          const spent = Math.abs(Number(tx.amount))
          if (
            params.expectedAmount !== undefined &&
            Math.abs(Math.abs(params.expectedAmount) - spent) > LEDGER_EPSILON
          ) {
            return errorResponse(
              `Garde-fou : la transaction est de ${round2(spent)} €, pas de ${params.expectedAmount} €. Rien n'a été écrit.`
            )
          }

          // Without this, a replayed batch doubles the debt.
          const existing = await this.reimbursementsService.findByTransaction(
            tx.id,
            userId
          )
          const duplicate = existing.find(r => r.personId === params.personId)
          if (duplicate) {
            return errorResponse(
              `Une demande existe déjà pour ${duplicate.personName} sur cette transaction (${duplicate.id}, ${duplicate.amount} €). Rien n'a été écrit.`
            )
          }

          const created = await this.reimbursementsService.create(userId, {
            transactionId: tx.id,
            personId: params.personId,
            amount: params.amount,
            ...(params.note !== undefined && { note: params.note }),
          })

          this.logger.log(
            `reimbursement-request user=${userId} transaction=${tx.id} ` +
              `person=${params.personId} request=${created.id}`
          )

          return dataResponse({
            reimbursement: reimbursementSummary(created),
            transaction: transactionHeader(tx),
          })
        })
    )

    // ── Tool: settle_reimbursements ──
    server.tool(
      'settle_reimbursements',
      'Regle des demandes de remboursement d une personne avec une transaction de revenu. ' +
        'Le montant regle ne peut depasser ce qui reste disponible sur le revenu.',
      {
        incomeTransactionId: z.string().describe('Le revenu qui paie'),
        personId: z
          .string()
          .describe('La personne qui paie, a qui appartiennent les demandes'),
        reimbursements: z
          .array(
            z.object({
              reimbursementId: z.string(),
              amountSettled: z.number().positive(),
              forceComplete: z
                .boolean()
                .optional()
                .describe(
                  'Solder la demande meme si le montant ne couvre pas le reste du'
                ),
            })
          )
          .min(1)
          .max(MAX_BATCH)
          .describe(`Les demandes reglees, ${MAX_BATCH} au plus`),
        note: z.string().optional(),
      },
      async params =>
        answer(async () => {
          if (
            params.reimbursements.length === 0 ||
            params.reimbursements.length > MAX_BATCH
          ) {
            return errorResponse(
              `Un règlement compte de 1 à ${MAX_BATCH} demandes ; celui-ci en compte ${params.reimbursements.length}.`
            )
          }

          const { availableAmount } =
            await this.settlementsService.getAvailableAmount(
              params.incomeTransactionId,
              userId
            )
          const requested = round2(
            params.reimbursements.reduce((sum, r) => sum + r.amountSettled, 0)
          )
          if (requested - availableAmount > LEDGER_EPSILON) {
            return errorResponse(
              `Le revenu n'a plus que ${availableAmount} € disponibles ; le règlement en demande ${requested} €. Rien n'a été écrit.`
            )
          }

          const settlement = await this.settlementsService.create(userId, {
            personId: params.personId,
            incomeTransactionId: params.incomeTransactionId,
            reimbursements: params.reimbursements.map(line => ({
              reimbursementId: line.reimbursementId,
              amountSettled: line.amountSettled,
              ...(line.forceComplete !== undefined && {
                forceComplete: line.forceComplete,
              }),
            })),
            ...(params.note !== undefined && { note: params.note }),
          })

          this.logger.log(
            `settlement user=${userId} income=${params.incomeTransactionId} ` +
              `person=${params.personId} settlement=${settlement.id} ` +
              `requests=${params.reimbursements.map(r => r.reimbursementId).join(',')}`
          )

          // The settlement's own answer does not carry the statuses the ledger
          // now derives; read them back rather than recompute them here.
          const [statuses, availableAfter] = await Promise.all([
            Promise.all(
              settlement.reimbursements.map(line =>
                this.reimbursementsService.findOne(line.reimbursementId, userId)
              )
            ),
            this.settlementsService.getAvailableAmount(
              params.incomeTransactionId,
              userId
            ),
          ])

          return dataResponse({
            settlement: {
              id: settlement.id,
              settledAt: settlement.createdAt,
              amountUsed: settlement.amountUsed,
              person: { id: settlement.personId, name: settlement.personName },
              lines: settlement.reimbursements.map((line, i) => ({
                reimbursementId: line.reimbursementId,
                transactionId: line.transactionId,
                transactionDescription: line.transactionDescription,
                amountSettled: line.amountSettled,
                status: statuses[i]?.status,
                amountRemaining: statuses[i]?.amountRemaining,
              })),
            },
            incomeAvailableAfter: availableAfter.availableAmount,
          })
        })
    )

    // ── Tool: get_budget_statistics ──
    server.tool(
      'get_budget_statistics',
      'Recupere les statistiques de budget avec moyennes de depenses et revenus par categorie ' +
        'sur une periode donnee. Le serveur deduit automatiquement les remboursements recus des ' +
        'depenses (controlable via deductReimbursements). Les remboursements en attente ' +
        '(PENDING/PARTIAL) peuvent aussi etre deduits via deductPendingReimbursements. ' +
        'Les montants retournes sont donc des montants nets apres deductions. ' +
        'Les transferts (epargne, virements internes, apports au compte joint, regularisations) ' +
        'ne sont ni des depenses ni des revenus et n apparaissent pas dans ces totaux.',
      {
        startDate: z.string().describe('Date de debut (ISO format YYYY-MM-DD)'),
        endDate: z.string().describe('Date de fin (ISO format YYYY-MM-DD)'),
        deductReimbursements: z
          .boolean()
          .optional()
          .describe(
            'Deduire les remboursements recus des depenses (defaut: true)'
          ),
        deductPendingReimbursements: z
          .boolean()
          .optional()
          .describe(
            'Deduire les remboursements en attente (PENDING/PARTIAL) des depenses (defaut: la preference de l utilisateur, oui sauf reglage contraire)'
          ),
        includeMonthlyBreakdown: z
          .boolean()
          .optional()
          .describe(
            'Inclure le detail des montants mois par mois dans monthlyAmounts pour chaque categorie, ' +
              'utile pour analyser les tendances et la saisonnalite (defaut: false)'
          ),
      },
      async params => {
        const statsFilters: {
          startDate: string
          endDate: string
          deductReimbursements?: boolean
          deductPendingReimbursements?: boolean
          includeMonthlyBreakdown?: boolean
        } = {
          startDate: params.startDate,
          endDate: params.endDate,
        }
        if (params.deductReimbursements !== undefined) {
          statsFilters.deductReimbursements = params.deductReimbursements
        }
        if (params.deductPendingReimbursements !== undefined) {
          statsFilters.deductPendingReimbursements =
            params.deductPendingReimbursements
        }
        if (params.includeMonthlyBreakdown !== undefined) {
          statsFilters.includeMonthlyBreakdown = params.includeMonthlyBreakdown
        }
        const result = await this.budgetsService.getStatistics(
          userId,
          statsFilters
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

    // ── Tool: get_dashboard_summary ──
    server.tool(
      'get_dashboard_summary',
      'Recupere le resume du dashboard avec depenses et revenus par mois et par categorie. ' +
        'Les transferts sont exclus des depenses et des revenus ; ceux vers l epargne sont lus a part ' +
        '(savingsTransfers). Contient aussi la structure des depenses (nature, rythme) et ce qui reste du ' +
        '(pendingReceivables).',
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

  /**
   * Serve one MCP request with a fresh server and transport.
   *
   * Stateless mode: every tool call, read or write, is a complete HTTP request
   * that went through McpAuthGuard, so there is nothing a session would carry
   * that the request does not already prove. A transport per request also
   * avoids the session-lookup 404s between initialize and the calls after it.
   */
  private async serve(
    userId: string,
    req: Request,
    res: Response,
    body?: Record<string, unknown>
  ): Promise<void> {
    const server = this.createMcpServer(userId)

    // The SDK type mistakenly marks sessionIdGenerator as required, but
    // passing undefined is the documented way to opt into stateless mode.
    const statelessOptions = {
      sessionIdGenerator: undefined,
    } as unknown as ConstructorParameters<
      typeof StreamableHTTPServerTransport
    >[0]
    const transport = new StreamableHTTPServerTransport(statelessOptions)

    // SDK declares onclose as required on the Transport interface, but the
    // implementation marks it optional. Cast through unknown to bridge the
    // exactOptionalPropertyTypes mismatch without losing type safety on the
    // server.connect signature.
    await server.connect(
      transport as unknown as Parameters<typeof server.connect>[0]
    )

    if (body === undefined) {
      await transport.handleRequest(req, res)
    } else {
      await transport.handleRequest(req, res, body)
    }

    await server.close()
  }

  @Post()
  @UseGuards(McpAuthGuard)
  async handlePost(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    await this.serve(user.id, req, res, req.body as Record<string, unknown>)
  }

  @Get()
  @UseGuards(McpAuthGuard)
  async handleGet(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    await this.serve(user.id, req, res)
  }
}

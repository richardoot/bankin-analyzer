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
import { RecurrencesService } from '../recurrences/recurrences.service'
import { SmoothingSuggestionsService } from '../transactions/smoothing-suggestions.service'
import { suggestedAmortizationMonths } from '../transactions/smoothing-suggestions'
import { TagsService } from '../tags/tags.service'
import { TagFamiliesService } from '../tag-families/tag-families.service'
import { TrendsService, type TrendsFilters } from '../trends/trends.service'
import { TAG_EVENT_STATUSES, type TagEventStatus } from '../tags/tag-status'
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

/**
 * The test every large expense goes through, repeated wherever an agent may
 * act on one (agent-os/product/amortization-framework.md).
 */
const SMOOTHING_RULE =
  'Le test : est-ce que ca reviendra sous une forme comparable dans les 2 a 3 ans ? ' +
  'Episode (voyage, mariage, demenagement, competition) : non, etiquette exceptionnelle, hors vie courante. ' +
  'Bien durable renouvele (telephone, ordinateur, electromenager, mobilier, velo, equipement de sport) : oui, ' +
  'lissage sur sa duree d usage (telephone, ordinateur 24 a 36 mois ; electromenager, mobilier 36 a 60), jamais exceptionnel. ' +
  'Imprevu subi (reparation auto, dentiste, amende, chaudiere) : reste en vie courante, lisse sur 6 a 12 mois si le montant ' +
  'deforme le plan, jamais exceptionnel. Une transaction est exceptionnelle ou lissee, jamais les deux. ' +
  'Un achat deja paye en plusieurs fois ou a credit ne se lisse pas : les echeances font deja le travail.'

/**
 * What a dated tag's candidates leave out, said wherever an agent reads them:
 * the window finds what was paid during the event, not what was bought for it.
 */
const TAG_CANDIDATES_RULE =
  'Le deplacement, l hebergement ou l inscription achetes des mois avant (train, avion, dossard) ne sont pas dans la fenetre : ' +
  'les chercher par marchand avec get_transactions (search). Proposer a l utilisateur avant de rattacher.'

/** A tag as a write on a transaction reports it, before and after. */
interface TagOnTransaction {
  id: string
  name: string
  isExceptional: boolean
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
    private readonly settlementsService: SettlementsService,
    private readonly recurrencesService: RecurrencesService,
    private readonly smoothingSuggestionsService: SmoothingSuggestionsService,
    private readonly tagsService: TagsService,
    private readonly tagFamiliesService: TagFamiliesService,
    private readonly trendsService: TrendsService
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

    // The service may still refuse (a smoothed expense cannot become a
    // transfer or an income): in a batch that is this row's answer, not the
    // end of the batch.
    let updated: ReadTransaction
    try {
      updated = await this.transactionsService.update(
        transactionId,
        userId,
        categoryId === null
          ? { categoryId: null }
          : { categoryId, subcategoryId }
      )
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return {
          transactionId,
          status: 'refused',
          reason: `Refusé par le serveur : ${error.message}`,
        }
      }
      throw error
    }
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
        'Chaque ligne porte son id et ceux de son classement, utilisables par les outils d ecriture, ' +
        'et amortizationMonths : le nombre de mois sur lesquels la depense est lissee en vie courante, null si elle compte en entier a sa date.',
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
        amortized: z
          .boolean()
          .optional()
          .describe(
            'true : seulement les depenses lissees sur plusieurs mois (amortizationMonths renseigne)'
          ),
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
          if (params.amortized) filters.amortized = true

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
                amortizationMonths: tx.amortizationMonths,
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
        'qu il paie, et son lissage (amortizationMonths, null si aucun ; suggestedAmortizationMonths pour une depense). ' +
        'A appeler avant et apres une ecriture pour verifier.',
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
            amortizationMonths: tx.amortizationMonths,
            // The one duration the framework proposes for its subcategory,
            // for an expense only.
            ...(tx.type === 'EXPENSE' && {
              suggestedAmortizationMonths: suggestedAmortizationMonths(
                tx.subcategoryRef?.catalogKey
              ),
            }),
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

    // ── Tool: get_recurrences ──
    server.tool(
      'get_recurrences',
      'Recupere les charges recurrentes detectees (abonnements, loyer, assurances...) : ' +
        'marchand, categorie, montant, periodicite, equivalent mensuel, dernier prelevement, ' +
        'et le total mensuel des recurrences actives',
      {
        status: z
          .enum(['ACTIVE', 'STOPPED', 'CANDIDATE'])
          .optional()
          .describe(
            'ACTIVE : en cours ; STOPPED : arretee recemment ; CANDIDATE : deux prelevements seulement, a confirmer'
          ),
      },
      async params =>
        answer(async () => {
          const list = await this.recurrencesService.list(userId)
          return dataResponse({
            monthlyTotal: list.monthlyTotal,
            byCategory: list.byCategory,
            recurrences: list.recurrences
              .filter(r => !params.status || r.status === params.status)
              .map(r => ({
                name: r.name,
                label: r.label,
                merchantKey: r.merchantKey,
                amountBucket: r.amountBucket,
                category: r.categoryName,
                subcategory: r.subcategoryName,
                period: r.period,
                amount: r.amount,
                monthlyEquivalent: r.monthlyEquivalent,
                occurrences: r.occurrences,
                totalPaid: r.totalPaid,
                firstDate: r.firstDate.slice(0, 10),
                lastDate: r.lastDate.slice(0, 10),
                nextExpected: r.nextExpected.slice(0, 10),
                status: r.status,
              })),
          })
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

    // ── Tool: set_transaction_amortization ──
    server.tool(
      'set_transaction_amortization',
      'Lisse une depense sur plusieurs mois en vie courante, ou arrete le lissage (months null). ' +
        'Le lissage commence au mois de la transaction ; chaque tranche vaut le net (remboursements demandes deduits, ' +
        'part du compte joint) divise par le nombre de mois. Le mode Reel, la liste et les soldes ne bougent pas. ' +
        SMOOTHING_RULE +
        ' Refuse un revenu, un transfert, et une transaction qui porte une etiquette exceptionnelle (la retirer d abord, avec set_transaction_tags). ' +
        'Renvoie le lissage avant et apres ; pour annuler, rappeler l outil avec l ancienne valeur.',
      {
        transactionId: z.string().describe('La depense a lisser'),
        months: z
          .number()
          .nullable()
          .describe(
            'Nombre entier de mois, de 2 a 60 (voir suggestedAmortizationMonths de get_transaction) ; null arrete le lissage'
          ),
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

          const spent = Math.abs(Number(tx.amount))
          if (
            params.expectedAmount !== undefined &&
            Math.abs(Math.abs(params.expectedAmount) - spent) > LEDGER_EPSILON
          ) {
            return errorResponse(
              `Garde-fou : la transaction est de ${round2(spent)} €, pas de ${params.expectedAmount} €. Rien n'a été écrit.`
            )
          }

          const before = tx.amortizationMonths
          if (before === params.months) {
            return dataResponse({
              status: 'unchanged',
              message:
                params.months === null
                  ? 'La transaction n est pas lissee : rien n a ete ecrit.'
                  : `La transaction est deja lissee sur ${params.months} mois : rien n a ete ecrit.`,
              transaction: transactionHeader(tx),
              before: { amortizationMonths: before },
              after: { amortizationMonths: before },
            })
          }

          // The service holds every rule (bounds, expense only, never with
          // an exceptional tag) and its refusals come back as isError.
          const updated = await this.transactionsService.update(tx.id, userId, {
            amortizationMonths: params.months,
          })

          this.logger.log(
            `amortization user=${userId} transaction=${tx.id} ` +
              `before=${before ?? '-'} after=${updated.amortizationMonths ?? '-'}`
          )

          return dataResponse({
            status: 'updated',
            transaction: transactionHeader(tx),
            before: { amortizationMonths: before },
            after: { amortizationMonths: updated.amortizationMonths },
          })
        })
    )

    // ── Tool: get_tags ──
    server.tool(
      'get_tags',
      'Recupere les etiquettes de l utilisateur : evenements dates (fenetre, status upcoming/ongoing/past), ' +
        'episodes sans date et themes, chacune avec sa famille (et l enveloppe annuelle de la famille), ' +
        'son nombre de transactions et ce qu elle a depense (depenses en valeur absolue, part du compte joint, ' +
        'comptes exclus des statistiques ignores). Une etiquette exceptionnelle sort ses transactions de la vie courante. ' +
        'Une etiquette ou une famille se cree dans l application, jamais par le MCP.',
      {
        status: z
          .enum(TAG_EVENT_STATUSES as [TagEventStatus, ...TagEventStatus[]])
          .optional()
          .describe(
            'Filtrer les evenements dates : upcoming (a venir), ongoing (en cours), past (passe)'
          ),
        familyId: z.string().optional().describe('Filtrer par famille'),
        isExceptional: z
          .boolean()
          .optional()
          .describe('true : les etiquettes exceptionnelles seulement'),
      },
      async params =>
        answer(async () => {
          const [tags, families, spent] = await Promise.all([
            this.tagsService.findAllByUser(userId),
            this.tagFamiliesService.findAllByUser(userId),
            this.tagsService.spentByTag(userId),
          ])
          const familyById = new Map(families.map(f => [f.id, f]))
          const selected = tags.filter(
            t =>
              (params.status === undefined || t.status === params.status) &&
              (params.familyId === undefined ||
                t.familyId === params.familyId) &&
              (params.isExceptional === undefined ||
                t.isExceptional === params.isExceptional)
          )
          return dataResponse({
            tags: selected.map(t => {
              const family = t.familyId ? familyById.get(t.familyId) : null
              return {
                id: t.id,
                name: t.name,
                color: t.color,
                isExceptional: t.isExceptional,
                eventStartDate: t.eventStartDate,
                eventEndDate: t.eventEndDate,
                status: t.status,
                family: family
                  ? {
                      id: family.id,
                      name: family.name,
                      annualBudget: family.annualBudget,
                    }
                  : null,
                transactionCount: t.transactionCount,
                spent: spent.get(t.id) ?? 0,
              }
            }),
            total: selected.length,
          })
        })
    )

    // ── Tool: get_tag_candidates ──
    server.tool(
      'get_tag_candidates',
      'Pour une etiquette datee, liste les depenses qui pourraient lui appartenir et ne la portent pas encore : ' +
        'datees dans sa fenetre elargie de 2 jours de chaque cote (bornes incluses), sur un compte compte dans les statistiques, ' +
        'hors depenses de rythme engage (abonnement, loyer, ligne d une recurrence) ; rhythm vaut VARIABLE ou null (non classee). ' +
        'Chaque ligne porte amortizationMonths : une depense lissee ne peut pas recevoir une etiquette exceptionnelle. ' +
        'Lecture seule : proposer a l utilisateur, puis set_transaction_tags pour rattacher. ' +
        TAG_CANDIDATES_RULE,
      {
        tagId: z.string().describe('L etiquette datee (voir get_tags)'),
      },
      async params =>
        answer(async () => {
          const result = await this.tagsService.findCandidates(
            params.tagId,
            userId
          )
          return dataResponse({
            ...result,
            total: result.candidates.length,
            rule: TAG_CANDIDATES_RULE,
          })
        })
    )

    // ── Tool: set_transaction_tags ──
    server.tool(
      'set_transaction_tags',
      'Ajoute et retire des etiquettes sur une transaction, par identifiant (voir get_tags). ' +
        'Tout est verifie avant d ecrire : transaction et etiquettes de l utilisateur, garde-fou expectedAmount. ' +
        'Ajouter une etiquette deja presente ou retirer une absente n est pas une erreur, la reponse le dit. ' +
        'Refuse une etiquette exceptionnelle sur une depense lissee : une transaction est exceptionnelle ou lissee, jamais les deux. ' +
        'Ne cree ni etiquette ni famille : une nouvelle edition se cree dans l application. ' +
        'Renvoie les etiquettes avant et apres ; pour annuler, rappeler l outil en inversant add et remove.',
      {
        transactionId: z.string().describe('La transaction'),
        add: z
          .array(z.string())
          .max(MAX_BATCH)
          .optional()
          .describe('Etiquettes a poser, par identifiant'),
        remove: z
          .array(z.string())
          .max(MAX_BATCH)
          .optional()
          .describe('Etiquettes a retirer, par identifiant'),
        expectedAmount: z
          .number()
          .optional()
          .describe(
            'Garde-fou : montant absolu de la transaction. Si la base dit autre chose, rien n est ecrit.'
          ),
      },
      async params =>
        answer(async () => {
          const add = [...new Set(params.add ?? [])]
          const remove = [...new Set(params.remove ?? [])]
          if (add.length === 0 && remove.length === 0) {
            return errorResponse(
              "Rien à faire : add et remove sont vides. Rien n'a été écrit."
            )
          }
          const both = add.filter(id => remove.includes(id))
          if (both.length > 0) {
            return errorResponse(
              `Une même étiquette ne peut être ajoutée et retirée dans le même appel (${both.join(', ')}). Rien n'a été écrit.`
            )
          }

          let tx: ReadTransaction
          try {
            tx = await this.transactionsService.findOne(
              params.transactionId,
              userId
            )
          } catch (error) {
            if (error instanceof HttpException && error.getStatus() === 404) {
              return errorResponse(
                `Transaction ${params.transactionId} introuvable chez cet utilisateur. Rien n'a été écrit.`
              )
            }
            throw error
          }

          const spentAmount = Math.abs(Number(tx.amount))
          if (
            params.expectedAmount !== undefined &&
            Math.abs(Math.abs(params.expectedAmount) - spentAmount) >
              LEDGER_EPSILON
          ) {
            return errorResponse(
              `Garde-fou : la transaction est de ${round2(spentAmount)} €, pas de ${params.expectedAmount} €. Rien n'a été écrit.`
            )
          }

          // Every tag is checked before the first write: a call is applied
          // whole or not at all.
          const tags = await this.tagsService.findAllByUser(userId)
          const tagById = new Map(tags.map(t => [t.id, t]))
          const unknown = [...add, ...remove].filter(id => !tagById.has(id))
          if (unknown.length > 0) {
            return errorResponse(
              `Étiquette(s) introuvable(s) chez cet utilisateur : ${unknown.join(', ')}. Rien n'a été écrit.`
            )
          }

          const onTransaction = (t: ReadTransaction): TagOnTransaction[] =>
            (t.tags ?? []).map(({ tag }) => ({
              id: tag.id,
              name: tag.name,
              isExceptional: tagById.get(tag.id)?.isExceptional ?? false,
            }))
          const before = onTransaction(tx)
          const current = new Set(before.map(t => t.id))
          const named = (ids: string[]): TagOnTransaction[] =>
            ids.flatMap(id => {
              const t = tagById.get(id)
              return t
                ? [{ id: t.id, name: t.name, isExceptional: t.isExceptional }]
                : []
            })

          // Exceptional tags first: the service refuses one on a smoothed
          // expense, and refusing on the very first write leaves nothing
          // half-done.
          const toAdd = named(add.filter(id => !current.has(id))).sort(
            (a, b) => Number(b.isExceptional) - Number(a.isExceptional)
          )
          const toRemove = named(remove.filter(id => current.has(id)))
          const alreadyPresent = named(add.filter(id => current.has(id)))
          const alreadyAbsent = named(remove.filter(id => !current.has(id)))

          if (toAdd.length === 0 && toRemove.length === 0) {
            return dataResponse({
              status: 'unchanged',
              message:
                'Les etiquettes demandees sont deja dans cet etat : rien n a ete ecrit.',
              transaction: transactionHeader(tx),
              alreadyPresent,
              alreadyAbsent,
              before,
              after: before,
            })
          }

          for (const tag of toAdd) {
            await this.tagsService.attachTransactions(tag.id, userId, [tx.id])
          }
          for (const tag of toRemove) {
            await this.tagsService.detachTransaction(tag.id, userId, tx.id)
          }

          const updated = (await this.transactionsService.findOne(
            tx.id,
            userId
          )) as ReadTransaction
          const after = onTransaction(updated)

          this.logger.log(
            `tags user=${userId} transaction=${tx.id} ` +
              `added=${toAdd.map(t => t.id).join(',') || '-'} ` +
              `removed=${toRemove.map(t => t.id).join(',') || '-'}`
          )

          return dataResponse({
            status: 'updated',
            transaction: transactionHeader(tx),
            added: toAdd,
            removed: toRemove,
            alreadyPresent,
            alreadyAbsent,
            before,
            after,
          })
        })
    )

    // ── Tool: get_smoothing_suggestions ──
    server.tool(
      'get_smoothing_suggestions',
      'Liste les depenses recentes qui depassent largement l habitude de leur sous-categorie ' +
        '(au moins 200 € et plus de 3 mois de ce qu elle coute d habitude sur les 12 mois precedents), ' +
        'pas encore tranchees (ni lissees ni exceptionnelles), hors engagements. Chacune porte une question et deux reponses : ' +
        'un achat d equipement (High-tech, Maison et deco, Sport et equipement de loisir) ou un imprevu (Entretien et reparation...) ' +
        'propose le lissage sur une duree selon la sous-categorie, ou de le laisser a sa date, jamais l etiquette exceptionnelle ; ' +
        'ailleurs, « Episode ou achat a lisser ? ». Lecture seule : poser la question a l utilisateur, puis ' +
        'set_transaction_amortization pour lisser ; une etiquette exceptionnelle se pose avec set_transaction_tags. ' +
        SMOOTHING_RULE,
      {
        months: z
          .number()
          .optional()
          .describe(
            'Anciennete maximale des depenses examinees, en mois (defaut 6, max 24)'
          ),
      },
      async params =>
        answer(async () => {
          const suggestions = await this.smoothingSuggestionsService.list(
            userId,
            params.months !== undefined ? { months: params.months } : {}
          )
          return dataResponse({ suggestions })
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
        'Les transferts sont exclus des depenses et des revenus. L epargne (savings) est revenus moins ' +
        'depenses reelles de la periode, negative en cas de deficit ; savingsRate en est la part des revenus ; ' +
        'remainingToLive est revenus moins depenses engagees de la vie courante. Les virements vers l epargne ' +
        'sont lus a part (savingsTransfers), pour information seulement : ils ne portent aucun taux. ' +
        'Contient aussi la structure des depenses (nature, rythme) et ce qui reste du (pendingReceivables).',
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

    // ── Tool: get_spending_trends ──
    server.tool(
      'get_spending_trends',
      'Recupere ce qui change dans les depenses, la liste de la carte « Ce qui change » du tableau de bord, ' +
        'calculee sans modele : un mois clos compare a la mediane des N mois complets qui le precedent (window), ' +
        'en lecture vie courante par defaut (etiquettes exceptionnelles hors calcul, achats lisses comptes par tranches). ' +
        'Rend la liste complete (insights), triee comme l ecran : les lignes a classer d abord, puis par score (l ecart en euros) ; ' +
        'la carte n en montre que les 5 premieres. Chaque tendance porte kind (amount, frequency, basket, share, uncategorized, ' +
        'newHabit, lostHabit, subscription, price, shift, drift, record, yearAgo, savings), unit, direction, current, reference, ' +
        'delta, deltaPct, la phrase de l ecran (sentence) et la serie des 7 derniers mois. ' +
        'Une liste vide s explique : quietSentence dit qu aucune habitude n a bouge, completeMonths qu il manque de l historique ' +
        '(3 mois complets au moins), horizons quelles comparaisons longues (pente, record, an dernier, epargne) l historique ne permet pas encore. ' +
        'Pour creuser une tendance : get_transactions sur windows.current (le mois lu) puis windows.reference (la fenetre de reference), ' +
        'avec unit.categoryId (categoryId), unit.id d une sous-categorie (subcategoryId) ou unit.search d un marchand (search). ' +
        'Ces chiffres sont la source : ne pas en calculer d autres ni en inventer. Remboursements deduits selon les preferences de l utilisateur, comme l ecran.',
      {
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month doit etre au format YYYY-MM')
          .optional()
          .describe(
            'Mois lu, YYYY-MM, un mois clos seulement (defaut : le dernier mois clos ; availableMonths liste ceux que la carte propose)'
          ),
        reading: z
          .enum(['everyday', 'real'])
          .optional()
          .describe(
            'everyday (defaut) : vie courante, comme la bascule « Vie courante » du tableau de bord ; real : tout a sa date'
          ),
        window: z
          .union([z.literal(3), z.literal(6), z.literal(12)])
          .optional()
          .describe(
            'Mois complets de reference avant le mois lu : 3, 6 (defaut) ou 12 ; raccourci a l historique s il est plus court'
          ),
      },
      async params =>
        answer(async () => {
          // The reimbursement switches are left to the service, as the
          // dashboard summary does: received ones deducted, pending ones by
          // the user's own preference.
          const filters: TrendsFilters = {}
          if (params.month) filters.month = params.month
          if (params.reading) filters.reading = params.reading
          if (params.window) filters.window = params.window
          return dataResponse(
            await this.trendsService.getTrends(userId, filters)
          )
        })
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

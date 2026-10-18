import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { TransactionsService } from './transactions.service'
import {
  parseTransactionFilters,
  type RawTransactionFilters,
} from './transaction-filters'
import {
  ImportTransactionsDto,
  ImportResultDto,
  ImportPreviewResultDto,
  TransactionResponseDto,
} from './dto'
import type { TransactionRecurrenceSummaryDto } from './dto/transaction-response.dto'
import { PaginatedTransactionsResponseDto } from './dto/paginated-transactions-response.dto'
import { createPaginationMeta } from '../common/dto/pagination.dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User, TransactionType, Transaction } from '../generated/prisma'

type TransactionWithRelations = Transaction & {
  category?: { name: string; icon?: string | null }
  subcategoryRef?: { id: string; name: string }
  accountRef: { name: string }
  settlementsAsIncome?: {
    id: string
    amountUsed: unknown
    personId: string
    person: { name: string }
  }[]
  tags?: {
    tag: { id: string; name: string; color: string | null; icon: string | null }
  }[]
  recurrences?: {
    recurrence: {
      status: 'ACTIVE' | 'STOPPED' | 'CANDIDATE'
      period: TransactionRecurrenceSummaryDto['period']
      merchantKey: string
      amountBucket: number
      label: string
      name: string
    }
  }[]
  subscriptionLink?: { id: string } | null
}

/** The recurrence a line proves a commitment for; a candidate is none yet. */
function recurrenceOf(tx: TransactionWithRelations): {
  recurrence?: TransactionRecurrenceSummaryDto
} {
  const recurrence = committedRecurrence(tx)
  return recurrence ? { recurrence } : {}
}

function committedRecurrence(
  tx: TransactionWithRelations
): TransactionRecurrenceSummaryDto | undefined {
  const link = tx.recurrences?.find(
    ({ recurrence }) => recurrence.status !== 'CANDIDATE'
  )
  if (!link) return undefined
  const { status, name, ...rest } = link.recurrence
  return {
    ...rest,
    name: name || rest.label,
    status: status === 'ACTIVE' ? 'ACTIVE' : 'STOPPED',
    linked: Boolean(tx.subscriptionLink),
  }
}

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  private mapToResponseDto(
    tx: TransactionWithRelations
  ): TransactionResponseDto {
    return {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: Number(tx.amount),
      type: tx.type,
      accountId: tx.accountId,
      account: tx.accountRef.name,
      subcategory: tx.subcategory,
      note: tx.note,
      isPointed: tx.isPointed,
      amortizationMonths: tx.amortizationMonths,
      categoryId: tx.categoryId,
      categoryName: tx.category?.name,
      subcategoryId: tx.subcategoryId,
      subcategoryName: tx.subcategoryRef?.name ?? null,
      categoryIcon: tx.category?.icon ?? null,
      ...(tx.settlementsAsIncome?.length
        ? {
            settlements: tx.settlementsAsIncome.map(s => ({
              id: s.id,
              personId: s.personId,
              personName: s.person.name,
              amountUsed: Number(s.amountUsed),
            })),
          }
        : {}),
      ...(tx.tags?.length
        ? {
            tags: tx.tags.map(tt => ({
              id: tt.tag.id,
              name: tt.tag.name,
              color: tt.tag.color,
              icon: tt.tag.icon,
            })),
          }
        : {}),
      ...recurrenceOf(tx),
      createdAt: tx.createdAt,
    }
  }

  @Post('import/preview')
  // Sized for the chunked importer, not a single call: the frontend splits a
  // CSV into batches of 200, so a 5 000-row file is ~25 previews then ~25
  // imports inside a couple of minutes. Sixty per five minutes lets that
  // through untouched and still stops an unattended loop.
  @Throttle({ default: { limit: 60, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Preview import - analyze duplicates without writing to DB',
  })
  @ApiResponse({ status: 200, type: ImportPreviewResultDto })
  async previewImport(
    @CurrentUser() user: User,
    @Body() dto: ImportTransactionsDto
  ): Promise<ImportPreviewResultDto> {
    return this.transactionsService.previewImport(user.id, dto.transactions)
  }

  @Post('import')
  // Same budget as the preview, for the same chunked caller — and this one
  // spends real money: each imported batch may fan out into Anthropic
  // categorization calls.
  @Throttle({ default: { limit: 60, ttl: 300_000 } })
  @ApiOperation({ summary: 'Import transactions with deduplication' })
  @ApiResponse({ status: 201, type: ImportResultDto })
  async importTransactions(
    @CurrentUser() user: User,
    @Body() dto: ImportTransactionsDto
  ): Promise<ImportResultDto> {
    return this.transactionsService.importTransactions(
      user.id,
      dto.transactions,
      dto.importHistoryId
    )
  }

  @Get()
  @ApiOperation({
    summary: 'Get all transactions for the current user (paginated)',
  })
  @ApiResponse({ status: 200, type: PaginatedTransactionsResponseDto })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({ name: 'type', required: false, enum: ['EXPENSE', 'INCOME'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({
    name: 'subcategoryId',
    required: false,
    type: String,
    description: 'Only meaningful together with categoryId',
  })
  @ApiQuery({ name: 'isPointed', required: false, type: Boolean })
  @ApiQuery({ name: 'account', required: false, type: String })
  @ApiQuery({ name: 'tagId', required: false, type: String })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Keyword matched against description, note and subcategory',
  })
  @ApiQuery({
    name: 'amountMin',
    required: false,
    type: Number,
    description: 'Minimum absolute amount',
  })
  @ApiQuery({
    name: 'amountMax',
    required: false,
    type: Number,
    description: 'Maximum absolute amount',
  })
  @ApiQuery({
    name: 'needsBankReview',
    required: false,
    type: Boolean,
    description:
      'Only rows a bank sync inserted or claimed and then lost the ' +
      'reference to — cleared to "aucun", or a correction still pending.',
  })
  @ApiQuery({
    name: 'recurrence',
    required: false,
    type: String,
    description:
      'Only the lines of one recurring charge: `<amountBucket>:<merchantKey>`.',
  })
  @ApiQuery({
    name: 'ids',
    required: false,
    type: String,
    description:
      'An exact list of transaction ids, comma-separated (at most 200).',
  })
  @ApiQuery({
    name: 'personId',
    required: false,
    type: String,
    description:
      'Only the expenses carrying a reimbursement request of this person.',
  })
  @ApiQuery({
    name: 'reimbursement',
    required: false,
    enum: ['open', 'all'],
    description:
      'With or without personId: `open` keeps the expenses where a ' +
      'remainder is still owed, `all` every expense carrying a request.',
  })
  @ApiQuery({
    name: 'settlementId',
    required: false,
    type: String,
    description:
      'The expenses this settlement closed, and the income that paid them.',
  })
  @ApiQuery({
    name: 'importId',
    required: false,
    type: String,
    description: 'The rows one CSV import wrote.',
  })
  @ApiQuery({
    name: 'syncRunId',
    required: false,
    type: String,
    description: 'The rows one bank sync run inserted or claimed.',
  })
  @ApiQuery({
    name: 'exceptional',
    required: false,
    enum: ['exclude', 'only'],
    description:
      '`exclude`: no exceptional tag of the user (the « Vie courante » ' +
      'reading); `only`: at least one. Anything else is refused.',
  })
  @ApiQuery({
    name: 'nature',
    required: false,
    enum: ['ESSENTIAL', 'PLEASURE', 'none'],
    description:
      "The subcategory's nature, else the category's default; `none` when " +
      'neither says (« à migrer »).',
  })
  @ApiQuery({
    name: 'rhythm',
    required: false,
    enum: ['COMMITTED', 'VARIABLE', 'none'],
    description:
      'COMMITTED for a line of an active or stopped recurrence, else the ' +
      "subcategory's rhythm, else the category's default; `none` when " +
      'nothing says.',
  })
  @ApiQuery({
    name: 'categoryIds',
    required: false,
    type: String,
    description:
      'Any of these categories, comma-separated (at most 200); `none` for ' +
      'the rows filed nowhere.',
  })
  @ApiQuery({
    name: 'recurrences',
    required: false,
    type: String,
    description:
      'The lines of any of these recurring charges, comma-separated ' +
      '`<amountBucket>:<merchantKey>` (at most 200).',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['date', 'amount'],
    description: 'Sort column (default: date)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction (default: desc)',
  })
  async findAll(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: TransactionType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('isPointed') isPointed?: string,
    @Query('account') account?: string,
    @Query('tagId') tagId?: string,
    @Query('search') search?: string,
    @Query('amountMin') amountMin?: string,
    @Query('amountMax') amountMax?: string,
    @Query('needsBankReview') needsBankReview?: string,
    @Query('recurrence') recurrence?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('ids') ids?: string,
    @Query('personId') personId?: string,
    @Query('reimbursement') reimbursement?: string,
    @Query('settlementId') settlementId?: string,
    @Query('importId') importId?: string,
    @Query('syncRunId') syncRunId?: string,
    @Query('exceptional') exceptional?: string,
    @Query('nature') nature?: string,
    @Query('rhythm') rhythm?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('recurrences') recurrences?: string
  ): Promise<PaginatedTransactionsResponseDto> {
    // Clamp limit to max 100
    const clampedLimit = Math.min(Math.max(limit, 1), 100)

    // Sortable columns are an allowlist, not a passthrough: a column name
    // reaching Prisma unchecked would let any caller order by (and thereby
    // probe) arbitrary fields.
    if (sortBy !== undefined && sortBy !== 'date' && sortBy !== 'amount') {
      throw new BadRequestException(
        `sortBy must be 'date' or 'amount', got '${sortBy}'`
      )
    }
    if (
      sortOrder !== undefined &&
      sortOrder !== 'asc' &&
      sortOrder !== 'desc'
    ) {
      throw new BadRequestException(
        `sortOrder must be 'asc' or 'desc', got '${sortOrder}'`
      )
    }
    const sort: { by: 'date' | 'amount'; order: 'asc' | 'desc' } | undefined =
      sortBy === 'date' || sortBy === 'amount'
        ? { by: sortBy, order: sortOrder === 'asc' ? 'asc' : 'desc' }
        : undefined

    const filters = parseTransactionFilters({
      ...(type && { type }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(categoryId && { categoryId }),
      ...(subcategoryId && { subcategoryId }),
      ...(isPointed !== undefined && { isPointed }),
      ...(account && { account }),
      ...(tagId && { tagId }),
      ...(search && { search }),
      ...(amountMin !== undefined && { amountMin }),
      ...(amountMax !== undefined && { amountMax }),
      ...(needsBankReview !== undefined && { needsBankReview }),
      ...(recurrence && { recurrence }),
      ...(ids && { ids }),
      ...(personId && { personId }),
      ...(reimbursement && { reimbursement }),
      ...(settlementId && { settlementId }),
      ...(importId && { importId }),
      ...(syncRunId && { syncRunId }),
      ...(exceptional && { exceptional }),
      ...(nature && { nature }),
      ...(rhythm && { rhythm }),
      ...(categoryIds && { categoryIds }),
      ...(recurrences && { recurrences }),
    })

    const { data: transactions, total } =
      await this.transactionsService.findAllByUserPaginated(
        user.id,
        { page, limit: clampedLimit },
        Object.keys(filters).length > 0 ? filters : undefined,
        sort
      )

    const data = transactions.map(tx =>
      this.mapToResponseDto(tx as TransactionWithRelations)
    )

    return {
      data,
      meta: createPaginationMeta(total, page, clampedLimit),
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction' })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<TransactionResponseDto> {
    const tx = await this.transactionsService.findOne(id, user.id)
    return this.mapToResponseDto(tx as TransactionWithRelations)
  }

  @Patch('bulk')
  @ApiOperation({
    summary: 'Bulk update transactions (category, subcategory, isPointed)',
  })
  @ApiResponse({ status: 200 })
  async bulkUpdate(
    @CurrentUser() user: User,
    @Body()
    body: {
      /** Explicit selection. Mutually exclusive with `filters`. */
      ids?: string[]
      /** Everything matching the list view's filter, however many pages deep. */
      filters?: RawTransactionFilters
      /** Required with `filters`: the count the user was shown. */
      expectedCount?: number
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
    }
  ): Promise<{ updated: number }> {
    const data: {
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
    } = {}
    if (body.categoryId !== undefined) data.categoryId = body.categoryId
    // Forwarded even when null: that is how the caller asks for the subcategory
    // to be cleared rather than left pointing at the previous category's one.
    if (body.subcategoryId !== undefined)
      data.subcategoryId = body.subcategoryId
    if (body.isPointed !== undefined) data.isPointed = body.isPointed

    // Accepting both at once would leave which one wins to chance, on an
    // operation that has no undo.
    if (body.ids !== undefined && body.filters !== undefined) {
      throw new BadRequestException('Send either ids or filters, not both')
    }

    if (body.filters !== undefined) {
      if (typeof body.expectedCount !== 'number') {
        throw new BadRequestException(
          'expectedCount is required when selecting by filter'
        )
      }
      return this.transactionsService.bulkUpdate(
        user.id,
        {
          filters: parseTransactionFilters(body.filters),
          expectedCount: body.expectedCount,
        },
        data
      )
    }

    return this.transactionsService.bulkUpdate(
      user.id,
      { ids: body.ids ?? [] },
      data
    )
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a transaction (note, category, subcategory, isPointed, amortizationMonths)',
  })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: {
      note?: string
      /** Null sends the transaction back to "à classer". */
      categoryId?: string | null
      subcategoryId?: string | null
      isPointed?: boolean
      /** Smooth the expense over 2 to 60 months; null stops smoothing it. */
      amortizationMonths?: number | null
    }
  ): Promise<TransactionResponseDto> {
    const tx = await this.transactionsService.update(id, user.id, body)
    return this.mapToResponseDto(tx as TransactionWithRelations)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a transaction' })
  @ApiResponse({ status: 200 })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.transactionsService.delete(id, user.id)
  }
}

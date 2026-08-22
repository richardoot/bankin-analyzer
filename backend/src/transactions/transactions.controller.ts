import {
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
import { TransactionsService } from './transactions.service'
import {
  ImportTransactionsDto,
  ImportResultDto,
  ImportPreviewResultDto,
  TransactionResponseDto,
} from './dto'
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
      createdAt: tx.createdAt,
    }
  }

  @Post('import/preview')
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
    @Query('amountMax') amountMax?: string
  ): Promise<PaginatedTransactionsResponseDto> {
    // Clamp limit to max 100
    const clampedLimit = Math.min(Math.max(limit, 1), 100)

    const filters: {
      type?: TransactionType
      startDate?: Date
      endDate?: Date
      categoryId?: string
      subcategoryId?: string
      isPointed?: boolean
      account?: string
      tagId?: string
      search?: string
      amountMin?: number
      amountMax?: number
    } = {}

    if (type) filters.type = type
    if (startDate) filters.startDate = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      // A date-only bound (YYYY-MM-DD) parses to UTC midnight; extend it to the
      // end of that day so the whole day is included in the inclusive upper bound.
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setUTCHours(23, 59, 59, 999)
      filters.endDate = end
    }
    if (categoryId) filters.categoryId = categoryId
    // A subcategory only exists inside a category, so narrowing by subcategory
    // without a category would be ambiguous: ignore it in that case.
    if (categoryId && subcategoryId) filters.subcategoryId = subcategoryId
    if (isPointed !== undefined) filters.isPointed = isPointed === 'true'
    if (account) filters.account = account
    if (tagId) filters.tagId = tagId
    if (search && search.trim()) filters.search = search.trim()
    // Parse amount bounds defensively: ignore non-numeric or negative input.
    const parsedMin = amountMin !== undefined ? Number(amountMin) : NaN
    const parsedMax = amountMax !== undefined ? Number(amountMax) : NaN
    if (Number.isFinite(parsedMin) && parsedMin >= 0)
      filters.amountMin = parsedMin
    if (Number.isFinite(parsedMax) && parsedMax >= 0)
      filters.amountMax = parsedMax

    const { data: transactions, total } =
      await this.transactionsService.findAllByUserPaginated(
        user.id,
        { page, limit: clampedLimit },
        Object.keys(filters).length > 0 ? filters : undefined
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
      ids: string[]
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
    return this.transactionsService.bulkUpdate(user.id, body.ids, data)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a transaction (note, category, subcategory, isPointed)',
  })
  @ApiResponse({ status: 200, type: TransactionResponseDto })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: {
      note?: string
      categoryId?: string
      subcategoryId?: string | null
      isPointed?: boolean
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

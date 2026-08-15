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
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { TagsService } from './tags.service'
import {
  CreateTagDto,
  UpdateTagDto,
  AttachTransactionsDto,
  TagResponseDto,
  TagAnalysisDto,
  TagBudgetSummaryDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tags for the current user' })
  @ApiResponse({ status: 200, type: [TagResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<TagResponseDto[]> {
    return this.tagsService.findAllByUser(user.id)
  }

  @Get('budget-summary')
  @ApiOperation({
    summary: 'Exceptional tags overlapping a window, with spend vs envelope',
  })
  @ApiResponse({ status: 200, type: TagBudgetSummaryDto })
  async getBudgetSummary(
    @CurrentUser() user: User,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ): Promise<TagBudgetSummaryDto> {
    return this.tagsService.getBudgetSummary(user.id, startDate, endDate)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag by ID' })
  @ApiResponse({ status: 200, type: TagResponseDto })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<TagResponseDto> {
    return this.tagsService.findOne(id, user.id)
  }

  @Get(':id/analysis')
  @ApiOperation({ summary: 'Get aggregated analysis of a tag' })
  @ApiResponse({ status: 200, type: TagAnalysisDto })
  async getAnalysis(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<TagAnalysisDto> {
    return this.tagsService.getAnalysis(id, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, type: TagResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateTagDto
  ): Promise<TagResponseDto> {
    return this.tagsService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, type: TagResponseDto })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto
  ): Promise<TagResponseDto> {
    return this.tagsService.update(id, user.id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 200 })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.tagsService.delete(id, user.id)
  }

  @Post(':id/transactions')
  @ApiOperation({ summary: 'Attach a tag to several transactions' })
  @ApiResponse({ status: 201 })
  async attach(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AttachTransactionsDto
  ): Promise<{ attached: number }> {
    return this.tagsService.attachTransactions(id, user.id, dto.transactionIds)
  }

  @Delete(':id/transactions/:transactionId')
  @ApiOperation({ summary: 'Detach a tag from a transaction' })
  @ApiResponse({ status: 200 })
  async detach(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('transactionId') transactionId: string
  ): Promise<void> {
    await this.tagsService.detachTransaction(id, user.id, transactionId)
  }
}

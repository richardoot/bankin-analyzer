import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { ImportHistoriesService } from './import-histories.service'
import { ImportHistoryResponseDto, CreateImportHistoryDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('import-histories')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('import-histories')
export class ImportHistoriesController {
  constructor(
    private readonly importHistoriesService: ImportHistoriesService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all import history for the current user' })
  @ApiResponse({ status: 200, type: [ImportHistoryResponseDto] })
  async findAll(
    @CurrentUser() user: User
  ): Promise<ImportHistoryResponseDto[]> {
    return this.importHistoriesService.findAllByUser(user.id)
  }

  @Get('latest-date')
  @ApiOperation({ summary: 'Get the latest imported transaction date' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async getLatestDate(
    @CurrentUser() user: User
  ): Promise<{ date: string | null }> {
    const date = await this.importHistoriesService.getLatestImportDate(user.id)
    return { date: date?.toISOString() ?? null }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new import history entry' })
  @ApiResponse({ status: 201, type: ImportHistoryResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateImportHistoryDto
  ): Promise<ImportHistoryResponseDto> {
    return this.importHistoriesService.create(user.id, {
      transactionsImported: dto.transactionsImported,
      categoriesCreated: dto.categoriesCreated,
      duplicatesSkipped: dto.duplicatesSkipped,
      totalInFile: dto.totalInFile,
      dateRangeStart: new Date(dto.dateRangeStart),
      dateRangeEnd: new Date(dto.dateRangeEnd),
      accounts: dto.accounts,
      fileName: dto.fileName,
    })
  }
}

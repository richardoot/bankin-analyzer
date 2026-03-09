import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger'
import { ImportHistoriesService } from './import-histories.service'
import {
  ImportHistoryResponseDto,
  CreateImportHistoryDto,
  StartImportDto,
  FinalizeImportDto,
} from './dto'
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

  @Post('start')
  @ApiOperation({ summary: 'Start a new import (creates IN_PROGRESS entry)' })
  @ApiResponse({ status: 201, type: ImportHistoryResponseDto })
  async startImport(
    @CurrentUser() user: User,
    @Body() dto: StartImportDto
  ): Promise<ImportHistoryResponseDto> {
    return this.importHistoriesService.startImport(user.id, {
      totalInFile: dto.totalInFile,
      fileName: dto.fileName,
    })
  }

  @Put(':id/finalize')
  @ApiOperation({ summary: 'Finalize an import with final statistics' })
  @ApiParam({ name: 'id', description: 'Import history ID' })
  @ApiResponse({ status: 200, type: ImportHistoryResponseDto })
  async finalizeImport(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: FinalizeImportDto
  ): Promise<ImportHistoryResponseDto> {
    return this.importHistoriesService.finalizeImport(id, user.id, {
      transactionsImported: dto.transactionsImported,
      categoriesCreated: dto.categoriesCreated,
      duplicatesSkipped: dto.duplicatesSkipped,
      dateRangeStart: new Date(dto.dateRangeStart),
      dateRangeEnd: new Date(dto.dateRangeEnd),
      accounts: dto.accounts,
    })
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an import and all its associated transactions',
  })
  @ApiParam({ name: 'id', description: 'Import history ID' })
  @ApiResponse({ status: 204, description: 'Import deleted successfully' })
  async deleteImport(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.importHistoriesService.deleteImport(id, user.id)
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a new import history entry (legacy, prefer start/finalize)',
  })
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

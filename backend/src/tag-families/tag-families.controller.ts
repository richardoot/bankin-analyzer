import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { TagFamiliesService } from './tag-families.service'
import { TagFamilyAnalysisService } from './tag-family-analysis.service'
import {
  CreateTagFamilyDto,
  TagFamilyAnalysisDto,
  TagFamilyAnalysisQueryDto,
  TagFamilyResponseDto,
  UpdateTagFamilyDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('tag-families')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('tag-families')
export class TagFamiliesController {
  constructor(
    private readonly tagFamiliesService: TagFamiliesService,
    private readonly analysisService: TagFamilyAnalysisService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all tag families of the current user' })
  @ApiResponse({ status: 200, type: [TagFamilyResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<TagFamilyResponseDto[]> {
    return this.tagFamiliesService.findAllByUser(user.id)
  }

  @Get(':id/analysis')
  @ApiOperation({
    summary:
      'Analyse a tag family: the union of its tags, each transaction once, ' +
      'per category, per year (event or cash basis) and per edition',
  })
  @ApiResponse({ status: 200, type: TagFamilyAnalysisDto })
  @ApiResponse({ status: 404, description: 'Tag family not found' })
  async getAnalysis(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: TagFamilyAnalysisQueryDto
  ): Promise<TagFamilyAnalysisDto> {
    return this.analysisService.getAnalysis(id, user.id, query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag family by ID' })
  @ApiResponse({ status: 200, type: TagFamilyResponseDto })
  @ApiResponse({ status: 404, description: 'Tag family not found' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<TagFamilyResponseDto> {
    return this.tagFamiliesService.findOne(id, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag family' })
  @ApiResponse({ status: 201, type: TagFamilyResponseDto })
  @ApiResponse({ status: 409, description: 'A family of that name exists' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateTagFamilyDto
  ): Promise<TagFamilyResponseDto> {
    return this.tagFamiliesService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, recolor or re-budget a tag family' })
  @ApiResponse({ status: 200, type: TagFamilyResponseDto })
  @ApiResponse({ status: 404, description: 'Tag family not found' })
  @ApiResponse({ status: 409, description: 'A family of that name exists' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTagFamilyDto
  ): Promise<TagFamilyResponseDto> {
    return this.tagFamiliesService.update(id, user.id, dto)
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a tag family. Its tags are kept, without a family',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Tag family not found' })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.tagFamiliesService.delete(id, user.id)
  }
}

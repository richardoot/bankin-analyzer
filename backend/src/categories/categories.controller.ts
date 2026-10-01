import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { CategoriesService } from './categories.service'
import { CategoryMigrationService } from './category-migration.service'
import { LegacyMigrationService } from './legacy-migration.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import {
  CategoryDeletionResultDto,
  CategoryDeletionSummaryDto,
  CategoryMigrationPreviewDto,
  CategoryMigrationResultDto,
  LegacyMigrationPreviewDto,
  LegacyMigrationRequestDto,
  LegacyMigrationResultDto,
  LegacyOverviewDto,
  MigrateCategoryDto,
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  toCategoryResponse,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categoryMigrationService: CategoryMigrationService,
    private readonly legacyMigrationService: LegacyMigrationService,
    private readonly aiSuggestionsService: AiSuggestionsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all categories for the current user' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<CategoryResponseDto[]> {
    const rows = await this.categoriesService.findAllByUser(user.id)
    return rows.map(toCategoryResponse)
  }

  @Get('legacy')
  @ApiOperation({
    summary:
      'What is left from before the catalogue: every legacy category, each line with its suggested filing',
  })
  @ApiResponse({ status: 200, type: LegacyOverviewDto })
  async legacyOverview(@CurrentUser() user: User): Promise<LegacyOverviewDto> {
    return this.legacyMigrationService.overview(user.id)
  }

  @Post(':id/legacy-migration/preview')
  @ApiOperation({
    summary:
      'What migrating a legacy category with these decisions would do: counts, envelopes, type changes',
  })
  @ApiResponse({ status: 200, type: LegacyMigrationPreviewDto })
  @ApiResponse({ status: 400, description: 'The arrangement is impossible' })
  @ApiResponse({
    status: 404,
    description: 'Not a legacy category of this user',
  })
  @HttpCode(200)
  async legacyMigrationPreview(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: LegacyMigrationRequestDto
  ): Promise<LegacyMigrationPreviewDto> {
    return this.legacyMigrationService.preview(user.id, id, dto.decisions)
  }

  @Post(':id/legacy-migration')
  @ApiOperation({
    summary:
      'Migrate a legacy category into the catalogue. Deleted once nothing is kept',
  })
  @ApiResponse({ status: 201, type: LegacyMigrationResultDto })
  @ApiResponse({ status: 400, description: 'The arrangement is impossible' })
  @ApiResponse({
    status: 404,
    description: 'Not a legacy category of this user',
  })
  async legacyMigration(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: LegacyMigrationRequestDto
  ): Promise<LegacyMigrationResultDto> {
    return this.legacyMigrationService.migrate(user.id, id, dto.decisions)
  }

  /**
   * Kept as a route rather than removed: a client written for the old API
   * deserves to be told why, not a 404. The body is still validated first,
   * so a malformed request reads as malformed and not as forbidden.
   */
  @Post()
  @ApiOperation({
    summary:
      'Refused: categories come from the catalogue. Add a subcategory inside one instead',
  })
  @ApiResponse({ status: 403, description: 'Categories are not user-created' })
  create(@CurrentUser() _user: User, @Body() dto: CreateCategoryDto): never {
    throw new ForbiddenException(
      `Categories come from the catalogue and cannot be created; ` +
        `add "${dto.name}" as a subcategory inside one of them`
    )
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a legacy category' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 403, description: 'Catalogue categories are locked' })
  @ApiResponse({
    status: 409,
    description: 'Another category of the same type already bears that name',
  })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(
      await this.categoriesService.update(user.id, id, dto)
    )
  }

  @Get(':id/deletion-summary')
  @ApiOperation({
    summary: 'Preview everything deleting a category would touch',
  })
  @ApiResponse({ status: 200, type: CategoryDeletionSummaryDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async deletionSummary(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<CategoryDeletionSummaryDto> {
    return this.categoriesService.getDeletionSummary(user.id, id)
  }

  @Get(':id/migration-preview')
  @ApiOperation({
    summary:
      'Plan moving a category into another: counts, name collisions, defaults',
  })
  @ApiResponse({ status: 200, type: CategoryMigrationPreviewDto })
  @ApiResponse({ status: 400, description: 'Categories of different types' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async migrationPreview(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('targetCategoryId') targetCategoryId: string
  ): Promise<CategoryMigrationPreviewDto> {
    return this.categoryMigrationService.preview(user.id, id, targetCategoryId)
  }

  @Post(':id/migrate')
  @ApiOperation({
    summary:
      "Move a category's transactions into another. The source is kept, even empty",
  })
  @ApiResponse({ status: 201, type: CategoryMigrationResultDto })
  @ApiResponse({ status: 400, description: 'The arrangement is impossible' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async migrate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: MigrateCategoryDto
  ): Promise<CategoryMigrationResultDto> {
    return this.categoryMigrationService.migrate(
      user.id,
      id,
      dto.targetCategoryId,
      dto.actions
    )
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a category. Its transactions are kept and become uncategorized',
  })
  @ApiResponse({ status: 200, type: CategoryDeletionResultDto })
  @ApiResponse({ status: 403, description: 'Catalogue categories are locked' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<CategoryDeletionResultDto> {
    return this.categoriesService.remove(user.id, id)
  }

  @Post('generate-icons')
  // Every call is money: one Anthropic request per batch of missing icons.
  // Five an hour covers any honest use — the button is pressed once, twice if
  // the first answer disappointed — and caps what a scripted caller can spend.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({
    summary:
      'Generate emoji icons for categories and subcategories without icons',
  })
  async generateIcons(@CurrentUser() user: User): Promise<{ updated: number }> {
    const categories = await this.categoriesService.findWithoutIcons(user.id)
    const subcategories =
      await this.categoriesService.findSubcategoriesWithoutIcons(user.id)

    if (categories.length === 0 && subcategories.length === 0) {
      return { updated: 0 }
    }

    await this.aiSuggestionsService.generateAndSaveIcons(
      user.id,
      categories.map(c => ({ id: c.id, name: c.name })),
      subcategories.map(s => ({ id: s.id, name: s.name }))
    )

    return { updated: categories.length + subcategories.length }
  }
}

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { CategoriesService } from './categories.service'
import { AiSuggestionsService } from '../ai-suggestions/ai-suggestions.service'
import { CategoryResponseDto, CreateCategoryDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly aiSuggestionsService: AiSuggestionsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all categories for the current user' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<CategoryResponseDto[]> {
    return this.categoriesService.findAllByUser(user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateCategoryDto
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.create(user.id, dto)
  }

  @Post('generate-icons')
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

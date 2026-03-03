import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { CategoriesService } from './categories.service'
import { CategoryResponseDto, CreateCategoryDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

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
}

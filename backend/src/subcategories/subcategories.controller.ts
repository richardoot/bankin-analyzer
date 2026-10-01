import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { SubcategoriesService } from './subcategories.service'
import {
  SubcategoryResponseDto,
  SubcategoryDeletionResultDto,
  CreateSubcategoryDto,
  toSubcategoryResponse,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('subcategories')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('subcategories')
export class SubcategoriesController {
  constructor(private readonly subcategoriesService: SubcategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all subcategories for the current user' })
  @ApiResponse({ status: 200, type: [SubcategoryResponseDto] })
  async findAll(@CurrentUser() user: User): Promise<SubcategoryResponseDto[]> {
    const rows = await this.subcategoriesService.findAllByUser(user.id)
    return rows.map(toSubcategoryResponse)
  }

  @Get('by-category/:categoryId')
  @ApiOperation({ summary: 'Get subcategories for a specific category' })
  @ApiResponse({ status: 200, type: [SubcategoryResponseDto] })
  async findByCategory(
    @CurrentUser() user: User,
    @Param('categoryId') categoryId: string
  ): Promise<SubcategoryResponseDto[]> {
    const rows = await this.subcategoriesService.findByCategoryId(
      user.id,
      categoryId
    )
    return rows.map(toSubcategoryResponse)
  }

  @Post()
  @ApiOperation({
    summary:
      'Add a subcategory inside a category, or return the one already bearing that name',
  })
  @ApiResponse({ status: 201, type: SubcategoryResponseDto })
  @ApiResponse({
    status: 400,
    description: 'A nature or a rhythm on an income subcategory',
  })
  @ApiResponse({ status: 403, description: 'Transfer categories are flat' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateSubcategoryDto
  ): Promise<SubcategoryResponseDto> {
    return toSubcategoryResponse(
      await this.subcategoriesService.create(user.id, dto)
    )
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a subcategory the user added. Its transactions fall back to the category\'s "Autre"',
  })
  @ApiResponse({ status: 200, type: SubcategoryDeletionResultDto })
  @ApiResponse({
    status: 403,
    description: 'Catalogue subcategories are locked',
  })
  @ApiResponse({ status: 404, description: 'Subcategory not found' })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<SubcategoryDeletionResultDto> {
    return this.subcategoriesService.remove(user.id, id)
  }
}

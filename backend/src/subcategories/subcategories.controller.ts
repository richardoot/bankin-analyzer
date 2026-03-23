import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { SubcategoriesService } from './subcategories.service'
import { SubcategoryResponseDto, CreateSubcategoryDto } from './dto'
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
    return this.subcategoriesService.findAllByUser(user.id)
  }

  @Get('by-category/:categoryId')
  @ApiOperation({ summary: 'Get subcategories for a specific category' })
  @ApiResponse({ status: 200, type: [SubcategoryResponseDto] })
  async findByCategory(
    @CurrentUser() user: User,
    @Param('categoryId') categoryId: string
  ): Promise<SubcategoryResponseDto[]> {
    return this.subcategoriesService.findByCategoryId(user.id, categoryId)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new subcategory' })
  @ApiResponse({ status: 201, type: SubcategoryResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateSubcategoryDto
  ): Promise<SubcategoryResponseDto> {
    return this.subcategoriesService.create(user.id, dto)
  }
}

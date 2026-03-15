import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger'
import { CategoryAssociationService } from './category-association.service'
import { CategoryAssociationDto, CreateCategoryAssociationDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('category-associations')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('category-associations')
export class CategoryAssociationController {
  constructor(
    private readonly categoryAssociationService: CategoryAssociationService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all category associations' })
  @ApiResponse({ status: 200, type: [CategoryAssociationDto] })
  async findAll(@CurrentUser() user: User): Promise<CategoryAssociationDto[]> {
    return this.categoryAssociationService.findAll(user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a category association' })
  @ApiResponse({ status: 201, type: CategoryAssociationDto })
  @ApiResponse({ status: 409, description: 'Association already exists' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateCategoryAssociationDto
  ): Promise<CategoryAssociationDto> {
    return this.categoryAssociationService.create(user.id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category association' })
  @ApiResponse({ status: 204, description: 'Association deleted' })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.categoryAssociationService.delete(user.id, id)
  }
}

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { AiSuggestionsService } from './ai-suggestions.service'
import { SuggestAssociationsDto } from './dto/suggest-associations.dto'
import { CategorySuggestionDto } from './dto/category-suggestion.dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('ai-suggestions')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('ai-suggestions')
export class AiSuggestionsController {
  constructor(private readonly aiSuggestionsService: AiSuggestionsService) {}

  @Post('category-associations')
  @ApiOperation({
    summary: 'Suggérer des associations de catégories via IA',
    description:
      "Utilise l'IA pour suggérer des associations entre catégories de dépenses et catégories de remboursement basées sur les noms des catégories.",
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des suggestions avec scores de confiance',
    type: [CategorySuggestionDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Non authentifié',
  })
  async suggestAssociations(
    @CurrentUser() user: User,
    @Body() dto: SuggestAssociationsDto
  ): Promise<CategorySuggestionDto[]> {
    return this.aiSuggestionsService.suggestAssociations(
      user.id,
      dto.expenseCategoryIds
    )
  }
}

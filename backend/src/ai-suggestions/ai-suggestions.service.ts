import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ChatAnthropic } from '@langchain/anthropic'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { ASSOCIATION_EXAMPLES } from './prompts/association-examples'
import { CategorySuggestionDto } from './dto/category-suggestion.dto'

/**
 * Schéma Zod pour valider la sortie structurée du LLM
 */
const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      expenseCategoryName: z
        .string()
        .describe('Nom exact de la catégorie de dépense'),
      suggestedIncomeCategoryName: z
        .string()
        .describe('Nom exact de la catégorie de remboursement suggérée'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Score de confiance entre 0 et 1'),
      reasoning: z.string().describe('Explication courte de la suggestion'),
    })
  ),
})

@Injectable()
export class AiSuggestionsService {
  private readonly logger = new Logger(AiSuggestionsService.name)
  private llm: ChatAnthropic

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      throw new InternalServerErrorException(
        'ANTHROPIC_API_KEY must be defined'
      )
    }

    this.llm = new ChatAnthropic({
      model: 'claude-haiku-4-5-20251001', // Modèle le moins cher ($1/$5 par MTok)
      apiKey,
      temperature: 0.1, // Faible température pour des réponses cohérentes
    })
  }

  /**
   * Suggère des associations entre catégories de dépenses et catégories de remboursement
   * en utilisant l'IA pour analyser les noms de catégories.
   */
  async suggestAssociations(
    userId: string,
    expenseCategoryIds: string[]
  ): Promise<CategorySuggestionDto[]> {
    this.logger.debug(
      `Suggesting associations for ${expenseCategoryIds.length} expense categories`
    )

    // 1. Récupérer les catégories expense demandées
    const expenseCategories = await this.prisma.category.findMany({
      where: {
        id: { in: expenseCategoryIds },
        userId,
        type: 'EXPENSE',
      },
    })

    if (expenseCategories.length === 0) {
      this.logger.debug('No expense categories found')
      return []
    }

    // 2. Récupérer toutes les catégories income disponibles
    const incomeCategories = await this.prisma.category.findMany({
      where: {
        userId,
        type: 'INCOME',
      },
    })

    if (incomeCategories.length === 0) {
      this.logger.debug('No income categories available')
      return []
    }

    // 3. Récupérer les associations existantes (pour exclure les catégories déjà associées)
    const existingAssociations = await this.prisma.categoryAssociation.findMany(
      {
        where: { userId },
        select: { expenseCategoryId: true, incomeCategoryId: true },
      }
    )

    const associatedExpenseIds = new Set(
      existingAssociations.map(a => a.expenseCategoryId)
    )
    const associatedIncomeIds = new Set(
      existingAssociations.map(a => a.incomeCategoryId)
    )

    // Filtrer les catégories déjà associées
    const unassociatedExpenseCategories = expenseCategories.filter(
      c => !associatedExpenseIds.has(c.id)
    )
    const availableIncomeCategories = incomeCategories.filter(
      c => !associatedIncomeIds.has(c.id)
    )

    if (
      unassociatedExpenseCategories.length === 0 ||
      availableIncomeCategories.length === 0
    ) {
      this.logger.debug(
        'No unassociated categories to analyze or no available income categories'
      )
      return []
    }

    // 4. Construire le prompt avec few-shot examples
    const examplesText = ASSOCIATION_EXAMPLES.map(
      e => `- "${e.expense}" → "${e.income}" (${e.reasoning})`
    ).join('\n')

    const expenseNames = unassociatedExpenseCategories
      .map(c => c.name)
      .join(', ')
    const incomeNames = availableIncomeCategories.map(c => c.name).join(', ')

    const systemPrompt = `Tu es un assistant spécialisé dans l'analyse financière personnelle française.
Tu dois suggérer des associations entre catégories de dépenses et catégories de remboursement.

Exemples d'associations typiques :
${examplesText}

Catégories de remboursement disponibles : ${incomeNames}

Règles importantes :
- Ne suggère une association que si elle a vraiment du sens (confiance > 0.7)
- Utilise EXACTEMENT les noms des catégories fournis (expense et income)
- Une catégorie income ne peut être associée qu'à une seule catégorie expense
- Fournis une explication courte et claire en français
- Si aucune association n'est pertinente pour une catégorie, ne la mentionne pas
- Retourne un tableau vide si aucune suggestion n'est appropriée`

    const userPrompt = `Analyse ces catégories de dépenses et suggère les associations avec les catégories de remboursement disponibles.

Catégories de dépenses à analyser : ${expenseNames}

Rappel des catégories de remboursement disponibles : ${incomeNames}`

    try {
      // 5. Appeler le LLM avec structured output
      const structuredLlm = this.llm.withStructuredOutput(SuggestionSchema)
      const result = await structuredLlm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ])

      this.logger.debug(`LLM returned ${result.suggestions.length} suggestions`)

      // 6. Mapper les résultats avec les IDs réels
      const suggestions: CategorySuggestionDto[] = []

      for (const suggestion of result.suggestions) {
        const expenseCat = unassociatedExpenseCategories.find(
          c =>
            c.name.toLowerCase() ===
            suggestion.expenseCategoryName.toLowerCase()
        )
        const incomeCat = availableIncomeCategories.find(
          c =>
            c.name.toLowerCase() ===
            suggestion.suggestedIncomeCategoryName.toLowerCase()
        )

        if (expenseCat && incomeCat && suggestion.confidence >= 0.7) {
          suggestions.push({
            expenseCategoryId: expenseCat.id,
            expenseCategoryName: expenseCat.name,
            suggestedIncomeCategoryId: incomeCat.id,
            suggestedIncomeCategoryName: incomeCat.name,
            confidence: suggestion.confidence,
            reasoning: suggestion.reasoning,
          })
        }
      }

      this.logger.debug(
        `Returning ${suggestions.length} valid suggestions after filtering`
      )
      return suggestions
    } catch (error) {
      this.logger.error('Error calling LLM for suggestions', error)
      throw error
    }
  }
}

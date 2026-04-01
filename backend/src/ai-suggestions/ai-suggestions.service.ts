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
 * Schéma Zod pour valider la sortie structurée du LLM (icônes)
 */
const IconSchema = z.object({
  icons: z.array(
    z.object({
      name: z
        .string()
        .describe('Exact category or subcategory name as provided'),
      icon: z
        .string()
        .describe('A single emoji that best represents this category'),
    })
  ),
})

/**
 * Schéma Zod pour valider la sortie structurée du LLM (suggestions)
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

  /**
   * Generates a single emoji icon for each provided name using the LLM.
   * Returns a Map from name to emoji string.
   */
  async generateIcons(names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) {
      return new Map()
    }

    const systemPrompt = `You are a financial categorization expert. For each category or subcategory name provided, choose exactly one emoji that best represents it visually. Use common, widely-supported emojis. For finance categories, prefer: food/drink emojis for food categories, vehicle/transport emojis for transport, medical emojis for health, house emojis for housing, etc.`

    const userPrompt = `Choose one emoji for each of the following category names:\n${names.map(n => `- ${n}`).join('\n')}`

    const structuredLlm = this.llm.withStructuredOutput(IconSchema)
    const result = await structuredLlm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    const iconMap = new Map<string, string>()
    for (const entry of result.icons) {
      iconMap.set(entry.name, entry.icon)
    }

    return iconMap
  }

  /**
   * Generates emoji icons for categories and subcategories, then persists them.
   * This method is designed to be called fire-and-forget; errors are logged but never thrown.
   */
  async generateAndSaveIcons(
    userId: string,
    categories: Array<{ id: string; name: string }>,
    subcategories: Array<{ id: string; name: string }>
  ): Promise<void> {
    // userId reserved for future per-user scoping
    void userId

    try {
      const allNames = [
        ...categories.map(c => c.name),
        ...subcategories.map(s => s.name),
      ]

      if (allNames.length === 0) {
        return
      }

      const iconMap = await this.generateIcons(allNames)

      const categoryUpdates = categories
        .filter(c => iconMap.has(c.name))
        .map(c =>
          this.prisma.category.update({
            where: { id: c.id },
            data: { icon: iconMap.get(c.name)! },
          })
        )

      const subcategoryUpdates = subcategories
        .filter(s => iconMap.has(s.name))
        .map(s =>
          this.prisma.subcategory.update({
            where: { id: s.id },
            data: { icon: iconMap.get(s.name)! },
          })
        )

      await Promise.all([...categoryUpdates, ...subcategoryUpdates])

      this.logger.debug(
        `Successfully generated and saved icons for ${iconMap.size} items`
      )
    } catch (error) {
      this.logger.error('Error generating or saving icons', error)
    }
  }
}

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ChatAnthropic } from '@langchain/anthropic'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'

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

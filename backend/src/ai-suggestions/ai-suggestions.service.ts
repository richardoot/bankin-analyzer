import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ChatAnthropic } from '@langchain/anthropic'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import {
  chunk,
  describeCatalog,
  resolveAssignments,
  type CategorizableTransaction,
  type CategoryChoice,
  type RawAssignment,
  type ResolvedAssignment,
  type SubcategoryChoice,
} from './transaction-categorizer'

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
 * Schéma Zod pour valider la sortie structurée du LLM (catégorisation).
 *
 * Le modèle répond avec l'index de la transaction plutôt qu'avec son libellé :
 * deux transactions peuvent porter exactement le même libellé, et un index ne
 * se reformule pas.
 */
const CategorizationSchema = z.object({
  assignments: z.array(
    z.object({
      index: z.number().describe('Index of the transaction, as given'),
      category: z
        .string()
        .describe('Exact name of one category from the provided list'),
      subcategory: z
        .string()
        .nullable()
        .optional()
        .describe(
          'Exact name of one subcategory of that category, or null if none fits'
        ),
    })
  ),
})

/** How many transactions go in one prompt. */
const CATEGORIZATION_BATCH_SIZE = 40

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

  /**
   * Pick the best fit, for each transaction, among the categories the user
   * already has.
   *
   * Never creates anything: the model is handed a catalogue and its answer is
   * checked against it (see `transaction-categorizer.ts`), so an invented name
   * yields no filing rather than a new category.
   *
   * Expenses and income are asked about separately. A transaction can only
   * land in a category of its own sign, so mixing them in one prompt would
   * spend tokens listing choices that are not available anyway.
   *
   * A batch that fails is logged and skipped rather than thrown: an import
   * must not be lost because the categorizer was unavailable. Those
   * transactions arrive unfiled, which is visible and one click to fix.
   */
  async categorizeTransactions(
    transactions: CategorizableTransaction[],
    categories: CategoryChoice[],
    subcategories: SubcategoryChoice[]
  ): Promise<ResolvedAssignment[]> {
    if (transactions.length === 0 || categories.length === 0) return []

    const assignments: ResolvedAssignment[] = []

    for (const type of ['EXPENSE', 'INCOME'] as const) {
      const ofType = transactions.filter(t => t.type === type)
      if (ofType.length === 0) continue

      const catalog = describeCatalog(categories, subcategories, type)
      if (catalog === '') continue

      for (const batch of chunk(ofType, CATEGORIZATION_BATCH_SIZE)) {
        try {
          const raw = await this.classifyBatch(batch, catalog, type)
          assignments.push(
            ...resolveAssignments(raw, batch, categories, subcategories)
          )
        } catch (error) {
          this.logger.error(
            `Categorization failed for a batch of ${batch.length} ${type} transactions`,
            error
          )
        }
      }
    }

    return assignments
  }

  private async classifyBatch(
    batch: CategorizableTransaction[],
    catalog: string,
    type: 'EXPENSE' | 'INCOME'
  ): Promise<RawAssignment[]> {
    const label = type === 'EXPENSE' ? 'depenses' : 'revenus'

    const systemPrompt = [
      'Tu classes des transactions bancaires francaises dans les categories',
      "existantes d'un utilisateur.",
      '',
      'Regles imperatives :',
      "- Choisis uniquement un nom present dans la liste, a l'identique.",
      "- N'invente jamais de categorie ni de sous-categorie.",
      '- La sous-categorie doit appartenir a la categorie choisie, sinon null.',
      '- Si aucune categorie ne convient vraiment, omets la transaction :',
      '  une transaction non classee vaut mieux quun mauvais classement.',
      '- Reponds pour chaque transaction avec son index exact.',
    ].join('\n')

    const userPrompt = [
      `Categories de ${label} disponibles :`,
      catalog,
      '',
      'Transactions a classer :',
      ...batch.map(
        t =>
          `${t.index}. ${t.description} (${Math.abs(t.amount).toFixed(2)} EUR)`
      ),
    ].join('\n')

    const structuredLlm = this.llm.withStructuredOutput(CategorizationSchema)
    const result = await structuredLlm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    return result.assignments
  }
}

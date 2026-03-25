export class CategorySuggestionDto {
  /** ID de la catégorie de dépense */
  expenseCategoryId!: string

  /** Nom de la catégorie de dépense */
  expenseCategoryName!: string

  /** ID de la catégorie de remboursement suggérée */
  suggestedIncomeCategoryId!: string

  /** Nom de la catégorie de remboursement suggérée */
  suggestedIncomeCategoryName!: string

  /** Score de confiance entre 0 et 1 */
  confidence!: number

  /** Explication de la suggestion par l'IA */
  reasoning!: string
}

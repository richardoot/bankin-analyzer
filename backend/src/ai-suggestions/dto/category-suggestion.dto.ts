import { ApiProperty } from '@nestjs/swagger'

export class CategorySuggestionDto {
  @ApiProperty({
    description: 'ID de la catégorie de dépense',
    example: 'uuid-expense-category',
  })
  expenseCategoryId!: string

  @ApiProperty({
    description: 'Nom de la catégorie de dépense',
    example: 'Frais médicaux',
  })
  expenseCategoryName!: string

  @ApiProperty({
    description: 'ID de la catégorie de remboursement suggérée',
    example: 'uuid-income-category',
  })
  suggestedIncomeCategoryId!: string

  @ApiProperty({
    description: 'Nom de la catégorie de remboursement suggérée',
    example: 'Remboursement Sécurité Sociale',
  })
  suggestedIncomeCategoryName!: string

  @ApiProperty({
    description: 'Score de confiance entre 0 et 1',
    minimum: 0,
    maximum: 1,
    example: 0.92,
  })
  confidence!: number

  @ApiProperty({
    description: "Explication de la suggestion par l'IA",
    example:
      "Les frais médicaux sont typiquement remboursés par l'assurance maladie",
  })
  reasoning!: string
}

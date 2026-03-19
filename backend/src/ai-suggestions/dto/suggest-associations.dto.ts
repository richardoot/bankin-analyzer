import { IsArray, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class SuggestAssociationsDto {
  @ApiProperty({
    type: [String],
    description: 'Liste des IDs de catégories de dépenses à analyser',
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @IsString({ each: true })
  expenseCategoryIds!: string[]
}

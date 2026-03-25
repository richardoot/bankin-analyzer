import { IsArray, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class SuggestAssociationsDto {
  /** Liste des IDs de catégories de dépenses à analyser */
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  expenseCategoryIds!: string[]
}

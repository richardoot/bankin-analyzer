import { ApiProperty } from '@nestjs/swagger'

export class SubcategoryResponseDto {
  @ApiProperty({ description: 'Subcategory ID' })
  id!: string

  @ApiProperty({ description: 'Parent category ID' })
  categoryId!: string

  @ApiProperty({ description: 'Subcategory name' })
  name!: string

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date
}

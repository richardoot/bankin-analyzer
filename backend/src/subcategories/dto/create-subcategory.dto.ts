import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsUUID, IsNotEmpty } from 'class-validator'

export class CreateSubcategoryDto {
  @ApiProperty({ description: 'Parent category ID' })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string

  @ApiProperty({ description: 'Subcategory name' })
  @IsString()
  @IsNotEmpty()
  name!: string
}

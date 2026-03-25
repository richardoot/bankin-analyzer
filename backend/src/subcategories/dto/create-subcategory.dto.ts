import { IsString, IsUUID, IsNotEmpty } from 'class-validator'

export class CreateSubcategoryDto {
  /** Parent category ID */
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string

  /** Subcategory name */
  @IsString()
  @IsNotEmpty()
  name!: string
}

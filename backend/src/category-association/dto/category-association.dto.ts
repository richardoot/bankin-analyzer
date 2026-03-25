import { IsString, IsUUID } from 'class-validator'

export class CategoryAssociationDto {
  /** Unique identifier */
  id!: string

  /** Expense category ID */
  expenseCategoryId!: string

  /** Expense category name */
  expenseCategoryName!: string

  /** Income category ID */
  incomeCategoryId!: string

  /** Income category name */
  incomeCategoryName!: string
}

export class CreateCategoryAssociationDto {
  /** Expense category ID */
  @IsString()
  @IsUUID()
  expenseCategoryId!: string

  /** Income category ID */
  @IsString()
  @IsUUID()
  incomeCategoryId!: string
}

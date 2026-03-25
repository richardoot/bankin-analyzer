export class SubcategoryResponseDto {
  /** Subcategory ID */
  id!: string

  /** Parent category ID */
  categoryId!: string

  /** Subcategory name */
  name!: string

  /** Creation date */
  createdAt!: Date
}

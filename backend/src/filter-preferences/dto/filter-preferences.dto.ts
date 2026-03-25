import { ApiProperty } from '@nestjs/swagger'

export class FilterPreferencesDto {
  /** List of hidden expense category names (dashboard filter only) */
  @ApiProperty({ type: [String] })
  hiddenExpenseCategories!: string[]

  /** List of hidden income category names (dashboard filter only) */
  @ApiProperty({ type: [String] })
  hiddenIncomeCategories!: string[]

  /** List of globally hidden expense category names (hidden everywhere) */
  @ApiProperty({ type: [String] })
  globalHiddenExpenseCategories!: string[]

  /** List of globally hidden income category names (hidden everywhere) */
  @ApiProperty({ type: [String] })
  globalHiddenIncomeCategories!: string[]

  /** Whether the advanced filters panel is expanded */
  isPanelExpanded!: boolean
}

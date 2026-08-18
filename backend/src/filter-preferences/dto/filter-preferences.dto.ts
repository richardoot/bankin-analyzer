import { ApiProperty } from '@nestjs/swagger'

export class FilterPreferencesDto {
  /** Hidden expense category ids (dashboard filter only) */
  @ApiProperty({ type: [String] })
  hiddenExpenseCategoryIds!: string[]

  /** Hidden income category ids (dashboard filter only) */
  @ApiProperty({ type: [String] })
  hiddenIncomeCategoryIds!: string[]

  /** Globally hidden expense category ids (hidden everywhere) */
  @ApiProperty({ type: [String] })
  globalHiddenExpenseCategoryIds!: string[]

  /** Globally hidden income category ids (hidden everywhere) */
  @ApiProperty({ type: [String] })
  globalHiddenIncomeCategoryIds!: string[]

  /** Whether the advanced filters panel is expanded */
  isPanelExpanded!: boolean
}

import { ApiProperty } from '@nestjs/swagger'

export class FilterPreferencesDto {
  @ApiProperty({
    description:
      'List of hidden expense category names (dashboard filter only)',
    type: [String],
  })
  hiddenExpenseCategories!: string[]

  @ApiProperty({
    description: 'List of hidden income category names (dashboard filter only)',
    type: [String],
  })
  hiddenIncomeCategories!: string[]

  @ApiProperty({
    description:
      'List of globally hidden expense category names (hidden everywhere)',
    type: [String],
  })
  globalHiddenExpenseCategories!: string[]

  @ApiProperty({
    description:
      'List of globally hidden income category names (hidden everywhere)',
    type: [String],
  })
  globalHiddenIncomeCategories!: string[]

  @ApiProperty({
    description: 'Whether the advanced filters panel is expanded',
  })
  isPanelExpanded!: boolean
}

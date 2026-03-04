import { ApiProperty } from '@nestjs/swagger'
import { CategoryAssociationDto } from './update-filter-preferences.dto'

export class FilterPreferencesDto {
  @ApiProperty({
    description: 'List of joint account names (amounts will be divided by 2)',
    type: [String],
  })
  jointAccounts!: string[]

  @ApiProperty({
    description: 'List of hidden expense category names',
    type: [String],
  })
  hiddenExpenseCategories!: string[]

  @ApiProperty({
    description: 'List of hidden income category names',
    type: [String],
  })
  hiddenIncomeCategories!: string[]

  @ApiProperty({
    description: 'List of expense-to-income category associations',
    type: [CategoryAssociationDto],
  })
  categoryAssociations!: CategoryAssociationDto[]

  @ApiProperty({
    description: 'Whether the advanced filters panel is expanded',
  })
  isPanelExpanded!: boolean
}

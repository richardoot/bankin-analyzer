import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min } from 'class-validator'

export class StartImportDto {
  @ApiProperty({ description: 'Total transactions in the file' })
  @IsInt()
  @Min(0)
  totalInFile!: number

  @ApiProperty({
    required: false,
    description: 'Name of the imported file (optional)',
  })
  @IsOptional()
  @IsString()
  fileName?: string
}

import { IsInt, IsString, IsOptional, Min } from 'class-validator'

export class StartImportDto {
  /** Total transactions in the file */
  @IsInt()
  @Min(0)
  totalInFile!: number

  /** Name of the imported file (optional) */
  @IsOptional()
  @IsString()
  fileName?: string
}

import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateTagFamilyDto {
  /** Family name (unique per user), e.g. "Voyages" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string

  /** Optional display color (e.g. "#ef4444") */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string

  /** Optional icon identifier */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string

  /** Envelope for the whole family over a calendar year */
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBudget?: number
}

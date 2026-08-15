import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

export class UpdateTagDto {
  /** Tag name (unique per user) */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string

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

  /** Keep the tagged transactions out of the dashboard's everyday averages */
  @IsOptional()
  @IsBoolean()
  isExceptional?: boolean

  /** First day of the suspended period; explicit null clears it */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  eventStartDate?: string | null

  /** Last day of the suspended period; explicit null clears it */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  eventEndDate?: string | null

  /** Total envelope for this event; explicit null clears it */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  budgetAmount?: number | null
}

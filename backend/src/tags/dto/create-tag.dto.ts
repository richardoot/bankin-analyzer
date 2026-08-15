import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateTagDto {
  /** Tag name (unique per user) */
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

  /** Keep the tagged transactions out of the dashboard's everyday averages */
  @IsOptional()
  @IsBoolean()
  isExceptional?: boolean

  /** First day of the period during which everyday life is suspended */
  @IsOptional()
  @IsDateString()
  eventStartDate?: string

  /** Last day of the period during which everyday life is suspended */
  @IsOptional()
  @IsDateString()
  eventEndDate?: string

  /** Total envelope allocated to this event (not a monthly amount) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number
}

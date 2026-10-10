import {
  IsIn,
  ValidateIf,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

/** Which series a decision is about. */
export class RecurrenceDecisionKeyDto {
  /** The merchant, as a recurrence carries it (`merchantKey`) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  merchantKey!: string

  /** The series' amount bucket; omitted or null for every series of the merchant */
  @IsOptional()
  @IsInt()
  amountBucket?: number | null
}

export const RECURRENCE_PERIODS = [
  'WEEKLY',
  'FOUR_WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const

/** Mark one expense as a recurring charge, on the rhythm the user knows it has. */
export class MarkTransactionRecurringDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string

  @IsIn(RECURRENCE_PERIODS)
  period!: (typeof RECURRENCE_PERIODS)[number]
}

/** Name a series; an empty or null name goes back to the one read from its labels. */
export class RenameRecurrenceDto extends RecurrenceDecisionKeyDto {
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(60)
  name!: string | null
}

/** Attach an expense by hand to a series, named as decisions name it. */
export class LinkTransactionDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  merchantKey!: string

  @IsInt()
  amountBucket!: number
}

export class SetRecurrenceDecisionDto extends RecurrenceDecisionKeyDto {
  /** CONFIRMED: it is a recurring charge. DISMISSED: it is not. */
  @IsIn(['CONFIRMED', 'DISMISSED'])
  decision!: 'CONFIRMED' | 'DISMISSED'
}

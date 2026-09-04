import { ApiProperty } from '@nestjs/swagger'
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator'

export class StartAuthorizationDto {
  /** The bank, exactly as `GET /aspsps` names it. */
  @IsString()
  @MaxLength(200)
  aspspName!: string

  /** Two-letter country code. */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string

  /**
   * Where the bank sends the user back.
   *
   * Must already be registered in the Enable Banking Control Panel: the API
   * refuses any other, and its refusal names neither the offender nor the
   * allowed list.
   */
  @IsUrl({ require_tld: false, protocols: ['https'] })
  redirectUrl!: string
}

export class CompleteAuthorizationDto {
  /** The `code` query parameter the redirect carried. Single use. */
  @IsString()
  @MaxLength(200)
  code!: string
}

export class UpdateBankAccountLinkDto {
  /** The account here this bank account is. `null` unlinks it. */
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  accountId?: string | null

  /** Whether transactions are read from it. */
  @IsOptional()
  @IsBoolean()
  isIngested?: boolean
}

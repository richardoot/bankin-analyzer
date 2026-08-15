import { ArrayNotEmpty, IsArray, IsString } from 'class-validator'

export class AttachTransactionsDto {
  /** Transaction ids to attach to the tag */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  transactionIds!: string[]
}

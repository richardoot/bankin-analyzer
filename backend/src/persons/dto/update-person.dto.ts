import { IsEmail, IsOptional, IsString } from 'class-validator'

export class UpdatePersonDto {
  /** Person name */
  @IsOptional()
  @IsString()
  name?: string

  /** Person email */
  @IsOptional()
  @IsEmail()
  email?: string
}

import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreatePersonDto {
  /** Person name */
  @IsString()
  @IsNotEmpty()
  name!: string

  /** Person email */
  @IsOptional()
  @IsEmail()
  email?: string
}

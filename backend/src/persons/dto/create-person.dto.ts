import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreatePersonDto {
  @ApiProperty({ description: 'Person name' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiProperty({ description: 'Person email', required: false })
  @IsOptional()
  @IsEmail()
  email?: string
}

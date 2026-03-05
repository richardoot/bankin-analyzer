import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString } from 'class-validator'

export class UpdatePersonDto {
  @ApiProperty({ description: 'Person name', required: false })
  @IsOptional()
  @IsString()
  name?: string

  @ApiProperty({ description: 'Person email', required: false })
  @IsOptional()
  @IsEmail()
  email?: string
}

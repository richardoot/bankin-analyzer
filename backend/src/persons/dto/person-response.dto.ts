import { ApiProperty } from '@nestjs/swagger'

export class PersonResponseDto {
  @ApiProperty({ description: 'Person ID' })
  id!: string

  @ApiProperty({ description: 'Person name' })
  name!: string

  @ApiProperty({ description: 'Person email', nullable: true })
  email!: string | null

  @ApiProperty({ description: 'Creation date' })
  createdAt!: Date

  @ApiProperty({ description: 'Last update date' })
  updatedAt!: Date
}

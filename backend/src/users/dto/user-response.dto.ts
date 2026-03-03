import { ApiProperty } from '@nestjs/swagger'

export class UserResponseDto {
  @ApiProperty({
    description: "L'identifiant unique de l'utilisateur",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string

  @ApiProperty({
    description: "L'identifiant Supabase de l'utilisateur",
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  supabaseId!: string

  @ApiProperty({
    description: "L'adresse email de l'utilisateur",
    example: 'user@example.com',
  })
  email!: string

  @ApiProperty({
    description: 'Date de creation du compte',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt!: Date

  @ApiProperty({
    description: 'Date de derniere mise a jour',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt!: Date
}

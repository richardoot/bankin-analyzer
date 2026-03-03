import { ApiProperty } from '@nestjs/swagger'

export class CreateUserDto {
  @ApiProperty({
    description: "L'identifiant Supabase de l'utilisateur",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  supabaseId!: string

  @ApiProperty({
    description: "L'adresse email de l'utilisateur",
    example: 'user@example.com',
  })
  email!: string
}

export class UserResponseDto {
  /** L'identifiant unique de l'utilisateur */
  id!: string

  /** L'identifiant Supabase de l'utilisateur */
  supabaseId!: string

  /** L'adresse email de l'utilisateur */
  email!: string

  /** Date de creation du compte */
  createdAt!: Date

  /** Date de derniere mise a jour */
  updatedAt!: Date
}

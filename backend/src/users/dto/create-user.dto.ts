export class CreateUserDto {
  /** L'identifiant Supabase de l'utilisateur */
  supabaseId!: string

  /** L'adresse email de l'utilisateur */
  email!: string
}

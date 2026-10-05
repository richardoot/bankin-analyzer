import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseService } from '../auth/supabase.service'
import { CategoryCatalogService } from '../categories/category-catalog.service'
import type { CreateUserDto } from './dto'
import { Prisma } from '../generated/prisma'
import type { User } from '../generated/prisma'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly categoryCatalog: CategoryCatalogService
  ) {}

  /**
   * One user by id, for `delete()` to resolve the supabaseId it must also
   * remove. Not reachable over HTTP: no route reads a user other than the
   * caller's own.
   */
  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`)
    }

    return user
  }

  async findBySupabaseId(supabaseId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { supabaseId },
    })
  }

  /**
   * A user row, and the catalogue with it: a brand-new user must be able to
   * file their first transaction without ever creating a category. Two
   * steps rather than one transaction, on purpose — the row must exist
   * before the concurrent boot requests (see below) can find it, and a
   * catalogue left half-provisioned by a crash is repaired by the next
   * `ensureCatalog`, which is idempotent.
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        supabaseId: createUserDto.supabaseId,
        email: createUserDto.email,
      },
    })
    await this.categoryCatalog.ensureCatalog(user.id)
    return user
  }

  /**
   * The row for a Supabase identity, created the first time it is seen.
   *
   * Two requests of a brand-new user can arrive at once — the frontend
   * fans out on boot — so both may miss the read and both try to insert.
   * The loser hits the unique constraint on supabaseId: re-read instead
   * of failing its request. A conflict that the re-read does not resolve
   * is the email being unique too, and already owned by another identity;
   * that one is real and surfaces.
   */
  async findOrCreateBySupabaseId(
    supabaseId: string,
    email: string
  ): Promise<User> {
    const existing = await this.findBySupabaseId(supabaseId)
    if (existing) return existing

    try {
      return await this.create({ supabaseId, email })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const winner = await this.findBySupabaseId(supabaseId)
      if (!winner) throw err
      return winner
    }
  }

  async delete(id: string): Promise<User> {
    const user = await this.findOne(id)

    // Delete from Supabase Auth first
    await this.supabaseService.deleteUser(user.supabaseId)

    // Then delete from PostgreSQL
    return this.prisma.user.delete({
      where: { id: user.id },
    })
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

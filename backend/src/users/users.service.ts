import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseService } from '../auth/supabase.service'
import type { CreateUserDto } from './dto'
import type { User } from '../generated/prisma'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService
  ) {}

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

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

  async create(createUserDto: CreateUserDto): Promise<User> {
    return this.prisma.user.create({
      data: {
        supabaseId: createUserDto.supabaseId,
        email: createUserDto.email,
      },
    })
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

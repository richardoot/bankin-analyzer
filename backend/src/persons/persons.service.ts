import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Person } from '../generated/prisma'
import type { CreatePersonDto, UpdatePersonDto } from './dto'

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string): Promise<Person[]> {
    return this.prisma.person.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: string, userId: string): Promise<Person> {
    const person = await this.prisma.person.findFirst({
      where: { id, userId },
    })

    if (!person) {
      throw new NotFoundException(`Person with ID ${id} not found`)
    }

    return person
  }

  async create(userId: string, dto: CreatePersonDto): Promise<Person> {
    return this.prisma.person.create({
      data: {
        userId,
        name: dto.name,
        email: dto.email ?? null,
      },
    })
  }

  async update(
    id: string,
    userId: string,
    dto: UpdatePersonDto
  ): Promise<Person> {
    // Verify person exists and belongs to user
    await this.findOne(id, userId)

    return this.prisma.person.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
    })
  }

  async delete(id: string, userId: string): Promise<void> {
    // Verify person exists and belongs to user
    await this.findOne(id, userId)

    await this.prisma.person.delete({
      where: { id },
    })
  }
}

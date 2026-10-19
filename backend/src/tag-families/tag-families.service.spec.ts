import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { TagFamiliesService } from './tag-families.service'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../generated/prisma'

const USER = 'user-1'

const family = {
  id: 'fam-1',
  userId: USER,
  name: 'Voyages',
  color: '#22c55e',
  icon: null,
  annualBudget: null,
  createdAt: new Date('2026-10-19T00:00:00.000Z'),
  updatedAt: new Date('2026-10-19T00:00:00.000Z'),
}

const WITH_TAG_COUNT = { _count: { select: { tags: true } } }

const prisma = {
  tagFamily: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  tag: {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}

const duplicate = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  })

describe('TagFamiliesService', () => {
  let service: TagFamiliesService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TagFamiliesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    service = module.get(TagFamiliesService)
    vi.resetAllMocks()
  })

  describe('findAllByUser', () => {
    it('lists the user’s families by name, each with its tag count', async () => {
      prisma.tagFamily.findMany.mockResolvedValue([
        {
          ...family,
          annualBudget: new Prisma.Decimal('4000.00'),
          _count: { tags: 3 },
        },
      ])

      const result = await service.findAllByUser(USER)

      expect(prisma.tagFamily.findMany).toHaveBeenCalledWith({
        where: { userId: USER },
        include: WITH_TAG_COUNT,
        orderBy: { name: 'asc' },
      })
      expect(result).toEqual([
        {
          id: 'fam-1',
          name: 'Voyages',
          color: '#22c55e',
          icon: null,
          annualBudget: 4000,
          tagCount: 3,
          createdAt: family.createdAt,
          updatedAt: family.updatedAt,
        },
      ])
    })
  })

  describe('create', () => {
    it('creates a family under the user, its name trimmed', async () => {
      prisma.tagFamily.create.mockResolvedValue({
        ...family,
        _count: { tags: 0 },
      })

      const result = await service.create(USER, {
        name: '  Voyages ',
        color: '#22c55e',
      })

      expect(prisma.tagFamily.create).toHaveBeenCalledWith({
        data: {
          userId: USER,
          name: 'Voyages',
          color: '#22c55e',
          icon: null,
          annualBudget: null,
        },
        include: WITH_TAG_COUNT,
      })
      expect(result.tagCount).toBe(0)
      expect(result.annualBudget).toBeNull()
    })

    it('refuses a name the user already gave a family with a 409', async () => {
      prisma.tagFamily.create.mockRejectedValue(duplicate())

      await expect(service.create(USER, { name: 'Voyages' })).rejects.toThrow(
        ConflictException
      )
    })
  })

  describe('update', () => {
    it('renames and recolours one of the user’s families', async () => {
      prisma.tagFamily.findFirst.mockResolvedValue({ id: 'fam-1' })
      prisma.tagFamily.update.mockResolvedValue({
        ...family,
        name: 'Vacances',
        color: '#6366f1',
        _count: { tags: 2 },
      })

      const result = await service.update('fam-1', USER, {
        name: 'Vacances',
        color: '#6366f1',
      })

      expect(prisma.tagFamily.update).toHaveBeenCalledWith({
        where: { id: 'fam-1' },
        data: { name: 'Vacances', color: '#6366f1' },
        include: WITH_TAG_COUNT,
      })
      expect(result.name).toBe('Vacances')
    })

    it('answers 404 for another user’s family, writing nothing', async () => {
      prisma.tagFamily.findFirst.mockResolvedValue(null)

      await expect(
        service.update('fam-1', 'someone-else', { name: 'Mine now' })
      ).rejects.toThrow(NotFoundException)
      expect(prisma.tagFamily.findFirst).toHaveBeenCalledWith({
        where: { id: 'fam-1', userId: 'someone-else' },
        select: { id: true },
      })
      expect(prisma.tagFamily.update).not.toHaveBeenCalled()
    })

    it('refuses a rename onto another family’s name with a 409', async () => {
      prisma.tagFamily.findFirst.mockResolvedValue({ id: 'fam-1' })
      prisma.tagFamily.update.mockRejectedValue(duplicate())

      await expect(
        service.update('fam-1', USER, { name: 'Compétitions' })
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('delete', () => {
    it('deletes the family alone: its tags are left to the foreign key', async () => {
      prisma.tagFamily.findFirst.mockResolvedValue({ id: 'fam-1' })
      prisma.tagFamily.delete.mockResolvedValue(family)

      await service.delete('fam-1', USER)

      expect(prisma.tagFamily.delete).toHaveBeenCalledWith({
        where: { id: 'fam-1' },
      })
      // ON DELETE SET NULL orphans them; nothing here deletes or rewrites a
      // tag (the e2e spec checks the column against a real database).
      expect(prisma.tag.deleteMany).not.toHaveBeenCalled()
      expect(prisma.tag.updateMany).not.toHaveBeenCalled()
    })

    it('answers 404 for another user’s family, deleting nothing', async () => {
      prisma.tagFamily.findFirst.mockResolvedValue(null)

      await expect(service.delete('fam-1', 'someone-else')).rejects.toThrow(
        NotFoundException
      )
      expect(prisma.tagFamily.delete).not.toHaveBeenCalled()
    })
  })
})

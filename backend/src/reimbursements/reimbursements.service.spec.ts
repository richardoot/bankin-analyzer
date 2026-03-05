import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { Decimal } from 'decimal.js'
import { ReimbursementsService } from './reimbursements.service'
import { PrismaService } from '../prisma/prisma.service'
import { ReimbursementStatus } from '../generated/prisma'

const mockUserId = '550e8400-e29b-41d4-a716-446655440001'

const mockPerson = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Alice Martin',
}

const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  name: 'Remboursement Santé',
}

const mockTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  userId: mockUserId,
  date: new Date('2024-01-15'),
  description: 'Pharmacie',
  amount: new Decimal(-50),
}

const mockReimbursement = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: mockUserId,
  transactionId: mockTransaction.id,
  personId: mockPerson.id,
  categoryId: mockCategory.id,
  amount: new Decimal(30),
  amountReceived: new Decimal(0),
  status: ReimbursementStatus.PENDING,
  note: 'Test note',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
  person: mockPerson,
  category: mockCategory,
}

const mockReimbursementPartial = {
  ...mockReimbursement,
  id: '550e8400-e29b-41d4-a716-446655440002',
  amountReceived: new Decimal(15),
  status: ReimbursementStatus.PARTIAL,
}

const mockPrismaService = {
  reimbursementRequest: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    findFirst: vi.fn(),
  },
  person: {
    findFirst: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
  },
}

describe('ReimbursementsService', () => {
  let service: ReimbursementsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReimbursementsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile()

    service = module.get<ReimbursementsService>(ReimbursementsService)

    vi.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('should return all reimbursements for a user', async () => {
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])

      const result = await service.findAllByUser(mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockReimbursement.id)
      expect(result[0].personName).toBe(mockPerson.name)
      expect(result[0].amount).toBe(30)
      expect(result[0].amountReceived).toBe(0)
      expect(result[0].amountRemaining).toBe(30)
    })

    it('should filter by status', async () => {
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursementPartial,
      ])

      const result = await service.findAllByUser(mockUserId, {
        status: ReimbursementStatus.PARTIAL,
      })

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe(ReimbursementStatus.PARTIAL)
      expect(
        mockPrismaService.reimbursementRequest.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, status: ReimbursementStatus.PARTIAL },
        })
      )
    })

    it('should return empty array when no reimbursements', async () => {
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-without-reimbursements')

      expect(result).toEqual([])
    })
  })

  describe('findByTransaction', () => {
    it('should return reimbursements for a transaction', async () => {
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        mockReimbursement,
      ])

      const result = await service.findByTransaction(
        mockTransaction.id,
        mockUserId
      )

      expect(result).toHaveLength(1)
      expect(result[0].transactionId).toBe(mockTransaction.id)
    })
  })

  describe('findByPerson', () => {
    it('should return reimbursements for a person', async () => {
      const reimbursementWithTransaction = {
        ...mockReimbursement,
        transaction: mockTransaction,
      }
      mockPrismaService.reimbursementRequest.findMany.mockResolvedValue([
        reimbursementWithTransaction,
      ])

      const result = await service.findByPerson(mockPerson.id, mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0].personId).toBe(mockPerson.id)
      expect(result[0].transaction).toBeDefined()
    })
  })

  describe('findOne', () => {
    it('should return a reimbursement by id', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursement
      )

      const result = await service.findOne(mockReimbursement.id, mockUserId)

      expect(result.id).toBe(mockReimbursement.id)
      expect(result.personName).toBe(mockPerson.name)
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(null)

      await expect(
        service.findOne('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('create', () => {
    it('should create a new reimbursement', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.category.findFirst.mockResolvedValue(mockCategory)
      mockPrismaService.reimbursementRequest.create.mockResolvedValue(
        mockReimbursement
      )

      const result = await service.create(mockUserId, {
        transactionId: mockTransaction.id,
        personId: mockPerson.id,
        amount: 30,
        categoryId: mockCategory.id,
        note: 'Test note',
      })

      expect(result.id).toBe(mockReimbursement.id)
      expect(
        mockPrismaService.reimbursementRequest.create
      ).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          transactionId: mockTransaction.id,
          personId: mockPerson.id,
          categoryId: mockCategory.id,
          amount: 30,
          note: 'Test note',
        },
        include: {
          person: { select: { name: true } },
          category: { select: { name: true } },
        },
      })
    })

    it('should throw NotFoundException when transaction not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null)

      await expect(
        service.create(mockUserId, {
          transactionId: 'non-existent',
          personId: mockPerson.id,
          amount: 30,
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when person not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.person.findFirst.mockResolvedValue(null)

      await expect(
        service.create(mockUserId, {
          transactionId: mockTransaction.id,
          personId: 'non-existent',
          amount: 30,
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when category not found', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTransaction)
      mockPrismaService.person.findFirst.mockResolvedValue(mockPerson)
      mockPrismaService.category.findFirst.mockResolvedValue(null)

      await expect(
        service.create(mockUserId, {
          transactionId: mockTransaction.id,
          personId: mockPerson.id,
          amount: 30,
          categoryId: 'non-existent',
        })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('should update a reimbursement', async () => {
      const updatedReimbursement = {
        ...mockReimbursement,
        note: 'Updated note',
      }
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursement
      )
      mockPrismaService.reimbursementRequest.update.mockResolvedValue(
        updatedReimbursement
      )

      const result = await service.update(mockReimbursement.id, mockUserId, {
        note: 'Updated note',
      })

      expect(result.note).toBe('Updated note')
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(null)

      await expect(
        service.update('non-existent-id', mockUserId, { note: 'Test' })
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('receivePayment', () => {
    it('should update amountReceived and status to PARTIAL', async () => {
      const partialReimbursement = {
        ...mockReimbursement,
        amountReceived: new Decimal(15),
        status: ReimbursementStatus.PARTIAL,
      }
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursement
      )
      mockPrismaService.reimbursementRequest.update.mockResolvedValue(
        partialReimbursement
      )

      const result = await service.receivePayment(
        mockReimbursement.id,
        mockUserId,
        15
      )

      expect(result.amountReceived).toBe(15)
      expect(result.status).toBe(ReimbursementStatus.PARTIAL)
      expect(
        mockPrismaService.reimbursementRequest.update
      ).toHaveBeenCalledWith({
        where: { id: mockReimbursement.id },
        data: {
          amountReceived: 15,
          status: ReimbursementStatus.PARTIAL,
        },
        include: {
          person: { select: { name: true } },
          category: { select: { name: true } },
        },
      })
    })

    it('should update status to COMPLETED when fully paid', async () => {
      const completedReimbursement = {
        ...mockReimbursement,
        amountReceived: new Decimal(30),
        status: ReimbursementStatus.COMPLETED,
      }
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursement
      )
      mockPrismaService.reimbursementRequest.update.mockResolvedValue(
        completedReimbursement
      )

      const result = await service.receivePayment(
        mockReimbursement.id,
        mockUserId,
        30
      )

      expect(result.amountReceived).toBe(30)
      expect(result.status).toBe(ReimbursementStatus.COMPLETED)
    })

    it('should accumulate payments', async () => {
      const completedReimbursement = {
        ...mockReimbursementPartial,
        amountReceived: new Decimal(30),
        status: ReimbursementStatus.COMPLETED,
      }
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursementPartial
      )
      mockPrismaService.reimbursementRequest.update.mockResolvedValue(
        completedReimbursement
      )

      const result = await service.receivePayment(
        mockReimbursementPartial.id,
        mockUserId,
        15
      )

      expect(result.amountReceived).toBe(30)
      expect(result.status).toBe(ReimbursementStatus.COMPLETED)
      expect(
        mockPrismaService.reimbursementRequest.update
      ).toHaveBeenCalledWith({
        where: { id: mockReimbursementPartial.id },
        data: {
          amountReceived: 30, // 15 (existing) + 15 (new)
          status: ReimbursementStatus.COMPLETED,
        },
        include: {
          person: { select: { name: true } },
          category: { select: { name: true } },
        },
      })
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(null)

      await expect(
        service.receivePayment('non-existent-id', mockUserId, 10)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    it('should delete a reimbursement', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(
        mockReimbursement
      )
      mockPrismaService.reimbursementRequest.delete.mockResolvedValue(
        mockReimbursement
      )

      await service.delete(mockReimbursement.id, mockUserId)

      expect(
        mockPrismaService.reimbursementRequest.delete
      ).toHaveBeenCalledWith({
        where: { id: mockReimbursement.id },
      })
    })

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.reimbursementRequest.findFirst.mockResolvedValue(null)

      await expect(
        service.delete('non-existent-id', mockUserId)
      ).rejects.toThrow(NotFoundException)
    })
  })
})

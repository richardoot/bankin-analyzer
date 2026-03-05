import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { ReimbursementsController } from './reimbursements.controller'
import { ReimbursementsService } from './reimbursements.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { ReimbursementStatus } from '../generated/prisma'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockReimbursementResponse = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  transactionId: '550e8400-e29b-41d4-a716-446655440030',
  personId: '550e8400-e29b-41d4-a716-446655440010',
  personName: 'Alice Martin',
  categoryId: '550e8400-e29b-41d4-a716-446655440020',
  categoryName: 'Remboursement Santé',
  amount: 30,
  amountReceived: 0,
  amountRemaining: 30,
  status: ReimbursementStatus.PENDING,
  note: 'Test note',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockReimbursementPartial = {
  ...mockReimbursementResponse,
  id: '550e8400-e29b-41d4-a716-446655440002',
  amountReceived: 15,
  amountRemaining: 15,
  status: ReimbursementStatus.PARTIAL,
}

const mockReimbursementsService = {
  findAllByUser: vi.fn(),
  findByTransaction: vi.fn(),
  findByPerson: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  receivePayment: vi.fn(),
  delete: vi.fn(),
}

describe('ReimbursementsController', () => {
  let controller: ReimbursementsController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReimbursementsController],
      providers: [
        {
          provide: ReimbursementsService,
          useValue: mockReimbursementsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<ReimbursementsController>(ReimbursementsController)
  })

  describe('findAll', () => {
    it('should return all reimbursements for current user', async () => {
      mockReimbursementsService.findAllByUser.mockResolvedValue([
        mockReimbursementResponse,
      ])

      const result = await controller.findAll(mockUser)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockReimbursementResponse.id)
      expect(mockReimbursementsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        { includeTransaction: false }
      )
    })

    it('should filter by status', async () => {
      mockReimbursementsService.findAllByUser.mockResolvedValue([
        mockReimbursementPartial,
      ])

      const result = await controller.findAll(
        mockUser,
        ReimbursementStatus.PARTIAL
      )

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe(ReimbursementStatus.PARTIAL)
      expect(mockReimbursementsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        { status: ReimbursementStatus.PARTIAL, includeTransaction: false }
      )
    })

    it('should include transaction when requested', async () => {
      mockReimbursementsService.findAllByUser.mockResolvedValue([
        mockReimbursementResponse,
      ])

      await controller.findAll(mockUser, undefined, 'true')

      expect(mockReimbursementsService.findAllByUser).toHaveBeenCalledWith(
        mockUser.id,
        { includeTransaction: true }
      )
    })

    it('should return empty array when no reimbursements', async () => {
      mockReimbursementsService.findAllByUser.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
    })
  })

  describe('findByTransaction', () => {
    it('should return reimbursements for a transaction', async () => {
      mockReimbursementsService.findByTransaction.mockResolvedValue([
        mockReimbursementResponse,
      ])

      const result = await controller.findByTransaction(
        mockUser,
        mockReimbursementResponse.transactionId
      )

      expect(result).toHaveLength(1)
      expect(mockReimbursementsService.findByTransaction).toHaveBeenCalledWith(
        mockReimbursementResponse.transactionId,
        mockUser.id
      )
    })
  })

  describe('findByPerson', () => {
    it('should return reimbursements for a person', async () => {
      mockReimbursementsService.findByPerson.mockResolvedValue([
        mockReimbursementResponse,
      ])

      const result = await controller.findByPerson(
        mockUser,
        mockReimbursementResponse.personId
      )

      expect(result).toHaveLength(1)
      expect(mockReimbursementsService.findByPerson).toHaveBeenCalledWith(
        mockReimbursementResponse.personId,
        mockUser.id
      )
    })
  })

  describe('findOne', () => {
    it('should return a reimbursement by id', async () => {
      mockReimbursementsService.findOne.mockResolvedValue(
        mockReimbursementResponse
      )

      const result = await controller.findOne(
        mockUser,
        mockReimbursementResponse.id
      )

      expect(result.id).toBe(mockReimbursementResponse.id)
      expect(mockReimbursementsService.findOne).toHaveBeenCalledWith(
        mockReimbursementResponse.id,
        mockUser.id,
        false
      )
    })

    it('should include transaction when requested', async () => {
      mockReimbursementsService.findOne.mockResolvedValue(
        mockReimbursementResponse
      )

      await controller.findOne(mockUser, mockReimbursementResponse.id, 'true')

      expect(mockReimbursementsService.findOne).toHaveBeenCalledWith(
        mockReimbursementResponse.id,
        mockUser.id,
        true
      )
    })
  })

  describe('create', () => {
    it('should create a new reimbursement', async () => {
      const createDto = {
        transactionId: mockReimbursementResponse.transactionId,
        personId: mockReimbursementResponse.personId,
        amount: 30,
        categoryId: mockReimbursementResponse.categoryId!,
        note: 'Test note',
      }
      mockReimbursementsService.create.mockResolvedValue(
        mockReimbursementResponse
      )

      const result = await controller.create(mockUser, createDto)

      expect(result.id).toBe(mockReimbursementResponse.id)
      expect(mockReimbursementsService.create).toHaveBeenCalledWith(
        mockUser.id,
        createDto
      )
    })
  })

  describe('update', () => {
    it('should update a reimbursement', async () => {
      const updateDto = { note: 'Updated note' }
      const updatedReimbursement = {
        ...mockReimbursementResponse,
        note: 'Updated note',
      }
      mockReimbursementsService.update.mockResolvedValue(updatedReimbursement)

      const result = await controller.update(
        mockUser,
        mockReimbursementResponse.id,
        updateDto
      )

      expect(result.note).toBe('Updated note')
      expect(mockReimbursementsService.update).toHaveBeenCalledWith(
        mockReimbursementResponse.id,
        mockUser.id,
        updateDto
      )
    })
  })

  describe('receivePayment', () => {
    it('should record a payment received', async () => {
      const completedReimbursement = {
        ...mockReimbursementResponse,
        amountReceived: 30,
        amountRemaining: 0,
        status: ReimbursementStatus.COMPLETED,
      }
      mockReimbursementsService.receivePayment.mockResolvedValue(
        completedReimbursement
      )

      const result = await controller.receivePayment(
        mockUser,
        mockReimbursementResponse.id,
        { amount: 30 }
      )

      expect(result.amountReceived).toBe(30)
      expect(result.status).toBe(ReimbursementStatus.COMPLETED)
      expect(mockReimbursementsService.receivePayment).toHaveBeenCalledWith(
        mockReimbursementResponse.id,
        mockUser.id,
        30
      )
    })
  })

  describe('delete', () => {
    it('should delete a reimbursement', async () => {
      mockReimbursementsService.delete.mockResolvedValue(undefined)

      await controller.delete(mockUser, mockReimbursementResponse.id)

      expect(mockReimbursementsService.delete).toHaveBeenCalledWith(
        mockReimbursementResponse.id,
        mockUser.id
      )
    })
  })
})

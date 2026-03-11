import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { SettlementsController } from './settlements.controller'
import { SettlementsService } from './settlements.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  supabaseId: 'supabase-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: new Date('2024-01-15T10:30:00.000Z'),
}

const mockSettlementResponse = {
  id: '550e8400-e29b-41d4-a716-446655440050',
  personId: '550e8400-e29b-41d4-a716-446655440010',
  personName: 'Alice Martin',
  incomeTransactionId: '550e8400-e29b-41d4-a716-446655440030',
  incomeTransactionDescription: 'Virement Alice',
  incomeTransactionDate: new Date('2024-01-20'),
  incomeTransactionAmount: 200,
  amountUsed: 80,
  note: null,
  createdAt: new Date('2024-01-20T14:00:00.000Z'),
  reimbursements: [
    {
      reimbursementId: '550e8400-e29b-41d4-a716-446655440040',
      transactionId: '550e8400-e29b-41d4-a716-446655440031',
      transactionDescription: 'Courses Carrefour',
      transactionDate: new Date('2024-01-15'),
      categoryId: '550e8400-e29b-41d4-a716-446655440020',
      categoryName: 'Alimentation',
      originalAmount: 80,
      amountSettled: 80,
    },
  ],
}

const mockAvailableAmount = {
  transactionId: '550e8400-e29b-41d4-a716-446655440030',
  totalAmount: 200,
  usedAmount: 80,
  availableAmount: 120,
}

const mockSettlementsService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
  getAvailableAmount: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}

describe('SettlementsController', () => {
  let controller: SettlementsController

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementsController],
      providers: [
        {
          provide: SettlementsService,
          useValue: mockSettlementsService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<SettlementsController>(SettlementsController)
  })

  describe('findAll', () => {
    it('should return all settlements for current user', async () => {
      mockSettlementsService.findAll.mockResolvedValue([mockSettlementResponse])

      const result = await controller.findAll(mockUser)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockSettlementResponse.id)
      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        mockUser.id,
        undefined
      )
    })

    it('should filter by personId', async () => {
      mockSettlementsService.findAll.mockResolvedValue([mockSettlementResponse])

      const result = await controller.findAll(
        mockUser,
        mockSettlementResponse.personId
      )

      expect(result).toHaveLength(1)
      expect(mockSettlementsService.findAll).toHaveBeenCalledWith(
        mockUser.id,
        mockSettlementResponse.personId
      )
    })

    it('should return empty array when no settlements', async () => {
      mockSettlementsService.findAll.mockResolvedValue([])

      const result = await controller.findAll(mockUser)

      expect(result).toEqual([])
    })
  })

  describe('findOne', () => {
    it('should return a settlement by id', async () => {
      mockSettlementsService.findOne.mockResolvedValue(mockSettlementResponse)

      const result = await controller.findOne(
        mockUser,
        mockSettlementResponse.id
      )

      expect(result.id).toBe(mockSettlementResponse.id)
      expect(result.personName).toBe(mockSettlementResponse.personName)
      expect(mockSettlementsService.findOne).toHaveBeenCalledWith(
        mockSettlementResponse.id,
        mockUser.id
      )
    })
  })

  describe('getAvailableAmount', () => {
    it('should return available amount for income transaction', async () => {
      mockSettlementsService.getAvailableAmount.mockResolvedValue(
        mockAvailableAmount
      )

      const result = await controller.getAvailableAmount(
        mockUser,
        mockAvailableAmount.transactionId
      )

      expect(result.totalAmount).toBe(200)
      expect(result.usedAmount).toBe(80)
      expect(result.availableAmount).toBe(120)
      expect(mockSettlementsService.getAvailableAmount).toHaveBeenCalledWith(
        mockAvailableAmount.transactionId,
        mockUser.id
      )
    })
  })

  describe('create', () => {
    it('should create a new settlement', async () => {
      const createDto = {
        personId: mockSettlementResponse.personId,
        incomeTransactionId: mockSettlementResponse.incomeTransactionId,
        reimbursements: [
          {
            reimbursementId: '550e8400-e29b-41d4-a716-446655440040',
            amountSettled: 80,
          },
        ],
      }
      mockSettlementsService.create.mockResolvedValue(mockSettlementResponse)

      const result = await controller.create(mockUser, createDto)

      expect(result.id).toBe(mockSettlementResponse.id)
      expect(result.amountUsed).toBe(80)
      expect(mockSettlementsService.create).toHaveBeenCalledWith(
        mockUser.id,
        createDto
      )
    })
  })

  describe('delete', () => {
    it('should delete a settlement', async () => {
      mockSettlementsService.delete.mockResolvedValue(undefined)

      await controller.delete(mockUser, mockSettlementResponse.id)

      expect(mockSettlementsService.delete).toHaveBeenCalledWith(
        mockSettlementResponse.id,
        mockUser.id
      )
    })
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ImportHistoriesController } from './import-histories.controller'
import { ImportHistoriesService } from './import-histories.service'
import { SupabaseGuard } from '../auth'
import { ImportStatus } from '../generated/prisma'
import type { User } from '../generated/prisma'

const user = { id: '550e8400-e29b-41d4-a716-446655440001' } as User

const history = {
  id: '550e8400-e29b-41d4-a716-446655440100',
  userId: user.id,
  status: ImportStatus.COMPLETED,
  transactionsImported: 10,
  categoriesCreated: 0,
  duplicatesSkipped: 1,
  totalInFile: 11,
  dateRangeStart: new Date('2024-01-01'),
  dateRangeEnd: new Date('2024-01-31'),
  fileName: 'export.csv',
  createdAt: new Date('2024-02-01'),
  accounts: ['Compte Courant'],
}

const service = {
  findById: vi.fn(),
  finalizeImport: vi.fn(),
}

describe('ImportHistoriesController', () => {
  let controller: ImportHistoriesController

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportHistoriesController],
      providers: [{ provide: ImportHistoriesService, useValue: service }],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(ImportHistoriesController)
  })

  describe('findOne', () => {
    it('returns the import of the current user, with its accounts', async () => {
      service.findById.mockResolvedValue(history)

      const result = await controller.findOne(user, history.id)

      expect(service.findById).toHaveBeenCalledWith(history.id, user.id)
      expect(result).toEqual(history)
    })

    it('answers 404 when the import is not this user’s, or not at all', async () => {
      service.findById.mockResolvedValue(null)

      await expect(controller.findOne(user, 'nope')).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('finalizeImport', () => {
    it('no longer needs a categoriesCreated figure from the client', async () => {
      service.finalizeImport.mockResolvedValue(history)

      await controller.finalizeImport(user, history.id, {
        transactionsImported: 10,
        duplicatesSkipped: 1,
        dateRangeStart: '2024-01-01',
        dateRangeEnd: '2024-01-31',
      })

      expect(service.finalizeImport).toHaveBeenCalledWith(
        history.id,
        user.id,
        expect.objectContaining({
          transactionsImported: 10,
          categoriesCreated: undefined,
        })
      )
    })
  })
})

import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { DashboardSummaryDto } from './dto'
import type { User } from '../generated/prisma'

describe('DashboardController', () => {
  let controller: DashboardController
  let service: DashboardService

  const mockUser: User = {
    id: 'user-123',
    supabaseId: 'supabase-123',
    email: 'test@test.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSummary: DashboardSummaryDto = {
    monthlyData: [
      { month: '2024-01', label: 'Jan 2024', expenses: 500, income: 2500 },
    ],
    expensesByCategory: [{ category: 'Alimentation', amount: 300 }],
    incomeByCategory: [{ category: 'Salaire', amount: 2500 }],
    totalExpenses: 500,
    totalIncome: 2500,
    allExpenseCategories: ['Alimentation', 'Transport'],
    allIncomeCategories: ['Salaire'],
    availableAccounts: ['Compte Courant'],
  }

  const mockDashboardService = {
    getSummary: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
      ],
    })
      .overrideGuard(SupabaseGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<DashboardController>(DashboardController)
    service = module.get<DashboardService>(DashboardService)
  })

  describe('getSummary', () => {
    it('should call service with user id and empty filters', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const result = await controller.getSummary(mockUser, {})

      expect(service.getSummary).toHaveBeenCalledWith(mockUser.id, {})
      expect(result).toEqual(mockSummary)
    })

    it('should pass joint accounts filter to service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const filters = {
        jointAccounts: ['Compte Joint'],
      }

      await controller.getSummary(mockUser, filters)

      expect(service.getSummary).toHaveBeenCalledWith(mockUser.id, filters)
    })

    it('should pass hidden categories filters to service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const filters = {
        hiddenExpenseCategories: ['Loisirs'],
        hiddenIncomeCategories: ['Prime'],
      }

      await controller.getSummary(mockUser, filters)

      expect(service.getSummary).toHaveBeenCalledWith(mockUser.id, filters)
    })

    it('should pass category associations to service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const filters = {
        categoryAssociations: [
          { expenseCategory: 'Santé', incomeCategory: 'Remboursement' },
        ],
      }

      await controller.getSummary(mockUser, filters)

      expect(service.getSummary).toHaveBeenCalledWith(mockUser.id, filters)
    })

    it('should pass all filters to service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const filters = {
        jointAccounts: ['Compte Joint'],
        hiddenExpenseCategories: ['Loisirs'],
        hiddenIncomeCategories: ['Prime'],
        categoryAssociations: [
          { expenseCategory: 'Santé', incomeCategory: 'Remboursement' },
        ],
      }

      await controller.getSummary(mockUser, filters)

      expect(service.getSummary).toHaveBeenCalledWith(mockUser.id, filters)
    })

    it('should return the summary from service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const result = await controller.getSummary(mockUser, {})

      expect(result).toEqual(mockSummary)
      expect(result.monthlyData).toHaveLength(1)
      expect(result.totalExpenses).toBe(500)
      expect(result.totalIncome).toBe(2500)
    })
  })
})

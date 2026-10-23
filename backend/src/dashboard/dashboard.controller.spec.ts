import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ValidationPipe } from '@nestjs/common'
import type { ArgumentMetadata } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { DashboardMonthQueryDto } from './dto'
import type { DashboardMonthDto, DashboardSummaryDto } from './dto'
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
    getMonth: vi.fn(),
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

    it('should pass all filters to service', async () => {
      mockDashboardService.getSummary.mockResolvedValue(mockSummary)

      const filters = {
        jointAccounts: ['Compte Joint'],
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
  describe('getMonth', () => {
    const month: DashboardMonthDto = {
      month: '2026-10',
      asOfDay: 23,
      daysInMonth: 31,
      spent: 1200,
      spentSeries: [1500, 1600, 1550, 1700, 1650, 1600, 1200],
      habit: 1600,
      habitToDate: 1187.1,
      habitMonths: 6,
      incomeReceived: 2500,
      incomeExpected: 2500,
      incomeSeries: [2500, 2500, 2500, 2500, 2500, 2500],
      upcoming: [],
      upcomingTotal: 0,
      remainingToLive: 1300,
      remainingShare: 0.52,
    }

    it('reads the month with the parameters given, and none by default', async () => {
      mockDashboardService.getMonth.mockResolvedValue(month)

      await expect(controller.getMonth(mockUser, {})).resolves.toEqual(month)
      expect(service.getMonth).toHaveBeenCalledWith(mockUser.id, {})

      const query = {
        reading: 'real' as const,
        deductReimbursements: false,
        deductPendingReimbursements: true,
        asOf: '2026-10-23',
      }
      await controller.getMonth(mockUser, query)
      expect(service.getMonth).toHaveBeenLastCalledWith(mockUser.id, query)
    })

    describe('query validation', () => {
      // The global pipe, as main.ts configures it.
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
      const metadata: ArgumentMetadata = {
        type: 'query',
        metatype: DashboardMonthQueryDto,
      }
      const validate = (query: Record<string, string>): Promise<unknown> =>
        pipe.transform(query, metadata)

      it('reads a query string into typed parameters', async () => {
        await expect(
          validate({
            reading: 'everyday',
            deductReimbursements: 'false',
            deductPendingReimbursements: 'true',
            asOf: '2026-10-23',
          })
        ).resolves.toEqual({
          reading: 'everyday',
          deductReimbursements: false,
          deductPendingReimbursements: true,
          asOf: '2026-10-23',
        })
      })

      it("accepts no parameter: the defaults are the service's", async () => {
        await expect(validate({})).resolves.toEqual({})
      })

      const refused: Array<Record<string, string>> = [
        { reading: 'weekly' },
        { deductReimbursements: 'yes' },
        { deductPendingReimbursements: '1' },
        { asOf: '2026-10' },
        { asOf: '2026-02-31' },
        { asOf: '23/10/2026' },
        { startDate: '2026-01-01' },
      ]
      for (const query of refused) {
        it(`refuses ${JSON.stringify(query)}`, async () => {
          await expect(validate(query)).rejects.toThrow()
        })
      }
    })
  })
})

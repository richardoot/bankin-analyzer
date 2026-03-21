import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { AccountDto, UpdateAccountDto } from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all accounts for the current user' })
  @ApiResponse({ status: 200, type: [AccountDto] })
  async findAll(@CurrentUser() user: User): Promise<AccountDto[]> {
    const accounts = await this.accountsService.findAllByUser(user.id)
    return accounts.map(account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      divisor: account.divisor,
      isExcludedFromBudget: account.isExcludedFromBudget,
      isExcludedFromStats: account.isExcludedFromStats,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }))
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific account' })
  @ApiResponse({ status: 200, type: AccountDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<AccountDto> {
    const account = await this.accountsService.findOne(user.id, id)
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      divisor: account.divisor,
      isExcludedFromBudget: account.isExcludedFromBudget,
      isExcludedFromStats: account.isExcludedFromStats,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an account' })
  @ApiResponse({ status: 200, type: AccountDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto
  ): Promise<AccountDto> {
    const account = await this.accountsService.update(user.id, id, dto)
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      divisor: account.divisor,
      isExcludedFromBudget: account.isExcludedFromBudget,
      isExcludedFromStats: account.isExcludedFromStats,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger'
import { ReimbursementsService } from './reimbursements.service'
import {
  CreateReimbursementDto,
  UpdateReimbursementDto,
  ReceivePaymentDto,
  ReimbursementResponseDto,
} from './dto'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User, ReimbursementStatus } from '../generated/prisma'

@ApiTags('reimbursements')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('reimbursements')
export class ReimbursementsController {
  constructor(private readonly reimbursementsService: ReimbursementsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all reimbursement requests for the current user',
  })
  @ApiResponse({ status: 200, type: [ReimbursementResponseDto] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'PARTIAL', 'COMPLETED'],
  })
  @ApiQuery({ name: 'includeTransaction', required: false, type: Boolean })
  async findAll(
    @CurrentUser() user: User,
    @Query('status') status?: ReimbursementStatus,
    @Query('includeTransaction') includeTransaction?: string
  ): Promise<ReimbursementResponseDto[]> {
    return this.reimbursementsService.findAllByUser(user.id, {
      ...(status && { status }),
      includeTransaction: includeTransaction === 'true',
    })
  }

  @Get('transaction/:transactionId')
  @ApiOperation({ summary: 'Get reimbursement requests for a transaction' })
  @ApiResponse({ status: 200, type: [ReimbursementResponseDto] })
  async findByTransaction(
    @CurrentUser() user: User,
    @Param('transactionId') transactionId: string
  ): Promise<ReimbursementResponseDto[]> {
    return this.reimbursementsService.findByTransaction(transactionId, user.id)
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'Get reimbursement requests for a person' })
  @ApiResponse({ status: 200, type: [ReimbursementResponseDto] })
  async findByPerson(
    @CurrentUser() user: User,
    @Param('personId') personId: string
  ): Promise<ReimbursementResponseDto[]> {
    return this.reimbursementsService.findByPerson(personId, user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a reimbursement request by ID' })
  @ApiResponse({ status: 200, type: ReimbursementResponseDto })
  @ApiQuery({ name: 'includeTransaction', required: false, type: Boolean })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('includeTransaction') includeTransaction?: string
  ): Promise<ReimbursementResponseDto> {
    return this.reimbursementsService.findOne(
      id,
      user.id,
      includeTransaction === 'true'
    )
  }

  @Post()
  @ApiOperation({ summary: 'Create a new reimbursement request' })
  @ApiResponse({ status: 201, type: ReimbursementResponseDto })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateReimbursementDto
  ): Promise<ReimbursementResponseDto> {
    return this.reimbursementsService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reimbursement request' })
  @ApiResponse({ status: 200, type: ReimbursementResponseDto })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateReimbursementDto
  ): Promise<ReimbursementResponseDto> {
    return this.reimbursementsService.update(id, user.id, dto)
  }

  @Patch(':id/receive')
  @ApiOperation({ summary: 'Record a payment received for a reimbursement' })
  @ApiResponse({ status: 200, type: ReimbursementResponseDto })
  async receivePayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReceivePaymentDto
  ): Promise<ReimbursementResponseDto> {
    return this.reimbursementsService.receivePayment(id, user.id, dto.amount)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reimbursement request' })
  @ApiResponse({ status: 200 })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    await this.reimbursementsService.delete(id, user.id)
  }
}

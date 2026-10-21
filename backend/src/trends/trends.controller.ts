import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'
import { TrendsQueryDto, TrendsResponseDto } from './dto'
import { TrendsService } from './trends.service'

@ApiTags('trends')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('trends')
export class TrendsController {
  constructor(private readonly trendsService: TrendsService) {}

  @Get()
  @ApiOperation({
    summary:
      'What changes in the everyday spending: a closed month against the habit of the months before it',
  })
  @ApiResponse({ status: 200, type: TrendsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'A malformed filter, or a month not closed yet',
  })
  async getTrends(
    @CurrentUser() user: User,
    @Query() query: TrendsQueryDto
  ): Promise<TrendsResponseDto> {
    return this.trendsService.getTrends(user.id, query)
  }
}

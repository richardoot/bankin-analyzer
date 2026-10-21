import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { SupabaseGuard, CurrentUser } from '../auth'
import type { User } from '../generated/prisma'
import {
  TrendDigestResponseDto,
  TrendsQueryDto,
  TrendsResponseDto,
} from './dto'
import { TrendDigestService } from './trend-digest.service'
import { TrendsService } from './trends.service'

@ApiTags('trends')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('trends')
export class TrendsController {
  constructor(
    private readonly trendsService: TrendsService,
    private readonly digestService: TrendDigestService
  ) {}

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

  @Get('digest')
  @ApiOperation({
    summary:
      'The paragraph Claude wrote from the trends of a closed month: the one remembered for these very figures, else written now and remembered (or the last one of the view, marked stale, when it cannot be)',
  })
  @ApiResponse({ status: 200, type: TrendDigestResponseDto })
  @ApiResponse({
    status: 400,
    description: 'A malformed filter, or a month not closed yet',
  })
  async getDigest(
    @CurrentUser() user: User,
    @Query() query: TrendsQueryDto
  ): Promise<TrendDigestResponseDto> {
    return { digest: await this.digestService.getDigest(user.id, query) }
  }

  // Each press is a call to the model: twenty an hour is more than a
  // person reading their month will ever press, and stops a loop.
  @Post('digest/regenerate')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({
    summary:
      'Write the paragraph of a closed month again; the previous one stays when the new one fails',
  })
  @ApiResponse({ status: 200, type: TrendDigestResponseDto })
  @ApiResponse({
    status: 400,
    description: 'A malformed filter, or a month not closed yet',
  })
  async regenerateDigest(
    @CurrentUser() user: User,
    @Query() query: TrendsQueryDto
  ): Promise<TrendDigestResponseDto> {
    return {
      digest: await this.digestService.getDigest(user.id, query, {
        force: true,
      }),
    }
  }
}

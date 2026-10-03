import { Module } from '@nestjs/common'
import { AiSuggestionsService } from './ai-suggestions.service'
import { MerchantMemoryService } from './merchant-memory.service'

@Module({
  providers: [AiSuggestionsService, MerchantMemoryService],
  exports: [AiSuggestionsService, MerchantMemoryService],
})
export class AiSuggestionsModule {}

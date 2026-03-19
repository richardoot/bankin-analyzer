import { Module } from '@nestjs/common'
import { AiSuggestionsService } from './ai-suggestions.service'
import { AiSuggestionsController } from './ai-suggestions.controller'

@Module({
  controllers: [AiSuggestionsController],
  providers: [AiSuggestionsService],
  exports: [AiSuggestionsService],
})
export class AiSuggestionsModule {}

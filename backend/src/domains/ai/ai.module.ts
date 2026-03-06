import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai.provider';
import { UiPresetsModule } from '../ui-presets/ui-presets.module';

@Module({
  imports: [UiPresetsModule],
  controllers: [AiController],
  providers: [AiService, AiProviderService],
  exports: [AiProviderService],
})
export class AiModule {}

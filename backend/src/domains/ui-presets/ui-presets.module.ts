import { Module } from '@nestjs/common';
import { UiPresetsService } from './ui-presets.service';

@Module({
  providers: [UiPresetsService],
  exports: [UiPresetsService],
})
export class UiPresetsModule {}

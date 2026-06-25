import { Module } from '@nestjs/common';
import { DeputyFilesController } from './deputy-files.controller';
import { DeputyFilesService } from './deputy-files.service';

@Module({
  controllers: [DeputyFilesController],
  providers: [DeputyFilesService],
})
export class DeputyFilesModule {}

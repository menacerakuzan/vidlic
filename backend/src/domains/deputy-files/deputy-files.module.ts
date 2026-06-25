import { Module } from '@nestjs/common';
import { DeputyFilesController } from './deputy-files.controller';
import { DeputyFilesService } from './deputy-files.service';
import { DeputyFilesScheduler } from './deputy-files.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DeputyFilesController],
  providers: [DeputyFilesService, DeputyFilesScheduler],
})
export class DeputyFilesModule {}

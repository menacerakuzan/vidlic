import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksScheduler } from './tasks.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksScheduler],
  exports: [TasksService],
})
export class TasksModule {}

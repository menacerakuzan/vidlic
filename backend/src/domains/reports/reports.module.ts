import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlaMonitorService } from './sla-monitor.service';

@Module({
  imports: [ApprovalsModule, AiModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, SlaMonitorService],
  exports: [ReportsService],
})
export class ReportsModule {}

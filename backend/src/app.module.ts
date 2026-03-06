import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './domains/auth/auth.module';
import { UsersModule } from './domains/users/users.module';
import { DepartmentsModule } from './domains/users/departments/departments.module';
import { ReportsModule } from './domains/reports/reports.module';
import { TasksModule } from './domains/tasks/tasks.module';
import { NotificationsModule } from './domains/notifications/notifications.module';
import { AuditModule } from './domains/audit/audit.module';
import { AnalyticsModule } from './domains/analytics/analytics.module';
import { ExportModule } from './domains/export/export.module';
import { ApprovalsModule } from './domains/approvals/approvals.module';
import { UiPresetsModule } from './domains/ui-presets/ui-presets.module';
import { AiModule } from './domains/ai/ai.module';
import { AttachmentsModule } from './domains/attachments/attachments.module';
import { SearchModule } from './domains/search/search.module';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    SharedModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    ReportsModule,
    TasksModule,
    NotificationsModule,
    AuditModule,
    AnalyticsModule,
    HealthModule,
    ExportModule,
    ApprovalsModule,
    UiPresetsModule,
    AiModule,
    AttachmentsModule,
    SearchModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ManagementsController } from './managements.controller';
import { ManagementsService } from './managements.service';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ManagementsController],
  providers: [ManagementsService],
  exports: [ManagementsService],
})
export class ManagementsModule {}
